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
export const GEO_CITY = {
  나이로비: [-1.29, 36.82], 몸바사: [-4.04, 39.67], 다르에스살람: [-6.79, 39.21], 도도마: [-6.16, 35.75], 잔지바르: [-6.17, 39.2],
  울란바토르: [47.89, 106.91], 비엔티안: [17.97, 102.63], 루앙프라방: [19.89, 102.13], 다카: [23.81, 90.41], 치타공: [22.36, 91.78],
  하노이: [21.03, 105.85], 호치민: [10.82, 106.63], 다낭: [16.05, 108.2], 메콩델타: [10.03, 105.78], 프놈펜: [11.56, 104.93],
  타슈켄트: [41.3, 69.24], 사마르칸트: [39.65, 66.96], 민다나오: [7.6, 125.0], 다바오: [7.07, 125.61], 마닐라: [14.6, 120.98], 세부: [10.32, 123.89],
  카라치: [24.86, 67.01], 이슬라마바드: [33.68, 73.05], 라호르: [31.55, 74.34], 자카르타: [-6.21, 106.85], 아디스아바바: [9.03, 38.74],
  아크라: [5.6, -0.19], 콜롬보: [6.93, 79.86], 카트만두: [27.72, 85.32], 키갈리: [-1.95, 30.06], 캄팔라: [0.35, 32.58], 카이로: [30.04, 31.24], 양곤: [16.84, 96.17],
};
export const GEO_TYPES = {
  quake: ["🏚️", "지진"], war: ["⚔️", "분쟁·전쟁"], terror: ["💥", "테러·폭발"], unrest: ["✊", "시위·소요"],
  flood: ["🌊", "홍수"], storm: ["🌀", "태풍"], fire: ["🔥", "산불"], volcano: ["🌋", "화산"], disease: ["🦠", "감염병"],
};
// 외교부 여행경보 단계 (색은 외교부 지도와 같은 계열)
const ALERT = { 1: ["1단계", "여행유의", "a1"], 2: ["2단계", "여행자제", "a2"], 3: ["3단계", "출국권고", "a3"], 4: ["4단계", "여행금지", "a4"] };
const LEVEL = { red: "위험", orange: "경고", none: "정상" };
const LV = { red: 2, orange: 1, none: 0 };
const DAY = 86400e3;
const RECENT = 7 * DAY; // 경고로 올리는 기간
const SEVERE = new Set(["war", "terror"]);

let ctx = null, map = null, tiles = null, layers = null, live = { quakes: null, at: null, err: null, loading: false };
const ui = { type: null, period: "14", lv: null };
try { ui.period = localStorage.getItem("edcf_geo_period") || "14"; } catch {}

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const cname = (c) => GEO_COUNTRY[c]?.[0] || c || "국가 미상";
const rel = (ms) => { const h = (Date.now() - ms) / 3600e3; return h < 1 ? "방금" : h < 24 ? `${Math.floor(h)}시간 전` : `${Math.floor(h / 24)}일 전`; };
const ymd = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(5, 16).replace("-", "/").replace("T", " ");
const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const evMs = (e) => e.at_ms || Date.parse(String(e.at || "").replace(" ", "T") + (String(e.at || "").length <= 10 ? "T00:00:00+09:00" : "+09:00")) || 0;

// 사업 위치: 직접 넣은 좌표 → 사업명 속 도시 → 수원국 중심(여러 사업이면 조금씩 비켜서)
export function projectPoint(p, i = 0) {
  if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) return { ll: [p.lat, p.lng], how: "좌표" };
  const city = Object.keys(GEO_CITY).find((k) => String(p.name || "").includes(k));
  if (city) return { ll: GEO_CITY[city], how: city };
  const c = GEO_COUNTRY[p.country];
  if (!c) return null;
  const a = i * 2.4; // 같은 나라 사업끼리 겹치지 않게
  return { ll: [c[2] + (i ? Math.sin(a) * 0.9 : 0), c[3] + (i ? Math.cos(a) * 0.9 : 0)], how: "국가 중심" };
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
      return { id: "usgs-" + f.id, type: "quake", mag: p.mag, title: `규모 ${(+p.mag).toFixed(1)} 지진 · ${p.place || ""}`, url: p.url, lat, lng, country: near.t.country, ms: p.time, at_ms: p.time, source: "USGS (실시간)", dist_km: Math.round(near.d) };
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

