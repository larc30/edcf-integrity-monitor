// 레이아웃 시안 (예시 데이터). 실제 화면 코드(assets/app.js)와 무관
const $ = (s, el = document) => el.querySelector(s);
const LV = { red: "경고", orange: "주의", green: "정상" };
const ORD = { red: 0, orange: 1, green: 2 };
const badge = (lv) => `<span class="badge ${lv}">${LV[lv]}</span>`;
const tv = (n) => n >= 3 ? `<span class="tv l3">${n}단계 ${n == 4 ? "여행금지" : "출국권고"}</span>` : n == 2 ? `<span class="tv l2">2단계 여행자제</span>` : n == 1 ? `<span class="tv l1">1단계 여행유의</span>` : "";

/* ---------- 데이터 만들기 ---------- */
const countries = CO.map(([id, num, ko, en, lat, lng, lv, alert, n, cities]) => ({ id, num, ko, en, lat, lng, lv, alert, n, cities, ps: [], evs: [] }));
const byId = Object.fromEntries(countries.map((c) => [c.id, c]));
const projects = [];
countries.forEach((c, ci) => {
  for (let i = 0; i < c.n; i++) {
    const city = c.cities[i % c.cities.length];
    const p = { c, i, city, name: (i == 0 && FIRST[c.id]) || `${c.ko} ${city} ${KIND[(i * 3 + ci) % KIND.length]}`, lv: c.lv, evs: [],
      lat: c.lat + (i ? Math.sin(i * 2.3 + ci) * 2.2 : 0), lng: c.lng + (i ? Math.cos(i * 1.7 + ci) * 2.2 : 0) };
    c.ps.push(p); projects.push(p);
  }
});
const events = EV.map((e, k) => {
  const c = byId[e.c], p = c.ps[0], ev = { ...e, k, c, name: TY[e.ty][0], col: TY[e.ty][1] };
  if (e.km != null) {
    const d = e.km / 111, a = e.brg * Math.PI / 180;
    ev.lat = p.lat + d * Math.cos(a); ev.lng = p.lng + d * Math.sin(a) / Math.cos(p.lat * Math.PI / 180); ev.p = p; p.evs.push(ev);
  } else { ev.lat = c.lat + 1.2; ev.lng = c.lng + 1.2; }
  c.evs.push(ev); return ev;
});
projects.forEach((p) => p.evs.sort((a, b) => a.km - b.km));
const why = (p) => p.evs.length ? `${p.evs[0].name}, 사업지 ${p.evs[0].km}km (${p.evs[0].ago})` : "";
// 정렬: 등급 → 새 사건이 있는 곳 먼저 → 사업 수
countries.sort((a, b) => ORD[a.lv] - ORD[b.lv] || b.evs.length - a.evs.length || b.n - a.n);
const hot = projects.filter((p) => p.lv != "green").sort((a, b) => ORD[a.lv] - ORD[b.lv] || b.evs.length - a.evs.length || (a.evs[0]?.h ?? 1e9) - (b.evs[0]?.h ?? 1e9));
const cnt = (lv) => countries.filter((c) => c.lv == lv);
const sum = (cs) => cs.reduce((s, c) => s + c.n, 0);

