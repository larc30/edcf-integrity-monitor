// 수원국 리스크 대시보드 (초안)
// - 지도: Leaflet + Esri 회색 무료 지도(키 없음)
// - 사업 위치: 사업명 속 도시 이름 → 도시 좌표, 없으면 수원국 중심 (projects.lat/lng 가 있으면 그 값)
// - 이벤트: Firestore meta/geo (매일 아침 monitor/geo.py 가 외교부 여행경보·USGS 지진·Google/네이버 뉴스로 저장)
//           + 브라우저에서 USGS 지진 실시간 (키 없음, 회사망에서 막히면 저장본만)
// - 수원국 등급: 위험(여행경보 3·4단계·특별여행주의보) / 경고(2단계, 최근 7일 큰 지진·분쟁·테러) / 정상
// 국가·도시 좌표와 이벤트 분류 단어는 monitor/geo.py 와 같게 유지

// 국가: [이름, 영문명(USGS 지명 대조), 위도, 경도]
export const GEO_COUNTRY = {
  TZ: ["탄자니아", "Tanzania", -6.4, 34.9], PK: ["파키스탄", "Pakistan", 30.4, 69.3], KE: ["케냐", "Kenya", 0.2, 37.9],
  MN: ["몽골", "Mongolia", 46.9, 103.8], LA: ["라오스", "Laos", 19.9, 102.5], ID: ["인도네시아", "Indonesia", -2.5, 118.0],
  KR: ["한국", "South Korea", 36.5, 127.9], VN: ["베트남", "Vietnam", 14.1, 108.3], KH: ["캄보디아", "Cambodia", 12.6, 104.9],
  BD: ["방글라데시", "Bangladesh", 23.7, 90.4], PH: ["필리핀", "Philippines", 12.9, 121.8], UZ: ["우즈베키스탄", "Uzbekistan", 41.4, 64.6],
  ET: ["에티오피아", "Ethiopia", 9.1, 40.5], GH: ["가나", "Ghana", 7.9, -1.0], MM: ["미얀마", "Myanmar", 21.9, 95.9],
  LK: ["스리랑카", "Sri Lanka", 7.9, 80.8], NP: ["네팔", "Nepal", 28.4, 84.1], RW: ["르완다", "Rwanda", -1.9, 29.9],
  UG: ["우간다", "Uganda", 1.4, 32.3], TN: ["튀니지", "Tunisia", 33.9, 9.5], EG: ["이집트", "Egypt", 26.8, 30.8],
  BO: ["볼리비아", "Bolivia", -16.3, -63.6], PY: ["파라과이", "Paraguay", -23.4, -58.4], CO: ["콜롬비아", "Colombia", 4.6, -74.3],
  PE: ["페루", "Peru", -9.2, -75.0], EC: ["에콰도르", "Ecuador", -1.8, -78.2], GT: ["과테말라", "Guatemala", 15.8, -90.2],
  SN: ["세네갈", "Senegal", 14.5, -14.5], MZ: ["모잠비크", "Mozambique", -18.7, 35.5], CM: ["카메룬", "Cameroon", 7.4, 12.4],
  NG: ["나이지리아", "Nigeria", 9.1, 8.7], TR: ["튀르키예", "Turkey", 39.0, 35.2], UA: ["우크라이나", "Ukraine", 48.4, 31.2],
  GE: ["조지아", "Georgia", 42.3, 43.4], AZ: ["아제르바이잔", "Azerbaijan", 40.1, 47.6], KZ: ["카자흐스탄", "Kazakhstan", 48.0, 66.9],
  KG: ["키르기스스탄", "Kyrgyzstan", 41.2, 74.8], TJ: ["타지키스탄", "Tajikistan", 38.9, 71.3], TL: ["동티모르", "Timor-Leste", -8.9, 125.7],
};
// 사업명에 들어 있으면 그 도시에 핀을 꽂음
export const GEO_CITY = { // [위도, 경도, 영문명]
  나이로비: [-1.29, 36.82, "Nairobi"], 몸바사: [-4.04, 39.67, "Mombasa"], 다르에스살람: [-6.79, 39.21, "Dar es Salaam"], 도도마: [-6.16, 35.75, "Dodoma"], 잔지바르: [-6.17, 39.2, "Zanzibar"],
  울란바토르: [47.89, 106.91, "Ulaanbaatar"], 비엔티안: [17.97, 102.63, "Vientiane"], 루앙프라방: [19.89, 102.13, "Luang Prabang"], 다카: [23.81, 90.41, "Dhaka"], 치타공: [22.36, 91.78, "Chittagong"],
  하노이: [21.03, 105.85, "Hanoi"], 호치민: [10.82, 106.63, "Ho Chi Minh City"], 다낭: [16.05, 108.2, "Da Nang"], 메콩델타: [10.03, 105.78, "Mekong Delta"], 프놈펜: [11.56, 104.93, "Phnom Penh"],
  타슈켄트: [41.3, 69.24, "Tashkent"], 사마르칸트: [39.65, 66.96, "Samarkand"], 민다나오: [7.6, 125.0, "Mindanao"], 다바오: [7.07, 125.61, "Davao"], 마닐라: [14.6, 120.98, "Manila"], 세부: [10.32, 123.89, "Cebu"],
  카라치: [24.86, 67.01, "Karachi"], 이슬라마바드: [33.68, 73.05, "Islamabad"], 라호르: [31.55, 74.34, "Lahore"], 자카르타: [-6.21, 106.85, "Jakarta"], 아디스아바바: [9.03, 38.74, "Addis Ababa"],
  아크라: [5.6, -0.19, "Accra"], 콜롬보: [6.93, 79.86, "Colombo"], 카트만두: [27.72, 85.32, "Kathmandu"], 키갈리: [-1.95, 30.06, "Kigali"], 캄팔라: [0.35, 32.58, "Kampala"], 카이로: [30.04, 31.24, "Cairo"], 양곤: [16.84, 96.17, "Yangon"],
};
// 이벤트 종류: [이름, 색, 아이콘(선 그림)] — 이모티콘 대신 같은 모양의 아이콘 배지
export const GEO_TYPES = {
  quake: ["지진", "#F59E0B", '<path d="M2 12h3l2-5 3 10 3-14 3 13 2-4h4"/>'],
  war: ["분쟁·전쟁", "#EF4444", '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="M5 14l4 4"/><path d="M7 17l-3 3"/><path d="M3 19l2 2"/>'],
  terror: ["테러·폭발", "#E11D48", '<path d="M12 2l1.8 4.6L18 4l-1.4 4.8L21.5 10l-4.2 2.4L20 17l-4.8-1.2L13 21l-1.8-4.4L7 19l.8-4.8L3 13l4-2.6L5 6l4.6 1.4z"/>'],
  unrest: ["시위·소요", "#A855F7", '<path d="M3 11l15-6v14L3 13z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/><path d="M21 9v6"/>'],
  flood: ["홍수", "#3B82F6", '<path d="M2 6c2 0 2-1.5 4-1.5S8 6 10 6s2-1.5 4-1.5S16 6 18 6s2-1.5 4-1.5"/><path d="M2 12c2 0 2-1.5 4-1.5S8 12 10 12s2-1.5 4-1.5S16 12 18 12s2-1.5 4-1.5"/><path d="M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5S16 18 18 18s2-1.5 4-1.5"/>'],
  storm: ["태풍", "#06B6D4", '<circle cx="12" cy="12" r="2"/><path d="M19 7c-1.5-2.5-4.2-4-7-4-4.4 0-8 3.6-8 8"/><path d="M5 17c1.5 2.5 4.2 4 7 4 4.4 0 8-3.6 8-8"/>'],
  fire: ["산불", "#F97316", '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'],
  volcano: ["화산", "#C2410C", '<path d="M2 21l6.5-10h7L22 21z"/><path d="M10 11l2 3 2-3"/><path d="M12 7V3"/><path d="M8.5 6.5 7 5"/><path d="M15.5 6.5 17 5"/>'],
  disease: ["감염병", "#22C55E", '<circle cx="12" cy="12" r="5"/><path d="M12 7V3M12 21v-4M7 12H3M21 12h-4M8.5 8.5 6 6M18 18l-2.5-2.5M15.5 8.5 18 6M6 18l2.5-2.5"/>'],
};
const icon = (t) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GEO_TYPES[t][2]}</svg>`;
const ibadge = (t, cls = "") => `<span class="ico ${cls}" style="--ec:${GEO_TYPES[t][1]}" title="${GEO_TYPES[t][0]}">${icon(t)}</span>`;
// 외교부 여행경보 단계 (색은 외교부 지도와 같은 계열)
const ALERT = { 1: ["1단계", "여행유의", "a1"], 2: ["2단계", "여행자제", "a2"], 3: ["3단계", "출국권고", "a3"], 4: ["4단계", "여행금지", "a4"] };
const LEVEL = { red: "위험", orange: "경고", none: "정상" };
const LV = { red: 2, orange: 1, none: 0 };
const DAY = 86400e3;
// 수원국 리스크 기준: 사업지에서 사건까지 거리 · 기간 (숫자만 바꾸면 기준이 바뀜, 설명 창도 이 표로 만듦)
// 지진은 거리 대신 '사업지 예상 진도'(mmi): 규모·거리·깊이로 사업지가 얼마나 흔들렸을지 계산 (siteMMI)
export const GEO_RULES = [
  { lv: "red", types: ["quake"], mmi: 6, days: 7, text: "지진: 사업지 예상 진도 6 이상 (건물 피해가 생기기 시작하는 흔들림)" },
  { lv: "red", types: ["terror", "war"], km: 50, days: 14, text: "테러, 분쟁 (같은 도시권)" },
  { lv: "orange", types: ["quake"], mmi: 5, days: 7, text: "지진: 사업지 예상 진도 5 (거의 모든 사람이 느끼고 물건이 떨어지는 흔들림)" },
  { lv: "orange", types: ["terror", "war"], km: 200, days: 14, text: "테러, 분쟁 (같은 지역권)" },
  { lv: "orange", types: ["flood", "storm", "fire", "volcano"], km: 100, days: 7, text: "홍수, 태풍, 산불, 화산" },
  { lv: "orange", types: ["unrest", "disease"], km: 50, days: 7, text: "시위, 감염병" },
];

let ctx = null, map = null, layers = null, live = { quakes: null, at: null, err: null, loading: false };
const ui = { type: null, period: "14", lv: null, focus: null };
const RINGS = [100, 200, 300, 400, 500]; // 사업을 누르면 사업지 둘레에 그리는 거리 원 (km)
const NEAR_KM = 600;
try { ui.period = localStorage.getItem("edcf_geo_period2") || "30d"; } catch {}
const PERIODS = [["all", "전체"], ["7d", "최근 7일"], ["30d", "최근 30일"], ["old", "30일 이전"]];
const inP = (e, p) => { const age = Date.now() - e.ms; return p === "all" ? true : p === "old" ? age > 30 * DAY : age <= (p === "7d" ? 7 : 30) * DAY; };
const P_LABEL = { all: "전체 기간", "7d": "최근 7일", "30d": "최근 30일", old: "30일 이전" };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const cname = (c) => GEO_COUNTRY[c]?.[0] || c || "국가 미상";
const cen = (c) => GEO_COUNTRY[c]?.[1] || c || "Unknown";
const rel = (ms) => { const h = (Date.now() - ms) / 3600e3; return h < 1 ? "방금" : h < 24 ? `${Math.floor(h)}시간 전` : `${Math.floor(h / 24)}일 전`; };
const ymd = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(5, 16).replace("-", "/").replace("T", " ");
const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const evMs = (e) => e.at_ms || Date.parse(String(e.at || "").replace(" ", "T") + (String(e.at || "").length <= 10 ? "T00:00:00+09:00" : "+09:00")) || 0;

// 사업 위치: 직접 넣은 좌표 → 사업명 속 도시 → 수원국 중심(여러 사업이면 조금씩 비켜서)
export function projectPoint(p, i = 0) {
  if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) return { ll: [p.lat, p.lng], how: "좌표", en: `${p.site_en || p.lat.toFixed(2) + ", " + p.lng.toFixed(2)}, ${cen(p.country)}` };
  const city = Object.keys(GEO_CITY).find((k) => String(p.name || "").includes(k));
  if (city) return { ll: GEO_CITY[city].slice(0, 2), how: city, en: `${GEO_CITY[city][2]}, ${cen(p.country)}` };
  const c = GEO_COUNTRY[p.country];
  if (!c) return null;
  const a = i * 2.4; // 같은 나라 사업끼리 겹치지 않게
  return { ll: [c[2] + (i ? Math.sin(a) * 0.9 : 0), c[3] + (i ? Math.cos(a) * 0.9 : 0)], how: "국가 중심", en: `${c[1]} (country center)` };
}

// ---------- 데이터 ----------
function geoDoc() { return ctx.state.geo || {}; }
function allEvents() {
  const stored = (geoDoc().events || []).map((e) => ({ ...e, ms: evMs(e) }));
  const out = [...stored];
  const have = new Set(stored.map((e) => e.id));
  for (const q of live.quakes || []) if (!have.has(q.id)) out.push(q);
  return out.filter((e) => e.ms && GEO_TYPES[e.type]).sort((a, b) => b.ms - a.ms);
}
// USGS 실시간 지진 (규모 4.5 이상, 최근 7일) — 사업 위치·수원국에서 600km 안만
async function loadLiveQuakes(force) {
  if (live.loading || (!force && live.at && Date.now() - live.at < 10 * 60e3)) return;
  live.loading = true;
  try {
    const r = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(), pts = targets();
    live.quakes = (j.features || []).map((f) => {
      const [lng, lat] = f.geometry?.coordinates || [], p = f.properties || {};
      const near = pts.map((t) => ({ t, d: km([lat, lng], t.ll) })).sort((a, b) => a.d - b.d)[0];
      if (!near || near.d > 600) return null;
      return { id: "usgs-" + f.id, type: "quake", mag: p.mag, title: `규모 ${(+p.mag).toFixed(1)} 지진 · ${p.place || ""}`, url: p.url, lat, lng, country: near.t.country, ms: p.time, at_ms: p.time, source: "USGS (실시간)", dist_km: Math.round(near.d), depth: f.geometry?.coordinates?.[2] };
    }).filter(Boolean);
    live.at = Date.now(); live.err = null;
  } catch (e) { live.err = String(e.message || e); live.quakes = live.quakes || []; }
  live.loading = false;
}
function targets() {
  const out = [], seen = new Set();
  const byC = {};
  ctx.state.projects.forEach((p) => { const i = (byC[p.country] = (byC[p.country] ?? -1) + 1); const pt = projectPoint(p, i); if (pt) out.push({ ll: pt.ll, country: p.country }); });
  ctx.state.projects.forEach((p) => { const c = GEO_COUNTRY[p.country]; if (c && !seen.has(p.country)) { seen.add(p.country); out.push({ ll: [c[2], c[3]], country: p.country }); } });
  return out;
}

// 여행경보로 보는 등급: 4단계·특별여행주의보·전역 3단계는 위험, 일부 지역 3단계·전역 2단계는 경고
function alertRisk(a) {
  if (!a) return { lv: "none", why: [] };
  const name = a.level ? `여행경보 ${ALERT[a.level][0]} ${ALERT[a.level][1]}${a.partial ? " (일부 지역)" : ""}` : "";
  if (a.special) return { lv: "red", why: [`특별여행주의보${a.special_text ? ` (${a.special_text})` : ""}`] };
  if (a.level >= 4 || (a.level === 3 && !a.partial)) return { lv: "red", why: [name] };
  if (a.level === 3 || (a.level === 2 && !a.partial)) return { lv: "orange", why: [name] };
  return { lv: "none", why: [] };
}
// 사업지 예상 진도 (수정 메르칼리 진도 1~12, 기상청 진도와 같은 단계)
// USGS 가 쓰는 진도 예측식 Atkinson & Wald (2007): 규모 M, 진앙까지 거리 km, 진원 깊이 km
export function siteMMI(mag, dKm, depth = 10) {
  const R = Math.hypot(dKm, depth ?? 10, 14), lr = Math.log10(R), m = mag - 6;
  const v = 12.27 + 2.27 * m + 0.1304 * m * m - 1.30 * lr - 0.000707 * R + 1.95 * (R > 30 ? Math.log10(R / 30) : 0) - 0.577 * mag * lr;
  return Math.max(1, Math.min(12, v));
}
// 사업지 등급 = 여행경보 + 사업지 둘레 사건 (GEO_RULES). 이유는 높은 등급부터
export function siteRisk(pt, country, evs, alerts) {
  const a = alerts[country] || null, base = alertRisk(a);
  let lv = base.lv; const why = base.lv === "red" ? [...base.why] : [], warn = base.lv === "orange" ? [...base.why] : [];
  if (pt) for (const r of GEO_RULES) {
    const hit = evs.filter((e) => r.types.includes(e.type) && Number.isFinite(e.lat) && Date.now() - e.ms <= r.days * DAY && (!r.mmi || e.mag))
      .map((e) => { const d = km(pt, [e.lat, e.lng]); return { e, d, mmi: r.mmi ? Math.round(siteMMI(+e.mag, d, e.depth)) : 0 }; })
      .filter((x) => (r.mmi ? x.mmi >= r.mmi : x.d <= r.km)).sort((x, y) => y.mmi - x.mmi || x.d - y.d)[0];
    if (!hit) continue;
    const t = `${GEO_TYPES[hit.e.type][0]}${hit.e.mag ? ` M${(+hit.e.mag).toFixed(1)}` : ""}, 사업지 ${fmtKm(hit.d)}${hit.mmi ? `, 예상 진도 ${hit.mmi}` : ""} (${rel(hit.e.ms)})`;
    if (r.lv === "red") { lv = "red"; if (!why.includes(t)) why.push(t); }
    else { if (lv === "none") lv = "orange"; if (!warn.includes(t) && !why.includes(t)) warn.push(t); }
  }
  return { lv, why: [...why, ...warn], alert: a };
}
const worse = (x, y) => (LV[y.lv] > LV[x.lv] ? y : x);

// ---------- 화면 ----------
export function initGeo(c) { ctx = c; }
export async function renderGeo() {
  const { state, esc, info } = ctx;
  const scope = ctx.getScope(), ps = scope === "mine" ? state.projects.filter(ctx.isMine) : state.projects;
  const g = geoDoc(), alerts = g.alerts || {};
  const evsAll = allEvents();
  const codes = [...new Set(ps.map((p) => p.country).filter(Boolean))];
  // 사업지마다 등급을 정하고, 나라 등급은 그 나라 사업 가운데 가장 높은 등급
  const byC0 = {};
  const pins = ps.map((p) => { const i = (byC0[p.country] = (byC0[p.country] ?? -1) + 1); const pt = projectPoint(p, i); return { p, pt, r: siteRisk(pt?.ll, p.country, evsAll, alerts) }; });
  const risk = {};
  codes.forEach((c) => {
    const rs = pins.filter((x) => x.p.country === c).map((x) => x.r);
    const top = rs.reduce(worse, { lv: "none", why: [], alert: alerts[c] || null });
    risk[c] = { lv: top.lv, why: [...new Set(rs.flatMap((r) => r.why))], alert: alerts[c] || null };
  });
  const inScope = evsAll.filter((e) => codes.includes(e.country));
  const pCounts = Object.fromEntries(PERIODS.map(([k]) => [k, inScope.filter((e) => inP(e, k)).length]));
  if (!pCounts.hasOwnProperty(ui.period)) ui.period = "30d";
  const evs = inScope.filter((e) => inP(e, ui.period)), pl = P_LABEL[ui.period];

  // 제목
  const now = new Date(Date.now() + 9 * 3600e3);
  $("#geoDate").textContent = `COUNTRY RISK · ${now.toISOString().slice(0, 10).replace(/-/g, ".")} (${"일월화수목금토"[now.getUTCDay()]})`;
  $("#geoSub").textContent = g.updated_at ? `마지막 갱신 ${String(g.updated_at).slice(5, 16).replace("-", "/")}` : "아직 저장된 수원국 정보가 없습니다";
  const mineN = state.projects.filter(ctx.isMine).length;
  $("#geoScope").innerHTML = [["mine", "내 담당 사업", mineN, ctx.ICON_USER], ["all", "EDCF 전체", state.projects.length, ctx.ICON_ORG]]
    .map(([k, l, n, ic]) => `<button data-s="${k}" class="sc-btn ${k} ${k === scope ? "active" : ""}" title="${l}: 사업 ${n}개"><span class="sc-ic">${ic}</span>${l}<span class="sc-n">사업 ${n}</span></button>`).join("");
  $$("#geoScope button").forEach((b) => b.onclick = () => { ctx.setScope(b.dataset.s); renderGeo(); });
  const aOk = Object.keys(alerts).length; // 연결 상태는 설정 > 고급 > API 연결에서

  // 왼쪽: 수원국 등급
  const byLv = { red: [], orange: [], none: [] };
  codes.forEach((c) => byLv[risk[c].lv].push(c));
  byLv.red.sort(); byLv.orange.sort(); byLv.none.sort();
  const ruleRows = (lv) => GEO_RULES.filter((r) => r.lv === lv).map((r) => r.km ? `${r.text}: 사업지 ${r.km}km 안, ${r.days}일 이내` : `${r.text}, ${r.days}일 이내`).join("<br>");
  const tip = `<div class="tip-p">사업지마다 아래 기준으로 정하고, 나라 등급은 그 나라 사업 가운데 가장 높은 등급입니다.</div>
    <div class="tip-row"><span class="badge red">위험</span><span>여행경보 4단계, 특별여행주의보, 전역 3단계<br>${ruleRows("red")}</span></div>
    <div class="tip-row"><span class="badge orange">경고</span><span>여행경보 일부 지역 3단계, 전역 2단계<br>${ruleRows("orange")}</span></div>
    <div class="tip-row"><span class="badge none">정상</span><span>그 밖 (여행경보 1단계, 일부 지역 2단계 포함)</span></div>`;
  $("#gboard").innerHTML = `<div class="card-head"><h2>수원국 등급 ${info(tip)}</h2></div>`
    + ["red", "orange", "none"].map((lv) => {
      const l = byLv[lv];
      const names = l.length ? l.map(cname).slice(0, 4).join(" · ") + (l.length > 4 ? ` 외 ${l.length - 4}` : "") : "해당 국가 없음";
      return `<button class="rk ${lv} ${l.length ? "on" : ""} ${ui.lv === lv ? "sel" : ""}" data-glv="${lv}" ${l.length ? `title="누르면 지도에서 ${LEVEL[lv]} 국가만 강조"` : "disabled"}>
        <div class="rk-num"><span>${l.length}</span><small>개국</small></div>
        <div class="rk-lv">${LEVEL[lv]}</div>
        <div class="rk-names ${l.length ? "" : "zero"}">${esc(names)}</div></button>`;
    }).join("");
  $$("#gboard [data-glv]:not(:disabled)").forEach((b) => b.onclick = () => { ui.lv = ui.lv === b.dataset.glv ? null : b.dataset.glv; renderGeo(); });

  // 왼쪽 아래: 이벤트 종류별 건수 (누르면 지도·목록 거르기)
  const tc = {}; evs.forEach((e) => (tc[e.type] = (tc[e.type] || 0) + 1));
  $("#evSummary").innerHTML = `<div class="card-head"><h2>이벤트 요약 ${info("수원국 안팎에서 최근 일어난 지진·분쟁·테러·재난입니다.<br><b>지진</b> USGS(미국지질조사국) 규모 4.5 이상, 사업지·수원국에서 600km 안<br><b>그 밖</b> Google·네이버 뉴스 제목에서 나라 이름과 사건 단어로 찾음 (매일 아침)<br>종류를 누르면 지도와 목록이 그 종류만 보여줍니다.")}</h2><span class="muted small">${pl}</span></div>
    <div class="ev-grid">${Object.entries(GEO_TYPES).map(([k, [label]]) => `<button class="ev-chip ${tc[k] ? "on" : ""} ${ui.type === k ? "sel" : ""}" data-et="${k}" ${tc[k] ? "" : "disabled"}>${ibadge(k, "sm")}<span class="lb">${label.split("·")[0]}</span><b>${tc[k] || 0}</b></button>`).join("")}</div>`;
  $$("#evSummary [data-et]:not(:disabled)").forEach((b) => b.onclick = () => { ui.type = ui.type === b.dataset.et ? null : b.dataset.et; renderGeo(); });

  // 오른쪽: 사업별 내역 + 여행경보
  pins.sort((a, b) => LV[b.r.lv] - LV[a.r.lv] || (b.r.alert?.level || 0) - (a.r.alert?.level || 0) || a.p.name.localeCompare(b.p.name));
  $("#geoProjTitle").textContent = scope === "mine" ? "내 담당 사업" : "전체 사업";
  $("#geoProjN").textContent = ps.length;
  if (ui.focus && !pins.some((x) => x.p.id === ui.focus)) ui.focus = null;
  $("#geoProjects").innerHTML = pins.map(({ p, pt, r }, idx) => {
    const a = r.alert, sel = ui.focus === p.id, near = nearEvents(pt, evs, p.country).slice(0, sel ? 6 : 2);
    const co = ctx.companyTally(p.id);
    const alertHtml = a?.level ? `<span class="alert-chip ${ALERT[a.level][2]}">${ALERT[a.level][0]} ${ALERT[a.level][1]}</span>${a.partial ? `<span class="muted small">일부 지역</span>` : ""}${a.special ? `<span class="alert-chip sp">특별여행주의보</span>` : ""}`
      : aOk ? `<span class="alert-chip a0">여행경보 없음</span>` : `<span class="muted small">여행경보 연결 전</span>`;
    return `<div class="gp ${r.lv} ${ui.focus === p.id ? "sel" : ""}" data-gpid="${p.id}" role="button" tabindex="0" title="누르면 자세한 내용과 지도의 거리 원을 보여줍니다">
      <div class="pj-top"><span class="gp-no ${r.lv}">${idx + 1}</span><span class="pj-name" title="${esc(p.name)}">${esc(p.name)}</span><span class="badge ${r.lv}">${LEVEL[r.lv]}</span></div>
      ${sel ? `      <div class="gp-row"><span class="gp-k">사업지</span><span>${esc(cname(p.country))}${pt ? ` <span class="gp-en">${esc(pt.en)}</span>` : ` <span class="muted small">· 위치 미상</span>`}</span></div>
      <div class="gp-row"><span class="gp-k">여행경보</span><span class="gp-alert">${alertHtml}</span></div>
      ${a?.regions ? `<div class="gp-reg">${esc(String(a.regions).slice(0, 120))}</div>` : ""}
      ${r.why.length ? `<div class="gp-row"><span class="gp-k">근거</span><span class="gp-why">${r.why.slice(0, sel ? 4 : 2).map((w) => `<span>${esc(w)}</span>`).join("")}</span></div>` : ""}
      <div class="gp-row"><span class="gp-k">${sel ? "가까운 사건" : "이벤트"}</span><span class="gp-evs">${near.length ? near.map((e) => `<span class="gp-ev" title="${esc(e.title)}">${ibadge(e.type, "xs")}<span class="gp-ev-t">${esc(e.title)}</span>${e.d != null ? `<b class="gp-km">${fmtKm(e.d)}</b>` : ""}</span>`).join("") : `<span class="muted small">${pl} · ${NEAR_KM}km 안 없음</span>`}</span></div>
      <div class="gp-row"><span class="gp-k">참여 업체</span><span class="pj-sum">${co.total ? (["red", "orange"].filter((lv) => co[lv]).map((lv) => `<span class="${lv}">${LEVEL[lv]} ${co[lv]}</span>`).join("") || `<span class="ok">이상 없음</span>`) + `<span class="tot">/ ${co.total}</span>` : `<span class="tot">연결된 업체 없음</span>`}</span></div>` : `<div class="gp-brief"><span class="gp-alert">${alertHtml}</span>${r.why.length ? `<span class="gp-why1" title="${esc(r.why.join(" / "))}">${esc(r.why[0])}</span>` : ""}${co.total && (co.red || co.orange) ? `<span class="gp-co pj-sum">업체 ${["red", "orange"].filter((lv) => co[lv]).map((lv) => `<span class="${lv}">${LEVEL[lv]} ${co[lv]}</span>`).join("")}</span>` : ""}</div>`}
    </div>`;
  }).join("") || `<div class="empty small">${scope === "mine" ? "내가 담당하는 사업이 없습니다." : "등록된 사업이 없습니다."}</div>`;

  // 아래: 최근 이벤트 목록
  const shown = evs.filter((e) => !ui.type || e.type === ui.type).filter((e) => !ui.lv || risk[e.country]?.lv === ui.lv);
  $("#evSeg").innerHTML = PERIODS.map(([k, l]) => `<button data-p="${k}" class="${k === ui.period ? "active" : ""}">${l} <span class="n">${pCounts[k]}</span></button>`).join("");
  $$("#evSeg button").forEach((b) => b.onclick = () => { ui.period = b.dataset.p; try { localStorage.setItem("edcf_geo_period2", ui.period); } catch {} renderGeo(); });
  $("#evCount").textContent = shown.length;
  $("#evFeed").innerHTML = shown.slice(0, 40).map((e) => `<div class="ev-item t-${e.type}" data-eid="${esc(e.id)}">
      ${ibadge(e.type, "lg")}
      <div class="ev-body"><div class="ev-top"><span class="ev-type" style="color:${GEO_TYPES[e.type][1]}">${GEO_TYPES[e.type][0]}</span><span class="ev-ctry">${esc(cname(e.country))} · ${esc(cen(e.country))}</span>${e.mag ? `<span class="ev-mag ${e.mag >= 6 ? "big" : ""}">M${(+e.mag).toFixed(1)}</span>` : ""}<span class="ev-time" title="${ymd(e.ms)}">${rel(e.ms)}</span></div>
      <div class="ev-title">${esc(e.title)}</div>
      <div class="ev-src">${esc(e.source || "-")} · ${ymd(e.ms)}${e.url ? ` · <a href="${esc(e.url)}" target="_blank" rel="noopener">원문 ↗</a>` : ""}</div></div></div>`).join("")
    || `<div class="ok-box">${ui.type || ui.lv ? "이 조건에 맞는 이벤트가 없습니다" : `${pl} 수원국 이벤트가 없습니다`}</div>`;
  if (shown.length > 40) $("#evFeed").insertAdjacentHTML("beforeend", `<div class="muted small">최근 40건만 보여줍니다 (전체 ${shown.length}건)</div>`);

  last = { pins, evs, risk };
  drawMap(pins, evs, risk);
  // 고른 사업 카드가 목록 안에서 보이게 (페이지는 움직이지 않게 목록만 스크롤)
  const selEl = ui.focus && $(`#geoProjects [data-gpid="${ui.focus}"]`), list = $("#geoProjects");
  if (selEl && (selEl.offsetTop < list.scrollTop || selEl.offsetTop + selEl.offsetHeight > list.scrollTop + list.clientHeight)) list.scrollTo({ top: selEl.offsetTop - 8, behavior: "smooth" });
  $$("#geoProjects [data-gpid]").forEach((el) => {
    const pid = el.dataset.gpid;
    el.onmouseenter = () => hiPin(pid, true); el.onmouseleave = () => hiPin(pid, false);
    el.onclick = () => setFocus(ui.focus === pid ? null : pid); el.onkeydown = (e) => { if (e.key === "Enter") setFocus(ui.focus === pid ? null : pid); };
  });
  $$("#evFeed [data-eid]").forEach((el) => el.onclick = (e) => { if (!e.target.closest("a")) flyEvent(el.dataset.eid); });

  if (!live.at && !live.loading) loadLiveQuakes().then(() => { if ($("#view-geo").classList.contains("active")) renderGeo(); });
}

