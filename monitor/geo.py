"""수원국 리스크 (초안) · 매일 아침 한 번, 문서 1개(meta/geo)에 저장

1) 외교부 여행경보: 공공데이터포털 '외교부_국가·지역별 여행경보'(+ 특별여행주의보)
   - 키: MOFA_TRAVEL_KEY, 없으면 DATA_GO_KR_KEY(조달청과 같은 공공데이터포털 키, 해당 API 활용신청 필요)
2) 지진: USGS 규모 4.5 이상 최근 7일 (키 없음) — 사업지·수원국에서 600km 안
2-1) GDACS(UN·EU) 태풍·홍수·화산·산불 주황·빨강 경보 (키 없음) — 600km 안
2-2) WHO 감염병 발생 소식(Disease Outbreak News, 키 없음) — 나라 단위
3) 뉴스 이벤트: Google 뉴스·네이버 뉴스에서 '나라 이름 + 사건 단어' 제목만 (분쟁·테러·홍수·태풍 등)

대시보드(assets/geo.js)가 이 문서를 읽어 지도·여행경보·이벤트 목록을 그린다.
국가·도시 좌표와 이벤트 분류 단어는 assets/geo.js 와 같게 유지.
공개 로그에는 건수만 남긴다.
"""
import hashlib
import logging
import math
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import httpx

from . import config, store
from .sources import news

log = logging.getLogger(__name__)

