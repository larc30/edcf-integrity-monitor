"""공식 제재 리스트

1) MDB 제재 리스트 — OpenSanctions가 정리해 공개하는 데이터셋(세계은행·ADB·AfDB·IDB·EBRD)을
   실행할 때마다 내려받아, 등록 업체명(국문/영문/별칭)과 매칭한다.
   ※ OpenSanctions 데이터는 비상업적 이용 무료(CC BY-NC). 실서비스 전 라이선스 확인 필요.
2) 조달청 부정당제재는 sources/pps.py
"""
import csv
import difflib
import io
import logging

import httpx

from .. import config
from ..textutil import norm

log = logging.getLogger(__name__)

DATASET_LABEL = {
    "worldbank_debarred": "World Bank 제재기업 리스트",
    "adb_sanctions": "ADB 제재 리스트",
    "afdb_sanctions": "AfDB 제재 리스트",
    "iadb_sanctions": "IDB 제재 리스트",
    "ebrd_ineligible": "EBRD 제재 리스트",
}

DATASET_HOME = {
    "worldbank_debarred": "https://www.worldbank.org/en/projects-operations/procurement/debarred-firms",
    "adb_sanctions": "https://lnadbg4.adb.org/oga0009p.nsf/sancALL1P?OpenView",
    "afdb_sanctions": "https://www.afdb.org/en/projects-and-operations/procurement/debarment-and-sanctions-procedures",
    "iadb_sanctions": "https://www.iadb.org/en/who-we-are/topics/transparency/integrity-at-the-idb-group/sanctioned-firms-and-individuals",
    "ebrd_ineligible": "https://www.ebrd.com/ineligible-entities.html",
}


def _load_one(ds: str) -> tuple[str, list[dict], object]:
    url = f"{config.OPENSANCTIONS_BASE}/{ds}/targets.simple.csv"
    try:
        r = httpx.get(url, timeout=90, follow_redirects=True)
        r.raise_for_status()
        out = []
        for row in csv.DictReader(io.StringIO(r.text)):
            if row.get("schema") not in (None, "", "Company", "Organization", "LegalEntity"):
                continue
            names = [row.get("name", "")] + [a for a in (row.get("aliases") or "").split(";") if a]
            out.append({
                "dataset": ds, "entity_id": row.get("id"), "name": row.get("name"),
                "countries": row.get("countries"), "sanctions": row.get("sanctions"),
                "norm_names": sorted({norm(x) for x in names if norm(x)}),
            })
        return ds, out, len(out)
    except Exception as e:  # 한 리스트 실패가 전체를 막지 않도록
        log.warning("sanction list %s failed: %s", ds, e)
        return ds, [], f"오류: {e}"


def load_lists() -> tuple[list[dict], dict]:
    """5개 리스트를 동시에 내려받아 메모리에 적재. (entries, {dataset: count or error})"""
    from concurrent.futures import ThreadPoolExecutor

    entries, result = [], {}
    with ThreadPoolExecutor(max_workers=len(config.OPENSANCTIONS_DATASETS) or 1) as ex:
        for ds, out, status in ex.map(_load_one, config.OPENSANCTIONS_DATASETS):
            entries += out
            result[ds] = status
    return entries, result


def _candidate_names(company: dict) -> list[str]:
    names = [company["name"], company.get("name_en") or ""]
    names += [a.strip() for a in (company.get("aliases") or "").split(",")]
    return [n for n in names if n and len(norm(n)) >= 3]


_index_cache: dict = {}


def _index(entries: list[dict]) -> tuple[dict, dict]:
    key = id(entries)
    if key not in _index_cache:
        exact, by_first = {}, {}
        for e in entries:
            for en in e["norm_names"]:
                if en:
                    exact.setdefault(en, []).append(e)
                    by_first.setdefault(en[0], []).append((en, e))
        _index_cache.clear()
        _index_cache[key] = (exact, by_first)
    return _index_cache[key]


def match_company(entries: list[dict], company: dict) -> list[dict]:
    """업체를 적재된 제재 리스트와 매칭 → findings 형태로 반환"""
    targets = {norm(n): n for n in _candidate_names(company)}
    if not targets or not entries:
        return []
    exact, by_first = _index(entries)
    best: dict[str, tuple[float, str, dict]] = {}
    # 유사명은 오탐이 많다(예: 다른 회사 'ANS Technologies'). 국가가 같고 아주 비슷할 때만 '확인 필요'로 표시
    my_country = (company.get("country") or "KR").lower()
    for tn, raw in targets.items():
        for e in exact.get(tn, []):
            best[e["entity_id"] + e["dataset"]] = (1.0, raw, e)
        for en, e in by_first.get(tn[0], []):
            if abs(len(en) - len(tn)) > max(3, len(tn) // 3):
                continue
            if min(len(tn), len(en)) >= 6 and (tn in en or en in tn):
                score = 0.9
            else:
                sm = difflib.SequenceMatcher(None, tn, en)
                if sm.real_quick_ratio() < 0.88 or sm.quick_ratio() < 0.88:
                    continue
                score = sm.ratio()
            k = e["entity_id"] + e["dataset"]
            countries = (e.get("countries") or "").lower()
            if score < 0.99 and (score < 0.94 or my_country not in countries):
                continue
            if score > best.get(k, (0,))[0]:
                best[k] = (score, raw, e)
    out = []
    for score, best_src, e in best.values():
        exact_hit = score >= 0.99
        ds = e["dataset"]
        out.append(
            {
                "source_type": "official",
                "source_name": DATASET_LABEL.get(ds, ds),
                "title": f"[{DATASET_LABEL.get(ds, ds)}] {e['name']} — {'등재 확인' if exact_hit else '유사명 매칭(확인 필요)'}",
                "url": f"https://www.opensanctions.org/entities/{e['entity_id']}/",
                "published_at": "",
                "snippet": f"리스트 등재명: {e['name']} / 국가: {e['countries'] or '-'} / 제재정보: {(e['sanctions'] or '-')[:300]}"
                f" / 원 출처: {DATASET_HOME.get(ds, '')}",
                "matched_keywords": f"이름매칭 {score:.2f} ({best_src})",
                "level": "red" if exact_hit else "orange",
                "category": "MDB 제재",
                "summary": (
                    f"{DATASET_LABEL.get(ds, ds)}에 '{e['name']}'(으)로 등재되어 있습니다. 교차제재(Cross-Debarment) 대상 여부 확인 필요."
                    if exact_hit
                    else f"{DATASET_LABEL.get(ds, ds)} 등재 업체 '{e['name']}'와 이름이 유사합니다(유사도 {score:.2f}). 동일 법인인지 확인 필요."
                ),
                "analyzer": "list-match",
            }
        )
    return out