"""스캔: 업체 식별(사업자번호·영문명) → 뉴스 수집·판정 → MDB 제재리스트 대조 → 조달청 부정당제재 조회

- 업체 6곳을 동시에 처리하고, DB 저장은 업체별로 한 번에 묶어서 한다(속도).
- 평소(데일리)에는 최신 기사만, 7일에 한 번은 '업체명+리스크 키워드' 심층 검색(과거 사건 포함).
- 업체마다 '무엇을 확인했는지'(last_check)를 기록해, 이슈가 없을 때도 검사 범위를 보여준다.
"""
import hashlib
import logging
import threading
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta

from . import analyzer, category, config, store
from .sources import dart, news, pps, sanctions
from .textutil import context_words, dedup_key, mentions, search_names

log = logging.getLogger(__name__)

EN_RISK_QUERY = '(corruption OR fraud OR sanction OR debarment OR bribery OR collusion OR "bid rigging")'
ID_RISK_QUERY = '(korupsi OR tersangka OR suap OR sanksi OR "daftar hitam")'


# 제재 기사 검색어: 이 검색어로 먼저 기사를 모은 뒤, 기사마다 '전체 감시 명단'과 대조한다.
# (업체 수가 많아도 검색 횟수가 늘지 않음)
TOPIC_QUERIES = [  # assets/app.js TOPIC_QUERIES(설정 화면 '기본 검색어')와 같은 목록 유지
    "부정당", "부정당업자", "부정당제재",
    "입찰참가자격 제한", "입찰참가제한", "입찰 제한 처분",
    "입찰 담합", "담합 과징금", "공정위 과징금 건설",
    "영업정지 건설사", "영업정지 엔지니어링", "등록말소 건설",
    "벌점 건설사", "제재 건설사", "제재 엔지니어링",
    "하도급 과징금", "공공입찰 제한", "국토교통부 처분",
    # 중대재해·안전사고 (팀 매뉴얼 언론보도 키워드: 재해)
    "중대재해 건설", "중대재해처벌법 기소", "건설현장 사망사고", "산업재해 건설사", "부실시공 건설사",
    # 집행정지: 조달청 API는 '현재 유효 제재'만 줘서 법원 집행정지로 멈춘 제재가 안 보임 → 뉴스로 보완
    "입찰제한 집행정지", "부정당 집행정지",
]


def topic_sweep(errors: list, extra: list[str] | None = None) -> tuple[list[dict], list[str]]:
    """제재 키워드로 Google 뉴스(+네이버)를 검색해 기사 모음 반환. extra: 설정에서 ★ 표시한 리스크 키워드"""
    qs = TOPIC_QUERIES + [q for q in dict.fromkeys(extra or []) if q and q not in TOPIC_QUERIES]
    jobs = [("google", q) for q in qs]
    if news.naver_enabled():
        jobs += [("naver", q) for q in qs]

    def one(job):
        engine, q = job
        try:
            items = news.naver_news(q, display=100, sort="date") if engine == "naver" else news.google_news(q, "ko", limit=100)
            return engine, items
        except Exception as e:
            errors.append(f"제재 키워드 검색 / {engine} '{q}': {e}")
            return engine, None

    seen, out, engines = set(), [], set()
    with ThreadPoolExecutor(max_workers=8) as ex:
        for engine, items in ex.map(one, jobs):
            if items is None:
                continue
            engines.add("네이버" if engine == "naver" else "Google")
            for a in items:
                k = dedup_key(a["title"], a["url"])
                if k not in seen:
                    seen.add(k)
                    a["dedup_key"] = k
                    a["via"] = (a.get("via") or "") + " · 제재 키워드"
                    out.append(a)
    return out, sorted(engines)


def _company_names(company: dict) -> list[str]:
    return [company["name"], company.get("name_en") or ""] + [x.strip() for x in (company.get("aliases") or "").split(",")]


def match_sweep(articles: list[dict], companies: list[dict]) -> dict[str, list[dict]]:
    """키워드 검색 기사 ↔ 명단 대조: {company_id: [기사, ...]}"""
    hits: dict[str, list[dict]] = {}
    texts = [(a, f"{a['title']} {a.get('snippet', '')}") for a in articles]
    for c in companies:
        names, ctx = _company_names(c), context_words(c)
        for a, t in texts:
            if mentions(t, names, ctx):
                hits.setdefault(c["id"], []).append(dict(a))
    return hits


def _period_ended(period: str | None) -> bool:
    """'2026.05.11~2026.11.10' 같은 제재기간의 끝 날짜가 오늘보다 앞이면 True (끝 날짜를 못 읽으면 False)"""
    ds = re.findall(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})", str(period or ""))
    if len(ds) < 2:
        return False
    try:
        return date(*map(int, ds[-1])) < date.today()
    except ValueError:
        return False


