"""스캔: 업체 식별(사업자번호·영문명) → 뉴스 수집·판정 → MDB 제재리스트 대조 → 조달청 부정당제재 조회

- 업체 6곳을 동시에 처리하고, DB 저장은 업체별로 한 번에 묶어서 한다(속도).
- 평소(데일리)에는 최신 기사만, 7일에 한 번은 '업체명+리스크 키워드' 심층 검색(과거 사건 포함).
- 업체마다 '무엇을 확인했는지'(last_check)를 기록해, 이슈가 없을 때도 검사 범위를 보여준다.
"""
import hashlib
import logging
import threading
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
TOPIC_QUERIES = [
    "부정당", "부정당업자", "부정당제재",
    "입찰참가자격 제한", "입찰참가제한", "입찰 제한 처분",
    "입찰 담합", "담합 과징금", "공정위 과징금 건설",
    "영업정지 건설사", "영업정지 엔지니어링", "등록말소 건설",
    "벌점 건설사", "제재 건설사", "제재 엔지니어링",
    "하도급 과징금", "공공입찰 제한", "국토교통부 처분",
    # 중대재해·안전사고 (팀 매뉴얼 언론보도 키워드: 재해)
    "중대재해 건설", "중대재해처벌법 기소", "건설현장 사망사고", "산업재해 건설사", "부실시공 건설사",
]


def topic_sweep(errors: list) -> tuple[list[dict], list[str]]:
    """제재 키워드로 Google 뉴스(+네이버)를 검색해 기사 모음 반환"""
    jobs = [("google", q) for q in TOPIC_QUERIES]
    if news.naver_enabled():
        jobs += [("naver", q) for q in TOPIC_QUERIES]

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
        active = "등록" in (e.get("status") or "")
        out.append({
            "source_type": "official", "source_name": "EDCF 부정당업자 (EXIMIIS)",
            "title": f"[EDCF 제재 {'등록' if active else '해지'}] {e.get('name')} · {e.get('period') or ''}",
            "url": "", "published_at": (e.get("period") or "")[:10].replace(".", "-"),
            "snippet": f"제재사유: {e.get('reason') or '-'} / 관련사업: {e.get('project_name') or '-'} ({e.get('country') or '-'}) / 등록기관: {e.get('agency') or '-'} / 사업자번호 {e.get('biz_no') or '-'}",
            "matched_keywords": "사업자번호 일치" if (biz and eb and biz == eb) else "업체명 일치",
            "level": "red" if active else "yellow", "category": "부정당업자 제재",
            "summary": (f"EDCF 부정당업자로 현재 등록되어 있습니다 (제재기간 {e.get('period') or '-'}, 사유: {(e.get('reason') or '-')[:80]})." if active
                        else f"과거 EDCF 부정당업자 제재 이력이 있습니다 (해지, 제재기간 {e.get('period') or '-'})."),
            "rationale": "EXIMIIS 부정당업자 명단 (경협평가부 관리)", "analyzer": "list-match",
            "dedup_key": "edcf-" + hashlib.sha1(f"{e.get('biz_no')}|{e.get('name')}|{e.get('period')}".encode()).hexdigest()[:16],
        })
    return out


def _days_since(ts: str | None) -> float:
    if not ts:
        return 1e9
    try:
        return (datetime.now() - datetime.strptime(ts[:19], "%Y-%m-%d %H:%M:%S")).total_seconds() / 86400
    except ValueError:
        return 1e9


def _queries(company: dict, keywords: list[dict], deep: bool) -> list[tuple[str, str, str, str]]:
    """(engine, lang, query, sort) 목록.
    데일리: 업체명 최신순 검색만 / 심층(deep): + '업체명 리스크키워드' 관련도순(과거 사건 포함)"""
    langs = [l.strip() for l in (company.get("search_langs") or "ko").split(",") if l.strip()]
    names = search_names(company)
    qs = []
    if "ko" in langs:
        boosters = [k["word"] for k in keywords if k.get("use_in_query") and k.get("lang") == "ko"][:6] if deep else []
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
                 force: bool = False) -> dict:
    """existing: 이 업체의 관련 이슈(relevant) 목록, seen_doc: 이미 본 기사 키 요약(seen/{업체 id}),
    force: 업체 하나만 '다시 스캔' — 주간 제한 없이 업체명 검색, 10년 범위, 예전에 관련 없다고 본 기사도 다시 판정"""
    t0 = time.time()
    errors: list[str] = []
    stats = {"fetched": 0, "candidates": 0, "new_findings": 0, "official": 0, "cleaned": 0}
    engagements = [
        {**e, "project_name": projects.get(e.get("project_id"), {}).get("name", "(삭제된 사업)")}
        for e in company.get("engagements") or []
    ]
    # 집중 감시: 우리 사업에 연결된 업체(또는 직접 지정) → 매일 업체명 검색
    # 기본 감시: 그 외 명단 업체 → 매일 제재 키워드 대조 + 조달청·MDB, 업체명 검색은 주 1회
    focus = bool(engagements) or bool(company.get("watch"))
    weekly_due = force or _days_since(company.get("last_deep_at")) >= config.DEEP_EVERY_DAYS
    deep = focus and weekly_due
    if focus:
        queries = _queries(company, keywords, deep)
    elif weekly_due:  # 기본 감시 업체도 주 1회 업체명 최신순 검색 (Google + 네이버)
        qs = _queries(company, keywords, False)
        queries = [q for q in qs if q[0] == "google"][:1] + [q for q in qs if q[0] == "naver"][:1]
    else:
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
        "confirmed": [f.get("title", "")[:120] for f in fb_src if f.get("status") == "reviewed"][:8],
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
    elif not focus and _days_since((company.get("last_check") or {}).get("pps", {}).get("checked_at")) < 3:
        pps_st = dict(company["last_check"]["pps"])  # 기본 감시 업체는 3일마다 조회 (API 일일 한도 고려)
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


def run_scan(only_names: list[str] | None = None, progress=None, should_stop=None) -> dict:
    """progress(done, total, current_name) 콜백으로 진행 상황을 알리고, should_stop()이 True면 남은 업체를 건너뛴다."""
    t_start = time.time()
    analyzer.CLAUDE_ERROR = None
    analyzer.check()
    projects = {p["id"]: p for p in store.all_docs("projects")}
    keywords = store.all_docs("keywords")
    companies = sorted(store.all_docs("companies"), key=lambda c: c["name"])
    if only_names:
        wanted = {n.strip() for n in only_names if n.strip()}
        companies = [c for c in companies if c["name"] in wanted]
    total = len(companies)
    if progress:
        progress(0, total, "제재 키워드 검색·제재리스트 준비")

    # DART 기업목록이 필요한 업체가 있으면 시작하자마자 백그라운드로 받기 시작
    needs_dart = config.DART_API_KEY and any(
        c.get("country", "KR") in ("KR", "", None) and not c.get("biz_no") and not c.get("corp_code")
        and _days_since(c.get("dart_checked_at")) >= 30 for c in companies)
    if needs_dart:
        threading.Thread(target=lambda: _safe(dart.load_master), daemon=True).start()

    errors: list[str] = []
    t_lists = time.time()
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_lists = ex.submit(sanctions.load_lists)
        f_sweep = ex.submit(topic_sweep, errors)
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
                          seen_docs.get(c["id"]), force): c for c in companies}
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
                log.exception("scan failed for %s", c["name"])
                errors.append(f"{c['name']}: {e}")
            done += 1
            log.info("스캔 %d/%d: %s", done, total, c["name"])
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
