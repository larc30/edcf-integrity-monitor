"""데이터 점검 — 지금 저장된 데이터가 설계대로 돌고 있는지 건수로만 확인 (공개 로그에 업체 이름·주소를 남기지 않음)

preview 작업 때 함께 실행됩니다 (읽기: 업체·사업·EXIMIIS 명단·관련 이슈 + 건수 집계 몇 번).
"""
from collections import Counter
from datetime import datetime

from . import store
from .scanner import match_edcf

LV = {"red": 3, "orange": 2, "yellow": 1, "none": 0}


def _age_days(ts, now: datetime) -> float | None:
    try:
        return (now - datetime.strptime(str(ts)[:19], "%Y-%m-%d %H:%M:%S")).total_seconds() / 86400
    except (TypeError, ValueError):
        return None


def _pub_age(f: dict, now: datetime) -> float | None:
    try:
        return (now - datetime.strptime(str(f.get("published_at") or "")[:10], "%Y-%m-%d")).days
    except ValueError:
        return None


def _count(name: str, *where) -> int:
    q = store.db().collection(name)
    if where:
        from google.cloud.firestore_v1.base_query import FieldFilter
        q = q.where(filter=FieldFilter(*where))
    return int(q.count().get()[0][0].value)


def check() -> dict:
    now = store.now_kst().replace(tzinfo=None)
    companies = store.all_docs("companies")
    projects = store.all_docs("projects")
    edcf = store.all_docs("edcf_sanctions")
    rel = store.where("findings", "relevant", "==", True)
    status = (store.db().collection("meta").document("status").get().to_dict() or {})
    ids = {c["id"] for c in companies}
    out: dict = {}

    # 1) 데이터
    focus = [c for c in companies if c.get("engagements") or c.get("watch")]
    edcf_ok = [e for e in edcf if str(e.get("status") or "").strip() or str(e.get("period") or "").strip()]
    out["데이터"] = {
        "업체": len(companies), "집중감시": len(focus), "사업": len(projects),
        "사업연결": sum(len(c.get("engagements") or []) for c in companies),
        "EXIMIIS": len(edcf), "EXIMIIS_제재기록아님": len(edcf) - len(edcf_ok),
        "이슈_전체": _count("findings"), "이슈_관련": len(rel), "메일수신자": _count("recipients"),
        "이미본기사_요약": _count("seen"),
    }

    # 2) 스캔 커버리지 (업체별 마지막 검사)
    ages = [_age_days((c.get("last_check") or {}).get("at"), now) for c in companies]
    lc = [c.get("last_check") or {} for c in companies]
    out["스캔"] = {
        "26시간내_검사": sum(1 for a in ages if a is not None and a <= 26 / 24),
        "그보다_오래됨": sum(1 for a in ages if a is not None and a > 26 / 24),
        "검사기록없음": sum(1 for a in ages if a is None),
        "방식": dict(Counter(x.get("mode") or "-" for x in lc)),
        "오류있는업체": sum(1 for x in lc if x.get("errors")),
        "Google사용": sum(1 for x in lc if "Google" in ((x.get("news") or {}).get("engines") or [])),
        "네이버사용": sum(1 for x in lc if "네이버" in ((x.get("news") or {}).get("engines") or [])),
        "판정": dict(Counter(x.get("analyzer") or "-" for x in lc)),
        "업체명검색_8일내": sum(1 for c in companies if (_age_days(c.get("last_deep_at"), now) or 99) <= 8),
        "집중_업체명검색_26시간내": sum(1 for c in focus if (_age_days(c.get("last_news_at"), now) or 99) <= 26 / 24),
    }

    # 3) 식별·공식 명단 조회 상태
    out["식별"] = {
        "사업자번호": sum(1 for c in companies if len("".join(ch for ch in str(c.get("biz_no") or "") if ch.isdigit())) == 10),
        "영문명": sum(1 for c in companies if c.get("name_en")),
        "조달청": dict(Counter(((x.get("pps") or {}).get("status") or "-") for x in lc)),
        "MDB": dict(Counter(((x.get("mdb") or {}).get("status") or "-") for x in lc)),
        "DART_직접입력필요": sum(1 for x in lc if any("직접 입력" in str(n) for n in ((x.get("identity") or {}).get("notes") or []))),
    }

    # 4) 이슈 — 등급·출처·처리 상태, 등급 기준과 어긋나는 것
    live = [f for f in rel if f.get("status") != "dismissed"]
    news = [f for f in live if (f.get("source_type") or "news") == "news"]
    keys = Counter((f.get("company_id"), f.get("dedup_key")) for f in rel)
    out["이슈"] = {
        "처리상태": dict(Counter(f.get("status") or "new" for f in rel)),
        "등급(관련없음 제외)": dict(Counter(f.get("level") or "none" for f in live)),
        "출처": dict(Counter(f.get("source_type") or "news" for f in live)),
        "판정방식": dict(Counter(f.get("analyzer") or "-" for f in live)),
        "뉴스인데_위험": sum(1 for f in news if f.get("level") == "red"),
        "뉴스_위험_1년지난기사": sum(1 for f in news if f.get("level") == "red" and (_pub_age(f, now) or 0) > 365),
        "뉴스_경고_1년지난기사": sum(1 for f in news if f.get("level") == "orange" and (_pub_age(f, now) or 0) > 365),
        "같은기사_중복저장": sum(n - 1 for n in keys.values() if n > 1),
        "삭제된업체의_이슈": sum(1 for f in rel if f.get("company_id") not in ids),
        "같은사건표시(same_as)": sum(1 for f in live if f.get("same_as")),
    }

    # 5) EXIMIIS 대조가 저장된 이슈와 맞는지
    expect, active = set(), 0
    for c in companies:
        hits = match_edcf(edcf, c)
        expect |= {(c["id"], h["dedup_key"]) for h in hits}
        active += any(h["level"] == "red" for h in hits)
    saved = {(f.get("company_id"), f.get("dedup_key")) for f in rel if str(f.get("dedup_key") or "").startswith("edcf-")}
    out["EXIMIIS대조"] = {"일치업체_기록": len(expect), "그중_현재제재업체": active,
                         "저장누락": len(expect - saved), "명단에없는_저장기록": len(saved - expect)}

    # 6) 업체 등급 (대시보드와 같은 기준: 관련 없음 처리하지 않은 이슈 중 가장 높은 등급)
    top: dict = {}
    for f in live:
        if LV.get(f.get("level"), 0) > LV.get(top.get(f.get("company_id")), 0):
            top[f.get("company_id")] = f.get("level")
    out["업체등급"] = dict(Counter(top.get(c["id"], "none") for c in companies))

    # 7) 자동 실행
    out["자동실행"] = {k: status.get(k) for k in ("last_scan_at", "last_daily_at", "last_tick_at")}
    return out