def match_edcf(edcf: list[dict], company: dict) -> list[dict]:
    """EDCF 부정당업자 명단(EXIMIIS 엑셀 업로드) 대조: 사업자번호 우선, 없으면 업체명 정확 일치"""
    from .textutil import norm as _n
    biz = pps.biz_digits(company.get("biz_no"))
    names = {_n(x) for x in _company_names(company) if x and len(_n(x)) >= 3}
    out = []
    for e in edcf:
        if not (str(e.get("status") or "").strip() or str(e.get("period") or "").strip()):
            continue  # 상태·제재기간이 없는 행은 제재 기록이 아님 (예: 업체 명단을 잘못 올린 경우)
        eb = pps.biz_digits(e.get("biz_no"))
        hit = (biz and eb and biz == eb) or ((not biz or not eb) and _n(e.get("name", "")) in names)
        if not hit:
            continue
        listed = "등록" in (e.get("status") or "")
        expired = listed and _period_ended(e.get("period"))  # 명단에는 '등록'이지만 제재기간이 지남 → 과거 이력(참고)
        active = listed and not expired
        out.append({
            "source_type": "official", "source_name": "EDCF 부정당업자 (EXIMIIS)",
            "title": f"[EDCF 제재 {'등록' if active else '기간 만료' if expired else '해지'}] {e.get('name')} · {e.get('period') or ''}",
            "url": "", "published_at": (e.get("period") or "")[:10].replace(".", "-"),
            "snippet": f"제재사유: {e.get('reason') or '-'} / 관련사업: {e.get('project_name') or '-'} ({e.get('country') or '-'}) / 등록기관: {e.get('agency') or '-'} / 사업자번호 {e.get('biz_no') or '-'}",
            "matched_keywords": "사업자번호 일치" if (biz and eb and biz == eb) else "업체명 일치",
            "level": "red" if active else "yellow", "category": "부정당업자 제재",
            "summary": (f"EDCF 부정당업자로 현재 등록되어 있습니다 (제재기간 {e.get('period') or '-'}, 사유: {(e.get('reason') or '-')[:80]})." if active
                        else f"EDCF 부정당업자 제재기간이 끝났습니다 (명단에는 아직 '등록', 제재기간 {e.get('period') or '-'}). 최신 EXIMIIS 명단으로 확인하세요." if expired
                        else f"과거 EDCF 부정당업자 제재 이력이 있습니다 (해지, 제재기간 {e.get('period') or '-'})."),
            "rationale": "EXIMIIS 부정당업자 명단 (경협평가부 관리)", "analyzer": "list-match",
            # 기간이 끝나면 키가 달라져서, 예전 '등록(위험)' 기록은 지워지고 '기간 만료(참고)' 기록이 새로 생김
            "dedup_key": "edcf-" + hashlib.sha1(f"{e.get('biz_no')}|{e.get('name')}|{e.get('period')}{'|만료' if expired else ''}".encode()).hexdigest()[:16],
        })
    return out


def _pps_today(company: dict, bizno: str) -> bool:
    """오늘 같은 사업자번호로 조달청을 이미 정상 조회했는지"""
    p = (company.get("last_check") or {}).get("pps") or {}
    return p.get("status") == "ok" and p.get("bizno") == bizno and str(p.get("checked_at") or "")[:10] == store.now_str()[:10]


def _days_since(ts: str | None) -> float:
    if not ts:
        return 1e9
    try:
        now = store.now_kst().replace(tzinfo=None)  # 저장 시각은 한국시간 (실행 서버는 UTC)
        return (now - datetime.strptime(ts[:19], "%Y-%m-%d %H:%M:%S")).total_seconds() / 86400
    except ValueError:
        return 1e9


def _queries(company: dict, keywords: list[dict], deep: bool) -> list[tuple[str, str, str, str]]:
    """(engine, lang, query, sort) 목록.
    데일리: 업체명 최신순 검색만 / 심층(deep): + '업체명 리스크키워드' 관련도순(과거 사건 포함)"""
    langs = [l.strip() for l in (company.get("search_langs") or "ko").split(",") if l.strip()]
    names = search_names(company)
    qs = []
    if "ko" in langs:
        boosters = [k["word"] for k in keywords if k.get("user") and k.get("lang") == "ko"][:6] if deep else []
        for n in names[:2]:
            qs.append(("naver", "ko", f'"{n}"', "date"))
            qs.append(("google", "ko", f'"{n}"', "date"))
            for b in boosters:
                qs.append(("naver", "ko", f'"{n}" {b}', "sim"))
            if boosters:
                qs.append(("google", "ko", f'"{n}" ({" OR ".join(boosters)})', "date"))
    en_name = company.get("name_en") or (company["name"] if company["name"].isascii() else "")
    if en_name and ("en" in langs or company.get("country") not in (None, "", "KR")):
        qs.append(("google", "en", f'"{en_name}" {EN_RISK_QUERY}', "date"))
        if deep or company.get("country") not in (None, "", "KR"):
            qs.append(("google", "en", f'"{en_name}"', "date"))
    if "id" in langs:
        qs.append(("google", "id", f'"{en_name or company["name"]}" {ID_RISK_QUERY}', "date"))
    if not news.naver_enabled():
        qs = [q for q in qs if q[0] != "naver"]
    return qs


