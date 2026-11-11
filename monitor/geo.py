"""수원국 리스크 (초안) — 매일 아침 한 번, 문서 1개(meta/geo)에 저장

1) 외교부 여행경보: 공공데이터포털 '외교부_국가·지역별 여행경보'(+ 특별여행주의보)
   - 키: MOFA_TRAVEL_KEY, 없으면 DATA_GO_KR_KEY(조달청과 같은 공공데이터포털 키, 해당 API 활용신청 필요)
2) 지진: USGS 규모 4.5 이상 최근 7일 (키 없음) — 사업지·수원국에서 600km 안
3) 뉴스 이벤트: Google 뉴스·네이버 뉴스에서 '나라 이름 + 사건 단어' 제목만 (분쟁·테러·홍수·태풍 등)

대시보드(assets/geo.js)가 이 문서를 읽어 지도·여행경보·이벤트 목록을 그린다.
국가·도시 좌표와 이벤트 분류 단어는 assets/geo.js 와 같게 유지.
공개 로그에는 건수만 남긴다.
"""
import hashlib
import logging
import math
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import httpx

from . import config, store
from .sources import news

log = logging.getLogger(__name__)

# 국가: (이름, 영문명, 위도, 경도) — assets/geo.js GEO_COUNTRY 와 같게
COUNTRY = {
    "TZ": ("탄자니아", "Tanzania", -6.4, 34.9), "PK": ("파키스탄", "Pakistan", 30.4, 69.3), "KE": ("케냐", "Kenya", 0.2, 37.9),
    "MN": ("몽골", "Mongolia", 46.9, 103.8), "LA": ("라오스", "Laos", 19.9, 102.5), "ID": ("인도네시아", "Indonesia", -2.5, 118.0),
    "KR": ("한국", "South Korea", 36.5, 127.9), "VN": ("베트남", "Vietnam", 14.1, 108.3), "KH": ("캄보디아", "Cambodia", 12.6, 104.9),
    "BD": ("방글라데시", "Bangladesh", 23.7, 90.4), "PH": ("필리핀", "Philippines", 12.9, 121.8), "UZ": ("우즈베키스탄", "Uzbekistan", 41.4, 64.6),
    "ET": ("에티오피아", "Ethiopia", 9.1, 40.5), "GH": ("가나", "Ghana", 7.9, -1.0), "MM": ("미얀마", "Myanmar", 21.9, 95.9),
    "LK": ("스리랑카", "Sri Lanka", 7.9, 80.8), "NP": ("네팔", "Nepal", 28.4, 84.1), "RW": ("르완다", "Rwanda", -1.9, 29.9),
    "UG": ("우간다", "Uganda", 1.4, 32.3), "TN": ("튀니지", "Tunisia", 33.9, 9.5), "EG": ("이집트", "Egypt", 26.8, 30.8),
    "BO": ("볼리비아", "Bolivia", -16.3, -63.6), "PY": ("파라과이", "Paraguay", -23.4, -58.4), "CO": ("콜롬비아", "Colombia", 4.6, -74.3),
    "PE": ("페루", "Peru", -9.2, -75.0), "EC": ("에콰도르", "Ecuador", -1.8, -78.2), "GT": ("과테말라", "Guatemala", 15.8, -90.2),
    "SN": ("세네갈", "Senegal", 14.5, -14.5), "MZ": ("모잠비크", "Mozambique", -18.7, 35.5), "CM": ("카메룬", "Cameroon", 7.4, 12.4),
    "NG": ("나이지리아", "Nigeria", 9.1, 8.7), "TR": ("튀르키예", "Turkey", 39.0, 35.2), "UA": ("우크라이나", "Ukraine", 48.4, 31.2),
    "GE": ("조지아", "Georgia", 42.3, 43.4), "AZ": ("아제르바이잔", "Azerbaijan", 40.1, 47.6), "KZ": ("카자흐스탄", "Kazakhstan", 48.0, 66.9),
    "KG": ("키르기스스탄", "Kyrgyzstan", 41.2, 74.8), "TJ": ("타지키스탄", "Tajikistan", 38.9, 71.3), "TL": ("동티모르", "Timor-Leste", -8.9, 125.7),
}
# 사업명·기사 제목에 있으면 그 도시 좌표 — assets/geo.js GEO_CITY 와 같게
CITY = {
    "나이로비": (-1.29, 36.82), "몸바사": (-4.04, 39.67), "다르에스살람": (-6.79, 39.21), "도도마": (-6.16, 35.75), "잔지바르": (-6.17, 39.2),
    "울란바토르": (47.89, 106.91), "비엔티안": (17.97, 102.63), "루앙프라방": (19.89, 102.13), "다카": (23.81, 90.41), "치타공": (22.36, 91.78),
    "하노이": (21.03, 105.85), "호치민": (10.82, 106.63), "다낭": (16.05, 108.2), "메콩델타": (10.03, 105.78), "프놈펜": (11.56, 104.93),
    "타슈켄트": (41.3, 69.24), "사마르칸트": (39.65, 66.96), "민다나오": (7.6, 125.0), "다바오": (7.07, 125.61), "마닐라": (14.6, 120.98), "세부": (10.32, 123.89),
    "카라치": (24.86, 67.01), "이슬라마바드": (33.68, 73.05), "라호르": (31.55, 74.34), "자카르타": (-6.21, 106.85), "아디스아바바": (9.03, 38.74),
    "아크라": (5.6, -0.19), "콜롬보": (6.93, 79.86), "카트만두": (27.72, 85.32), "키갈리": (-1.95, 30.06), "캄팔라": (0.35, 32.58), "카이로": (30.04, 31.24), "양곤": (16.84, 96.17),
}
# 이벤트 종류 → 제목에서 찾을 단어 (위에서부터 먼저 맞는 것). 지진은 USGS 로 따로 받지만 뉴스에서도 잡음
EVENT_WORDS = [
    ("terror", ("테러", "폭탄", "자폭", "폭발 사건", "총격", "납치", "terror", "bomb", "suicide attack", "gunmen", "kidnap")),
    ("war", ("내전", "전쟁", "교전", "무력 충돌", "무력충돌", "쿠데타", "공습", "반군", "civil war", "clashes", "coup", "airstrike", "rebels")),
    ("quake", ("지진", "earthquake")),
    ("volcano", ("화산", "volcano", "eruption")),
    ("storm", ("태풍", "사이클론", "허리케인", "typhoon", "cyclone", "hurricane")),
    ("flood", ("홍수", "침수", "폭우", "산사태", "flood", "landslide")),
    ("fire", ("산불", "wildfire")),
    ("unrest", ("시위", "폭동", "소요", "계엄", "protest", "riot", "martial law")),
    ("disease", ("콜레라", "에볼라", "엠폭스", "전염병", "감염병", "cholera", "ebola", "mpox", "outbreak")),
]
NEWS_QUERY_WORDS = ["지진", "홍수", "태풍", "테러", "내전", "쿠데타", "폭동", "산불", "콜레라"]
KEEP_DAYS = 365  # 과거 이력(30일 이상)도 볼 수 있게 1년 보관
QUAKE_KM = 600
KST = timezone(timedelta(hours=9))


