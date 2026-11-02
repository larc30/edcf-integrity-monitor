"""스캔: 업체별 뉴스 수집 → 필터 → AI 판정 → 공식 제재리스트 매칭 → Firestore 저장"""
import hashlib
import logging
from datetime import date, timedelta

from . import analyzer, config, store
from .sources import dart, news, sanctions
from .textutil import dedup_key, mentions

log = logging.getLogger(__name__)

EN_RISK_QUERY = '(corruption OR fraud OR sanction OR debarment OR bribery OR collusion OR "bid rigging")'
ID_RISK_QUERY = '(korupsi OR tersangka OR suap OR sanksi OR "daftar hitam")'


def _queries(company: dict, keywords: list[dict]) -> list[tuple[str, str, str]]:
    """(engine, lang, query) 목록"""
    langs = [l.strip() for l in (company.get("search_langs") or "ko").split(",") if l.strip()]
    names = [company["name"]] + [a.strip() for a in (company.get("aliases") or "").split(",") if a.strip()]
    qs = []
    if "ko" in langs:
        boosters = [k["word"] for k in keywords if k.get("use_in_query") and k.get("lang") == "ko"][:6]
        for n in names[:2]:
            qs.append(("naver", "ko", f'"{n}"'))
            qs.append(("google", "ko", f'"{n}"'))
            for b in boosters:
                qs.append(("naver", "ko", f'"{n}" {b}'))
            if boosters:
                qs.append(("google", "ko", f'"{n}" ({" OR ".join(boosters)})'))
    if "en" in langs:
        en_name = company.get("name_en") or (company["name"] if company["name"].isascii() else "")
        if en_name:
            qs.append(("google", "en", f'"{en_name}" {EN_RISK_QUERY}'))
            qs.append(("google", "en", f'"{en_name}"'))
    if "id" in langs:
        n = company.get("name_en") or company["name"]
        qs.append(("google", "id", f'"{n}" {ID_RISK_QUERY}'))
    return qs


def _enrich_from_dart(company: dict, errors: list) -> None:
    """DART 고유번호가 있으면 대표자·사업자번호·영문명 자동 보강"""
    if not (company.get("corp_code") and config.DART_API_KEY) or company.get("ceo"):
        return
    try:
        d = dart.company_detail(company["corp_code"])
    except Exception as e:
        errors.append(f"{company['name']} / DART 기업개황: {e}")
        return
    patch = {k: v for k, v in d.items() if v and not company.get(k)}
    if patch:
        store.update("companies", company["id"], patch)
        company.update(patch)


def scan_company(company: dict, projects: dict, keywords: list[dict], entries: list[dict], errors: list) -> dict:
    stats = {"fetched": 0, "candidates": 0, "new_findings": 0, "official": 0}
    _enrich_from_dart(company, errors)
    engagements = [
        {**e, "project_name": projects.get(e.get("project_id"), {}).get("name", "(삭제된 사업)")}
        for e in company.get("engagements") or []
    ]

    # 1) 뉴스 수집
    cutoff = (date.today() - timedelta(days=config.NEWS_LOOKBACK_DAYS)).isoformat()
    seen, articles = set(), []
    for engine, lang, q in _queries(company, keywords):
        try:
            items = news.naver_news(q) if engine == "naver" else news.google_news(q, lang)
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
    names = [company["name"], company.get("name_en") or ""] + [
        x.strip() for x in (company.get("aliases") or "").split(",")
    ]
    known = store.known_keys(company["id"])
    cands = [
        a
        for a in articles
        if a["dedup_key"] not in known
        and (not a["published_at"] or a["published_at"] >= cutoff)
        and mentions(f"{a['title']} {a.get('snippet', '')}", names)
    ][:60]
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

    # 4) 공식 제재 리스트
    official = sanctions.match_company(entries, company)
    try:
        official += sanctions.pps_lookup(company)
    except Exception as e:
        errors.append(f"{company['name']} / 조달청 API: {e}")
    for f in official:
        f["dedup_key"] = "official-" + hashlib.sha1((f["url"] + f["title"]).encode()).hexdigest()[:16]
        if f["dedup_key"] in known:
            continue
        f["relevant"] = 1
        store.add_finding(company, f)
        stats["new_findings"] += 1
        stats["official"] += 1
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
    totals = {"companies": len(companies), "fetched": 0, "candidates": 0, "new_findings": 0, "official": 0}
    for c in companies:
        log.info("스캔: %s", c["name"])
        try:
            s = scan_company(c, projects, keywords, entries, errors)
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

    store.update(
        "meta",
        "status",
        {
            "last_scan_at": store.now_str(),
            "sanction_lists": list_status,
            "analyzer": totals["analyzer"],
            "claude_model": config.CLAUDE_MODEL if config.ANTHROPIC_API_KEY else None,
            "connections": connections(),
        },
    )
    store.log_run("scan", not errors, totals)
    return totals


def connections() -> dict:
    """어떤 Secrets가 설정됐는지 (값은 기록하지 않음)"""
    return {
        "naver": bool(config.NAVER_CLIENT_ID and config.NAVER_CLIENT_SECRET),
        "google_news": config.GOOGLE_NEWS_ENABLED,
        "claude": bool(config.ANTHROPIC_API_KEY),
        "dart": bool(config.DART_API_KEY),
        "pps": bool(config.PPS_SANCTION_API_URL and config.DATA_GO_KR_KEY),
        "smtp": bool(config.SMTP_USER and config.SMTP_PASSWORD),
    }