def _identify(company: dict, errors: list) -> dict:
    """사업자번호·영문명·대표자 자동 보강. 사용자가 입력한 값은 덮어쓰지 않는다.
    DART에서 못 찾은 업체는 30일 동안 다시 찾지 않는다(매번 목록 전체를 읽지 않도록)."""
    info = {"bizno_source": company.get("bizno_source") or ("직접 입력" if company.get("biz_no") else ""), "notes": []}
    patch: dict = {}

    domestic = company.get("country", "KR") in ("KR", "", None)
    # 업종 자동 분류: 비어 있거나 '이름 추정'인 경우만 (사용자가 넣은 분류는 그대로)
    want_cat = (not company.get("category") or company.get("category_source") == "이름 추정") and _days_since(company.get("cat_checked_at")) >= 30
    need_dart = config.DART_API_KEY and domestic and (not company.get("biz_no") or want_cat)
    if need_dart and not company.get("corp_code") and _days_since(company.get("dart_checked_at")) < 30:
        info["notes"].append(company.get("dart_note") or "DART에서 찾지 못함 — 사업자번호 직접 입력 필요")
        need_dart = False
    if need_dart:
        try:
            corp_code = company.get("corp_code")
            if not corp_code:
                cands, listed = dart.match_by_name(company["name"])
                pick = cands[0] if len(cands) == 1 else (listed[0] if len(listed) == 1 else None)
                if pick:
                    corp_code = pick[0]
                    patch["corp_code"] = corp_code
                    if pick[2] and not company.get("name_en"):
                        patch["name_en"] = pick[2]
                else:
                    note = (f"DART에 같은 이름 기업이 {len(cands)}곳 있어 자동 매칭하지 않음 — 사업자번호 직접 입력 필요" if cands
                            else "DART 기업목록에 없음 (비상장·소규모·건축사사무소 등) — 사업자번호 직접 입력 필요")
                    info["notes"].append(note)
                    patch["dart_checked_at"] = store.now_str()
                    patch["dart_note"] = note
            if corp_code:
                d = dart.company_detail(corp_code)
                if d.get("biz_no") and not company.get("biz_no"):
                    patch["biz_no"] = pps.biz_digits(d["biz_no"])
                    patch["bizno_source"] = "DART 자동"
                if want_cat:
                    patch["cat_checked_at"] = store.now_str()
                    cat = category.from_ksic(d.get("induty_code"))
                    if cat:
                        patch.update(category=cat, category_source="DART 업종", induty_code=d.get("induty_code"))
                if d.get("name_en") and not company.get("name_en") and "name_en" not in patch:
                    patch["name_en"] = d["name_en"]
                if d.get("ceo") and not company.get("ceo"):
                    patch["ceo"] = d["ceo"]
        except Exception as e:
            errors.append(f"{company['name']} / DART: {e}")

    bizno = patch.get("biz_no") or company.get("biz_no")
    if (pps.enabled() and bizno and _days_since(company.get("pps_basic_checked_at")) >= 30
            and (not (company.get("name_en") or patch.get("name_en")) or not (company.get("ceo") or patch.get("ceo")))):
        patch["pps_basic_checked_at"] = store.now_str()
        try:
            b = pps.basic_info(bizno)
            if b.get("engCorpNm") and not (company.get("name_en") or patch.get("name_en")):
                patch["name_en"] = b["engCorpNm"].strip()
            if b.get("ceoNm") and not (company.get("ceo") or patch.get("ceo")):
                patch["ceo"] = b["ceoNm"].strip()
            if not b:
                info["notes"].append("나라장터 미등록 업체 (사업자번호로 조회되지 않음)")
        except Exception as e:
            errors.append(f"{company['name']} / 나라장터 기본정보: {e}")

    # DART 업종이 없으면 업체명으로 추정 (예: '…엔지니어링' → 엔지니어링·설계·감리)
    if not (company.get("category") or patch.get("category")):
        g = category.guess(company.get("name")) or category.guess(company.get("name_en")) or "기타"
        patch.update(category=g, category_source="이름 추정")
    elif not patch.get("category") and company.get("category") not in category.CATS:
        # 예전 명단의 분류 이름(예: 'IT·시스템·통신·교통시스템')은 6가지 업종으로 맞춤
        n = category.normalize(company.get("category"))
        if n:
            patch["category"] = n
        else:
            g = category.guess(company.get("name")) or category.guess(company.get("name_en")) or "기타"
            patch.update(category=g, category_source="이름 추정")

    if patch.get("name_en"):
        langs = [l for l in (company.get("search_langs") or "ko").split(",") if l]
        if "en" not in langs:
            patch["search_langs"] = ",".join(langs + ["en"])
    if patch:
        store.update("companies", company["id"], patch)
        company.update(patch)
        info["bizno_source"] = company.get("bizno_source") or info["bizno_source"]
    return info