// 수원국 등급 + 이유
export function countryRisk(code, evs, alerts) {
  const a = alerts[code] || null, why = [];
  let lv = "none";
  if (a?.special) { lv = "red"; why.push(`특별여행주의보${a.special_text ? ` (${a.special_text})` : ""}`); }
  if ((a?.level || 0) >= 3) { lv = "red"; why.push(`여행경보 ${ALERT[a.level][0]} ${ALERT[a.level][1]}${a.partial ? " (일부 지역)" : ""}`); }
  else if (a?.level === 2) { if (lv === "none") lv = "orange"; why.push(`여행경보 2단계 여행자제${a.partial ? " (일부 지역)" : ""}`); }
  const recent = evs.filter((e) => e.country === code && Date.now() - e.ms <= RECENT);
  const sev = recent.filter((e) => SEVERE.has(e.type) || (e.type === "quake" && (e.mag || 0) >= 6) || e.severe);
  if (sev.length) { if (lv === "none") lv = "orange"; why.push(`최근 7일 ${[...new Set(sev.map((e) => GEO_TYPES[e.type][1]))].join("·")} ${sev.length}건`); }
  return { lv, why, alert: a, recent };
}

// ---------- 화면 ----------
export function initGeo(c) { ctx = c; }
export async function renderGeo() {
  const { state, esc, info } = ctx;
  const scope = ctx.getScope(), ps = scope === "mine" ? state.projects.filter(ctx.isMine) : state.projects;
  const g = geoDoc(), alerts = g.alerts || {};
  const evsAll = allEvents();
  const codes = [...new Set(ps.map((p) => p.country).filter(Boolean))];
  const risk = Object.fromEntries(codes.map((c) => [c, countryRisk(c, evsAll, alerts)]));
  const days = { "7": 7, "14": 14, "30": 30 }[ui.period] || 14;
  const evs = evsAll.filter((e) => codes.includes(e.country) && Date.now() - e.ms <= days * DAY);

  // 제목
  const now = new Date(Date.now() + 9 * 3600e3);
  $("#geoDate").textContent = `COUNTRY RISK · ${now.toISOString().slice(0, 10).replace(/-/g, ".")} (${"일월화수목금토"[now.getUTCDay()]})`;
  $("#geoSub").textContent = `수원국 ${codes.length}개국 · 사업 ${ps.length}개${g.updated_at ? ` · 마지막 갱신 ${String(g.updated_at).slice(5, 16).replace("-", "/")}` : " · 아직 저장된 수원국 정보가 없습니다"}`;
  const mineN = state.projects.filter(ctx.isMine).length;
  $("#geoScope").innerHTML = [["mine", "내 담당 사업", mineN, ctx.ICON_USER], ["all", "EDCF 전체", state.projects.length, ctx.ICON_ORG]]
    .map(([k, l, n, ic]) => `<button data-s="${k}" class="sc-btn ${k} ${k === scope ? "active" : ""}"><span class="sc-ic">${ic}</span>${l}<span class="sc-n">${n}</span></button>`).join("");
  $$("#geoScope button").forEach((b) => b.onclick = () => { ctx.setScope(b.dataset.s); renderGeo(); });
  const aOk = Object.keys(alerts).length;
  $("#geoSrcs").innerHTML = [
    aOk ? `<span class="src ok">여행경보 · 외교부${g.alerts_at ? ` ${esc(String(g.alerts_at).slice(5, 16).replace("-", "/"))}` : ""}</span>` : `<span class="src warn" title="공공데이터포털에서 외교부 여행경보 API 활용신청 후 연결됩니다">여행경보 · 연결 전</span>`,
    live.quakes && !live.err ? `<span class="src ok">지진 · USGS 실시간</span>` : (g.events || []).some((e) => e.type === "quake") ? `<span class="src ok">지진 · USGS 저장본</span>` : `<span class="src off">지진 · ${live.loading ? "불러오는 중" : "불러오지 못함"}</span>`,
    g.news_at ? `<span class="src ok">뉴스 · Google·네이버 ${esc(String(g.news_at).slice(5, 16).replace("-", "/"))}</span>` : `<span class="src off">뉴스 · 다음 아침 스캔부터</span>`,
  ].join("");

  // 왼쪽: 수원국 등급
  const byLv = { red: [], orange: [], none: [] };
  codes.forEach((c) => byLv[risk[c].lv].push(c));
  byLv.red.sort(); byLv.orange.sort(); byLv.none.sort();
  const tip = `<div class="tip-row"><span class="badge red">위험</span><span><b>여행경보 3단계(출국권고)·4단계(여행금지)</b> 또는 특별여행주의보가 있는 나라</span></div>
    <div class="tip-row"><span class="badge orange">경고</span><span><b>여행경보 2단계(여행자제)</b>, 또는 최근 7일 안에 규모 6 이상 지진·분쟁·테러가 있었던 나라</span></div>
    <div class="tip-row"><span class="badge none">정상</span><span>그 밖 (1단계 여행유의 포함). 홍수·태풍 같은 이벤트는 지도와 목록에만 표시</span></div>
    <div class="tip-row muted">여행경보가 일부 지역만 높아도 그 나라 전체를 높은 단계로 봅니다 (초안 기준)</div>`;
  $("#gboard").innerHTML = `<div class="card-head"><h2>수원국 등급 ${info(tip)}</h2><span class="muted small">${codes.length}개국 중 ${byLv.red.length + byLv.orange.length}개국</span></div>`
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
  $("#evSummary").innerHTML = `<div class="card-head"><h2>이벤트 요약 ${info("수원국 안팎에서 최근 일어난 지진·분쟁·테러·재난입니다.<br><b>지진</b> USGS(미국지질조사국) 규모 4.5 이상, 사업지·수원국에서 600km 안<br><b>그 밖</b> Google·네이버 뉴스 제목에서 나라 이름과 사건 단어로 찾음 (매일 아침)<br>종류를 누르면 지도와 목록이 그 종류만 보여줍니다.")}</h2><span class="muted small">최근 ${days}일</span></div>
    <div class="ev-grid">${Object.entries(GEO_TYPES).map(([k, [emo, label]]) => `<button class="ev-chip ${tc[k] ? "on" : ""} ${ui.type === k ? "sel" : ""}" data-et="${k}" ${tc[k] ? "" : "disabled"}><span class="emo">${emo}</span><span class="lb">${label.split("·")[0]}</span><b>${tc[k] || 0}</b></button>`).join("")}</div>`;
  $$("#evSummary [data-et]:not(:disabled)").forEach((b) => b.onclick = () => { ui.type = ui.type === b.dataset.et ? null : b.dataset.et; renderGeo(); });

  // 오른쪽: 사업별 내역 + 여행경보
  const byC = {};
  const pins = ps.map((p) => { const i = (byC[p.country] = (byC[p.country] ?? -1) + 1); return { p, pt: projectPoint(p, i), r: risk[p.country] || { lv: "none", why: [], recent: [] } }; });
  pins.sort((a, b) => LV[b.r.lv] - LV[a.r.lv] || (b.r.alert?.level || 0) - (a.r.alert?.level || 0) || a.p.name.localeCompare(b.p.name));
  $("#geoProjTitle").textContent = scope === "mine" ? "내 담당 사업" : "전체 사업";
  $("#geoProjN").textContent = ps.length;
  $("#geoProjects").innerHTML = pins.map(({ p, pt, r }, idx) => {
    const a = r.alert, near = evs.filter((e) => e.country === p.country).slice(0, 2);
    const co = ctx.companyTally(p.id);
    const alertHtml = a?.level ? `<span class="alert-chip ${ALERT[a.level][2]}">${ALERT[a.level][0]} ${ALERT[a.level][1]}</span>${a.partial ? `<span class="muted small">일부 지역</span>` : ""}${a.special ? `<span class="alert-chip sp">특별여행주의보</span>` : ""}`
      : aOk ? `<span class="alert-chip a0">여행경보 없음</span>` : `<span class="muted small">여행경보 연결 전</span>`;
    return `<div class="gp ${r.lv}" data-gpid="${p.id}" role="button" tabindex="0">
      <div class="pj-top"><span class="gp-no ${r.lv}">${idx + 1}</span><span class="pj-name" title="${esc(p.name)}">${esc(p.name)}</span><span class="badge ${r.lv}">${LEVEL[r.lv]}</span></div>
      <div class="gp-row"><span class="gp-k">수원국</span><span>${esc(cname(p.country))}${pt ? ` <span class="muted small">· 핀 ${esc(pt.how)}</span>` : ` <span class="muted small">· 위치 미상</span>`}</span></div>
      <div class="gp-row"><span class="gp-k">여행경보</span><span class="gp-alert">${alertHtml}</span></div>
      ${a?.regions ? `<div class="gp-reg">${esc(String(a.regions).slice(0, 120))}</div>` : ""}
      <div class="gp-row"><span class="gp-k">이벤트</span><span class="gp-evs">${near.length ? near.map((e) => `<span class="gp-ev" title="${esc(e.title)}">${GEO_TYPES[e.type][0]} ${esc(e.title)}</span>`).join("") : `<span class="muted small">최근 ${days}일 없음</span>`}</span></div>
      <div class="gp-row"><span class="gp-k">참여 업체</span><span class="pj-sum">${co.total ? (["red", "orange"].filter((lv) => co[lv]).map((lv) => `<span class="${lv}">${LEVEL[lv]} ${co[lv]}</span>`).join("") || `<span class="ok">이상 없음</span>`) + `<span class="tot">/ ${co.total}곳</span>` : `<span class="tot">연결된 업체 없음</span>`}</span></div>
    </div>`;
  }).join("") || `<div class="empty small">${scope === "mine" ? "내가 담당하는 사업이 없습니다." : "등록된 사업이 없습니다."}</div>`;

  // 아래: 최근 이벤트 목록
  const shown = evs.filter((e) => !ui.type || e.type === ui.type).filter((e) => !ui.lv || risk[e.country]?.lv === ui.lv);
  $("#evSeg").innerHTML = [["7", "7일"], ["14", "14일"], ["30", "30일"]].map(([k, l]) => `<button data-p="${k}" class="${k === ui.period ? "active" : ""}">${l}</button>`).join("");
  $$("#evSeg button").forEach((b) => b.onclick = () => { ui.period = b.dataset.p; try { localStorage.setItem("edcf_geo_period", ui.period); } catch {} renderGeo(); });
  $("#evCount").textContent = shown.length;
  $("#evFeed").innerHTML = shown.slice(0, 40).map((e) => `<div class="ev-item t-${e.type}" data-eid="${esc(e.id)}">
      <span class="ev-emo">${GEO_TYPES[e.type][0]}</span>
      <div class="ev-body"><div class="ev-top"><span class="ev-type">${GEO_TYPES[e.type][1]}</span><span class="ev-ctry">${esc(cname(e.country))}</span>${e.mag ? `<span class="ev-mag ${e.mag >= 6 ? "big" : ""}">M${(+e.mag).toFixed(1)}</span>` : ""}<span class="ev-time" title="${ymd(e.ms)}">${rel(e.ms)}</span></div>
      <div class="ev-title">${esc(e.title)}</div>
      <div class="ev-src">${esc(e.source || "-")} · ${ymd(e.ms)}${e.url ? ` · <a href="${esc(e.url)}" target="_blank" rel="noopener">원문 ↗</a>` : ""}</div></div></div>`).join("")
    || `<div class="ok-box">${ui.type || ui.lv ? "이 조건에 맞는 이벤트가 없습니다" : `최근 ${days}일 수원국 이벤트가 없습니다`}</div>`;
  if (shown.length > 40) $("#evFeed").insertAdjacentHTML("beforeend", `<div class="muted small">최근 40건만 보여줍니다 (전체 ${shown.length}건)</div>`);

  drawMap(pins, evs, risk);
  $$("#geoProjects [data-gpid]").forEach((el) => {
    const pid = el.dataset.gpid;
    el.onmouseenter = () => hiPin(pid, true); el.onmouseleave = () => hiPin(pid, false);
    el.onclick = () => flyPin(pid); el.onkeydown = (e) => { if (e.key === "Enter") flyPin(pid); };
  });
  $$("#evFeed [data-eid]").forEach((el) => el.onclick = (e) => { if (!e.target.closest("a")) flyEvent(el.dataset.eid); });

  if (!live.at && !live.loading) loadLiveQuakes().then(() => { if ($("#view-geo").classList.contains("active")) renderGeo(); });
}