def _km(a, b) -> float:
    r = math.pi / 180
    dla, dlo = (b[0] - a[0]) * r, (b[1] - a[1]) * r
    x = math.sin(dla / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dlo / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(x))


def project_point(p: dict, i: int = 0):
    if isinstance(p.get("lat"), (int, float)) and isinstance(p.get("lng"), (int, float)):
        return (p["lat"], p["lng"])
    for name, ll in CITY.items():
        if name in (p.get("name") or ""):
            return ll
    c = COUNTRY.get(p.get("country") or "")
    if not c:
        return None
    a = i * 2.4
    return (c[2] + (math.sin(a) * 0.9 if i else 0), c[3] + (math.cos(a) * 0.9 if i else 0))


def targets(projects: list[dict]) -> list[tuple[tuple[float, float], str]]:
    out, seen, idx = [], set(), {}
    for p in projects:
        code = p.get("country") or ""
        idx[code] = idx.get(code, -1) + 1
        pt = project_point(p, idx[code])
        if pt:
            out.append((pt, code))
        if code in COUNTRY and code not in seen:
            seen.add(code)
            out.append(((COUNTRY[code][2], COUNTRY[code][3]), code))
    return out


def classify(text: str) -> str | None:
    t = (text or "").lower()
    for kind, words in EVENT_WORDS:
        if any(w.lower() in t for w in words):
            return kind
    return None