/* ---------- 업체 리스크 ---------- */
function renderCo() {
  const dots = [[212, 150], [258, 132], [300, 168], [330, 205], [342, 250], [320, 292], [282, 322], [236, 330], [196, 304], [170, 262], [176, 214], [352, 178]];
  const rl = [["red", "도레온건설", "본구매 · 탄자니아 국가공간정보", "조달청 입찰참가자격 제한 6개월 (현재 유효)"], ["red", "청누리시스템", "본구매 · 케냐 스마트시티", "EDCF 부정당업자 등록 · 제재기간 중"], ["red", "한올터이앤씨", "컨설턴트 · 베트남 상수도", "조달청 입찰참가자격 제한 3개월 (현재 유효)"],
    ["orange", "별하솔정보통신", "본구매 · 몽골 교통관제", "공정위 입찰 담합 과징금 부과 · 처분 예고"], ["orange", "온새미정보통신", "F/S · 방글라데시 행정정보망", "전 임원 뇌물 공여 혐의 기소"]];
  const pj = [["탄자니아 국가공간정보 기반 구축사업", "탄자니아", [1, 1, 5], `<span class="role">본구매</span><span class="nm red">도레온건설</span><span class="nm orange">솔마루설계</span>정상 5`],
    ["케냐 나이로비 스마트시티 구축사업", "케냐", [1, 0, 6], `<span class="role">본구매</span><span class="nm red">청누리시스템</span>정상 3 <span class="role">컨설턴트</span>정상 3`],
    ["베트남 메콩델타 상수도 확충사업", "베트남", [1, 0, 4], `<span class="role">컨설턴트</span><span class="nm red">한올터이앤씨</span>정상 4`],
    ["몽골 울란바토르 교통관제센터 확충사업", "몽골", [0, 1, 7], `<span class="role">본구매</span><span class="nm orange">별하솔정보통신</span>정상 4 <span class="role">F/S</span>정상 3`]];
  const iss = [["red", "도레온건설", 1, "계약 이행 부실로 입찰참가자격 제한 6개월 (현재 유효)", "본구매 · 탄자니아 국가공간정보 기반 구축사업", "조달청 나라장터", "13시간 전"],
    ["orange", "별하솔정보통신", 0, "공공 통신망 입찰 담합으로 과징금 부과, 입찰제한 처분 예고", "본구매 · 몽골 울란바토르 교통관제센터 확충사업", "연합뉴스", "2일 전"],
    ["orange", "온새미정보통신", 0, "해외 사업 수주 과정의 뇌물 공여 혐의로 전 임원 기소", "F/S · 방글라데시 다카 행정정보망 고도화사업", "한국경제", "3일 전"],
    ["orange", "솔마루설계", 0, "법원에 기업회생절차 개시 신청", "본구매 · 탄자니아 국가공간정보 기반 구축사업", "매일경제", "5일 전"]];
  $("#co").innerHTML = `
  <div class="head"><div><div class="kick">RISK BRIEFING · 2026.11.24 (화)</div><h1>오늘의 <em>EDCF 업체 리스크</em></h1><div class="last">마지막 스캔 11/24 10:30</div></div><span class="sp"></span>
    <div class="scope"><button>정보통신팀 사업 · 업체 65</button><button class="on">EDCF 전체 · 업체 308</button></div><button class="btn">보고서</button><button class="btn pri">지금 스캔</button></div>
  <div class="tiles">
    <button class="card tile red"><div class="lb">경고</div><div class="n"><b>3</b><span>업체</span><i>어제보다 +1</i></div><div class="sub">도레온건설 · 청누리시스템 · 한올터이앤씨</div></button>
    <button class="card tile orange"><div class="lb">주의</div><div class="n"><b>12</b><span>업체</span></div><div class="sub">별하솔정보통신 · 온새미정보통신 외 10</div></button>
    <button class="card tile green"><div class="lb">정상</div><div class="n"><b>293</b><span>업체</span></div><div class="sub">참고 이력만 있는 업체 41 포함</div></button>
    <div class="card tile plain"><div class="lb">공식 제재 명단 · 제재 중</div><div class="row" style="margin-top:6px">EDCF (EXIMIIS)<b class="r">1</b></div><div class="row">조달청 나라장터<b class="r">2</b></div><div class="row">MDB 5곳<b>0</b></div></div>
    <div class="card tile plain"><div class="lb">최근 7일 새 이슈</div><div class="spark"><div class="nn"><b style="color:var(--red)">4</b><span>경고</span><b style="color:var(--orange)">9</b><span>주의</span></div>
      <svg viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M0 52 C30 50 40 44 66 46 S100 30 130 38 S170 12 200 8 V60 H0Z" fill="rgba(255,159,28,.16)"/><path d="M0 52 C30 50 40 44 66 46 S100 30 130 38 S170 12 200 8" fill="none" stroke="#FF9F1C" stroke-width="2"/><path d="M0 56 C40 55 60 52 90 54 S150 46 200 40" fill="none" stroke="#FF5A5F" stroke-width="2"/></svg></div></div>
  </div>
  <div class="mid">
    <section class="card"><div class="ph"><h2>리스크 레이더</h2><span class="cnt">경고 3 · 주의 12</span></div>
      <div class="rad"><svg viewBox="0 0 500 430">
        <defs><radialGradient id="rg"><stop offset="0" stop-color="#22305A"/><stop offset="1" stop-color="#141B2F"/></radialGradient></defs>
        <circle cx="250" cy="215" r="196" fill="none" stroke="#7C83FF" stroke-opacity=".3" stroke-dasharray="3 6"/>
        <circle cx="250" cy="215" r="180" fill="url(#rg)" stroke="#22D3EE" stroke-opacity=".5"/>
        <circle cx="250" cy="215" r="125" fill="rgba(255,159,28,.07)" stroke="#FF9F1C" stroke-opacity=".5"/>
        <circle cx="250" cy="215" r="64" fill="rgba(255,90,95,.14)" stroke="#FF5A5F" stroke-opacity=".6"/>
        <path d="M70 215H430M250 35V395" stroke="#7C83FF" stroke-opacity=".18"/>
        <g class="sweep"><path d="M250 215 L250 35 A180 180 0 0 1 340 59 Z" fill="rgba(124,131,255,.22)"/><path d="M250 215 L340 59" stroke="#fff" stroke-width="2"/></g>
        ${dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#FF9F1C" stroke="#141B2F" stroke-width="2"/>`).join("")}
        ${[[222, 196, 78, 205, "도레온건설"], [286, 196, 430, 180, "청누리시스템"], [247, 246, 430, 250, "한올터이앤씨"]].map(([x, y, lx, ly, n]) => `<line x1="${x}" y1="${y}" x2="${lx}" y2="${ly}" stroke="#FF5A5F" stroke-opacity=".6"/><circle cx="${x}" cy="${y}" r="8" fill="#FF5A5F"/><circle cx="${x}" cy="${y}" r="13" fill="none" stroke="#FF5A5F" stroke-dasharray="3 3"/>
          <g transform="translate(${lx},${ly})"><rect x="${lx < 250 ? -74 : -4}" y="-12" width="80" height="24" rx="6" fill="#141B2F" stroke="#FF5A5F"/><text x="${lx < 250 ? -34 : 36}" y="4" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">${n}</text></g>`).join("")}
        <text x="250" y="52" text-anchor="middle" fill="#2DD4BF" font-size="11" font-weight="700">정상</text><text x="250" y="106" text-anchor="middle" fill="#FF9F1C" font-size="11" font-weight="700">주의</text><text x="250" y="166" text-anchor="middle" fill="#FF5A5F" font-size="11" font-weight="700">경고</text>
      </svg>
      <div class="rl">${rl.map(([lv, n, m, s]) => `<div class="it">${badge(lv)}<b>${n}</b><span class="m">${m}</span><span class="s">${s}</span></div>`).join("")}<button class="more">주의 10곳 더 보기</button></div></div></section>
    <section class="card"><div class="ph"><h2>사업별 현황</h2><span class="cnt">186</span><div class="seg"><button class="on">경고·주의 사업<b>14</b></button><button>전체</button></div></div>
      <div class="pjs">${pj.map(([n, c, [r, o, g], rs]) => `<div class="pj"><div class="t">${n}<span>${c}</span></div><div class="pb">${r ? `<i style="flex:${r};background:var(--red)"></i>` : ""}${o ? `<i style="flex:${o};background:var(--orange)"></i>` : ""}<i style="flex:${g};background:var(--green);opacity:.75"></i></div><div class="rs">${rs}</div></div>`).join("")}</div></section>
  </div>
  <section class="card"><div class="ph"><h2>확인이 필요한 이슈</h2><span class="cnt">7</span><div class="seg"><button>전체<b>23</b></button><button>24시간<b>2</b></button><button class="on">최근 7일<b>7</b></button><button>최근 30일<b>15</b></button></div></div>
    <div class="tb"><div class="tr h"><span>등급</span><span>업체</span><span>내용</span><span>관련 사업</span><span>출처</span><span>시각</span><span></span></div>
    ${iss.map(([lv, n, nw, t, p, s, a]) => `<div class="tr"><span>${badge(lv)}</span><b>${n}${nw ? `<i class="new">NEW</i>` : ""}</b><b>${t}</b><span>${p}</span><span>${s}</span><span>${a}</span><span class="acts"><button>✓ 관련 있음</button><button>✕ 관련 없음</button></span></div>`).join("")}</div></section>`;
}

/* ---------- 수원국 리스크 ---------- */
const ui = { mode: "c", open: null, sel: null };
function renderGeo() {
  const tile = (lv) => { const cs = cnt(lv); return `<button class="card tile ${lv}" data-lv="${lv}"><div class="lb">${LV[lv]}</div><div class="n"><b>${cs.length}</b><span>개국</span><i ${lv == "green" ? "hidden" : ""}>사업 ${sum(cs)}</i></div><div class="sub">${lv == "green" ? `사업 ${sum(cs)} · ` : ""}${cs.slice(0, 3).map((c) => c.ko).join(" · ")} 외 ${cs.length - 3}</div></button>`; };
  const tc = Object.keys(TY).map((k) => [TY[k], events.filter((e) => e.ty == k).length]).sort((a, b) => b[1] - a[1]);
  $("#geo").innerHTML = `
  <div class="head"><div><div class="kick">COUNTRY RISK · 2026.11.24 (화)</div><h1>오늘의 <em>EDCF 수원국 리스크</em></h1><div class="last">마지막 갱신 11/24 13:30</div></div><span class="sp"></span>
    <div class="scope"><button>정보통신팀 사업 · 사업 20</button><button class="on">EDCF 전체 · 사업 ${projects.length}</button></div><button class="btn pri" style="background:var(--grad-geo)">지금 스캔</button></div>
  <div class="tiles">${tile("red")}${tile("orange")}${tile("green")}
    <div class="card tile plain"><div class="lb">여행경보 · 사업지 기준</div><div class="row" style="margin-top:6px"><span class="al a34">3·4단계</span>출국권고 · 여행금지<b class="r">31</b></div><div class="row"><span class="al a2">2단계</span>여행자제<b class="o">58</b></div><div class="row"><span class="al a1">1단계</span>여행유의 · 없음<b>97</b></div></div>
    <div class="card tile plain"><div class="lb">최근 7일 이벤트</div><div class="n"><b>${events.length}</b><span>건</span></div><div class="bar">${tc.map(([t, n]) => `<i style="flex:${n};background:${t[1]}"></i>`).join("")}</div><div class="lg">${tc.map(([t, n]) => `<span><i class="sq" style="background:${t[1]}"></i>${t[0]} ${n}</span>`).join("")}</div></div>
  </div>
  <div class="mid">
    <section class="card"><div class="ph"><h2>사업지 지도</h2><span class="cnt" id="mapCnt"></span></div>
      <div class="map" id="map"><svg><g id="land"></g><g id="fx"></g></svg><div id="ov"></div><span class="mchip" id="mchip"></span><button class="mall" id="mall" hidden>‹ 전체 지도</button>
        <div class="mlg"><span><i class="dot" style="background:var(--red)"></i>경고</span><span><i class="dot" style="background:var(--orange)"></i>주의</span><span><i class="dot" style="background:var(--green)"></i>정상</span><span><i class="sq" style="background:#A78BFA"></i>이벤트</span></div></div></section>
    <section class="card"><div class="ph"><h2 id="glH"></h2><span class="cnt" id="glN"></span><div class="seg" id="glMode"><button data-m="c">나라별</button><button data-m="p">사업별</button></div></div><div class="gl" id="gl"></div></section>
  </div>
  <section class="card"><div class="ph"><h2>수원국 최근 이벤트</h2><span class="cnt">${events.length}</span><div class="seg"><button>24시간<b>2</b></button><button class="on">최근 7일<b>${events.length}</b></button><button>최근 30일<b>41</b></button></div></div>
    <div class="tb"><div class="tr h"><span>종류</span><span>수원국</span><span>내용</span><span>영향받는 사업</span><span>출처</span><span>시각</span><span></span></div>
    ${events.slice(0, 8).map((e) => `<div class="tr"><b><i class="sq" style="background:${e.col}"></i>${e.name}</b><span>${e.c.ko}</span><b>${e.title}</b><span>${e.p ? `${e.p.name.replace(e.c.ko + " ", "")} · ${e.km}km` : `나라 단위 · 사업 ${e.c.n}`}</span><span>${e.src}</span><span>${e.ago}</span><span class="acts"><button>✓ 관련 있음</button><button>✕ 관련 없음</button></span></div>`).join("")}</div></section>`;
  $("#geo .tiles").onclick = (ev) => { const b = ev.target.closest("[data-lv]"); if (b) openLevel(b.dataset.lv); };
  $("#glMode").onclick = (ev) => { const b = ev.target.closest("[data-m]"); if (b) { ui.mode = b.dataset.m; renderList(); } };
  $("#mall").onclick = () => select(null);
  renderList(); drawMap();
}
const pCard = (p, k) => `<div class="gp ${ui.sel == p ? "sel" : ""}" data-p="${projects.indexOf(p)}"><div class="t"><span class="no ${p.lv}">${k}</span>${p.name}${badge(p.lv)}</div>
  ${ui.sel == p ? `<div class="kv"><span>사업지</span><div>${p.c.ko} ${p.city}</div><span>여행경보</span><div>${tv(p.c.alert)}</div>${p.evs.length ? `<span>가까운 사건</span><div>${p.evs.map((e) => `<div class="e"><span><i class="sq" style="background:${e.col}"></i>${e.title}</span><b>${e.km}km</b></div>`).join("")}</div>` : ""}<span>참여 업체</span><div>${p.lv == "green" ? "정상 6" : `<b style="color:var(--orange)">주의 1</b> / 7`}</div></div>`
    : `<div class="r">${tv(p.c.alert)}${why(p)}</div>`}</div>`;
function renderList() {
  document.querySelectorAll("#glMode button").forEach((b) => b.classList.toggle("on", b.dataset.m == ui.mode));
  const gl = $("#gl");
  if (ui.mode == "p") {
    $("#glH").textContent = "사업별 현황"; $("#glN").textContent = `경고·주의 ${hot.length}`;
    gl.innerHTML = hot.slice(0, 30).map((p, k) => pCard(p, k + 1)).join("");
  } else {
    const cs = countries.filter((c) => c.lv != "green");
    $("#glH").textContent = "수원국별 현황"; $("#glN").textContent = `경고·주의 ${cs.length}개국`;
    gl.innerHTML = cs.map((c, k) => {
      const withEv = c.ps.filter((p) => p.evs.length), rest = c.n - withEv.length, nat = c.evs.filter((e) => !e.p);
      return `<div class="gp" data-c="${c.id}"><div class="t"><span class="no ${c.lv}">${k + 1}</span>${c.ko}<span class="c2">사업 ${c.n}</span>${badge(c.lv)}</div>
        <div class="r">${tv(c.alert)}${c.evs.length ? `<span class="nw">새 사건 ${c.evs.length}</span>` : ""}${nat.map((e) => e.title.replace(" (예시)", "")).join(" · ")}</div>
        ${ui.open == c.id || withEv.includes(ui.sel) ? `<div class="sub-p">${c.ps.map((p) => `<button data-p="${projects.indexOf(p)}" style="${ui.sel == p ? "background:rgba(45,212,191,.12)" : ""}">${p.name.replace(c.ko + " ", "")}<span>${why(p)}</span></button>`).slice(0, 6).join("")}${c.n > 6 ? `<div class="rest">그 밖 사업 ${c.n - 6}</div>` : ""}</div>`
          : withEv.length ? `<div class="sub-p">${withEv.map((p) => `<button data-p="${projects.indexOf(p)}">${p.name.replace(c.ko + " ", "")}<span>${why(p)}</span></button>`).join("")}${rest ? `<div class="rest">그 밖 사업 ${rest} · 여행경보만 해당</div>` : ""}</div>` : ""}</div>`;
    }).join("");
  }
  gl.onclick = (ev) => {
    const pb = ev.target.closest("[data-p]"), cb = ev.target.closest("[data-c]");
    if (pb) { const p = projects[pb.dataset.p]; select(ui.sel == p ? null : p); }
    else if (cb) { ui.open = ui.open == cb.dataset.c ? null : cb.dataset.c; renderList(); }
  };
}
function select(p) { ui.sel = p; if (p) ui.open = p.c.id; renderList(); drawMap(); const el = $("#gl .sel, #gl [style*='212']"); if (el) el.scrollIntoView({ block: "nearest" }); }

/* 등급을 누르면: 나라로 묶고 그 안에 사업 */
function openLevel(lv) {
  const cs = cnt(lv);
  $("#dw").innerHTML = `<h2>${badge(lv)} 수원국 ${cs.length} <button class="x" id="dwX">×</button></h2><div class="sm">사업 ${sum(cs)}</div>
    ${cs.map((c) => { const withEv = c.ps.filter((p) => p.evs.length), rest = c.ps.filter((p) => !p.evs.length);
      return `<div class="card dc"><div class="t">${c.ko}${tv(c.alert)}<span class="c2">사업 ${c.n}</span></div>
        ${c.evs.length ? `<h4>최근 7일 사건</h4>${c.evs.map((e) => `<div class="ln"><i class="sq" style="background:${e.col}"></i><b>${e.title}</b><span>${e.src} · ${e.ago}</span></div>`).join("")}` : ""}
        ${withEv.length ? `<h4>사건이 가까운 사업</h4>${withEv.map((p) => `<div class="ln"><b>${p.name}</b><span>${p.evs[0].name} ${p.evs[0].km}km</span></div>`).join("")}` : ""}
        ${rest.length ? `<details><summary>${withEv.length ? "그 밖 사업" : "사업"} ${rest.length}</summary>${rest.map((p) => `<div>${p.name}</div>`).join("")}</details>` : ""}</div>`; }).join("")}`;
  $("#dwBg").classList.add("open"); $("#dwX").onclick = closeDw;
}
const closeDw = () => $("#dwBg").classList.remove("open");
$("#dwBg").onclick = (e) => { if (e.target.id == "dwBg") closeDw(); };

/* ---------- 지도 (저장소의 세계 지도 파일을 직접 그림) ---------- */
let topo = null;
function landPaths() {
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
  const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * sx + tx, -((y += dy) * sy + ty)]); });
  // 날짜변경선을 넘는 땅(피지·러시아 동쪽)은 경도를 이어 붙임
  const ring = (r, wrap) => "M" + r.flatMap((i, k) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return (k ? a.slice(1) : a).map((p) => (wrap && p[0] < 0 ? p[0] + 360 : p[0]).toFixed(2) + " " + p[1].toFixed(2)); }).join("L") + "Z";
  const lvOf = Object.fromEntries(countries.map((c) => [c.num, c.lv]));
  return topo.objects.countries.geometries.filter((g) => +g.id != 10 && g.arcs).map((g) => {
    const polys = g.type == "Polygon" ? [g.arcs] : g.arcs, lv = lvOf[+g.id];
    return `<path class="${lv && lv != "green" ? lv : ""}" d="${polys.map((p) => p.map((r) => ring(r, +g.id == 242 || +g.id == 643)).join("")).join("")}"/>`;
  }).join("");
}
function drawMap() {
  const box = $("#map"); if (!box || !topo || $("#geo").hidden) return;
  if (!$("#land").innerHTML) $("#land").innerHTML = landPaths();
  const W = box.clientWidth, H = box.clientHeight, p = ui.sel;
  const v = p ? { lng: p.lng, lat: p.lat, span: 13 } : { lng: 62, lat: 14, span: 96 };
  const k = H / v.span, X = (lng) => (lng - v.lng) * k + W / 2, Y = (lat) => (v.lat - lat) * k + H / 2;
  const tf = `translate(${W / 2},${H / 2}) scale(${k}) translate(${-v.lng},${v.lat})`;
  $("#land").setAttribute("transform", tf); $("#fx").setAttribute("transform", tf);
  const at = (lng, lat, html) => `<div style="left:${X(lng)}px;top:${Y(lat)}px" ${html}</div>`;
  let ov = "", fx = "";
  if (!p) {
    ov += countries.map((c) => at(c.lng, c.lat - 3.4, `class="cl">${c.en}`)).join("");
    ov += events.map((e) => at(e.lng, e.lat, `class="ev" style="background:${e.col}" title="${e.title}">`)).join("");
    ov += countries.slice().reverse().map((c) => at(c.lng, c.lat, `class="pin ${c.lv}" data-c="${c.id}" title="${c.ko} · 사업 ${c.n}">${c.n}`)).join("");
    $("#mchip").textContent = `사업 ${projects.length} · 이벤트 ${events.length}`; $("#mapCnt").textContent = `사업 ${projects.length}`;
  } else {
    const cy = -p.lat, near = events.filter((e) => e.p == p || (e.c == p.c && e.p));
    fx = [5, 4, 3, 2, 1].map((n) => `<circle class="ring ${n == 5 ? "ring0" : ""}" cx="${p.lng}" cy="${cy}" r="${n * 100 / 111}"/>`).join("")
      + `<path class="cross" d="M${p.lng - 4.7} ${cy}H${p.lng + 4.7}M${p.lng} ${cy - 4.7}V${cy + 4.7}"/>`
      + `<g style="transform-origin:${p.lng}px ${cy}px" class="wedge"><path d="M${p.lng} ${cy}L${p.lng} ${cy - 4.5}A4.5 4.5 0 0 1 ${p.lng + 2.6} ${cy - 3.67}Z"/></g>`
      + near.map((e) => `<line class="dl" x1="${p.lng}" y1="${cy}" x2="${e.lng}" y2="${-e.lat}"/>`).join("");
    ov += [1, 2, 3, 4, 5].map((n) => at(p.lng + .25, p.lat + n * 100 / 111 - .2, `class="rk">${n}00km`)).join("");
    ov += p.c.ps.filter((q) => q != p).map((q) => at(q.lng, q.lat, `class="pin site ${q.lv}" style="width:11px;height:11px;opacity:.8" title="${q.name}">`)).join("");
    ov += near.map((e) => at(e.lng, e.lat, `class="evl ${e.lng < p.lng ? "w" : ""}"><i class="sq" style="background:${e.col}"></i>${e.tag || e.name.split("·")[0]} · ${e.km}km`)).join("");
    ov += at(p.lng, p.lat, `class="pin site ${p.lv}">`) + at(p.lng, p.lat, `class="sl" style="border-color:var(--${p.lv})">${p.name.replace(p.c.ko + " ", "").replace(/ (구축|확충|건립|건설|개선)?사업$/, "")}`);
    $("#mchip").textContent = `${p.c.ko} ${p.city} · 600km 안 이벤트 ${near.length}`; $("#mapCnt").textContent = p.name;
  }
  $("#fx").innerHTML = fx; $("#ov").innerHTML = ov; $("#mall").hidden = !p;
  $("#ov").onclick = (ev) => { const c = ev.target.closest("[data-c]"); if (c) { ui.mode = "c"; ui.open = c.dataset.c; renderList(); $(`#gl [data-c="${c.dataset.c}"]`)?.scrollIntoView({ block: "nearest" }); } };
}

/* ---------- 시작 ---------- */
function show(v) {
  $("#co").hidden = v != "co"; $("#geo").hidden = v != "geo";
  document.querySelectorAll("#sw button").forEach((b) => b.classList.toggle("on", b.dataset.v == v));
  if (v == "geo") drawMap();
  history.replaceState(null, "", v == "geo" ? "#country" : "#company");
}
renderCo(); renderGeo();
$("#sw").onclick = (ev) => { const b = ev.target.closest("[data-v]"); if (b) show(b.dataset.v); };
show(location.hash == "#country" ? "geo" : "co");
addEventListener("resize", drawMap);
fetch("../assets/world-50m.json").then((r) => r.json()).then((t) => { topo = t; drawMap(); });