// 사업지에서 가까운 이벤트 (거리 순). 위치를 모르면 같은 나라 이벤트
const fmtKm = (d) => d < 10 ? "10km 안" : `${Math.round(d)}km`;
function nearEvents(pt, evs, country) {
  if (!pt) return evs.filter((e) => e.country === country);
  return evs.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng)).map((e) => ({ ...e, d: km(pt.ll, [e.lat, e.lng]) }))
    .filter((e) => e.d <= NEAR_KM).sort((a, b) => a.d - b.d);
}

// ---------- 지도 ----------
let last = null;
const pinMarkers = {}, evMarkers = {};
// 지도 바탕: 완전 플랫 — 바다·육지·국경선만 (assets/world-50m.json, Natural Earth 1:50m · 저장소 안 파일이라 바깥 지도 서비스·키 없음)
// 나라 이름은 지도 위에 글자로 직접 올림(그림자 없이). 사업이 있는 나라는 등급 색으로 옅게 칠함
const isLight = () => document.documentElement.dataset.theme === "light";
// 나라 숫자 코드(ISO 3166-1) ↔ 두 글자 코드
const ISO_NUM = { TZ: "834", PK: "586", KE: "404", MN: "496", LA: "418", ID: "360", KR: "410", VN: "704", KH: "116", BD: "050", PH: "608", UZ: "860", ET: "231", GH: "288", MM: "104", LK: "144", NP: "524", RW: "646", UG: "800", TN: "788", EG: "818", BO: "068", PY: "600", CO: "170", PE: "604", EC: "218", GT: "320", SN: "686", MZ: "508", CM: "120", NG: "566", TR: "792", UA: "804", GE: "268", AZ: "031", KZ: "398", KG: "417", TJ: "762", TL: "626" };
const NUM_ISO = Object.fromEntries(Object.entries(ISO_NUM).map(([k, v]) => [v, k]));
let world = null, worldLayer = null, nameLayer = null, riskNow = {}, worldLoading = null;
const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function loadWorld() {
  if (world || worldLoading) return worldLoading;
  worldLoading = fetch("assets/world-50m.json").then((r) => r.json()).then((t) => {
    world = window.topojson.feature(t, t.objects.countries).features.filter((f) => f.id !== "010"); // 남극은 뺌
    // 날짜변경선(경도 180도)을 넘는 땅(피지·러시아 동쪽 끝)은 테두리가 지도 전체를 가로지르는 가로줄로 그려짐 → 서쪽 조각을 동쪽으로 이어 붙임
    const unwrap = (ring) => { const xs = ring.map((p) => p[0]); if (Math.max(...xs) - Math.min(...xs) > 180) ring.forEach((p) => { if (p[0] < 0) p[0] += 360; }); };
    world.forEach((f) => { const g = f.geometry; if (!g) return; (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []).forEach((poly) => poly.forEach(unwrap)); });
    if (map) { drawWorld(); if (last) drawMap(last.pins, last.evs, last.risk); }
  }).catch((e) => { console.warn("world map", e); });
  return worldLoading;
}
// 두 색을 섞은 불투명 색 (육지 위에 등급 색을 옅게 · 바다 색이 비치지 않게)
const mix = (a, b, k) => { const h = (c) => { c = c.replace("#", ""); if (c.length === 3) c = [...c].map((x) => x + x).join(""); return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16)); }; try { const x = h(a), y = h(b); return "#" + x.map((v, i) => Math.round(v * k + y[i] * (1 - k)).toString(16).padStart(2, "0")).join(""); } catch { return b; } };
function landStyle(f) {
  const code = NUM_ISO[f.id], lv = riskNow[code];
  const tint = lv && lv !== "none" ? cssv(lv === "red" ? "--red" : "--orange") : null; // 정상 나라는 칠하지 않음 (초록은 바다처럼 보여서)
  const dim = lv && ui.lv && ui.lv !== lv;
  return { stroke: true, color: lv ? cssv("--map-name-2") : cssv("--map-border"), weight: lv ? 1.3 : 0.7, opacity: 1, fill: true, fillColor: tint && !dim ? mix(tint, cssv("--map-land"), isLight() ? 0.2 : 0.28) : cssv("--map-land"), fillOpacity: 1 };
}
// 나라 이름 자리: 가장 큰 덩어리의 가운데 (사업 나라는 정해 둔 중심)
function labelPoint(f) {
  const code = NUM_ISO[f.id];
  if (GEO_COUNTRY[code]) return [GEO_COUNTRY[code][2], GEO_COUNTRY[code][3]];
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const ring = polys.map((p) => p[0]).sort((x, y) => y.length - x.length)[0];
  let [x0, y0, x1, y1] = [180, 90, -180, -90];
  ring.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  return { ll: [(y0 + y1) / 2, (x0 + x1) / 2], size: (x1 - x0) * (y1 - y0) };
}
function drawWorld() {
  if (!world || !map) return;
  if (worldLayer) map.removeLayer(worldLayer);
  if (nameLayer) map.removeLayer(nameLayer);
  worldLayer = L.geoJSON(world, { pane: "land", renderer: L.canvas({ pane: "land", padding: 0.5 }), style: landStyle, interactive: false }).addTo(map);
  nameLayer = L.layerGroup().addTo(map);
  world.forEach((f) => {
    const code = NUM_ISO[f.id], lp = labelPoint(f), mine = !!riskNow[code];
    const ll = Array.isArray(lp) ? lp : lp.ll, size = Array.isArray(lp) ? 999 : lp.size;
    if (!mine && size < 6) return; // 아주 작은 나라 이름은 생략
    const name = GEO_COUNTRY[code]?.[1] || f.properties.name;
    const tier = mine ? "mine" : size > 400 ? "big" : size > 60 ? "mid" : "small";
    L.marker(ll, { pane: "names", interactive: false, keyboard: false, icon: L.divIcon({ className: "", html: `<span class="cn ${tier}">${ctx.esc(name)}</span>`, iconSize: [0, 0] }) }).addTo(nameLayer);
  });
  zoomClass();
}
function zoomClass() { // 확대할수록 작은 나라 이름까지
  const z = map.getZoom(), el = $("#geoMap");
  el.classList.toggle("z-big", z >= 2.5); el.classList.toggle("z-mid", z >= 4); el.classList.toggle("z-small", z >= 5.5);
  setTimeout(declutter, 30);
}
function applyTheme() { if (worldLayer) worldLayer.setStyle(landStyle); }
function ensureMap() {
  if (map || !window.L) return !!map;
  // 휠 확대·축소를 잘게(0.25단계) 나눠 부드럽게
  map = L.map("geoMap", { worldCopyJump: true, minZoom: 2, maxZoom: 10, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110, wheelDebounceTime: 20, attributionControl: true }).setView([15, 80], 3);
  map.attributionControl.setPrefix("").addAttribution('지도 자료: <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a>');
  map.createPane("land"); map.getPane("land").style.zIndex = 200;
  map.createPane("names"); map.getPane("names").style.zIndex = 450; map.getPane("names").style.pointerEvents = "none";
  layers = { halo: L.layerGroup().addTo(map), focus: L.layerGroup().addTo(map), ev: L.layerGroup().addTo(map), pin: L.layerGroup().addTo(map) };
  map.on("zoomend", zoomClass);
  map.on("zoomend moveend", () => setTimeout(declutter, 30));
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  map._fitted = false;
  loadWorld();
  return true;
}
function drawMap(pins, evs, risk) {
  if (!ensureMap()) { $("#geoMap").innerHTML = `<div class="empty">지도를 불러오지 못했습니다 (인터넷 연결 또는 회사망 차단 확인)</div>`; return; }
  setTimeout(() => map.invalidateSize(), 0); setTimeout(() => map.invalidateSize(), 520); // 화면 전환(뒤집기) 뒤에도 크기 맞춤
  layers.halo.clearLayers(); layers.focus.clearLayers(); layers.ev.clearLayers(); layers.pin.clearLayers();
  const f = ui.focus && pins.find((x) => x.p.id === ui.focus && x.pt);
  // 수원국: 나라를 등급 색으로 옅게 칠함 (지도 자료를 받은 뒤)
  riskNow = Object.fromEntries(Object.entries(risk).map(([c, r]) => [c, r.lv]));
  if (world && (!worldLayer || worldLayer._riskKey !== JSON.stringify(riskNow))) { drawWorld(); worldLayer._riskKey = JSON.stringify(riskNow); }
  else if (worldLayer) worldLayer.setStyle(landStyle);
  // 이벤트: 종류별 아이콘 배지
  const near = f ? nearEvents(f.pt, evs, f.p.country) : [];
  const nearIds = new Set(near.map((e) => e.id));
  evs.filter((e) => !ui.type || e.type === ui.type).filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng)).forEach((e) => {
    const [label, color] = GEO_TYPES[e.type], fresh = Date.now() - e.ms <= 2 * DAY, big = e.type === "quake" && (e.mag || 0) >= 6;
    const dim = (ui.lv && risk[e.country]?.lv !== ui.lv) || (f && !nearIds.has(e.id));
    const d = f ? near.find((x) => x.id === e.id)?.d : null;
    const m = L.marker([e.lat, e.lng], { icon: L.divIcon({ className: "", html: `<div class="gev ${fresh ? "fresh" : ""} ${big ? "big" : ""} ${dim ? "dim" : ""}" style="--ec:${color}">${icon(e.type)}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] }), zIndexOffset: 100 })
      .bindPopup(`<div class="gpop"><div class="gpop-h" style="color:${color}">${icon(e.type)}<b>${ctx.esc(label)}</b><span>${ctx.esc(cen(e.country))}${e.mag ? ` · M${(+e.mag).toFixed(1)}` : ""}</span></div><div class="gpop-t">${ctx.esc(e.title)}</div><div class="gpop-s">${d != null ? `<b>사업지에서 ${fmtKm(d)}</b> · ` : ""}${ctx.esc(e.source || "-")} · ${ymd(e.ms)} (${rel(e.ms)})${e.url ? ` · <a href="${ctx.esc(e.url)}" target="_blank" rel="noopener">원문 ↗</a>` : ""}</div></div>`, { maxWidth: 300 })
      .addTo(layers.ev);
    evMarkers[e.id] = m;
  });
  // 사업: 핀
  const pts = [];
  const short = (p) => String(p.name || "").replace(new RegExp("^" + cname(p.country) + "\\s*"), "").replace(/\s*사업$/, "");
  pins.forEach(({ p, pt, r }, idx) => {
    if (!pt) return;
    const dim = (ui.lv && ui.lv !== r.lv) || (f && f.p.id !== p.id);
    const side = pins.some((o, j) => j < idx && o.pt && Math.abs(o.pt.ll[0] - pt.ll[0]) < 4 && o.pt.ll[1] > pt.ll[1] - 1 && o.pt.ll[1] - pt.ll[1] < 12) ? "l" : "r"; // 오른쪽 가까이에 다른 핀이 있으면 왼쪽에
    const lb = dim ? "" : `<span class="pin-lb ${side} ${r.lv}" title="${ctx.esc(p.name)}">${ctx.esc(short(p))}</span>`;
    const m = L.marker(pt.ll, { icon: L.divIcon({ className: "", html: `<div class="gpin-w"><div class="gpin ${r.lv} ${dim ? "dim" : ""} ${f && f.p.id === p.id ? "hi" : ""}" data-pin="${p.id}"><span>${idx + 1}</span></div>${lb}</div>`, iconSize: [28, 36], iconAnchor: [14, 34], tooltipAnchor: [0, -30] }), zIndexOffset: dim ? 500 : 1000 })
      .bindTooltip(`<b>${ctx.esc(p.name)}</b><br><span class="en">${ctx.esc(pt.en)}</span> · ${LEVEL[r.lv]}${r.why.length ? `<br><span class="muted">${ctx.esc(r.why.join(" / "))}</span>` : ""}`, { direction: "top", className: "gtip" })
      .on("click", () => setFocus(ui.focus === p.id ? null : p.id))
      .addTo(layers.pin);
    pinMarkers[p.id] = m;
    if (!dim) pts.push(pt.ll);
  });
  drawFocus(f, near);
  requestAnimationFrame(declutter);
  if (f) return;
  if (pts.length && (!map._fitted || ui.lv !== map._fitLv || map._fitFocus)) {
    map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: ui.lv ? 6 : 4, animate: map._fitted });
    map._fitted = true; map._fitLv = ui.lv; map._fitFocus = false;
  }
}
// 고른 사업: 100km 간격 점선 원 + 가까운 이벤트까지 선과 거리 + 지도 위 안내 상자
function drawFocus(f, near) {
  const box = $("#mapFocus"), all = $("#mapAll");
  all.classList.toggle("hidden", !f); all.onclick = () => setFocus(null);
  box.classList.add("hidden"); // 사업 정보는 오른쪽 카드 안에 펼쳐 보여 줌 (지도를 가리지 않게)
  if (!f) { map._focusPid = null; if (map._sweepOff) map._sweepOff(); return; }
  const c = f.pt.ll, accent = cssv("--accent-2");
  // 레이더처럼: 십자선·대각선 + 실선 원 + 한 바퀴씩 도는 빛 (업체 리스크 레이더와 같은 모양)
  const line = isLight() ? "#0E7490" : "#67E8F9", R = RINGS[RINGS.length - 1], kLng = 111.2 * Math.cos((c[0] * Math.PI) / 180);
  const at = (deg, r) => [c[0] + (Math.cos((deg * Math.PI) / 180) * r) / 111.2, c[1] + (Math.sin((deg * Math.PI) / 180) * r) / kLng];
  [0, 45, 90, 135].forEach((d) => L.polyline([at(d, R), at(d + 180, R)], { color: line, weight: d % 90 ? 0.6 : 1, opacity: d % 90 ? 0.3 : 0.5, interactive: false }).addTo(layers.focus));
  for (let d = 0; d < 360; d += 10) L.polyline([at(d, R), at(d, R * (d % 30 ? 1.02 : 1.04))], { color: line, weight: 1.2, opacity: 0.8, interactive: false }).addTo(layers.focus); // 바깥 눈금
  const sweep = L.marker(c, { interactive: false, keyboard: false, icon: L.divIcon({ className: "", html: `<div class="geo-sweep"></div>`, iconSize: [0, 0] }) }).addTo(layers.focus);
  const sizeSweep = () => { const el = sweep.getElement()?.firstChild; if (!el) return; const r = Math.abs(map.latLngToLayerPoint(at(90, R)).x - map.latLngToLayerPoint(c).x); el.style.cssText = `width:${2 * r}px;height:${2 * r}px;margin:${-r}px 0 0 ${-r}px`; el.classList.remove("hide"); };
  if (map._sweepOff) map._sweepOff();
  const hideSweep = () => sweep.getElement()?.firstChild?.classList.add("hide");
  map.on("zoomstart", hideSweep); map.on("zoomend", sizeSweep);
  map._sweepOff = () => { map.off("zoomstart", hideSweep); map.off("zoomend", sizeSweep); map._sweepOff = null; };
  sizeSweep();
  RINGS.forEach((r, i) => {
    L.circle(c, { radius: r * 1000, color: line, weight: i === RINGS.length - 1 ? 2.4 : 1.2, opacity: i === RINGS.length - 1 ? 0.95 : 0.7, fill: i === RINGS.length - 1, fillColor: accent, fillOpacity: 0.05, interactive: false }).addTo(layers.focus);
    const lat = c[0] - r / 111.2; // 원의 맨 아래에 거리 글씨 (위쪽은 핀 자리)
    L.marker([lat, c[1]], { interactive: false, icon: L.divIcon({ className: "", html: `<span class="ring-lb">${r}km</span>`, iconSize: [44, 16], iconAnchor: [22, 8] }) }).addTo(layers.focus);
  });
  near.slice(0, 6).forEach((e) => {
    const color = GEO_TYPES[e.type][1];
    if (e.d < 30) return; // 사업지 바로 옆은 선 대신 안내 상자에만
    L.polyline([c, [e.lat, e.lng]], { color, weight: 1.6, opacity: 0.85, dashArray: "1 5", lineCap: "round", interactive: false }).addTo(layers.focus);
    const mid = [(c[0] + e.lat) / 2, (c[1] + e.lng) / 2];
    L.marker(mid, { interactive: false, icon: L.divIcon({ className: "", html: `<span class="dist-lb" style="--ec:${color}">${fmtKm(e.d)}</span>`, iconSize: [60, 18], iconAnchor: [30, 9] }) }).addTo(layers.focus);
  });
  const dLat = 560 / 111.2, dLng = 560 / (111.2 * Math.cos((c[0] * Math.PI) / 180));
  if (map._focusPid !== f.p.id) map.flyToBounds([[c[0] - dLat, c[1] - dLng], [c[0] + dLat, c[1] + dLng]], { duration: 0.9 }); // 다시 그릴 때는 그대로
  map._focusPid = f.p.id;
  map._fitFocus = true;
}
function setFocus(pid) { ui.focus = pid; renderGeo(); }
// 이름표가 겹치면 자리를 바꿔 봄: 원래 쪽 → 반대쪽 → 핀 아래 → 핀 위. 모두 막히면 숨김 (위험한 사업부터 자리를 차지) · 확대하면 다시 보임
const SIDES = ["r", "l", "b", "t"];
function declutter() {
  const map0 = $("#geoMap"); if (!map0) return;
  const edge = map0.getBoundingClientRect(); // 지도 밖으로 잘리는 자리도 안 됨
  const pins = $$("#geoMap .gpin").map((el) => ({ el, box: el.getBoundingClientRect() })), placed = [];
  const hit = (q, x) => !(q.right < x.left || q.left > x.right || q.bottom < x.top || q.top > x.bottom);
  const put = (el, side) => SIDES.forEach((k) => el.classList.toggle(k, k === side));
  const free = (el) => {
    const q = el.getBoundingClientRect(), own = el.previousElementSibling;
    const inside = q.left >= edge.left + 4 && q.right <= edge.right - 4 && q.top >= edge.top + 4 && q.bottom <= edge.bottom - 4;
    return inside && !placed.some((x) => hit(q, x)) && !pins.some((x) => x.el !== own && hit(q, x.box)) ? q : null;
  };
  $$("#geoMap .pin-lb").forEach((el) => {
    el.style.visibility = "";
    if (!el.dataset.side) el.dataset.side = el.classList.contains("l") ? "l" : "r";
    const order = [el.dataset.side, ...SIDES.filter((k) => k !== el.dataset.side)];
    let q = null;
    for (const side of order) { put(el, side); q = free(el); if (q) break; }
    if (q) placed.push(q);
    else { put(el, el.dataset.side); el.style.visibility = "hidden"; }
  });
  const evs = $$("#geoMap .gev").map((el) => el.getBoundingClientRect());
  $$("#geoMap .cn").sort((x, y) => (y.classList.contains("mine") - x.classList.contains("mine")) || (y.classList.contains("big") - x.classList.contains("big"))).forEach((el) => {
    el.style.visibility = "";
    if (getComputedStyle(el).display === "none") return;
    const q = el.getBoundingClientRect();
    if (placed.some((x) => hit(q, x)) || pins.some((x) => hit(q, x.box)) || evs.some((x) => hit(q, x))) el.style.visibility = "hidden";
    else placed.push(q);
  });
}
function hiPin(pid, on) { const el = document.querySelector(`.gpin[data-pin="${pid}"]`); if (el) el.classList.toggle("hi", on || ui.focus === pid); }
function flyEvent(id) { const m = evMarkers[id]; if (!m || !map) return; map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 5), { duration: 0.8 }); setTimeout(() => m.openPopup(), 850); }
export async function refreshGeo() { await loadLiveQuakes(true); renderGeo(); }

// 사업지 고르기 (사업 수정 창의 작은 지도): 눌러서 핀을 놓고 끌어서 옮김. onPick(lat, lng)
export function mountSitePicker(el, { lat, lng, country }, onPick) {
  const has = Number.isFinite(lat) && Number.isFinite(lng), cc = GEO_COUNTRY[country];
  const m = L.map(el, { minZoom: 2, maxZoom: 11, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110, attributionControl: false, worldCopyJump: true })
    .setView(has ? [lat, lng] : cc ? [cc[2], cc[3]] : [15, 80], has ? 7 : cc ? 5 : 3);
  m.createPane("land"); m.getPane("land").style.zIndex = 200;
  const draw = () => {
    if (!world || !el.isConnected) return;
    L.geoJSON(world, { pane: "land", renderer: L.canvas({ pane: "land", padding: 0.5 }), interactive: false, style: () => ({ stroke: true, color: cssv("--map-border"), weight: 0.8, opacity: 1, fill: true, fillColor: cssv("--map-land"), fillOpacity: 1 }) }).addTo(m);
    // 자리를 찾기 쉽게: 아는 도시를 작은 점과 이름으로
    Object.values(GEO_CITY).forEach(([la, ln, en]) => L.marker([la, ln], { interactive: false, keyboard: false, icon: L.divIcon({ className: "", html: `<span class="sp-city"><i></i>${en}</span>`, iconSize: [0, 0] }) }).addTo(m));
  };
  const w = loadWorld(); if (w && w.then) w.then(draw); else draw();
  let pin = null;
  const put = (ll, silent) => {
    if (pin) pin.setLatLng(ll);
    else pin = L.marker(ll, { draggable: true, keyboard: false, icon: L.divIcon({ className: "", html: `<span class="sp-pin"></span>`, iconSize: [0, 0] }) }).addTo(m)
      .on("dragend", () => { const p = pin.getLatLng(); onPick(p.lat, p.lng); });
    if (!silent) onPick(ll[0], ll[1]);
  };
  if (has) put([lat, lng], true);
  m.on("click", (e) => put([e.latlng.lat, e.latlng.lng]));
  setTimeout(() => m.invalidateSize(), 60);
  return {
    set(ll) { put(ll); m.setView(ll, Math.max(m.getZoom(), 7)); },
    clear() { if (pin) { m.removeLayer(pin); pin = null; } },
    country(code) { const c = GEO_COUNTRY[code]; if (c) m.setView([c[2], c[3]], 5); },
  };
}