def _jitter(key: str, base: tuple[float, float]) -> tuple[float, float]:
    """같은 나라 기사들이 한 점에 겹치지 않게 (주소로 정해지는 작은 이동)"""
    h = int(hashlib.md5(key.encode()).hexdigest()[:8], 16)
    a, r = (h % 360) * math.pi / 180, 0.4 + (h >> 9) % 100 / 100
    return (round(base[0] + math.sin(a) * r, 3), round(base[1] + math.cos(a) * r, 3))


# ---------- 1) 외교부 여행경보 ----------
ALERT_URL = "https://apis.data.go.kr/1262000/TravelAlarmService2/getTravelAlarmList2"
SPECIAL_URL = "https://apis.data.go.kr/1262000/SptravelWarningServiceV2/getSptravelWarningListV2"


def _rows(j) -> list[dict]:
    """응답 모양이 조금 달라도 '나라 코드가 있는 줄' 목록을 꺼냄"""
    if isinstance(j, list):
        if j and all(isinstance(x, dict) for x in j) and any("country_iso_alp2" in x for x in j):
            return j
        return [r for x in j for r in _rows(x)]
    if isinstance(j, dict):
        if "country_iso_alp2" in j:
            return [j]
        return [r for v in j.values() for r in _rows(v)]
    return []


def fetch_alerts(get=httpx.get) -> dict:
    key = config.MOFA_TRAVEL_KEY
    if not key:
        return {}
    r = get(ALERT_URL, params={"serviceKey": key, "returnType": "JSON", "numOfRows": 1000, "pageNo": 1}, timeout=30)
    r.raise_for_status()
    out: dict[str, dict] = {}
    for row in _rows(r.json()):
        code = (row.get("country_iso_alp2") or "").upper()
        try:
            lvl = int(str(row.get("alarm_lvl") or "0").strip() or 0)
        except ValueError:
            lvl = 0
        if not code or not lvl:
            continue
        a = out.setdefault(code, {"level": 0, "min": 9, "regions": []})
        a["level"], a["min"] = max(a["level"], lvl), min(a["min"], lvl)
        reg = " ".join(str(row.get(k) or "").strip() for k in ("region_ty", "remark")).strip()
        if reg and reg not in a["regions"]:
            a["regions"].append(reg)
        a["written"] = max(a.get("written", ""), str(row.get("written_dt") or ""))
    for a in out.values():
        a["partial"] = a["min"] < a["level"]
        a["regions"] = " / ".join(a["regions"])[:300]
        a.pop("min", None)
    try:  # 특별여행주의보 (같은 키, 별도 활용신청). 실패해도 여행경보는 저장
        r2 = get(SPECIAL_URL, params={"serviceKey": key, "returnType": "JSON", "numOfRows": 300, "pageNo": 1}, timeout=30)
        r2.raise_for_status()
        for row in _rows(r2.json()):
            code = (row.get("country_iso_alp2") or "").upper()
            if code:
                a = out.setdefault(code, {"level": 0, "partial": False, "regions": ""})
                a["special"] = True
                a["special_text"] = str(row.get("splimit_note") or row.get("remark") or "")[:120]
    except Exception as e:
        log.warning("특별여행주의보 실패: %s", type(e).__name__)
    return out


# ---------- 2) USGS 지진 ----------
USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson"


def fetch_quakes(tg, get=httpx.get) -> list[dict]:
    if not tg:
        return []
    r = get(USGS_URL, timeout=30)
    r.raise_for_status()
    out = []
    for f in r.json().get("features", []):
        co = (f.get("geometry") or {}).get("coordinates", [None, None])
        lng, lat = co[:2]
        depth = co[2] if len(co) > 2 and co[2] is not None else None
        p = f.get("properties") or {}
        if lat is None or lng is None or p.get("mag") is None:
            continue
        d, code = min((_km((lat, lng), ll), c) for ll, c in tg)
        if d > QUAKE_KM:
            continue
        out.append({"id": f"usgs-{f.get('id')}", "type": "quake", "country": code, "lat": round(lat, 3), "lng": round(lng, 3),
                    "mag": round(float(p["mag"]), 1), "title": f"규모 {float(p['mag']):.1f} 지진 · {p.get('place') or ''}".strip(),
                    "url": p.get("url") or "", "at_ms": int(p.get("time") or 0), "source": "USGS", "dist_km": round(d),
                    **({"depth": round(float(depth))} if depth is not None else {})})
    return out