// ---------- 지도 ----------
const pinMarkers = {}, evMarkers = {};
// 지도 바탕: Esri 회색 지도 (키 없음, 다크·라이트) + 나라·도시 이름 층. CARTO 무료 지도는 키를 요구해서 사용하지 않음
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
const tileUrl = (kind) => `${ESRI}World_${document.documentElement.dataset.theme === "light" ? "Light" : "Dark"}_Gray_${kind}/MapServer/tile/{z}/{y}/{x}`;
let labels = null;
function ensureMap() {
  if (map || !window.L) return !!map;
  map = L.map("geoMap", { worldCopyJump: true, minZoom: 2, maxZoom: 12, zoomSnap: 0.5, attributionControl: true }).setView([15, 80], 3);
  tiles = L.tileLayer(tileUrl("Base"), { maxZoom: 16, attribution: 'Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> · Esri, HERE, Garmin, &copy; OpenStreetMap' }).addTo(map);
  labels = L.tileLayer(tileUrl("Reference"), { maxZoom: 16, pane: "overlayPane", opacity: 0.85 }).addTo(map);
  layers = { halo: L.layerGroup().addTo(map), ev: L.layerGroup().addTo(map), pin: L.layerGroup().addTo(map) };
  new MutationObserver(() => { tiles.setUrl(tileUrl("Base")); labels.setUrl(tileUrl("Reference")); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  map._fitted = false;
  return true;
}
function drawMap(pins, evs, risk) {
  if (!ensureMap()) { $("#geoMap").innerHTML = `<div class="empty">지도를 불러오지 못했습니다 (인터넷 연결 또는 회사망 차단 확인)</div>`; return; }
  setTimeout(() => map.invalidateSize(), 0);
  layers.halo.clearLayers(); layers.ev.clearLayers(); layers.pin.clearLayers();
  const col = (lv) => getComputedStyle(document.documentElement).getPropertyValue(lv === "red" ? "--red" : lv === "orange" ? "--orange" : "--green").trim();
  // 수원국: 등급 색 원
  Object.entries(risk).forEach(([code, r]) => {
    const c = GEO_COUNTRY[code]; if (!c) return;
    const dim = ui.lv && ui.lv !== r.lv;
    L.circle([c[2], c[3]], { radius: 420000, color: col(r.lv), weight: 1, opacity: dim ? 0.15 : 0.55, fillColor: col(r.lv), fillOpacity: dim ? 0.02 : r.lv === "none" ? 0.05 : 0.12, dashArray: "4 4", interactive: false }).addTo(layers.halo);
  });
  // 이벤트: 이모티콘
  evs.filter((e) => !ui.type || e.type === ui.type).filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng)).forEach((e) => {
    const [emo, label] = GEO_TYPES[e.type], fresh = Date.now() - e.ms <= 2 * DAY, big = e.type === "quake" && (e.mag || 0) >= 6;
    const dim = ui.lv && risk[e.country]?.lv !== ui.lv;
    const m = L.marker([e.lat, e.lng], { icon: L.divIcon({ className: "", html: `<div class="gev t-${e.type} ${fresh ? "fresh" : ""} ${big ? "big" : ""} ${dim ? "dim" : ""}">${emo}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: 100 })
      .bindPopup(`<div class="gpop"><div class="gpop-h">${emo} <b>${ctx.esc(label)}</b> · ${ctx.esc(cname(e.country))}${e.mag ? ` · M${(+e.mag).toFixed(1)}` : ""}</div><div class="gpop-t">${ctx.esc(e.title)}</div><div class="gpop-s">${ctx.esc(e.source || "-")} · ${ymd(e.ms)} (${rel(e.ms)})${e.url ? ` · <a href="${ctx.esc(e.url)}" target="_blank" rel="noopener">원문 ↗</a>` : ""}</div></div>`, { maxWidth: 300 })
      .addTo(layers.ev);
    evMarkers[e.id] = m;
  });
  // 사업: 핀
  const pts = [];
  pins.forEach(({ p, pt, r }, idx) => {
    if (!pt) return;
    const dim = ui.lv && ui.lv !== r.lv;
    const m = L.marker(pt.ll, { icon: L.divIcon({ className: "", html: `<div class="gpin ${r.lv} ${dim ? "dim" : ""}" data-pin="${p.id}"><span>${idx + 1}</span></div>`, iconSize: [28, 36], iconAnchor: [14, 34], tooltipAnchor: [0, -30] }), zIndexOffset: 1000 })
      .bindTooltip(`<b>${ctx.esc(p.name)}</b><br>${ctx.esc(cname(p.country))} · ${LEVEL[r.lv]}${r.why.length ? `<br><span class="muted">${ctx.esc(r.why.join(" / "))}</span>` : ""}`, { direction: "top", className: "gtip" })
      .addTo(layers.pin);
    pinMarkers[p.id] = m;
    if (!dim) pts.push(pt.ll);
  });
  if (pts.length && (!map._fitted || ui.lv !== map._fitLv)) {
    map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: ui.lv ? 6 : 4, animate: map._fitted });
    map._fitted = true; map._fitLv = ui.lv;
  }
}
function hiPin(pid, on) { const el = document.querySelector(`.gpin[data-pin="${pid}"]`); if (el) el.classList.toggle("hi", on); }
function flyPin(pid) { const m = pinMarkers[pid]; if (!m || !map) return; map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 5), { duration: 0.8 }); setTimeout(() => m.openTooltip(), 850); }
function flyEvent(id) { const m = evMarkers[id]; if (!m || !map) return; map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 5), { duration: 0.8 }); setTimeout(() => m.openPopup(), 850); }
export async function refreshGeo() { await loadLiveQuakes(true); renderGeo(); }
