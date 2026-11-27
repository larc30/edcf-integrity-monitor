"""등급 기준을 바꾼 뒤 예전 판정 다시 하기 (한 번만 — meta/settings.rejudge_version 으로 기록)

v1 (2026-11-05): 'red = 지금 제재 중' 기준(v27) 이전에 판정된 뉴스 이슈 중 red·orange, 그리고 AI 대신 키워드 규칙으로
판정된 뉴스 이슈를 지금 기준으로 Claude에게 다시 판정. 담당자가 이미 처리한 것(확인했음·관련 없음)은 건드리지 않음.
v2 (2026-11-23): 기간이 있는 처분(영업정지 등)은 기사에 종료일이 있고 오늘이 그 이전일 때만 red, 종료일은 valid_until 에 저장.
뉴스 이슈 중 red 인 것(관련 없음 처리 제외)을 한 번 다시 판정. 담당자가 '관련 있음'으로 처리한 것도 등급·종료일만 고침.
v3 (2026-11-27 사용자: '참고 이력 320건이 거의 단순 언급 · AI 로 한꺼번에'): 아직 처리하지 않은 참고(yellow) 뉴스 이슈를
지금 기준(판정 지침 + 담당자 사례)으로 한 번 다시 판정.
  - 관련 없음·중립으로 판정 → '관련 없음'으로 자동 처리(reviewed_by '자동 정리' = AI 사례로 쓰지 않음, 화면에서 [되돌리기] 가능)
  - 여전히 참고 → 그대로 (다시 본 표시만)
  - 경고·주의로 판정 → 등급을 올려 '확인이 필요한 이슈'에 나오게
예전 값은 prev_level / prev_relevant 로 남겨 되돌릴 수 있게 함. 공개 로그에는 건수만.
"""
import logging
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

from . import analyzer, config, store

log = logging.getLogger("monitor")
REJUDGE_VERSION = 3
CHUNK = 25    # 한 번에 AI 에게 보내는 기사 수 (업체 하나에 참고 이력이 많을 때 나눠 보냄)
WORKERS = 4   # 동시에 판정하는 업체 수


def _targets(rel: list[dict]) -> list[dict]:
    """아직 처리하지 않은 참고(yellow) 뉴스 이슈. 공식 제재 기록과 담당자가 ✓/✕ 한 것은 건드리지 않음"""
    return [f for f in rel
            if (f.get("source_type") or "news") == "news" and (f.get("status") or "new") == "new"
            and f.get("level") == "yellow" and f.get("rejudge_v") != REJUDGE_VERSION]


def _judge(c: dict, engs: list[dict], items: list[dict], keywords: list[dict], feedback: dict) -> tuple[dict, str]:
    """업체 하나의 기사들을 판정 → ({기사 순번: 판정}, 오류 문구). 못 받은 기사는 결과에 없음"""
    out, err = {}, ""
    for s in range(0, len(items), CHUNK):
        part = items[s:s + CHUNK]
        arts = [{"title": f.get("title") or "", "snippet": f.get("snippet") or "", "published_at": f.get("published_at") or "",
                 "source_name": f.get("source_name") or ""} for f in part]
        judged, used = analyzer.analyze(c, engs, arts, keywords, feedback)
        if used != "claude":  # 규칙 판정으로 덮어쓰지 않음 → 다음 실행 때 다시 시도
            err = f"{c.get('name')} / AI 재판정: {(analyzer.CLAUDE_ERROR or 'AI 응답 오류')[:150]} ({len(part)}건)"
            continue
        by_idx = {j["idx"]: j for j in judged}
        miss = [i for i in range(len(part)) if i not in by_idx]
        if miss:  # AI가 일부 기사에 답을 빠뜨리면 그 기사만 한 번 더 물어봄
            again, used2 = analyzer.analyze(c, engs, [arts[i] for i in miss], keywords, feedback)
            if used2 == "claude":
                for j in again:
                    if 0 <= j["idx"] < len(miss):
                        by_idx[miss[j["idx"]]] = {**j, "idx": miss[j["idx"]]}
            if any(i not in by_idx for i in miss):
                err = f"{c.get('name')} / AI 재판정: AI가 일부 기사에 판정을 주지 않음 — 예전 등급 유지"
        for i, j in by_idx.items():
            if 0 <= i < len(part):
                out[s + i] = j
    return out, err


