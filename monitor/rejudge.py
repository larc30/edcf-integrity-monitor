"""등급 기준을 바꾼 뒤 예전 판정 다시 하기 (한 번만 — meta/settings.rejudge_version 으로 기록)

v1 (2026-11-05): '위험 = 지금 제재 중' 기준(v27) 이전에 판정된 뉴스 이슈 중 위험·경고, 그리고 AI 대신 키워드 규칙으로
판정된 뉴스 이슈를 지금 기준으로 Claude에게 다시 판정. 담당자가 이미 처리한 것(확인했음·관련 없음)은 건드리지 않음.
예전 값은 prev_level / prev_relevant 로 남겨 되돌릴 수 있게 함. 공개 로그에는 건수만.
"""
import logging
from collections import Counter, defaultdict

from . import analyzer, config, store

log = logging.getLogger("monitor")
REJUDGE_VERSION = 1


def _targets(rel: list[dict]) -> list[dict]:
    return [f for f in rel
            if (f.get("source_type") or "news") == "news" and (f.get("status") or "new") == "new"
            and not f.get("rejudged_at") and (f.get("level") in ("red", "orange") or f.get("analyzer") == "rule")]


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

    moves, patches, failed, errors = Counter(), {}, 0, []
    for cid, items in by_co.items():
        c = companies[cid]
        engs = [{**e, "project_name": projects.get(e.get("project_id"), {}).get("name", "(삭제된 사업)")} for e in c.get("engagements") or []]
        mine = [f for f in rel if f.get("company_id") == cid]
        feedback = {
            "dismissed": [f.get("title", "")[:120] for f in mine if f.get("status") == "dismissed" and f.get("reviewed_by") != "자동 정리"][:12],
            "confirmed": [f.get("title", "")[:120] for f in mine if f.get("status") == "reviewed"][:8],
        }
        arts = [{"title": f.get("title") or "", "snippet": f.get("snippet") or "", "published_at": f.get("published_at") or "",
                 "source_name": f.get("source_name") or ""} for f in items]
        judged, used = analyzer.analyze(c, engs, arts, keywords, feedback)
        if used != "claude":  # 규칙 판정으로 덮어쓰지 않음 → 다음 실행 때 다시 시도
            failed += len(items)
            errors.append(f"{c.get('name')} / AI 재판정: {(analyzer.CLAUDE_ERROR or 'AI 응답 오류')[:150]} ({len(items)}건)")
            continue
        by_idx = {j["idx"]: j for j in judged}
        miss = [i for i in range(len(items)) if i not in by_idx]
        if miss:  # AI가 일부 기사에 답을 빠뜨리면 그 기사만 한 번 더 물어봄
            again, used2 = analyzer.analyze(c, engs, [arts[i] for i in miss], keywords, feedback)
            if used2 == "claude":
                for j in again:
                    if 0 <= j["idx"] < len(miss):
                        by_idx[miss[j["idx"]]] = {**j, "idx": miss[j["idx"]]}
            left = sum(1 for i in miss if i not in by_idx)
            if left:
                errors.append(f"{c.get('name')} / AI 재판정: AI가 일부 기사에 판정을 주지 않음 — 예전 등급 유지")
        for i, f in enumerate(items):
            j = by_idx.get(i)
            if not j:
                failed += 1
                continue
            new_lv = j["level"] if j.get("relevant") else "none"
            moves[f"{f.get('level')}→{new_lv}"] += 1
            p = {"prev_level": f.get("level"), "prev_relevant": True, "rejudged_at": store.now_str(), "analyzer": "claude",
                 "category": j.get("category"), "summary": j.get("summary"), "rationale": j.get("rationale")}
            if j.get("relevant"):
                p["level"] = j["level"]
            else:  # 이 업체 기사가 아니거나 중립 기사 → 새 기사 판정과 같게 '관련 없음'으로 (목록에서 빠짐)
                p.update({"relevant": False, "level": "none"})
            patches[f["id"]] = p
    if patches:
        store.update_many("findings", patches)
    tries = int(settings.get("rejudge_tries") or 0) + (1 if failed else 0)
    res = {"targets": len(targets), "companies": len(by_co), "updated": len(patches), "failed": failed, "moves": dict(moves), "tries": tries}
    if not failed or tries >= 3:  # 다 됐거나 3번 시도해도 안 되는 기사는 예전 판정 그대로 두고 끝냄 (매일 오류가 쌓이지 않게)
        store.update("meta", "settings", {"rejudge_version": REJUDGE_VERSION, "rejudged_at": store.now_str(), "rejudge_tries": tries})
        if failed:
            errors.append(f" / 재판정 마침: 3번 시도해도 판정을 못 받은 {failed}건은 예전 등급 그대로 둠")
    else:
        store.update("meta", "settings", {"rejudge_tries": tries})
    # 업체 이름이 들어간 오류 내용은 Firestore 실행 기록에만 (공개 로그에는 건수만 — run.py 가 res 를 출력)
    store.log_run("rejudge", not failed, {**res, "errors": errors[:50]})
    return res