def scan_company(company: dict, projects: dict, keywords: list[dict], entries: list[dict], lists_ok: int,
                 sweep_hits: list[dict] | None = None, sweep_engines: list[str] | None = None, sweep_total: int = 0,
                 edcf: list[dict] | None = None, existing: list[dict] | None = None, seen_doc: dict | None = None,
                 force: bool = False, quick: bool = False) -> dict:
    """quick: 빠른 스캔 — 업체명 검색은 건너뛰고 제재 키워드 기사 대조 + 공식 명단만 (업체명 검색은 매일 아침 전체 스캔이 함)
    existing: 이 업체의 관련 이슈(relevant) 목록, seen_doc: 이미 본 기사 키 요약(seen/{업체 id}),
    force: 업체 하나만 '다시 스캔' — 주간 제한 없이 업체명 검색, 10년 범위, 예전에 관련 없다고 본 기사도 다시 판정"""
    t0 = time.time()
    errors: list[str] = []
    stats = {"fetched": 0, "candidates": 0, "new_findings": 0, "official": 0, "cleaned": 0}
    engagements = [
        {**e, "project_name": projects.get(e.get("project_id"), {}).get("name", "(삭제된 사업)")}
        for e in company.get("engagements") or []
        if projects.get(e.get("project_id"), {}).get("status") != "done"  # 완료한 사업은 집중 감시에서 뺌 (기본 감시만)
    ]
    # 집중 감시: 우리 사업에 연결된 업체(또는 직접 지정) → 매일 업체명 검색 + '업체명 + 추가 키워드' 검색
    # 기본 감시: 그 외 명단 업체 → 매일 키워드 기사 대조 + 조달청·MDB, 업체명 검색은 주 1회
    focus = bool(engagements) or bool(company.get("watch"))
    weekly_due = force or _days_since(company.get("last_deep_at")) >= config.DEEP_EVERY_DAYS
    deep = focus  # v33: 심층 검색을 주 1회 → 매일 (이미 본 기사는 건너뛰어 AI 비용은 거의 그대로)
    if focus:
        queries = _queries(company, keywords, deep)
    elif weekly_due:  # 기본 감시 업체도 주 1회 업체명 최신순 검색 (Google + 네이버)
        qs = _queries(company, keywords, False)
        queries = [q for q in qs if q[0] == "google"][:1] + [q for q in qs if q[0] == "naver"][:1]
    else:
        queries = []
    if quick:
        queries = []

    # 1) 뉴스 수집 (제재 키워드 검색에서 이 업체가 나온 기사 + 업체명 검색)
    # 기간: 첫 스캔·다시 스캔은 10년(과거 이력 포함), 그 뒤 매일은 마지막 확인 7일 전부터 (이미 본 기사는 키로 건너뜀)
    last_news = company.get("last_news_at")
    if force or not last_news:
        cutoff = (date.today() - timedelta(days=config.NEWS_LOOKBACK_DAYS)).isoformat()
    else:
        cutoff = (datetime.strptime(last_news[:10], "%Y-%m-%d").date() - timedelta(days=7)).isoformat()
    seen, articles, engines_ok = set(), [], set(sweep_engines or [])
    for a in sweep_hits or []:
        if a["dedup_key"] not in seen:
            seen.add(a["dedup_key"])
            articles.append(a)
    for engine, lang, q, sort in queries:
        try:
            items = news.naver_news(q, sort=sort) if engine == "naver" else news.google_news(q, lang)
            engines_ok.add("네이버" if engine == "naver" else "Google")
        except Exception as e:
            errors.append(f"{company['name']} / {engine} '{q}': {e}")
            continue
        for a in items:
            stats["fetched"] += 1
            k = dedup_key(a["title"], a["url"])
            if k in seen:
                continue
            seen.add(k)
            a["dedup_key"] = k
            articles.append(a)

    # 2) 필터: 기간, 업체명 정확 일치, 이미 분석한 기사 제외
    names, ctx = _company_names(company), context_words(company)
    # 이미 본 기사: 요약 문서(seen)의 키 + 관련 이슈의 키. 요약이 아직 없으면 이 업체 기록을 한 번 전부 읽어서 만듦
    seen_keys = set((seen_doc or {}).get("keys") or [])
    if existing is None or seen_doc is None:
        allf = store.where("findings", "company_id", "==", company["id"])
        seen_keys |= {f.get("dedup_key") for f in allf if f.get("dedup_key")}
        existing = [f for f in allf if f.get("relevant")]
    known = {f.get("dedup_key") for f in existing} | (set() if force else seen_keys)
    mentioned = [
        a for a in articles
        if (not a["published_at"] or a["published_at"] >= cutoff) and mentions(f"{a['title']} {a.get('snippet', '')}", names, ctx)
    ]
    # 최근 기사부터 판정 (Google 결과는 관련도순이라, 오래된 기사에 밀려 최근 사건이 60건 밖으로 빠지지 않게)
    mentioned.sort(key=lambda a: a.get("published_at") or "", reverse=True)
    cands = [a for a in mentioned if a["dedup_key"] not in known][:60]
    stats["candidates"] = len(cands)

    # 2-1) 예전 기준으로 잘못 잡힌 기사 자동 정리 (예: '안세' → 배우 '안세하' 기사)
    cleanup = {
        f["id"]: {"status": "dismissed", "reviewed_by": "자동 정리", "reviewed_at": store.now_str(),
                  "reviewer_note": "업체명이 정확히 일치하지 않는 기사 (동명·유사 단어)"}
        for f in existing
        if f.get("source_type") == "news" and f.get("status") == "new" and f.get("relevant")
        and not mentions(f"{f.get('title', '')} {f.get('snippet', '')}", names, ctx)
    }
    # 키워드 규칙으로 잡았는데 키워드가 다른 단어의 일부였던 기사 (예: '정부도' → '부도')
    for f in existing:
        if (f["id"] not in cleanup and f.get("source_type") == "news" and f.get("status") == "new" and f.get("relevant")
                and f.get("analyzer") == "rule" and not analyzer.kw_hits(f"{f.get('title', '')} {f.get('snippet', '')}", keywords)):
            cleanup[f["id"]] = {"status": "dismissed", "reviewed_by": "자동 정리", "reviewed_at": store.now_str(),
                                "reviewer_note": "리스크 키워드가 다른 단어의 일부 (예: 정부도 → 부도)"}
    if cleanup:
        store.update_many("findings", cleanup)
        stats["cleaned"] = len(cleanup)

    # 3) 판정 (Claude, 실패/미설정 시 키워드 규칙)
    # 담당자 피드백(관련 없음/확인했음)을 AI 판정 예시로 전달 — 자동 정리된 것은 제외
    fb_src = sorted(existing, key=lambda f: f.get("reviewed_at") or "", reverse=True)
    feedback = {
        "dismissed": [f.get("title", "")[:120] for f in fb_src if f.get("status") == "dismissed" and f.get("reviewed_by") != "자동 정리"][:12],
        "confirmed": [f.get("title", "")[:120] for f in fb_src if f.get("status") == "reviewed" and f.get("review_note") != "과거 이력 일괄 정리"][:8],
        # 같은 사건 판단용: 이 업체의 최근 이슈 (AI가 새 기사와 비교해 same_event_as 로 표시)
        "recent": [{"id": f["id"], "title": f.get("title", ""), "date": f.get("published_at") or "", "summary": f.get("summary") or ""}
                   for f in sorted((x for x in existing if x.get("relevant") and x.get("status") != "dismissed" and x.get("source_type") == "news"),
                                   key=lambda x: x.get("published_at") or "", reverse=True)[:20]],
    }
    judgements, used = analyzer.analyze(company, engagements, cands, keywords, feedback)
    by_idx = {j["idx"]: j for j in judgements}
    to_save = []
    for i, a in enumerate(cands):
        j = by_idx.get(i, {"relevant": 0, "level": "none"})
        text = f"{a['title']} {a.get('snippet', '')}".lower()
        same = j.get("same_as")
        if same and str(same).startswith("idx:"):  # 이번에 함께 들어온 다른 기사 → 그 기록 id
            n = int(str(same)[4:])
            same = f"{company['id']}_{cands[n]['dedup_key']}".replace("/", "_")[:1400] if 0 <= n < len(cands) and n != i else None
        to_save.append({
            "source_type": "news",
            "source_name": f"{a.get('source_name') or '-'} ({a.get('via')})",
            "title": a["title"],
            "url": a["url"],
            "published_at": a.get("published_at") or "",
            "snippet": a.get("snippet") or "",
            "matched_keywords": ", ".join(k["word"] for k in keywords if k["word"].lower() in text),
            "relevant": j.get("relevant", 0),
            "level": j.get("level", "none"),
            "category": j.get("category"),
            "summary": j.get("summary"),
            "rationale": j.get("rationale"),
            "analyzer": j.get("analyzer", used),
            "dedup_key": a["dedup_key"],
            "same_as": same or None,
        })
        if j.get("relevant"):
            stats["new_findings"] += 1

    # 3-1) 업체 식별 (사업자번호·영문명) — 뉴스 검색 뒤에 해서, 그동안 DART 목록을 백그라운드로 받아 둠
    ident = _identify(company, errors)

    # 4) MDB 제재리스트 (영문명이 있어야 의미 있는 대조가 된다)
    official = sanctions.match_company(entries, company) + match_edcf(edcf or [], company)
    mdb_names = [n for n in [company.get("name_en"), *(company.get("aliases") or "").split(","), company["name"]] if n and n.strip().isascii()]
    mdb = {"lists": lists_ok, "names": mdb_names[:3], "status": "ok" if (lists_ok and mdb_names) else ("no_lists" if not lists_ok else "no_en")}

    # 5) 조달청 부정당제재 (사업자번호 필요, 조회 시점 유효 제재만)
    bizno = pps.biz_digits(company.get("biz_no"))
    if company.get("country") not in (None, "", "KR") and len(bizno) != 10:
        pps_st = {"status": "foreign"}
    elif not pps.enabled():
        pps_st = {"status": "not_connected"}
    elif len(bizno) != 10:
        pps_st = {"status": "no_bizno"}
    elif quick and _pps_today(company, bizno):
        # 빠른 스캔: 오늘 이미 정상 조회했으면 다시 부르지 않음 (하루 호출 한도·지연 오류 줄이기). 저장된 조달청 기록은 그대로 둠
        pps_st = {**company["last_check"]["pps"], "reused": True}
    else:
        try:
            hits = pps.sanctions(company)
            official += hits
            pps_st = {"status": "ok", "bizno": bizno, "hits": len(hits), "checked_at": store.now_str()}
        except Exception as e:
            errors.append(f"{company['name']} / 조달청 부정당제재: {e}")
            pps_st = {"status": "error", "bizno": bizno, "error": str(e)[:200]}

    for f in official:
        f.setdefault("dedup_key", "official-" + hashlib.sha1((f["url"] + f["title"]).encode()).hexdigest()[:16])
    still = {f["dedup_key"] for f in official}
    stale = {f["id"]: {"status": "dismissed", "reviewed_by": "자동 정리", "reviewed_at": store.now_str(),
                       "reviewer_note": "이름만 비슷한 다른 업체로 판단 (국가 불일치·유사도 기준 강화)"}
             for f in existing if f.get("analyzer") == "list-match" and "유사명" in (f.get("title") or "")
             and f.get("status") == "new" and f.get("dedup_key") not in still}
    if stale:
        store.update_many("findings", stale)
        stats["cleaned"] += len(stale)
    # EDCF 명단을 새로 올려서 더는 맞지 않는 기록(예: 잘못 올린 명단)은 지움 — 자동 대조 결과라 사용자 판단과 무관
    gone = [f["id"] for f in existing if str(f.get("dedup_key") or "").startswith("edcf-") and f.get("dedup_key") not in still]
    if gone:
        store.delete_many("findings", gone)
        existing = [f for f in existing if f["id"] not in set(gone)]
        stats["cleaned"] += len(gone)
    # 조달청 제재는 상태가 바뀔 수 있음 (집행정지·해제·기간 만료) → 이미 저장된 기록도 오늘 조회 결과에 맞춰 고침
    if pps_st.get("status") == "ok" and not pps_st.get("reused"):
        now_pps = {f["dedup_key"]: f for f in official if str(f.get("dedup_key", "")).startswith("pps-")}
        fix = {}
        for e in existing:
            k = str(e.get("dedup_key") or "")
            if not k.startswith("pps-"):
                continue
            n = now_pps.get(k)
            if n and (n["level"] != e.get("level") or n["summary"] != e.get("summary") or e.get("pps_state")):
                fix[e["id"]] = {"level": n["level"], "summary": n["summary"], "snippet": n["snippet"], "rstt_end": n.get("rstt_end"), "pps_state": None, "pps_updated_at": store.now_str()}
            elif not n and e.get("pps_state") not in ("missing_active", "expired"):  # 오늘은 '현재 유효 제재'로 조회되지 않음
                end = re.sub(r"\D", "", str(e.get("rstt_end") or (re.search(r"제재기간 \S* ~ (\S+)", e.get("snippet") or "") or [None, ""])[1]))[:8]
                if len(end) == 8 and end >= store.now_kst().strftime("%Y%m%d"):  # 기간이 남았는데 사라짐 → 법원 집행정지·해제 가능성
                    fix[e["id"]] = {"level": "orange", "pps_state": "missing_active", "pps_updated_at": store.now_str(),
                                    "summary": "제재 기간이 남았는데 나라장터에서 '현재 유효 제재'로 조회되지 않습니다 — 법원 집행정지·해제 가능성. 나라장터 '부정당제재 이력'에서 확인하세요. (처음 조회: " + (e.get("summary") or "")[:80] + ")"}
                else:  # 기간이 끝나서 사라짐 → 지난 이력
                    fix[e["id"]] = {"level": "yellow", "pps_state": "expired", "pps_updated_at": store.now_str(),
                                    "summary": (e.get("summary") or "") + " (제재 기간이 끝나 지금은 조회되지 않음 — 지난 이력)"}
        if fix:
            store.update_many("findings", fix)
    for f in official:
        if f["dedup_key"] in known:
            continue
        f["relevant"] = 1
        to_save.append(f)
        stats["new_findings"] += 1
        stats["official"] += 1
    if to_save:
        store.add_findings(company, to_save)

    # 6) 검사 내역 기록
    patch = {"last_check": {
        "at": store.now_str(),
        "mode": ("집중·심층" if deep else "집중·데일리") if focus else ("기본·주간검색" if queries else "기본"),
        "seconds": round(time.time() - t0, 1),
        "news": {"engines": sorted(engines_ok), "queries": len(queries), "fetched": stats["fetched"],
                 "mentioned": len(mentioned), "new_analyzed": len(cands),
                 "sweep_total": sweep_total, "sweep_hits": len(sweep_hits or [])},
        "analyzer": used if cands else ("claude" if config.ANTHROPIC_API_KEY else "rule"),
        "mdb": mdb,
        "pps": pps_st,
        "identity": {"bizno": bizno or None, "bizno_source": company.get("bizno_source") or ident["bizno_source"] or None,
                     "name_en": company.get("name_en") or None, "notes": ident["notes"]},
        "errors": errors[:5],
    }}
    if (deep or (not focus and queries)) and engines_ok:
        patch["last_deep_at"] = store.now_str()
    if engines_ok:
        patch["last_news_at"] = store.now_str()
    # 이미 본 기사 키 요약 갱신 (다음 스캔 때 전체 기록을 읽지 않도록)
    new_keys = {a["dedup_key"] for a in cands} | {f["dedup_key"] for f in official}
    if seen_doc is None or not new_keys <= seen_keys:
        store.update("seen", company["id"], {"keys": sorted((seen_keys | new_keys | {f.get("dedup_key") for f in existing}) - {None}),
                                             "updated_at": store.now_str()})
    store.update("companies", company["id"], patch)
    stats["errors"] = errors
    stats["deep"] = deep
    return stats


