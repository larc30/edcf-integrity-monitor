"""스캔: 업체 식별(사업자번호·영문명) → 뉴스 수집·판정 → MDB 제재리스트 대조 → 조달청 부정당제재 조회

업체마다 '무엇을 확인했는지'(last_check)를 기록해, 이슈가 없을 때도 검사 범위를 보여줄 수 있게 한다.
"""
import hashlib
import logging
from datetime import date, timedelta

from . import analyzer, config, store
from .sources import dart, news, pps, sanctions
from .textutil import dedup_key, mentions

log = logging.getLogger(__name__)

EN_RISK_QUERY = '(corruption OR fraud OR sanction OR debarment OR bribery OR collusion OR "bid rigging")'
ID_RISK_QUERY = '(korupsi OR tersangka OR suap OR sanksi OR "daftar hitam")'


def _queries(company: dict, keywords: list[dict]) -> list[tuple[str, str, str, str]]:
    """(engine, lang, query, sort) 목록. 업체명만 검색은 최신순, '업체명+리스크 키워드'는 관련도순(과거 사건 포함)."""
    langs = [l.strip() for l in (company.get("search_langs") or "ko").split(",") if l.strip()]
    names = [company["name"]] + [a.strip() for a in (company.get("aliases") or "").split(",") if a.strip()]
    names = [n for n in names if not n.isascii()] or names  # 국문 검색에는 국문 이름 우선
    qs = []
    if "ko" in langs:
        boosters = [k["word"] for k in keywords if k.get("use_in_query") and k.get("lang") == "ko"][:6]
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
        qs.append(("google", "en", f'"{en_name}"', "date"))
    if "id" in langs:
        qs.append(("google", "id", f'"{en_name or company["name"]}" {ID_RISK_QUERY}', "date"))
    if not news.naver_enabled():
        qs = [q for q in qs if q[0] != "naver"]
    return qs


def _identify(company: dict, errors: list) -> dict:
    """사업자번호·영문명·대표자 자동 보강. 사용자가 입력한 값은 덮어쓰지 않는다."""
    info = {"bizno_source": company.get("bizno_source") or ("직접 입력" if company.get("biz_no") else ""), "notes": []}
    patch: dict = {}

    # 1) DART: 국내 법인, 사업자번호 없을 때 업체명으로 고유번호 찾기
    if config.DART_API_KEY and company.get("country", "KR") in ("KR", "", None) and not company.get("biz_no"):
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
                elif cands:
                    info["notes"].append(f"DART에 같은 이름 기업이 {len(cands)}곳 있어 자동 매칭하지 않음 — 사업자번호 직접 입력 필요")
                else:
                    info["notes"].append("DART 기업목록에 없음 (비상장·소규모·건축사사무소 등) — 사업자번호 직접 입력 필요")
            if corp_code:
                d = dart.company_detail(corp_code)
                if d.get("biz_no"):
                    patch["biz_no"] = pps.biz_digits(d["biz_no"])
                    patch["bizno_source"] = "DART 자동"
                if d.get("name_en") and not company.get("name_en") and "name_en" not in patch:
                    patch["name_en"] = d["name_en"]
                if d.get("ceo") and not company.get("ceo"):
                    patch["ceo"] = d["ceo"]
        except Exception as e:
            errors.append(f"{company['name']} / DART: {e}")

    # 2) 나라장터 기본정보: 사업자번호로 영문업체명·대표자 보강
    bizno = patch.get("biz_no") or company.get("biz_no")
    if pps.enabled() and bizno and (not (company.get("name_en") or patch.get("name_en")) or not (company.get("ceo") or patch.get("ceo"))):
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

    if patch.get("name_en"):
        langs = [l for l in (company.get("search_langs") or "ko").split(",") if l]
        if "en" not in langs:
            patch["search_langs"] = ",".join(langs + ["en"])
    if patch:
        store.update("companies", company["id"], patch)
        company.update(patch)
        info["bizno_source"] = company.get("bizno_source") or info["bizno_source"]
    return info