# 국가: (이름, 영문명, 위도, 경도) — assets/geo.js GEO_COUNTRY 와 같게
COUNTRY = {
    "HN": ("온두라스", "Honduras", 15.2, -86.2), "NI": ("니카라과", "Nicaragua", 12.9, -85.2), "SV": ("엘살바도르", "El Salvador", 13.8, -88.9), "CR": ("코스타리카", "Costa Rica", 9.7, -83.8), "PA": ("파나마", "Panama", 8.5, -80.8), "DO": ("도미니카공화국", "Dominican Republic", 18.7, -70.2), "BR": ("브라질", "Brazil", -14.2, -51.9),
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
    "다카르": (14.72, -17.47), "티에스": (14.79, -16.93), "생루이": (16.03, -16.5), "아루샤": (-3.37, 36.68), "므완자": (-2.52, 32.9),
    "음베야": (-8.9, 33.46), "탕가": (-5.07, 39.1), "페샤와르": (34.01, 71.58), "퀘타": (30.18, 66.99), "파이살라바드": (31.42, 73.08),
    "물탄": (30.2, 71.47), "라왈핀디": (33.6, 73.05), "키수무": (-0.09, 34.77), "나쿠루": (-0.3, 36.07), "엘도레트": (0.51, 35.27),
    "다르항": (49.49, 105.92), "에르데네트": (49.03, 104.08), "팍세": (15.12, 105.8), "사반나켓": (16.57, 104.75), "수라바야": (-7.25, 112.75),
    "반둥": (-6.91, 107.61), "메단": (3.6, 98.67), "마카사르": (-5.15, 119.43), "덴파사르": (-8.65, 115.22), "누산타라": (0.97, 116.7),
    "하이퐁": (20.86, 106.68), "껀터": (10.03, 105.79), "후에": (16.46, 107.59), "냐짱": (12.24, 109.19), "시엠레아프": (13.36, 103.86),
    "시아누크빌": (10.63, 103.52), "바탐방": (13.1, 103.2), "쿨나": (22.85, 89.54), "실렛": (24.89, 91.87), "라지샤히": (24.37, 88.6),
    "일로일로": (10.72, 122.56), "클라크": (15.19, 120.55), "바기오": (16.4, 120.6), "부하라": (39.77, 64.42), "나망간": (41.0, 71.67),
    "페르가나": (40.38, 71.79), "누쿠스": (42.46, 59.6), "디레다와": (9.6, 41.85), "메켈레": (13.5, 39.47), "바하르다르": (11.59, 37.39),
    "하와사": (7.06, 38.48), "쿠마시": (6.69, -1.62), "타말레": (9.4, -0.85), "테마": (5.67, 0.0), "네피도": (19.76, 96.08),
    "만달레이": (21.96, 96.09), "캔디": (7.29, 80.63), "함반토타": (6.12, 81.12), "자프나": (9.66, 80.02), "포카라": (28.21, 83.99),
    "비라트나가르": (26.45, 87.28), "후예": (-2.6, 29.74), "루바부": (-1.68, 29.26), "엔테베": (0.05, 32.46), "굴루": (2.77, 32.3),
    "진자": (0.42, 33.2), "튀니스": (36.81, 10.18), "스팍스": (34.74, 10.76), "알렉산드리아": (31.2, 29.92), "수에즈": (29.97, 32.55),
    "아스완": (24.09, 32.9), "신행정수도": (30.02, 31.7), "수크레": (-19.05, -65.26), "코차밤바": (-17.39, -66.16), "엘알토": (-16.5, -68.19),
    "오루로": (-17.97, -67.11), "타리하": (-21.53, -64.73), "포토시": (-19.58, -65.75), "시우다드델에스테": (-25.51, -54.61), "엔카르나시온": (-27.33, -55.87),
    "메데진": (6.24, -75.58), "바랑키야": (10.96, -74.8), "카르타헤나": (10.39, -75.48), "아레키파": (-16.41, -71.54), "쿠스코": (-13.53, -71.97),
    "트루히요": (-8.11, -79.03), "피우라": (-5.19, -80.63), "이키토스": (-3.75, -73.25), "쿠엥카": (-2.9, -79.0), "만타": (-0.95, -80.73),
    "케찰테낭고": (14.83, -91.52), "산페드로술라": (15.5, -88.03), "레온": (12.44, -86.88), "산타아나": (13.99, -89.56), "리몬": (9.99, -83.03),
    "콜론": (9.36, -79.9), "산티아고데로스카바예로스": (19.45, -70.7), "리우데자네이루": (-22.91, -43.17), "마나우스": (-3.12, -60.02), "마푸토": (-25.97, 32.57),
    "베이라": (-19.84, 34.84), "나칼라": (-14.56, 40.69), "남풀라": (-15.12, 39.27), "야운데": (3.85, 11.5), "두알라": (4.05, 9.7),
    "아부자": (9.08, 7.4), "라고스": (6.52, 3.38), "카노": (12.0, 8.52), "포트하커트": (4.82, 7.03), "앙카라": (39.93, 32.86),
    "이스탄불": (41.01, 28.98), "이즈미르": (38.42, 27.14), "키이우": (50.45, 30.52), "리비우": (49.84, 24.03), "오데사": (46.48, 30.73),
    "하르키우": (49.99, 36.23), "트빌리시": (41.72, 44.79), "바투미": (41.64, 41.64), "쿠타이시": (42.27, 42.7), "바쿠": (40.41, 49.87),
    "아스타나": (51.17, 71.45), "알마티": (43.24, 76.89), "쉼켄트": (42.32, 69.6), "비슈케크": (42.87, 74.59), "두샨베": (38.56, 68.79),
    "후잔트": (40.28, 69.62), "딜리": (-8.56, 125.58), "바우카우": (-8.47, 126.45),
    "리마": (-12.05, -77.04), "라파스": (-16.5, -68.15), "산타크루스": (-17.78, -63.18), "아순시온": (-25.26, -57.58), "보고타": (4.71, -74.07), "키토": (-0.18, -78.47), "과야킬": (-2.17, -79.92), "과테말라시티": (14.63, -90.51), "테구시갈파": (14.07, -87.19), "마나과": (12.11, -86.24), "산살바도르": (13.69, -89.22), "산호세": (9.93, -84.08), "파나마시티": (8.98, -79.52), "산토도밍고": (18.49, -69.93), "브라질리아": (-15.79, -47.88), "상파울루": (-23.55, -46.63),
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
    ("politics", ("선거", "대선", "총선", "정권 교체", "정권교체", "탄핵", "대통령 사임", "총리 사임", "내각 총사퇴", "의회 해산", "정부 해산",
                  "election", "impeach", "resigns", "dissolve parliament")),  # 참고용 (등급에는 안 넣음)
    ("disease", ("콜레라", "에볼라", "엠폭스", "전염병", "감염병", "cholera", "ebola", "mpox", "outbreak")),
]
NEWS_QUERY_WORDS = ["지진", "홍수", "태풍", "테러", "내전", "쿠데타", "폭동", "산불", "콜레라", "선거", "정권"]
KEEP_DAYS = 365  # 과거 이력(30일 이상)도 볼 수 있게 1년 보관
NEW_DAYS = 14  # 뉴스 이벤트로 새로 넣는 기사의 기간 (오래된 기사가 다시 색인돼 최근 날짜로 들어오는 것을 줄임)
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