def run_once() -> dict | None:
    settings = store.db().collection("meta").document("settings").get().to_dict() or {}
    if int(settings.get("rejudge_version") or 0) >= REJUDGE_VERSION:
        return None
    if not config.ANTHROPIC_API_KEY:
        log.info("재판정: Claude 키가 없어 건너뜀")
        return None
    rel = store.where("findings", "relevant", "==", True)
    targets = _targets(rel)
    companies = {c["id"]: c for c in store.all_docs("companies")}
    projects = {p["id"]: p for p in store.all_docs("projects")}
    keywords = analyzer.build_keywords(store.all_docs("keywords"))
    by_co = defaultdict(list)
    for f in targets:
        if f.get("company_id") in companies:
            by_co[f["company_id"]].append(f)

    # 새 기사 판정과 같은 근거를 줌: 모든 업체의 담당자 사례 + 판정 지침 (스캔보다 먼저 돌아서 여기서 직접 채움)
    try:
        from . import scanner
        rel_by = defaultdict(list)
        for f in rel:
            rel_by[f.get("company_id")].append(f)
        dis, conf = scanner._shared_feedback(rel_by)
        analyzer.SHARED = {"dismissed": dis[:40], "confirmed": conf[:40], "guide": scanner._load_guide(dis, conf, refresh=False)}
    except Exception as e:
        log.warning("재판정: 공통 사례·지침을 못 읽음 (%s) → 업체별 사례만으로 판정", type(e).__name__)

    def work(cid: str):
        c = companies[cid]
        engs = [{**e, "project_name": projects.get(e.get("project_id"), {}).get("name", "(삭제된 사업)")} for e in c.get("engagements") or []]
        mine = [f for f in rel if f.get("company_id") == cid]
        feedback = {
            "dismissed": [f.get("title", "")[:120] for f in mine if f.get("status") == "dismissed" and f.get("reviewed_by") != "자동 정리"][:12],
            "confirmed": [f.get("title", "")[:120] for f in mine if f.get("status") == "reviewed" and f.get("review_note") != "과거 이력 일괄 정리"][:8],
        }
        try:
            return cid, *_judge(c, engs, by_co[cid], keywords, feedback)
        except Exception as e:  # 한 업체가 실패해도 나머지는 계속
            return cid, {}, f"{c.get('name')} / AI 재판정: {type(e).__name__}"

    moves, patches, failed, errors = Counter(), {}, 0, []
    now = store.now_str()
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for cid, got, err in ex.map(work, list(by_co)):
            if err:
                errors.append(err)
            for i, f in enumerate(by_co[cid]):
                j = got.get(i)
                if not j:
                    failed += 1
                    continue
                lv = j.get("level") if j.get("relevant") else "none"
                mark = {"rejudged_at": now, "rejudge_v": REJUDGE_VERSION}
                if lv in ("red", "orange"):  # 참고로 둘 것이 아니라고 봄 → 등급을 올려 '확인이 필요한 이슈'에
                    moves[f"yellow→{lv}"] += 1
                    patches[f["id"]] = {**mark, "prev_level": "yellow", "prev_relevant": True, "level": lv, "valid_until": j.get("valid_until") or None,
                                        "analyzer": "claude", "category": j.get("category"), "summary": j.get("summary"), "rationale": j.get("rationale")}
                elif lv == "yellow":         # 실제 과거·간접 이력 → 그대로
                    moves["yellow→yellow"] += 1
                    patches[f["id"]] = mark
                else:                        # 이 업체 이야기가 아니거나 단순 언급 → 참고 이력에서 뺌 (되돌릴 수 있게 관련 없음 처리로)
                    moves["yellow→관련 없음"] += 1
                    patches[f["id"]] = {**mark, "prev_level": "yellow", "prev_relevant": True, "status": "dismissed", "reviewed_by": "자동 정리",
                                        "reviewed_at": now, "review_note": "AI 재판정: 참고 이력 정리"}
    if patches:
        store.update_many("findings", patches)
    tries = int(settings.get("rejudge_tries_v3") or 0) + (1 if failed else 0)
    res = {"targets": len(targets), "companies": len(by_co), "updated": len(patches), "failed": failed, "moves": dict(moves), "tries": tries}
    if not failed or tries >= 3:  # 다 됐거나 3번 시도해도 안 되는 기사는 예전 판정 그대로 두고 끝냄 (매일 오류가 쌓이지 않게)
        store.update("meta", "settings", {"rejudge_version": REJUDGE_VERSION, "rejudged_at": now, "rejudge_tries_v3": tries})
        if failed:
            errors.append(f" / 재판정 마침: 3번 시도해도 판정을 못 받은 {failed}건은 예전 등급 그대로 둠")
    else:
        store.update("meta", "settings", {"rejudge_tries_v3": tries})
    # 업체 이름이 들어간 오류 내용은 Firestore 실행 기록에만 (공개 로그에는 건수만 — run.py 가 res 를 출력)
    store.log_run("rejudge", not failed, {**res, "errors": errors[:50]})
    return res