def scan_company(company: dict, projects: dict, keywords: list[dict], entries: list[dict], lists_ok: int, errors: list) -> dict:
    stats = {"fetched": 0, "candidates": 0, "new_findings": 0, "official": 0}
    err_before = len(errors)
    ident = _identify(company, errors)
    engagements = [
        {**e, "project_name": projects.get(e.get("project_id"), {}).get("name", "(삭제된 사업)")}
        for e in company.get("engagements") or []
    ]

    # 1) 뉴스 수집
    cutoff = (date.today() - timedelta(days=config.NEWS_LOOKBACK_DAYS)).isoformat()
    seen, articles, engines_ok, queries = set(), [], set(), _queries(company, keywords)
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

    # 2) 필터: 기간, 업체명 실제 등장, 이미 분석한 기사 제외
    names = [company["name"], company.get("name_en") or ""] + [x.strip() for x in (company.get("aliases") or "").split(",")]
    known = store.known_keys(company["id"])
    mentioned = [
        a for a in articles
        if (not a["published_at"] or a["published_at"] >= cutoff) and mentions(f"{a['title']} {a.get('snippet', '')}", names)
    ]
    cands = [a for a in mentioned if a["dedup_key"] not in known][:60]
    stats["candidates"] = len(cands)

    # 3) 판정 (Claude, 실패/미설정 시 키워드 규칙)
    judgements, used = analyzer.analyze(company, engagements, cands, keywords)
    by_idx = {j["idx"]: j for j in judgements}
    for i, a in enumerate(cands):
        j = by_idx.get(i, {"relevant": 0, "level": "none"})
        text = f"{a['title']} {a.get('snippet', '')}".lower()
        f = {
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
        }
        store.add_finding(company, f)
        if f["relevant"]:
            stats["new_findings"] += 1

    # 4) MDB 제재리스트 (영문명이 있어야 의미 있는 대조가 된다)
    official = sanctions.match_company(entries, company)
    mdb_names = [n for n in [company.get("name_en"), *(company.get("aliases") or "").split(","), company["name"]] if n and n.strip().isascii()]
    mdb = {"lists": lists_ok, "names": mdb_names[:3], "status": "ok" if (lists_ok and mdb_names) else ("no_lists" if not lists_ok else "no_en")}

    # 5) 조달청 부정당제재 (사업자번호 필요, 조회 시점 유효 제재만)
    bizno = pps.biz_digits(company.get("biz_no"))
    if company.get("country") not in (None, "", "KR") and len(bizno) != 10:
        pps_st = {"status": "foreign"}  # 해외 업체: 국내 조달청 제재 대상 아님
    elif not pps.enabled():
        pps_st = {"status": "not_connected"}
    elif len(bizno) != 10:
        pps_st = {"status": "no_bizno"}
    else:
        try:
            hits = pps.sanctions(company)
            official += hits
            pps_st = {"status": "ok", "bizno": bizno, "hits": len(hits)}
        except Exception as e:
            errors.append(f"{company['name']} / 조달청 부정당제재: {e}")
            pps_st = {"status": "error", "bizno": bizno, "error": str(e)[:200]}

    for f in official:
        f.setdefault("dedup_key", "official-" + hashlib.sha1((f["url"] + f["title"]).encode()).hexdigest()[:16])
        if f["dedup_key"] in known:
            continue
        f["relevant"] = 1
        store.add_finding(company, f)
        stats["new_findings"] += 1
        stats["official"] += 1

    # 6) 검사 내역 기록
    store.update("companies", company["id"], {"last_check": {
        "at": store.now_str(),
        "news": {"engines": sorted(engines_ok), "queries": len(queries), "fetched": stats["fetched"],
                 "mentioned": len(mentioned), "new_analyzed": len(cands)},
        "analyzer": used if cands else ("claude" if config.ANTHROPIC_API_KEY else "rule"),
        "mdb": mdb,
        "pps": pps_st,
        "identity": {"bizno": bizno or None, "bizno_source": company.get("bizno_source") or ident["bizno_source"] or None,
                     "name_en": company.get("name_en") or None, "notes": ident["notes"]},
        "errors": errors[err_before:][:5],
    }})
    return stats


def run_scan(only_names: list[str] | None = None) -> dict:
    errors: list[str] = []
    projects = {p["id"]: p for p in store.all_docs("projects")}
    keywords = store.all_docs("keywords")
    companies = sorted(store.all_docs("companies"), key=lambda c: c["name"])
    if only_names:
        wanted = {n.strip() for n in only_names if n.strip()}
        companies = [c for c in companies if c["name"] in wanted]

    entries, list_status = sanctions.load_lists()
    lists_ok = sum(1 for v in list_status.values() if isinstance(v, int))
    totals = {"companies": len(companies), "fetched": 0, "candidates": 0, "new_findings": 0, "official": 0}
    for c in companies:
        log.info("스캔: %s", c["name"])
        try:
            s = scan_company(c, projects, keywords, entries, lists_ok, errors)
            for k in ("fetched", "candidates", "new_findings", "official"):
                totals[k] += s[k]
        except Exception as e:
            log.exception("scan failed for %s", c["name"])
            errors.append(f"{c['name']}: {e}")
    totals["analyzer"] = "claude" if config.ANTHROPIC_API_KEY else "rule"
    totals["errors"] = errors[:50]
    totals["sanction_lists"] = list_status
    if only_names:
        totals["only"] = only_names

    store.update("meta", "status", {
        "last_scan_at": store.now_str(),
        "sanction_lists": list_status,
        "analyzer": totals["analyzer"],
        "claude_model": config.CLAUDE_MODEL if config.ANTHROPIC_API_KEY else None,
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