def _is_rest(text: str) -> bool:
    """'4단계 지정 지역을 제외한 지역', '2·3 단계 발령 지역 외 전 지역', '전 지역' 처럼 '나머지 지역' 줄인지"""
    t = re.sub(r"\s+", " ", text or "")
    return bool(re.search(r"(제외한|발령 지역 외|지정 지역 외)\s*(전\s*)?지역|^전\s*지역$|나머지\s*지역", t))


def _finish_alert(a: dict) -> None:
    """base = 사업지가 특정 지역에 들지 않을 때의 단계(나머지 지역 단계), partial = 나라 안에서 단계가 다름
    regions = 예전 화면용 요약"""
    zones = a["zones"]
    rest = [z["lv"] for z in zones if z["rest"]]
    a["base"] = min(rest) if rest else min(z["lv"] for z in zones)
    a["partial"] = len({z["lv"] for z in zones}) > 1 or not rest
    a["regions"] = " / ".join(f"{z['lv']}단계 {z['text']}" for z in sorted(zones, key=lambda z: -z["lv"]) if z["text"])[:300]


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
        a = out.setdefault(code, {"level": 0, "zones": []})
        a["level"] = max(a["level"], lvl)
        text = str(row.get("remark") or "").strip()
        whole = str(row.get("region_ty") or "").strip() == "전체"
        a["zones"].append({"lv": lvl, "text": text[:200], "rest": whole or _is_rest(text)})
        a["written"] = max(a.get("written", ""), str(row.get("written_dt") or ""))
    for a in out.values():
        _finish_alert(a)
    try:  # 특별여행주의보 (같은 키, 별도 활용신청). 실패해도 여행경보는 저장
        r2 = get(SPECIAL_URL, params={"serviceKey": key, "returnType": "JSON", "numOfRows": 300, "pageNo": 1}, timeout=30)
        r2.raise_for_status()
        for row in _rows(r2.json()):
            code = (row.get("country_iso_alp2") or "").upper()
            if code:
                a = out.setdefault(code, {"level": 0, "base": 0, "partial": False, "regions": "", "zones": []})
                a["special"] = True
                a["special_text"] = str(row.get("splimit_note") or row.get("remark") or row.get("txt_origin_cn") or "")[:200]
    except Exception as e:
        log.warning("특별여행주의보 실패: %s", type(e).__name__)
    return out


# ---------- 2) USGS 지진 ----------
USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson"


QUAKE_MIN = 5.5  # 이보다 작은 지진은 저장하지 않음 (assets/geo.js QUAKE_MIN 과 같게)


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
        if lat is None or lng is None or p.get("mag") is None or float(p["mag"]) < QUAKE_MIN:
            continue
        d, code = min((_km((lat, lng), ll), c) for ll, c in tg)
        if d > QUAKE_KM:  # 사업지·수원국에서 먼 지진은 뺌
            continue
        out.append({"id": f"usgs-{f.get('id')}", "type": "quake", "country": code, "lat": round(lat, 3), "lng": round(lng, 3),
                    "mag": round(float(p["mag"]), 1), "title": f"규모 {float(p['mag']):.1f} 지진 · {p.get('place') or ''}".strip(),
                    "url": p.get("url") or "", "at_ms": int(p.get("time") or 0), "source": "USGS", "dist_km": round(d),
                    **({"depth": round(float(depth))} if depth is not None else {})})
    return out