def _safe(fn):
    try:
        fn()
    except Exception as e:
        log.warning("DART 기업목록 미리 받기 실패: %s", e)


def _shared_feedback(rel_by: dict) -> tuple[list[str], list[str]]:
    """모든 업체에서 담당자가 누른 '관련 없음' / '확인 완료' 사례 (최근 것부터). 자동 정리·일괄 정리는 제외"""
    allf = sorted((f for l in rel_by.values() for f in l if f.get("source_type") == "news"), key=lambda f: f.get("reviewed_at") or "", reverse=True)
    note = lambda f: f" (메모: {str(f.get('review_note'))[:60]})" if f.get("review_note") else ""
    dis = [f"{f.get('company_name') or ''}: {(f.get('title') or '')[:100]}{note(f)}" for f in allf
           if f.get("status") == "dismissed" and f.get("reviewed_by") not in (None, "", "자동 정리")]
    conf = [f"{LEVEL_KO.get(f.get('level'), '참고')} · {f.get('company_name') or ''}: {(f.get('title') or '')[:100]}" for f in allf
            if f.get("status") == "reviewed" and f.get("review_note") != "과거 이력 일괄 정리"]
    return dis, conf


LEVEL_KO = {"red": "위험", "orange": "경고", "yellow": "참고"}


