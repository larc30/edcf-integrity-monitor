"""같은 이슈 묶기 — 대시보드(assets/app.js 의 groupFindings)와 같은 기준

같은 기사·같은 사건이 여러 건으로 보이지 않게 한 묶음으로 보여줌 (저장된 기록은 그대로):
 ① 제목이 같거나(매체 꼬리·[단독] 같은 머리표 제외) 원문 주소가 같은 기사 — 업체가 달라도 하나로
 ② 같은 업체 · 같은 분류(예: 입찰담합) · 보도일 3일 이내 — 여러 매체가 같은 사건을 보도한 경우
 ③ 같은 업체 · 제목이 거의 같음 (업체명을 뺀 제목의 글자 쌍 60% 이상 일치)
 ④ 같은 업체 · 같은 공식 명단의 기록 여러 건 (예: EDCF 제재 이력)
처리 상태(new/reviewed/dismissed)가 다른 기록끼리는 묶지 않음.
"""
import re
from datetime import datetime
from urllib.parse import urlparse

LEVEL_ORDER = {"red": 3, "orange": 2, "yellow": 1, "none": 0}
NEAR_DAYS = 3
SIM = 0.6


def norm_title(t: str | None) -> str:
    t = re.sub(r"\s*[-|]\s*[^-|]{1,30}$", "", t or "")  # ' - 연합뉴스' 같은 매체 꼬리
    t = re.sub(r"\[[^\]]{1,12}\]", "", t)              # [단독] [종합] 같은 머리표
    return re.sub(r"[^0-9a-zA-Z가-힣]", "", t).lower()


def _bigrams(s: str) -> set:
    return {s[i:i + 2] for i in range(len(s) - 1)}


def title_sim(a: str | None, b: str | None, name: str | None = "") -> float:
    """업체명을 뺀 제목끼리 글자 쌍 일치율 (0~1)"""
    n = re.sub(r"[^0-9a-zA-Z가-힣]", "", name or "").lower()
    x, y = norm_title(a), norm_title(b)
    if n:
        x, y = x.replace(n, ""), y.replace(n, "")
    A, B = _bigrams(x), _bigrams(y)
    return 2 * len(A & B) / (len(A) + len(B)) if A and B else 0.0


def _day(f: dict) -> int | None:
    for v in (f.get("published_at"), f.get("first_seen")):
        try:
            return datetime.strptime(str(v or "")[:10], "%Y-%m-%d").toordinal()
        except ValueError:
            continue
    return None


def _url_key(u: str | None) -> str | None:
    try:
        p = urlparse(u or "")
    except ValueError:
        return None
    return u if p.netloc and p.path.strip("/") else None


def _official(f: dict) -> bool:
    return (f.get("source_type") or "news") != "news"


def same_company_issue(a: dict, b: dict) -> bool:
    if _official(a) or _official(b):
        return _official(a) and _official(b) and a.get("source_name") == b.get("source_name")
    da, db_ = _day(a), _day(b)
    cat = a.get("category")
    if cat and cat != "기타" and cat == b.get("category") and da is not None and db_ is not None and abs(da - db_) <= NEAR_DAYS:
        return True
    return title_sim(a.get("title"), b.get("title"), a.get("company_name")) >= SIM


def rank(f: dict) -> tuple:
    """대표 고르기·정렬: 등급 높은 것 → 공식 명단 → 최신"""
    return (-LEVEL_ORDER.get(f.get("level"), 0), 0 if _official(f) else 1, -(_day(f) or 0), f.get("company_name") or "")


def group(findings: list[dict]) -> list[list[dict]]:
    """[[대표, 같은 내용…], …] — 묶음 안은 rank 순, 묶음끼리는 대표의 rank 순"""
    parent = list(range(len(findings)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[rj] = ri

    buckets: dict[tuple, list[int]] = {}
    for i, f in enumerate(findings):
        st = f.get("status") or "new"
        t = norm_title(f.get("title"))
        if len(t) >= 8:
            buckets.setdefault(("t", st, t), []).append(i)
        u = _url_key(f.get("url"))
        if u:
            buckets.setdefault(("u", st, u), []).append(i)
        buckets.setdefault(("c", st, f.get("company_id")), []).append(i)
    for (kind, _, _), idx in buckets.items():
        if kind != "c":
            for j in idx[1:]:
                union(idx[0], j)
            continue
        for x in range(len(idx)):
            for y in range(x + 1, len(idx)):
                if same_company_issue(findings[idx[x]], findings[idx[y]]):
                    union(idx[x], idx[y])
    out: dict[int, list[dict]] = {}
    for i, f in enumerate(findings):
        out.setdefault(find(i), []).append(f)
    groups = [sorted(g, key=rank) for g in out.values()]
    groups.sort(key=lambda g: rank(g[0]))
    return groups


def companies_of(g: list[dict]) -> list[str]:
    seen, names = set(), []
    for f in g:
        if f.get("company_id") not in seen:
            seen.add(f.get("company_id"))
            names.append(f.get("company_name") or "")
    return names