# ---------- 2-1) GDACS (UN·EU 재난 경보, 키 없음) ----------
# 태풍·홍수·화산·산불의 공식 경보 등급(초록·주황·빨강). 주황·빨강만 받음. 지진은 USGS 로 따로(진도 계산), 가뭄은 기간이 길고 범위가 넓어 뺌
GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
GDACS_TYPE = {"TC": "storm", "FL": "flood", "VO": "volcano", "WF": "fire"}
GDACS_KO = {"Red": "빨강", "Orange": "주황"}
GDACS_DAYS = 30


def _iso_ms(t: str) -> int:
    try:
        return int(datetime.fromisoformat(str(t)[:19]).replace(tzinfo=timezone.utc).timestamp() * 1000)
    except ValueError:
        return 0


def fetch_gdacs(tg, get=httpx.get) -> list[dict]:
    if not tg:
        return []
    now = datetime.now(timezone.utc)
    codes = {c for _, c in tg}
    r = get(GDACS_URL, params={"eventlist": ";".join(GDACS_TYPE), "alertlevel": "orange;red",
                               "fromdate": (now - timedelta(days=GDACS_DAYS * 3)).strftime("%Y-%m-%d"), "todate": now.strftime("%Y-%m-%d")}, timeout=40)
    r.raise_for_status()
    out = []
    for f in r.json().get("features") or []:
        p, g = f.get("properties") or {}, f.get("geometry") or {}
        kind, lvl = GDACS_TYPE.get(p.get("eventtype")), p.get("alertlevel")
        co = g.get("coordinates") or []
        if not kind or lvl not in GDACS_KO or g.get("type") != "Point" or len(co) < 2:
            continue
        lng, lat = float(co[0]), float(co[1])
        at = _iso_ms(p.get("todate") or p.get("fromdate"))
        if at < (now - timedelta(days=GDACS_DAYS)).timestamp() * 1000:  # 오래전에 시작했어도 최근까지 이어진 사건은 남김
            continue
        d, code = min((_km((lat, lng), ll), c) for ll, c in tg)
        far = d > QUAKE_KM
        if far:
            # 태풍은 '마지막 위치' 한 점으로만 와서 지나온 나라가 멀어 보임 → GDACS 가 적은 영향 국가에 사업 나라가 있으면 참고로 남김 (거리 규칙·등급에는 안 넣음)
            hit = [a.get("iso2") for a in (p.get("affectedcountries") or []) if isinstance(a, dict)]
            code = next((c for c in hit if c in codes), None)
            if not code:
                continue
        sev = p.get("severitydata") if isinstance(p.get("severitydata"), dict) else {}
        url = (p.get("url") or {}).get("report", "") if isinstance(p.get("url"), dict) else ""
        out.append({"id": f"gdacs-{p.get('eventtype')}-{p.get('eventid')}", "type": kind, "country": code, "lat": round(lat, 3), "lng": round(lng, 3),
                    "title": " ".join(f"GDACS {GDACS_KO[lvl]} 경보 · {p.get('name') or p.get('eventname') or ''}{' (영향 국가 기준)' if far else ''}".split())[:140],
                    "note": str(sev.get("severitytext") or "")[:120], "url": url, "at_ms": at,
                    "source": "GDACS", "gdacs": lvl, "dist_km": round(d), **({"country_level": True} if far else {})})
    return out


# ---------- 2-2) WHO 감염병 발생 소식 (Disease Outbreak News, 키 없음) ----------
# 좌표 없이 나라 단위로 옴 → 그 나라 가운데에 표시하고, 등급은 '같은 나라 사업' 기준 (assets/geo.js GEO_RULES country 규칙)
WHO_URL = "https://www.who.int/api/news/diseaseoutbreaknews"
WHO_DAYS = 90
WHO_ALIAS = {"Viet Nam": "VN", "Lao People's Democratic Republic": "LA", "United Republic of Tanzania": "TZ", "Türkiye": "TR",
             "Turkiye": "TR", "Republic of Korea": "KR", "Bolivia (Plurinational State of)": "BO", "Kyrgyz Republic": "KG"}