def _load_guide(dis: list[str], conf: list[str], refresh: bool) -> str:
    """팀 판정 지침 = 담당자 판단(확인 완료·관련 없음)을 AI가 요약한 것(auto, 전체 스캔 때 주 1회 갱신)"""
    try:
        g = store.get_many("meta", ["ai_guide"]).get("ai_guide") or {}
    except Exception:
        g = {}
    auto = g.get("auto") or ""
    n = len(dis) + len(conf)
    if (refresh and config.ANTHROPIC_API_KEY and not analyzer.CLAUDE_ERROR and n >= 5
            and _days_since(g.get("auto_at")) >= 7 and n != g.get("auto_n")):
        try:
            auto = analyzer.summarize_guide(dis[:60], conf[:60], auto) or auto
            store.update("meta", "ai_guide", {"auto": auto, "auto_at": store.now_str(), "auto_n": n})
            log.info("판정 지침 갱신: 사례 %d건 → %d줄", n, len(auto.splitlines()))
        except Exception as e:
            log.warning("판정 지침 갱신 실패: %s", type(e).__name__)
    return auto.strip()  # 직접 적는 칸은 없앰 (2026-11-12): AI가 정리한 기준만


def run_scan(only_names: list[str] | None = None, progress=None, should_stop=None, quick: bool = False) -> dict:
    """progress(done, total, current_name) 콜백으로 진행 상황을 알리고, should_stop()이 True면 남은 업체를 건너뛴다.
    quick: 빠른 스캔 (제재 키워드 기사 + 공식 명단만, 업체명 검색 없음)"""
    t_start = time.time()
    analyzer.CLAUDE_ERROR = None
    analyzer.check()
    projects = {p["id"]: p for p in store.all_docs("projects")}
    keywords = analyzer.build_keywords(store.all_docs("keywords"))  # 추가 키워드 + 예비 등급 기준
    companies = sorted(store.all_docs("companies"), key=lambda c: c["name"])
    if only_names:
        wanted = {n.strip() for n in only_names if n.strip()}
        companies = [c for c in companies if c["name"] in wanted]
    total = len(companies)
    if progress:
        progress(0, total, "제재 키워드 검색·제재리스트 준비")

    # DART 기업목록이 필요한 업체가 있으면 시작하자마자 백그라운드로 받기 시작
    needs_dart = not quick and config.DART_API_KEY and any(
        c.get("country", "KR") in ("KR", "", None) and not c.get("biz_no") and not c.get("corp_code")
        and _days_since(c.get("dart_checked_at")) >= 30 for c in companies)
    if needs_dart:
        threading.Thread(target=lambda: _safe(dart.load_master), daemon=True).start()

    errors: list[str] = []
    t_lists = time.time()
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_lists = ex.submit(sanctions.load_lists)
        stars = [k["word"] for k in keywords if k.get("user") and k.get("lang") == "ko"][:12]  # 추가 키워드도 매일 검색
        f_sweep = ex.submit(topic_sweep, errors, stars)
        entries, list_status = f_lists.result()
        sweep_articles, sweep_engines = f_sweep.result()
    lists_ok = sum(1 for v in list_status.values() if isinstance(v, int))
    lists_sec = round(time.time() - t_lists, 1)
    hits = match_sweep(sweep_articles, companies)
    edcf = store.all_docs("edcf_sanctions")
    # 업체별 관련 이슈는 한 번에 읽고(관련 없는 기사는 읽지 않음), 이미 본 기사 키 요약도 한 번에
    rel_by: dict[str, list] = {}
    for f in store.where("findings", "relevant", "==", True):
        rel_by.setdefault(f.get("company_id"), []).append(f)
    try:
        seen_docs = store.get_many("seen", [c["id"] for c in companies])
    except Exception as e:
        log.warning("seen 요약 읽기 실패 → 업체별로 읽음: %s", e)
        seen_docs = {}
    force = bool(only_names) and len(companies) <= 3  # 업체 1~3곳만 다시 스캔: 꼼꼼하게
    # AI가 계속 배우도록: 모든 업체에서 담당자가 누른 판단 사례 + 그것을 요약한 판정 지침을 판정마다 함께 줌
    fb_dis, fb_conf = _shared_feedback(rel_by)
    analyzer.SHARED = {"dismissed": fb_dis[:40], "confirmed": fb_conf[:40], "guide": _load_guide(fb_dis, fb_conf, refresh=not only_names and not quick)}
    # 매뉴얼: MDB는 영문명 조회 후 국적 대한민국으로 최종 확인 → 한국 국적 제재 기업 목록을 따로 기록
    korea = [{"name": e["name"], "dataset": e["dataset"], "sanctions": (e.get("sanctions") or "")[:200],
              "url": f"https://www.opensanctions.org/entities/{e['entity_id']}/"}
             for e in entries if "kr" in [c.strip().lower() for c in (e.get("countries") or "").replace(",", ";").split(";")]]
    store.update("meta", "mdb_korea", {"items": korea[:200], "count": len(korea), "at": store.now_str()})
    if progress:
        progress(0, total, f"제재 키워드 기사 {len(sweep_articles)}건 대조 완료")

    totals = {"companies": total, "fetched": 0, "candidates": 0, "new_findings": 0, "official": 0, "cleaned": 0, "deep": 0,
              "sweep_articles": len(sweep_articles), "sweep_matched_companies": len(hits),
              "focus": sum(1 for c in companies if c.get("engagements") or c.get("watch"))}
    lock, done = threading.Lock(), 0
    with ThreadPoolExecutor(max_workers=config.SCAN_WORKERS) as ex:
        futs = {ex.submit(scan_company, c, projects, keywords, entries, lists_ok,
                          hits.get(c["id"], []), sweep_engines, len(sweep_articles), edcf,
                          rel_by.get(c["id"], []) if c["id"] in seen_docs and seen_docs[c["id"]] is not None else None,
                          seen_docs.get(c["id"]), force, quick): c for c in companies}
        for fut in as_completed(futs):
            c = futs[fut]
            try:
                s = fut.result()
                with lock:
                    for k in ("fetched", "candidates", "new_findings", "official", "cleaned"):
                        totals[k] += s[k]
                    totals["deep"] += 1 if s["deep"] else 0
                    errors += s["errors"]
            except Exception as e:
                log.warning("업체 스캔 실패 (%d번째): %s", done + 1, type(e).__name__)  # 이름·내용은 실행 기록에만
                errors.append(f"{c['name']}: {e}")
            done += 1
            if done % 25 == 0 or done == total:  # 공개 로그라 업체 이름은 남기지 않음 (진행 상황은 대시보드에 표시)
                log.info("스캔 %d/%d", done, total)
            if should_stop and done % 3 == 0 and should_stop():
                for f in futs:
                    f.cancel()
                totals["stopped"] = True
                log.info("중지 요청으로 스캔을 멈춥니다 (%d/%d)", done, total)
                break
            if progress:
                try:
                    progress(done, total, c["name"])
                except Exception as e:
                    log.warning("진행 상황 기록 실패: %s", e)

    totals["seconds"] = round(time.time() - t_start, 1)
    totals["lists_seconds"] = lists_sec
    err = analyzer.CLAUDE_ERROR or ""
    claude_error = ("크레딧 부족 — Anthropic Console > Billing에서 크레딧 충전 필요" if "credit" in err
                    else "API 키 오류 — ANTHROPIC_API_KEY 확인 필요" if ("authentication" in err or "x-api-key" in err)
                    else err[:200] if err else None)
    totals["analyzer"] = "claude" if config.ANTHROPIC_API_KEY and not claude_error else "rule"
    if claude_error:
        totals["claude_error"] = claude_error
    totals["errors"] = errors[:50]
    totals["sanction_lists"] = list_status
    if only_names:
        totals["only"] = only_names
    if quick:
        totals["quick"] = True

    store.update("meta", "status", {
        "last_scan_at": store.now_str(),
        "last_scan_seconds": totals["seconds"],
        "sanction_lists": list_status,
        "analyzer": totals["analyzer"],
        "claude_model": config.CLAUDE_MODEL if config.ANTHROPIC_API_KEY else None,
        "claude_error": claude_error,
        "connections": connections(),
    })
    store.log_run("scan", not errors, totals)
    return totals


