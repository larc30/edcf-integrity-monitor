"""assets/cities.json 만들기: 수원국(assets/geo.js GEO_COUNTRY)의 인구 1천 이상 도시 (사업 등록 창의 도시 찾기용)

자료: GeoNames cities1000 (CC BY 4.0, https://www.geonames.org) · PyPI geonamescache 에 든 사본을 씀
쓰기:  pip install geonamescache  →  python tools/build_cities.py
형식:  {"_src": 출처, "KE": [[영문명, 위도, 경도, 한글 표기들(쉼표) 또는 ""], ...]}  (나라 안에서는 인구 많은 순)
"""
import ast
import json
import re
from pathlib import Path

import geonamescache

ROOT = Path(__file__).resolve().parent.parent
geo_js = (ROOT / "assets" / "geo.js").read_text(encoding="utf-8")
block = geo_js[geo_js.index("export const GEO_COUNTRY"):geo_js.index("export const GEO_CITY")]
codes = set(re.findall(r'\b([A-Z]{2}): \["', block)) - {"KR"}

out: dict = {"_src": "GeoNames cities1000 (CC BY 4.0) geonames.org"}
rows = sorted(geonamescache.GeonamesCache(min_city_population=1000).get_cities().values(), key=lambda c: -int(c.get("population") or 0))
for c in rows:
    cc = c["countrycode"]
    if cc not in codes:
        continue
    alt = c.get("alternatenames") or []
    if isinstance(alt, str):
        try:
            alt = ast.literal_eval(alt)
        except Exception:
            alt = []
    ko = ",".join(list(dict.fromkeys(a for a in alt if re.fullmatch(r"[가-힣 ]{2,12}", a or "")))[:4])  # 한글 표기 여러 개(옛 이름 포함)는 찾기에만 씀
    out.setdefault(cc, []).append([c["name"], round(float(c["latitude"]), 3), round(float(c["longitude"]), 3), ko])

path = ROOT / "assets" / "cities.json"
path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
n = sum(len(v) for k, v in out.items() if k != "_src")
print(f"{len(out) - 1}개국 · 도시 {n}곳 · {path.stat().st_size // 1024}KB · 한글명 {sum(1 for k, v in out.items() if k != '_src' for r in v if r[3])}곳")