def who_countries(title: str) -> list[str]:
    t = title or ""
    out = [c for name, c in WHO_ALIAS.items() if name in t]
    out += [c for c, v in COUNTRY.items() if re.search(rf"\b{re.escape(v[1])}\b", t) and c not in out and c != "KR"]
    return out


def fetch_who(get=httpx.get) -> list[dict]:
    r = get(WHO_URL, params={"$top": 40, "$orderby": "PublicationDate desc", "$select": "Title,PublicationDate,ItemDefaultUrl,DonId"}, timeout=40)
    r.raise_for_status()
    since = int((datetime.now(KST) - timedelta(days=WHO_DAYS)).timestamp() * 1000)
    out = []
    for v in r.json().get("value") or []:
        ms = _iso_ms(v.get("PublicationDate"))
        if ms < since:
            continue
        title = str(v.get("Title") or "")
        for code in who_countries(title):
            c = COUNTRY[code]
            out.append({"id": f"who-{v.get('DonId') or str(v.get('ItemDefaultUrl') or '').strip('/')}-{code}", "type": "disease", "country": code,
                        "lat": c[2], "lng": c[3], "country_level": True, "title": f"WHO 발표 · {title}"[:140],
                        "url": "https://www.who.int/emergencies/disease-outbreak-news/item" + str(v.get("ItemDefaultUrl") or ""),
                        "at_ms": ms, "source": "WHO"})
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
    since = int((datetime.now(KST) - timedelta(days=NEW_DAYS)).timestamp() * 1000)  # 새로 넣는 것은 최근 기사만 (보관은 KEEP_DAYS)
    codes = [c for c in codes if c in COUNTRY and c != "KR"]

    def fetch(code):
        name, items, bad = COUNTRY[code][0], [], 0
        try:
            items += gnews(f"{name} ({' OR '.join(NEWS_QUERY_WORDS)}) when:{NEW_DAYS}d", "ko", 20)  # 오래된 기사·칼럼이 섞이지 않게 최근 기간만
        except Exception:
            bad += 1
        try:
            if news.naver_enabled():
                items += naver(" | ".join(f"{name} {w}" for w in NEWS_QUERY_WORDS[:6]), 20, "date")
        except Exception:
            bad += 1
        return items, bad

    with ThreadPoolExecutor(max_workers=4) as ex:  # 나라별 검색을 동시에 (Google 호출 간격은 news 쪽에서 지킴)
        fetched = list(ex.map(fetch, codes))
    for code, (items, bad) in zip(codes, fetched):
        name = COUNTRY[code][0]
        errors += bad
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
    projects = [p for p in projects if p.get("status") != "done"]  # 완료한 사업은 뺌
    codes = sorted({p.get("country") for p in projects if p.get("country")})
    tg = targets(projects)
    prev_snap = store.db().collection("meta").document("geo").get()
    prev = (prev_snap.to_dict() or {}) if prev_snap.exists else {}
    doc, res = {"updated_at": store.now_str()}, {"countries": len(codes)}

    # 출처마다 따로 받아 오므로 동시에 요청 (결과 처리는 아래에서 예전 순서 그대로)
    ex = ThreadPoolExecutor(max_workers=5)
    f_alerts, f_quakes, f_gdacs, f_who = ex.submit(fetch_alerts, get), ex.submit(fetch_quakes, tg, get), ex.submit(fetch_gdacs, tg, get), ex.submit(fetch_who, get)
    f_news = ex.submit(news_events, codes, gnews, naver)
    ex.shutdown(wait=False)
    try:
        alerts = f_alerts.result()
        if alerts:
            doc["alerts"], doc["alerts_at"] = alerts, store.now_str()
        res["alerts"] = len(alerts) if alerts else ("키 없음" if not config.MOFA_TRAVEL_KEY else 0)
    except Exception as e:
        res["alerts"] = f"오류 {type(e).__name__}"
    try:
        quakes = f_quakes.result()
        res["quakes"] = len(quakes)
    except Exception as e:
        quakes, res["quakes"] = [], f"오류 {type(e).__name__}"
    try:
        gd = f_gdacs.result()
        res["gdacs"] = len(gd)
    except Exception as e:
        gd, res["gdacs"] = [], f"오류 {type(e).__name__}"
    try:
        who = [e for e in f_who.result() if e["country"] in codes]
        res["who"] = len(who)
    except Exception as e:
        who, res["who"] = [], f"오류 {type(e).__name__}"
    # WHO 제목(영어)은 한국어 한 줄로 옮겨 보여 줌: 한 번 옮긴 것은 저장본에서 다시 쓰고 새 것만 AI 에 맡김 (실패하면 영어 그대로, 다음에 다시)
    if who:
        from . import analyzer as _an
        done = {e["id"]: e for e in prev.get("events") or [] if e.get("ko") and e.get("source") == "WHO"}
        fresh = sorted({e["title"] for e in who if e["id"] not in done})
        tr = _an.ko_titles([t.replace("WHO 발표 · ", "", 1) for t in fresh]) if fresh else None
        ko_by = {t: tr[i] for i, t in enumerate(fresh) if tr and tr.get(i)}
        for e in who:
            if e["id"] in done:
                e.update(title=done[e["id"]]["title"], title_en=done[e["id"]].get("title_en") or e["title"], ko=True)
            elif e["title"] in ko_by:
                e.update(title_en=e["title"], title=f"WHO 발표 · {ko_by[e['title']]}"[:140], ko=True)
        res["who_ko"] = sum(1 for e in who if e.get("ko"))
    evs, errs = f_news.result()
    res["news"], res["news_errors"] = len(evs), errs
    if evs or not errs:
        doc["news_at"] = store.now_str()

    # 지난 이벤트와 합치기 (1년 지난 것은 버림). 이미 AI가 판정한 뉴스는 그 결과를 그대로 둠
    since = int((datetime.now(KST) - timedelta(days=KEEP_DAYS)).timestamp() * 1000)
    merged = {e["id"]: e for e in prev.get("events") or [] if (e.get("at_ms") or 0) >= since}
    rejected = list(prev.get("rejected") or [])  # AI가 '사업에 영향 없음'으로 본 기사 id (다시 판정하지 않음)
    rej = set(rejected)
    merged.update({e["id"]: e for e in quakes + gd + who})
    for e in evs:
        if e["id"] not in rej and not (merged.get(e["id"]) or {}).get("ai"):
            merged[e["id"]] = e
    # 최종 판정은 AI: 단어로 잡은 뉴스 가운데 아직 판정하지 않은 것 (한 번에 최근 60건까지, 나머지는 다음 실행에)
    from . import analyzer
    # 예전 지침으로 판정한 것(ai_v 가 낮음)도 한 번 다시 판정
    todo = sorted((e for e in merged.values() if str(e.get("id", "")).startswith("news-") and (not e.get("ai") or (e.get("ai_v") or 1) < analyzer.EVENT_AI_V)), key=lambda e: -(e.get("at_ms") or 0))[:60]
    if todo:
        verdict = analyzer.judge_events([{"title": e.get("title"), "country": (COUNTRY.get(e.get("country")) or [e.get("country")])[0],
                                          "date": datetime.fromtimestamp((e.get("at_ms") or 0) / 1000, KST).strftime("%Y-%m-%d")} for e in todo])
        kept = dropped = 0
        for i, e in enumerate(todo):
            v = (verdict or {}).get(i)
            if not v:
                continue  # 판정을 못 받은 것은 단어 분류 그대로 두고 다음에 다시
            if not v["affects"]:
                merged.pop(e["id"], None)
                rejected.append(e["id"])
                dropped += 1
            else:
                e.update(ai=True, ai_v=analyzer.EVENT_AI_V, note=v["note"], **({"type": v["type"]} if v["type"] in analyzer.EVENT_TYPES else {}))
                kept += 1
        res["ai_kept"], res["ai_dropped"] = kept, dropped
        res["ai"] = "ok" if verdict is not None else "판정 못 함(단어 분류 유지)"
    doc["rejected"] = rejected[-800:]
    doc["events"] = sorted(merged.values(), key=lambda e: -(e.get("at_ms") or 0))[:300]
    res["events"] = len(doc["events"])
    store.update("meta", "geo", doc)
    return res