def dart_fill() -> dict:
    """업체 관리 [DART로 빈 정보 채우기]: 사업자번호·영문명이 빈 국내 업체를 DART 이름으로 찾음.
    이름이 정확히 1곳이면 바로 채우고, 여러 곳이면 후보(dart_cands)를 저장해 화면에서 고르게 함."""
    if not config.DART_API_KEY:
        raise RuntimeError("DART_API_KEY 가 등록돼 있지 않습니다")
    res = {"filled": 0, "choose": 0, "none": 0, "count": 0}
    patches: dict[str, dict] = {}
    for c in store.all_docs("companies"):
        if c.get("country", "KR") not in ("KR", "", None) or (c.get("biz_no") and c.get("name_en")):
            continue
        res["count"] += 1
        try:
            code = c.get("corp_code")
            cands = [] if code else dart.match_by_name(c["name"])[0]
            if not code and len(cands) == 1:
                code = cands[0][0]
            if code:
                d = dart.company_detail(code)
                p = {"corp_code": code, "dart_cands": None, "dart_note": None}
                if d.get("biz_no") and not c.get("biz_no"):
                    p.update(biz_no=pps.biz_digits(d["biz_no"]), bizno_source="DART 자동")
                if d.get("name_en") and not c.get("name_en"):
                    p["name_en"] = d["name_en"]
                if d.get("ceo") and not c.get("ceo"):
                    p["ceo"] = d["ceo"]
                cat = category.from_ksic(d.get("induty_code"))
                if cat and (not c.get("category") or c.get("category_source") == "이름 추정"):
                    p.update(category=cat, category_source="DART 업종", induty_code=d.get("induty_code"))
                patches[c["id"]] = p
                res["filled"] += 1
            elif cands:  # 같은 이름이 여러 곳: 후보마다 대표자·사업자번호를 받아 두고 화면에서 고름
                opts = []
                for r in cands[:8]:
                    d = dart.company_detail(r[0])
                    opts.append({"corp_code": r[0], "name": r[1], "name_en": d.get("name_en") or r[2] or "", "ceo": d.get("ceo") or "",
                                 "biz_no": pps.biz_digits(d.get("biz_no") or ""), "listed": bool(r[3]), "induty_code": d.get("induty_code") or ""})
                patches[c["id"]] = {"dart_cands": opts, "dart_checked_at": store.now_str()}
                res["choose"] += 1
            else:
                patches[c["id"]] = {"dart_checked_at": store.now_str(), "dart_note": "DART 기업목록에 없음 (비상장·소규모·건축사사무소 등) — 사업자번호 직접 입력 필요"}
                res["none"] += 1
        except Exception as e:
            log.warning("DART 채움 실패: %s", type(e).__name__)
    if patches:
        store.update_many("companies", patches)
    store.log_run("dartfill", True, res)
    return res


def connections() -> dict:
    """어떤 Secrets가 설정됐는지 (값은 기록하지 않음)"""
    return {
        "naver": news.naver_enabled(),
        "google_news": config.GOOGLE_NEWS_ENABLED,
        "claude": bool(config.ANTHROPIC_API_KEY),
        "dart": bool(config.DART_API_KEY),
        "pps": pps.enabled(),
        "smtp": bool(config.SMTP_USER and config.SMTP_PASSWORD),
    }