# ---------- 3) 뉴스 이벤트 ----------
def _ms(pub: str) -> int:
    if not pub:
        return 0
    try:
        return int(datetime.fromisoformat(pub[:10]).replace(tzinfo=KST).timestamp() * 1000)
    except ValueError:
        try:
            return int(parsedate_to_datetime(pub).timestamp() * 1000)
        except Exception:
            return 0


def news_events(codes: list[str], gnews=news.google_news, naver=news.naver_news) -> tuple[list[dict], int]:
    out, seen, errors = [], set(), 0
    since = int((datetime.now(KST) - timedelta(days=KEEP_DAYS)).timestamp() * 1000)
    for code in codes:
        if code not in COUNTRY or code == "KR":
            continue
        name = COUNTRY[code][0]
        items = []
        try:
            items += gnews(f"{name} ({' OR '.join(NEWS_QUERY_WORDS)})", "ko", 20)
        except Exception:
            errors += 1
        try:
            if news.naver_enabled():
                items += naver(" | ".join(f"{name} {w}" for w in NEWS_QUERY_WORDS[:6]), 20, "date")
        except Exception:
            errors += 1
        for it in items:
            title = it.get("title") or ""
            if name not in title:  # 나라 이름이 제목에 없으면 다른 나라 이야기일 가능성이 큼
                continue
            kind = classify(title)
            ms = _ms(it.get("published_at") or "")
            key = title.replace(" ", "")[:40]
            if not kind or ms < since or key in seen:
                continue
            seen.add(key)
            city = next((c for c in CITY if c in title), None)
            base = CITY[city] if city else (COUNTRY[code][2], COUNTRY[code][3])
            lat, lng = _jitter(it.get("url") or title, base) if not city else base
            out.append({"id": "news-" + hashlib.md5((it.get("url") or title).encode()).hexdigest()[:12], "type": kind, "country": code,
                        "lat": lat, "lng": lng, "title": title[:140], "url": it.get("url") or "", "at_ms": ms,
                        "source": f"{it.get('via') or '뉴스'} · {it.get('source_name') or ''}".strip(" ·")})
    return out, errors


def update(projects: list[dict] | None = None, get=httpx.get, gnews=news.google_news, naver=news.naver_news) -> dict:
    """meta/geo 갱신. 반환: 건수 요약 (공개 로그용)"""
    projects = projects if projects is not None else store.all_docs("projects")
    codes = sorted({p.get("country") for p in projects if p.get("country")})
    tg = targets(projects)
    prev_snap = store.db().collection("meta").document("geo").get()
    prev = (prev_snap.to_dict() or {}) if prev_snap.exists else {}
    doc, res = {"updated_at": store.now_str()}, {"countries": len(codes)}

    try:
        alerts = fetch_alerts(get)
        if alerts:
            doc["alerts"], doc["alerts_at"] = alerts, store.now_str()
        res["alerts"] = len(alerts) if alerts else ("키 없음" if not config.MOFA_TRAVEL_KEY else 0)
    except Exception as e:
        res["alerts"] = f"오류 {type(e).__name__}"
    try:
        quakes = fetch_quakes(tg, get)
        res["quakes"] = len(quakes)
    except Exception as e:
        quakes, res["quakes"] = [], f"오류 {type(e).__name__}"
    evs, errs = news_events(codes, gnews, naver)
    res["news"], res["news_errors"] = len(evs), errs
    if evs or not errs:
        doc["news_at"] = store.now_str()

    # 지난 이벤트와 합치기 (1년 지난 것은 버림, 같은 id 는 새것으로)
    since = int((datetime.now(KST) - timedelta(days=KEEP_DAYS)).timestamp() * 1000)
    merged = {e["id"]: e for e in prev.get("events") or [] if (e.get("at_ms") or 0) >= since}
    merged.update({e["id"]: e for e in quakes + evs})
    doc["events"] = sorted(merged.values(), key=lambda e: -(e.get("at_ms") or 0))[:300]
    res["events"] = len(doc["events"])
    store.update("meta", "geo", doc)
    return res
