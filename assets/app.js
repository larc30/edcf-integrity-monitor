// EDCF 부정당업자 모니터링 — GitHub Pages + Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ALLOWED_EMAILS, GITHUB_REPO } from "./firebase-config.js?v=11";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const ACTIONS_URL = `https://github.com/${GITHUB_REPO}/actions/workflows/monitor.yml`;
const SECRETS_URL = `https://github.com/${GITHUB_REPO}/settings/secrets/actions`;

// ---------- 공통 ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LEVEL = { red: "위험", orange: "경고", yellow: "주의", none: "정상" };
const LEVEL_DESC = { red: "제재·영업정지 등 직접 장애", orange: "최근 수사·담합·처분", yellow: "과거 이력·의혹", none: "발견된 이슈 없음" };
const LV = { red: 3, orange: 2, yellow: 1, none: 0 };
const ROLE_CLS = { 컨설턴트: "consult", 본구매: "buy", "F/S": "fs" };
const ROLE_ORDER = ["F/S", "컨설턴트", "본구매"];
const COUNTRY = { TZ: "탄자니아", PK: "파키스탄", KE: "케냐", MN: "몽골", LA: "라오스", ID: "인도네시아", KR: "한국", VN: "베트남", KH: "캄보디아", BD: "방글라데시", PH: "필리핀", UZ: "우즈베키스탄", ET: "에티오피아", GH: "가나", MM: "미얀마", LK: "스리랑카", NP: "네팔", RW: "르완다", UG: "우간다", TN: "튀니지", EG: "이집트", BO: "볼리비아", PY: "파라과이", CO: "콜롬비아", PE: "페루", EC: "에콰도르", GT: "과테말라", SN: "세네갈", MZ: "모잠비크", CM: "카메룬", NG: "나이지리아", TR: "튀르키예", UA: "우크라이나", GE: "조지아", AZ: "아제르바이잔", KZ: "카자흐스탄", KG: "키르기스스탄", TJ: "타지키스탄", TL: "동티모르" };
const COUNTRY_BY_NAME = { ...Object.fromEntries(Object.entries(COUNTRY).map(([k, v]) => [v, k])), 카라치: "PK", 이슬라마바드: "PK", 나이로비: "KE", 다르에스살람: "TZ", 울란바토르: "MN", 비엔티안: "LA", 자카르타: "ID", 하노이: "VN", 프놈펜: "KH", 다카: "BD", 마닐라: "PH", 타슈켄트: "UZ" };
const badge = (lv) => `<span class="badge ${lv || "none"}">${LEVEL[lv || "none"]}</span>`;
const roleTag = (r) => `<span class="role ${ROLE_CLS[r] || "fs"}">${esc(r)}</span>`;
const stageTag = (e) => e.stage && e.stage !== "계약" ? `<span class="stage">${esc(e.stage)}${e.rank ? " " + e.rank + "순위" : ""}</span>` : "";
const state = { projects: [], companies: [], findings: [], keywords: [], recipients: [], status: {}, runs: [], edcf: [], mdbKorea: null, loadedAt: 0 };
const me = () => auth.currentUser?.email || "";
const isMine = (p) => !p.owner || p.owner === me();

function toast(msg, ms = 2800) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
}
function modal(html) { $("#modal").innerHTML = html + `<div class="actions"><button class="btn" id="modalClose">닫기</button></div>`; $("#modalBg").classList.add("open"); $("#modalClose").onclick = closeModal; }
function closeModal() { $("#modalBg").classList.remove("open"); }
$("#modalBg").addEventListener("click", (e) => { if (e.target.id === "modalBg") closeModal(); });
const projName = (pid) => state.projects.find((p) => p.id === pid)?.name || "(삭제된 사업)";
const engText = (e) => `${esc(projName(e.project_id))} · ${esc(e.role)}${e.stage && e.stage !== "계약" ? ` · ${esc(e.stage)}${e.rank ? " " + e.rank + "순위" : ""}` : ""}`;
const nowStr = () => new Date(Date.now() + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 19); // KST
const guessCountry = (t) => Object.entries(COUNTRY_BY_NAME).find(([n]) => t.includes(n))?.[1] || null;
const scanned = () => !!state.status.last_scan_at;

// ---------- 로그인 ----------
$("#btnLogin").onclick = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { $("#loginMsg").textContent = "로그인 실패: " + e.message; }
};
const doLogout = () => signOut(auth);
$("#btnLogout").onclick = doLogout; $("#btnLogout2").onclick = doLogout;

onAuthStateChanged(auth, async (user) => {
  const showLogin = (msg, denied) => {
    $("#appView").classList.add("hidden"); $("#loginView").classList.remove("hidden");
    $("#loginMsg").innerHTML = msg;
    $("#btnLogin").classList.toggle("hidden", denied); $("#btnLogout2").classList.toggle("hidden", !denied);
  };
  if (!user) return showLogin("허용된 Google 계정으로 로그인하세요.", false);
  if (!ALLOWED_EMAILS.includes(user.email)) return showLogin(`<b>${esc(user.email)}</b> 계정은 접근 권한이 없습니다.<br>관리자에게 허용 목록 추가를 요청하세요.`, true);
  $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
  $("#userEmail").textContent = user.email;
  $("#lnkActions").href = ACTIONS_URL; $("#lnkSecrets").href = SECRETS_URL;
  try {
    await loadAll();
  } catch (e) {
    console.error(e);
    showGuide(`<b>Firebase에서 데이터를 읽지 못했습니다</b> (${esc(e.code || e.message)})<br>Firebase 콘솔 → Firestore Database → 규칙 탭에 <code>firestore.rules</code> 내용을 붙여넣고 [게시]했는지 확인하세요.`);
    return;
  }
  let v = "home"; try { v = localStorage.getItem("view3") || v; } catch {}
  showView(v);
});

// ---------- 데이터 ----------
const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
async function loadAll() {
  const [p, c, f, k, r, st, runs, cfg, ed, mk] = await Promise.all([
    getDocs(collection(db, "projects")),
    getDocs(collection(db, "companies")),
    getDocs(query(collection(db, "findings"), where("relevant", "==", true))),
    getDocs(collection(db, "keywords")),
    getDocs(collection(db, "recipients")),
    getDoc(doc(db, "meta", "status")),
    getDocs(query(collection(db, "runs"), orderBy("at_ms", "desc"), limit(10))),
    getDoc(doc(db, "meta", "settings")),
    getDocs(collection(db, "edcf_sanctions")),
    getDoc(doc(db, "meta", "mdb_korea")),
  ]);
  state.projects = docs(p).sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || a.name.localeCompare(b.name));
  state.companies = docs(c);
  state.findings = docs(f);
  state.keywords = docs(k);
  state.recipients = docs(r);
  state.status = st.exists() ? st.data() : {};
  state.runs = docs(runs);
  state.settings = cfg.exists() ? cfg.data() : {};
  state.edcf = docs(ed);
  state.mdbKorea = mk.exists() ? mk.data() : null;
  state.loadedAt = Date.now();
  if (!state.keywords.length || (state.settings?.keywords_version || 1) < KEYWORDS_VERSION) await loadDefaultKeywords();
  compute();
}
function compute() {
  for (const c of state.companies) {
    c.engagements = c.engagements || [];
    c.focus = c.engagements.length > 0 || !!c.watch;
    c.mine = !!c.watch || c.engagements.some((e) => { const p = state.projects.find((x) => x.id === e.project_id); return p && isMine(p); });
    const fs = state.findings.filter((f) => f.company_id === c.id && f.status !== "dismissed");
    c.risk = fs.reduce((m, f) => (LV[f.level] || 0) > (LV[m] || 0) ? f.level : m, "none");
    c.open = fs.filter((f) => f.status === "new").length;
    c.total = fs.length;
  }
}
const byLevelDate = (a, b) => (LV[b.level] - LV[a.level]) || String(b.published_at || "").localeCompare(String(a.published_at || ""));
const worstOf = (cs) => cs.reduce((m, c) => LV[c.risk] > LV[m] ? c.risk : m, "none");

// ---------- 화면 전환 ----------
$$("#tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
function showView(v) {
  if (!$(`#view-${v}`)) v = "home";
  $$("#tabs button").forEach((x) => x.classList.toggle("active", x.dataset.view === v));
  $$(".view").forEach((x) => x.classList.toggle("active", x.id === `view-${v}`));
  try { localStorage.setItem("view3", v); } catch {}
  $("#tabCnt").textContent = state.companies.length;
  v === "home" ? renderHome() : v === "companies" ? renderCompanies() : renderSettings();
}
const rerender = () => { compute(); showView($("#tabs button.active")?.dataset.view || "home"); if (state.openCid && $("#drawer").classList.contains("open")) openCompany(state.openCid); };
// 자동 새로고침: 창으로 돌아올 때(1분 이상 지났으면)와 5분마다. 끌기·입력 중에는 건너뜀
async function autoRefresh(minAge) {
  if (!auth.currentUser || $("#appView").classList.contains("hidden")) return;
  if (Date.now() - state.loadedAt < minAge || document.body.classList.contains("dnd-active") || $("#modalBg").classList.contains("open")) return;
  const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  try { await loadAll(); rerender(); } catch (e) { console.warn("auto refresh", e); }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") autoRefresh(60e3); });
setInterval(() => { if (document.visibilityState === "visible") autoRefresh(5 * 60e3); }, 60e3);
function showGuide(html) { const g = $("#guide"); g.innerHTML = html; g.classList.toggle("hidden", !html); }

// 테마 (다크 기본 / 라이트)
function applyThemeLabel() { $("#btnTheme").textContent = document.documentElement.dataset.theme === "dark" ? "라이트" : "다크"; }
$("#btnTheme").onclick = () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("edcf_theme2", t); } catch {}
  applyThemeLabel();
};
applyThemeLabel();

// 숫자 카운트업
function countUp(root) {
  $$("[data-count]", root).forEach((el) => {
    const to = +el.dataset.count, t0 = performance.now(), dur = 900;
    if (!to) { el.textContent = "0"; return; }
    const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
const DAY = 86400e3;
const relTime = (ms) => { const m = Math.round((Date.now() - ms) / 60e3); return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`; };
const weekday = ["일", "월", "화", "수", "목", "금", "토"];

// ---------- 기간 ----------
const PERIODS = [["today", "오늘·어제"], ["7d", "7일"], ["30d", "30일"], ["all", "전체"], ["old", "과거 이력"]];
const pubMs = (f) => { const d = f.published_at ? Date.parse(String(f.published_at).slice(0, 10) + "T00:00:00+09:00") : NaN; return Number.isFinite(d) ? d : (f.first_seen_ms || Date.now()); };
function inPeriod(f, p) {
  const age = Date.now() - pubMs(f), official = f.source_type !== "news";
  if (p === "all") return true;
  if (p === "old") return !official && age > 365 * DAY;
  if (official) return true; // 공식 제재·수기 기록은 기간과 무관하게 항상 표시
  return age <= { today: 2 * DAY, "7d": 7 * DAY, "30d": 30 * DAY }[p];
}
let period = null;
try { period = localStorage.getItem("edcf_period"); } catch {}
// 보기 범위: 진행중 사업 업체(내가 담당하는 사업에 연결된 업체 + 집중 감시) / EDCF 주요 업체(전체 명단)
let scope = null;
try { scope = localStorage.getItem("edcf_scope2"); } catch {}
function scopeCompanies() {
  const mine = state.companies.filter((c) => c.mine);
  if (!scope) scope = mine.length ? "mine" : "all";
  return scope === "mine" ? mine : state.companies;
}
const scopeProjects = () => scope === "mine" ? state.projects.filter(isMine) : state.projects;

// ---------- 대시보드 ----------
function renderHome() {
  const cs = scopeCompanies(), s = state.status, sc = scanned();
  const ids = new Set(cs.map((c) => c.id));
  const mineN = state.companies.filter((c) => c.mine).length;
  $("#scopeSeg").innerHTML = state.companies.length
    ? [["mine", "진행중 사업 업체", mineN], ["all", "EDCF 주요 업체", state.companies.length]].map(([k, l, n]) => `<button data-s="${k}" class="${k === scope ? "active" : ""}" title="${k === "mine" ? "내가 담당하는 사업에 연결된 업체와 집중 감시 업체" : "명단에 등록된 전체 업체"}">${l} <span class="n">${n}</span></button>`).join("") : "";
  $$("#scopeSeg button").forEach((b) => b.onclick = () => { scope = b.dataset.s; try { localStorage.setItem("edcf_scope2", scope); } catch {} renderHome(); });
  const now = new Date(Date.now() + 9 * 3600e3);
  $("#sumSub").textContent = `${now.toISOString().slice(0, 10).replace(/-/g, ".")} (${weekday[now.getUTCDay()]}) · ` + (sc
    ? `마지막 스캔 ${s.last_scan_at.slice(5, 16)}${s.last_scan_seconds ? ` (${Math.round(s.last_scan_seconds)}초)` : ""} · 판정 ${s.analyzer === "claude" ? "AI" : "키워드 규칙"}`
    : "아직 스캔하지 않았습니다");

  if (!state.companies.length) showGuide(`<b>시작하기</b><ol><li><b>업체·사업</b> 탭에서 사업과 업체를 추가하세요.</li><li>여기로 돌아와 <b>지금 스캔</b>을 누르세요.</li></ol>`);
  else if (scope === "mine" && !cs.length) showGuide(`내가 담당하는 사업에 연결된 업체가 없습니다. <b>업체·사업</b> 탭에서 업체를 사업 카드로 끌어다 놓으세요.`);
  else if (!sc) showGuide(`업체 ${cs.length}개가 등록됐습니다. <b>지금 스캔</b>을 눌러 첫 스캔을 실행하세요.`);
  else showGuide("");

  const open = state.findings.filter((f) => f.status === "new" && ids.has(f.company_id));

  // KPI 보드: 전체 → 위험/경고/주의 → 확인할 이슈
  const cnt = (lv) => cs.filter((c) => c.risk === lv).length;
  const n = { red: cnt("red"), orange: cnt("orange"), yellow: cnt("yellow"), none: cnt("none") };
  const pct = (v) => cs.length ? (v / cs.length) * 100 : 0;
  $("#kboard").innerHTML = `
    <div class="kb">
      <div class="label">${scope === "mine" ? "진행중 사업 업체" : "EDCF 주요 업체"}</div>
      <div class="value" data-count="${cs.length}">0</div>
      <div class="hint">${scopeProjects().length}개 사업${sc ? ` · 정상 ${n.none}` : " · 스캔 전"}</div>
    </div>
    <div class="kb kb-risks">
      <div class="kb-risks-head"><span>리스크 업체</span><span>${sc ? `총 ${n.red + n.orange + n.yellow}곳` : "스캔 전"}</span></div>
      <div class="kb-cells">
        ${["red", "orange", "yellow"].map((lv) => `<div class="kb-cell ${lv}">
          <div class="lv"><span class="dot"></span>${LEVEL[lv]}</div>
          <div class="value" ${sc ? `data-count="${n[lv]}"` : ""}>${sc ? 0 : "-"}</div>
          <div class="hint">${LEVEL_DESC[lv]}</div></div>`).join("")}
      </div>
      <div class="kb-bar" title="업체 중 등급별 비율">${sc ? ["red", "orange", "yellow", "none"].map((lv) => `<i class="${lv}" style="width:0" data-w="${pct(n[lv])}"></i>`).join("") : ""}</div>
    </div>
    <div class="kb kb-note">
      <div class="label">확인할 이슈</div>
      <div class="value"><span data-count="${open.length}">0</span><span class="hint" style="font-size:13px;font-weight:500"> 건</span></div>
      <div class="hint">'확인했음 / 관련 없음' 처리 전</div>
    </div>`;
  countUp($("#kboard"));
  requestAnimationFrame(() => $$("#kboard .kb-bar i").forEach((i) => (i.style.width = i.dataset.w + "%")));

  // 검사 범위
  const cv = coverage(cs);
  const cvItem = (label, k, total, note) => {
    const st = !total ? "na" : k === total ? "ok" : k === 0 ? "bad" : "warn";
    return `<span class="cv ${st}"><b>${label}</b> ${total ? `${k}/${total}` : "-"}${note ? ` <span class="muted">${note}</span>` : ""}</span>`;
  };
  const gapCount = cs.filter((c) => c.last_check && checkGaps(c).length).length;
  $("#coverage").innerHTML = !cv.scanned ? "" : `<span class="cv-title">검사 범위</span>
    ${cvItem("뉴스", cv.news, cv.scanned)}
    ${cvItem("MDB 제재", cv.mdb, cv.scanned, cv.mdb < cv.scanned ? "(영문명 필요)" : "")}
    ${cv.ppsConnected ? cvItem("조달청 제재", cv.pps, cv.ppsTotal, cv.pps < cv.ppsTotal ? "(사업자번호 필요)" : "") : `<span class="cv na"><b>조달청 제재</b> 미연결</span>`}
    ${state.edcf.length ? `<span class="cv ok"><b>EDCF 명단</b> ${state.edcf.length}건 대조</span>` : `<span class="cv warn"><b>EDCF 명단</b> 미등록</span>`}
    ${gapCount ? `<button class="btn sm" id="btnGaps">보완할 업체 ${gapCount}곳</button>` : ""}`;
  $("#btnGaps")?.addEventListener("click", showGaps);

  // 이슈 + 기간 선택
  const counts = Object.fromEntries(PERIODS.map(([k]) => [k, open.filter((f) => inPeriod(f, k)).length]));
  if (!period || !counts.hasOwnProperty(period)) period = counts.today ? "today" : "7d";
  $("#periodSeg").innerHTML = PERIODS.map(([k, label]) => `<button data-p="${k}" class="${k === period ? "active" : ""}">${label} <span class="n">${counts[k]}</span></button>`).join("");
  $$("#periodSeg button").forEach((b) => b.onclick = () => { period = b.dataset.p; try { localStorage.setItem("edcf_period", period); } catch {} renderHome(); });
  const shown = open.filter((f) => inPeriod(f, period)).sort((a, b) => (LV[b.level] - LV[a.level]) || pubMs(b) - pubMs(a));
  $("#issueCount").textContent = open.length;
  if (shown.length) renderFeed(shown, $("#feed"));
  else $("#feed").innerHTML = !sc ? `<div class="empty">스캔 후 이곳에 이슈가 출처와 함께 표시됩니다.</div>`
    : open.length ? `<div class="ok-box">${PERIODS.find((p) => p[0] === period)[1]} 기간에는 확인할 이슈가 없습니다 <span class="muted small">(다른 기간 ${open.length}건)</span></div>`
    : `<div class="ok-box">확인이 필요한 이슈가 없습니다</div>`;
  const done = state.findings.filter((f) => f.status === "reviewed" && ids.has(f.company_id)).sort(byLevelDate);
  $("#doneWrap").classList.toggle("hidden", !done.length);
  if (done.length) renderFeed(done, $("#feedDone"));

  // 진행중 사업 (사이드바 위쪽 — 놓치지 않도록)
  const ps = scopeProjects();
  $("#projectMap").innerHTML = ps.map((p, i) => projectBox(p, false, i)).join("") || `<div class="muted small">${scope === "mine" ? "내가 담당하는 사업이 없습니다." : "등록된 사업이 없습니다."}</div>`;
  bindProjectBoxes($("#projectMap"));

  // 등급별 업체
  const groupHtml = (lv, list) => {
    if (lv === "none" || lv === "pending") {
      return `<div class="rgroup ${lv}"><div class="rgroup-head">${lv === "pending" ? "스캔 전" : "정상"} <span class="desc">${lv === "pending" ? "아직 스캔하지 않음" : "확인 범위 내 발견 없음"}</span><span class="n">${list.length}</span></div>
        <div class="chipwrap">${list.slice(0, 60).map((c) => { const g = lv === "none" ? checkGaps(c) : []; return `<span class="nchip ${g.length ? "partial" : ""}" data-cid="${c.id}" title="${esc(g.join(" / ") || "전 항목 확인")}">${esc(c.name)}</span>`; }).join("") || `<span class="muted small">없음</span>`}${list.length > 60 ? `<span class="muted small">외 ${list.length - 60}곳</span>` : ""}</div></div>`;
    }
    if (!list.length) return "";
    return `<div class="rgroup ${lv}"><div class="rgroup-head">${LEVEL[lv]} <span class="desc">${LEVEL_DESC[lv]}</span><span class="n">${list.length}</span></div>
      ${list.map((c) => `<div class="rrow" data-cid="${c.id}">
        <div><div class="rname">${esc(c.name)}</div><div class="rmeta">${c.engagements.map(engText).join("<br>") || "EDCF 주요 업체"}</div></div>
        <div class="issues">${c.total}건${c.open ? ` · 미확인 ${c.open}` : ""}</div></div>`).join("")}</div>`;
  };
  const sorted = [...cs].sort((a, b) => a.name.localeCompare(b.name));
  $("#riskGroups").innerHTML = !cs.length ? `<div class="muted small">업체가 없습니다.</div>`
    : !sc ? groupHtml("pending", sorted)
    : ["red", "orange", "yellow"].map((lv) => groupHtml(lv, sorted.filter((c) => c.risk === lv))).join("") + groupHtml("none", sorted.filter((c) => c.risk === "none"));
  $$("#riskGroups [data-cid]").forEach((x) => x.addEventListener("click", () => openCompany(x.dataset.cid)));

  // MDB 한국 국적 제재 기업 (매뉴얼: 영문명 조회 후 국적 '대한민국'으로 최종 확인)
  const mk = state.mdbKorea;
  $("#mdbKoreaN").textContent = mk?.count ?? 0;
  $("#mdbKorea").innerHTML = !mk ? `<div class="muted">첫 스캔 때 World Bank·ADB·AfDB·IDB·EBRD 제재 리스트에서 국적이 한국인 기업을 모아 보여줍니다.</div>`
    : !mk.items?.length ? `<div class="muted">현재 한국 국적 제재 기업이 없습니다.</div>`
    : `<div class="mk-list">${mk.items.slice(0, 30).map((e) => `<a class="mk-row" href="${esc(e.url)}" target="_blank" rel="noopener" title="${esc(e.sanctions || "")}"><span class="nm">${esc(e.name)}</span><span class="ds">${esc(MDB_NAME[e.dataset] || e.dataset)}</span></a>`).join("")}</div>
       <div class="muted" style="margin-top:6px">${esc(mk.at || "")} 기준 · 출처 OpenSanctions</div>`;
  renderJob();
}
const MDB_NAME = { worldbank_debarred: "World Bank", adb_sanctions: "ADB", afdb_sanctions: "AfDB", iadb_sanctions: "IDB", ebrd_ineligible: "EBRD" };

function projectBox(p, editable, i = 0) {
  const rows = [];
  for (const c of state.companies) c.engagements.forEach((e, k) => { if (e.project_id === p.id) rows.push({ c, e, k }); });
  const sc = scanned();
  const worst = sc ? worstOf(rows.map((r) => r.c)) : "pending";
  const roles = [...new Set(rows.map((r) => r.e.role))].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  const issueN = rows.reduce((s, r) => s + (sc ? r.c.total : 0), 0);
  return `<div class="pbox">
    <div class="pbox-head ${worst}"><div class="pname">${esc(p.name)}</div>${p.country ? `<span class="ctry">${esc(COUNTRY[p.country] || p.country)}</span>` : ""}</div>
    <div class="pbox-body">
      ${roles.map((role) => `<div class="rsec">${roleTag(role)}
        ${rows.filter((r) => r.e.role === role).map(({ c, e }) => `<div class="corow ${sc ? c.risk : ""}" data-cid="${c.id}">
          <span class="dot ${sc ? c.risk : ""}"></span><span class="cn">${esc(c.name)}</span>${stageTag(e)}
          <span class="right">${sc && c.total ? badge(c.risk) : ""}</span>
        </div>`).join("")}</div>`).join("") || `<div class="muted small" style="padding:10px 0">연결된 업체 없음</div>`}
    </div>
    <div class="pbox-foot"><span>업체 ${rows.length}개${sc ? ` · 이슈 ${issueN}건` : ""}</span>${ownerTag(p)}</div>
  </div>`;
}
const ownerTag = (p) => `<span class="owner">${!p.owner ? "담당 미지정" : p.owner === me() ? "내 사업" : "담당 " + esc(p.owner.split("@")[0])}</span>`;
function bindProjectBoxes(root) {
  $$(".corow", root).forEach((x) => x.addEventListener("click", (ev) => { if (!ev.target.closest(".xbtn")) openCompany(x.dataset.cid); }));
}

function findingHtml(f, showCompany = true, i = 0) {
  const official = f.source_type !== "news";
  const isNew = f.status === "new" && Date.now() - (f.first_seen_ms || 0) < DAY;
  return `<div class="item lv-${f.level} ${f.status === "reviewed" ? "reviewed" : ""}" data-fid="${esc(f.id)}">
    <div class="item-head">
      ${badge(f.level)}
      ${showCompany ? `<span class="item-company" data-cid="${f.company_id}">${esc(f.company_name)}</span>` : ""}
      ${official ? `<span class="tag official">${f.source_type === "manual" ? "수기 등록" : "공식 제재 명단"}</span>` : ""}
      ${f.category ? `<span class="tag">${esc(f.category)}</span>` : ""}
      ${isNew ? `<span class="new-pill">NEW</span>` : ""}
      <span class="item-age">${f.first_seen_ms ? `감지 ${relTime(f.first_seen_ms)}` : ""}</span>
    </div>
    <div class="item-summary">${esc(f.summary || f.title)}</div>
    <div class="source">
      출처: <b>${esc(f.source_name || "-")}</b> · ${esc(f.published_at || "날짜 미상")}
      ${f.url ? ` · <a href="${esc(f.url)}" target="_blank" rel="noopener">원문 보기 ↗</a>` : ""}
      <div class="src-title">「${esc(f.title)}」</div>
      ${f.rationale ? `<div class="muted">판단 근거: ${esc(f.rationale)}</div>` : ""}
    </div>
    <div class="item-actions">
      ${f.status !== "reviewed" ? `<button class="btn sm" data-act="reviewed">확인했음</button>` : ""}
      ${f.status !== "dismissed" ? `<button class="btn sm" data-act="dismissed">관련 없음</button>` : ""}
      ${f.status && f.status !== "new" ? `<button class="btn sm ghost" data-act="new">되돌리기</button>` : ""}
    </div>
  </div>`;
}
function renderFeed(list, el, showCompany = true) {
  el.innerHTML = list.map((f, i) => findingHtml(f, showCompany, i)).join("");
  $$(".item-company", el).forEach((x) => x.addEventListener("click", () => openCompany(x.dataset.cid)));
  $$("[data-act]", el).forEach((b) => b.addEventListener("click", async () => {
    const fid = b.closest(".item").dataset.fid, st = b.dataset.act;
    const patch = { status: st, reviewed_by: auth.currentUser.email, reviewed_at: nowStr() };
    await updateDoc(doc(db, "findings", fid), patch);
    Object.assign(state.findings.find((f) => f.id === fid) || {}, patch);
    toast(st === "dismissed" ? "관련 없는 기사로 처리했습니다 (다시 수집하지 않음)" : st === "reviewed" ? "확인 처리했습니다" : "되돌렸습니다");
    rerender();
  }));
}

// ---------- 검사 범위 ----------
// 업체별로 '무엇을 확인했는지'를 해석. 이슈가 없을 때 '정상'이 어디까지 확인된 결과인지 보여주기 위함.
function checkGaps(c) {
  const lc = c.last_check;
  if (!lc) return ["아직 스캔하지 않음"];
  const g = [];
  if (!lc.news?.engines?.length) g.push("뉴스 검색 실패");
  if (lc.mdb?.status === "no_en") g.push("영문명 없음 → MDB 제재리스트 대조 불완전");
  if (lc.pps?.status === "no_bizno") g.push("사업자번호 없음 → 조달청 부정당제재 조회 못 함");
  if (lc.pps?.status === "error") g.push("조달청 조회 오류");
  return g;
}
function coverage(list = state.companies) {
  const cs = list.filter((c) => c.last_check);
  const domestic = cs.filter((c) => c.last_check.pps?.status !== "foreign");
  return {
    scanned: cs.length,
    news: cs.filter((c) => c.last_check.news?.engines?.length).length,
    mdb: cs.filter((c) => c.last_check.mdb?.status === "ok").length,
    pps: domestic.filter((c) => c.last_check.pps?.status === "ok").length,
    ppsTotal: domestic.length,
    ppsConnected: !!state.status.connections?.pps,
  };
}
function showGaps() {
  const list = state.companies.filter((c) => c.last_check && checkGaps(c).length).sort((a, b) => a.name.localeCompare(b.name));
  modal(`<h2>보완할 업체 ${list.length}곳</h2>
    <p class="muted small">아래 업체는 일부 항목을 확인하지 못했습니다. 업체를 눌러 <b>식별 정보</b>에 사업자번호·영문명을 넣으면 다음 스캔부터 확인됩니다.</p>
    <div class="gap-list">${list.map((c) => `<div class="gap-row" data-cid="${c.id}"><b>${esc(c.name)}</b><div class="muted small">${checkGaps(c).map(esc).join(" · ")}</div></div>`).join("")}</div>`);
  $$("#modal .gap-row").forEach((x) => x.onclick = () => { closeModal(); openCompany(x.dataset.cid); });
}
const fmtBiz = (b) => { const d = String(b || "").replace(/\D/g, ""); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : (b || ""); };

// ---------- 업체 상세 ----------
function checkRows(c) {
  const lc = c.last_check;
  if (!lc) return `<div class="muted small">아직 스캔하지 않았습니다.</div>`;
  const row = (st, k, d) => `<div class="chk-row ${st}"><span class="ic">${{ ok: "✓", warn: "!", bad: "✕", na: "–" }[st]}</span><div><b>${k}</b><div class="d">${d}</div></div></div>`;
  const n = lc.news || {}, m = lc.mdb || {}, p = lc.pps || {};
  const ppsRow = {
    ok: () => row("ok", "조달청 부정당제재", `사업자번호 ${esc(fmtBiz(p.bizno))}로 조회 — 현재 유효한 제재 ${p.hits ? `<b>${p.hits}건</b>` : "없음"} <span class="muted">(만료된 과거 제재는 제공되지 않음)</span>`),
    no_bizno: () => row("warn", "조달청 부정당제재", "사업자번호가 없어 조회하지 못했습니다 → 아래 <b>사업자번호</b>를 입력하세요"),
    not_connected: () => row("na", "조달청 부정당제재", "미연결 (GitHub Secret <code>DATA_GO_KR_KEY</code> 필요)"),
    foreign: () => row("na", "조달청 부정당제재", "해외 업체 — 해당 없음"),
    error: () => row("bad", "조달청 부정당제재", `조회 오류: ${esc(p.error || "")}`),
  }[p.status || "not_connected"]();
  return `
    ${row(n.engines?.length ? "ok" : "bad", "뉴스", n.engines?.length ? `${esc(n.engines.join("·"))} 검색어 ${n.queries}개로 기사 ${n.fetched}건 확인 (업체명 언급 ${n.mentioned}건, 이번 신규 분석 ${n.new_analyzed}건)` : "검색 실패 — 실행 기록을 확인하세요")}
    ${row("ok", "판정 방식", lc.analyzer === "claude" ? "AI(Claude)가 기사별로 관련성·등급 판정" : "키워드 규칙 (AI 키 없음 — 키워드 없는 기사는 놓칠 수 있음)")}
    ${m.status === "ok" ? row("ok", "MDB 제재리스트", `${m.lists}개 리스트(World Bank·ADB 등)와 '${esc((m.names || []).join(", "))}' 이름으로 대조`)
      : m.status === "no_lists" ? row("bad", "MDB 제재리스트", "리스트를 내려받지 못했습니다")
      : row("warn", "MDB 제재리스트", "영문명이 없어 대조가 불완전합니다 → 아래 <b>영문명</b>을 입력하세요")}
    ${ppsRow}
    ${(lc.identity?.notes || []).map((t) => `<div class="chk-note">ℹ ${esc(t)}</div>`).join("")}
    <div class="muted small" style="margin-top:6px">검사 시각 ${esc(lc.at)}</div>`;
}

function openCompany(cid) {
  const c = state.companies.find((x) => x.id === cid);
  if (!c) return;
  state.openCid = cid;
  const fs = state.findings.filter((f) => f.company_id === cid && f.status !== "dismissed").sort(byLevelDate);
  const dismissed = state.findings.filter((f) => f.company_id === cid && f.status === "dismissed");
  const gaps = checkGaps(c);
  $("#drawerTitle").innerHTML = `<div class="t">${esc(c.name)} ${scanned() ? badge(c.risk) : ""}</div>
    <div class="muted small">${c.engagements.map((e) => `${roleTag(e.role)} ${esc(projName(e.project_id))} ${stageTag(e)}`).join(" &nbsp; ") || "사업 미배정"}</div>`;
  $("#drawerBody").innerHTML = `
    <div class="muted small" style="margin-bottom:10px">${c.category ? `${esc(c.category)} · ` : ""}${c.focus ? "<b>집중 감시</b> — 매일 업체명 검색 + 주 1회 심층 검색" : "<b>기본 감시</b> — 매일 제재 키워드 기사·MDB 대조, 조달청 3일마다, 업체명 검색 주 1회"}</div>
    <div class="actions left" style="margin-top:0">
      <button class="btn primary" id="dScan">이 업체만 다시 스캔</button>
      ${c.engagements.length ? "" : `<button class="btn" id="dWatch">${c.watch ? "집중 감시 해제" : "집중 감시로 지정"}</button>`}
      <a class="btn" target="_blank" rel="noopener" href="https://search.naver.com/search.naver?where=news&query=${encodeURIComponent('"' + c.name + '"')}">네이버 뉴스 ↗</a>
    </div>

    <h2 style="margin-top:18px">이슈 <span class="count">${fs.length}</span></h2>
    <div id="dFeed" class="feed" style="max-height:none">${fs.length ? "" : `<div class="empty">${!c.last_check ? "아직 스캔하지 않았습니다." : gaps.length ? "확인한 범위에서는 발견되지 않았습니다. 다만 아래 '검사 내역'의 ⚠ 항목은 확인하지 못했습니다." : "확인한 범위에서 발견된 이슈가 없습니다."}</div>`}</div>
    ${dismissed.length ? `<details class="more"><summary>관련 없음 처리한 기사 ${dismissed.length}건</summary><div id="dDismissed" class="feed" style="max-height:none"></div></details>` : ""}

    <div class="card" style="margin-top:16px">
      <h2>검사 내역 ${gaps.length && c.last_check ? `<span class="badge yellow">확인 못 한 항목 ${gaps.length}</span>` : c.last_check ? `<span class="badge none">전 항목 확인</span>` : ""}</h2>
      ${checkRows(c)}
    </div>

    <div class="card">
      <h2>사업 연결</h2>
      ${c.engagements.length ? `<div class="simple-list">${c.engagements.map((e, i) => `<div class="srow"><span>${roleTag(e.role)} ${esc(projName(e.project_id))} ${stageTag(e)}</span><button class="xbtn" data-dunlink="${i}" title="이 사업에서 빼기">✕</button></div>`).join("")}</div>` : `<div class="muted small">연결된 사업이 없습니다 (EDCF 주요 업체로 기본 감시).</div>`}
      ${state.projects.length ? `<form id="linkForm" class="add-row" style="margin:10px 0 0"><select name="pid">${state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select><select name="role">${ROLES.map((r) => `<option>${r}</option>`).join("")}</select><button class="btn sm">연결</button></form>` : ""}
    </div>

    <div class="card">
      <h2>식별 정보 <span class="muted small" style="font-weight:500">— 사업자번호·영문명이 있어야 조달청·MDB 조회가 정확합니다</span></h2>
      <form id="advForm" class="form">
        <div class="row">
          <label>사업자등록번호 ${c.bizno_source ? `<span class="muted">(${esc(c.bizno_source)})</span>` : ""}<input name="biz_no" value="${esc(fmtBiz(c.biz_no))}" placeholder="000-00-00000"></label>
          <label>영문명<input name="name_en" value="${esc(c.name_en || "")}" placeholder="MDB 제재리스트 대조용 (예: DOHWA ENGINEERING)"></label>
        </div>
        <div class="row">
          <label>별칭 (쉼표 구분)<input name="aliases" value="${esc(c.aliases || "")}"></label>
          <label>보조 키워드<input name="context_keywords" value="${esc(c.context_keywords || "")}" placeholder="동명 업체 구분용 (예: 감리, 대표자명)"></label>
        </div>
        <div class="row">
          <label>대표자<input name="ceo" value="${esc(c.ceo || "")}"></label>
          <label>검색 언어<input name="search_langs" value="${esc(c.search_langs || "ko")}" placeholder="ko,en,id"></label>
        </div>
        <div class="row">
          <label>분류<input name="category" value="${esc(c.category || "")}" list="catList"></label>
          <label>메모<input name="note" value="${esc(c.note || "")}"></label>
        </div>
        <datalist id="catList">${categories().map((k) => `<option value="${esc(k)}">`).join("")}</datalist>
        <div class="actions"><button class="btn primary">저장</button></div>
      </form>
      <p class="muted small" style="margin:6px 0 0">DART에 등록된 업체(상장사 + 공시 대상 비상장사)는 스캔 때 사업자번호·영문명이 자동으로 채워집니다. 소규모 업체·건축사사무소·대학·해외 업체는 사업자등록증을 보고 직접 입력하세요.</p>
    </div>

    <details class="more">
      <summary>직접 확인한 제재 기록 추가</summary>
      <form id="manualForm" class="form">
        <div class="row">
          <select name="source_name"><option>조달청 나라장터 부정당제재</option><option>World Bank 제재기업 리스트</option><option>ADB 제재 리스트</option><option>공정거래위원회 의결</option><option>기타</option></select>
          <select name="level"><option value="red">위험</option><option value="orange">경고</option><option value="yellow">주의</option></select>
        </div>
        <input name="title" placeholder="내용 (예: 입찰참가자격 제한 6개월, 2025.03~2025.09)" required>
        <div class="row"><input name="url" placeholder="출처 URL"><input name="published_at" placeholder="처분일 YYYY-MM-DD"></div>
        <div class="actions"><button class="btn primary">기록 추가</button></div>
      </form>
    </details>
    <div class="actions left" style="margin-top:20px"><button class="btn sm danger" id="dDelete">업체 삭제</button></div>`;
  if (fs.length) renderFeed(fs, $("#dFeed"), false);
  if (dismissed.length) renderFeed(dismissed, $("#dDismissed"), false);
  $("#dScan").onclick = () => runWorkflow({ task: "scan", companies: c.name }, `'${c.name}' 재스캔`);
  $("#dWatch")?.addEventListener("click", async () => {
    c.watch = !c.watch; await updateDoc(doc(db, "companies", cid), { watch: c.watch });
    toast(c.watch ? "집중 감시로 지정했습니다 (다음 스캔부터 매일 업체명 검색)" : "기본 감시로 되돌렸습니다"); rerender();
  });
  $("#linkForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    await placeCompany(cid, null, fd.get("pid"), fd.get("role"));
  });
  $$("[data-dunlink]").forEach((b) => b.onclick = async () => {
    c.engagements.splice(+b.dataset.dunlink, 1); await saveEngagements(c); toast("사업 연결을 뺐습니다"); rerender();
  });
  $("#dDelete").onclick = async () => {
    if (!confirm(`'${c.name}' 업체와 수집 이력을 삭제할까요?`)) return;
    await deleteCompany(cid); closeDrawer(); rerender();
  };
  $("#advForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target));
    const patch = Object.fromEntries(Object.entries(fd).map(([k, v]) => [k, v.trim() || null]));
    const biz = (patch.biz_no || "").replace(/\D/g, "");
    if (patch.biz_no && biz.length !== 10) return toast("사업자등록번호는 숫자 10자리입니다");
    patch.biz_no = biz || null;
    if (patch.biz_no !== (c.biz_no ? String(c.biz_no).replace(/\D/g, "") : null)) patch.bizno_source = patch.biz_no ? "직접 입력" : null;
    if (patch.name_en && !(patch.search_langs || "").includes("en")) patch.search_langs = (patch.search_langs || "ko") + ",en";
    await updateDoc(doc(db, "companies", cid), patch); Object.assign(c, patch);
    toast("저장했습니다. 다음 스캔부터 적용됩니다"); openCompany(cid);
  };
  $("#manualForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target));
    const key = "manual-" + Date.now();
    const data = {
      company_id: cid, company_name: c.name, source_type: "manual", source_name: fd.source_name, title: fd.title,
      url: fd.url || "", published_at: fd.published_at || "", level: fd.level,
      category: /공정/.test(fd.source_name) ? "과징금·행정처분" : /Bank|ADB/.test(fd.source_name) ? "MDB 제재" : "부정당업자 제재",
      summary: fd.title, rationale: `담당자 수기 등록 (${auth.currentUser.email})`, analyzer: "manual", relevant: true,
      dedup_key: key, status: "new", first_seen: nowStr(), first_seen_ms: Date.now(), reported_at: null,
    };
    await setDoc(doc(db, "findings", `${cid}_${key}`), data);
    state.findings.push({ id: `${cid}_${key}`, ...data });
    toast("기록을 추가했습니다"); rerender();
  };
  $("#drawer").classList.add("open"); $("#drawerBg").classList.add("open");
}
function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawerBg").classList.remove("open"); state.openCid = null; }
$("#drawerClose").onclick = closeDrawer; $("#drawerBg").onclick = closeDrawer;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDrawer(); closeModal(); } });

// ---------- 스캔 실행 (대시보드 → GitHub Actions) ----------
const GH_KEY = "edcf_gh_token", JOB_KEY = "edcf_job2";
const ghToken = () => { try { return localStorage.getItem(GH_KEY) || ""; } catch { return ""; } };
const setGhToken = (t) => { try { t ? localStorage.setItem(GH_KEY, t) : localStorage.removeItem(GH_KEY); } catch {} };
// 브라우저에서 GitHub API 호출 (CORS 허용 헤더만 사용: Accept·Authorization·Content-Type)
async function gh(path, opts = {}) {
  return fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, {
    ...opts,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${ghToken()}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
  });
}
async function ghError(r) {
  let msg = ""; try { msg = (await r.json()).message || ""; } catch {}
  return `HTTP ${r.status}${msg ? ` — ${msg}` : ""}`;
}
function errorModal(title, detail, tips) {
  modal(`<h2>${title}</h2>
    <p><code>${esc(detail)}</code></p>
    <ul class="small">${tips.map((t) => `<li>${t}</li>`).join("")}</ul>
    <p class="muted small">계속 안 되면 이 창을 캡처해서 보내주세요. 토큰 없이 실행하려면 <a href="${ACTIONS_URL}" target="_blank" rel="noopener">GitHub에서 직접 실행 ↗</a></p>`);
}
const NET_TIPS = ["회사망·보안 프로그램이 <code>api.github.com</code> 접속을 막고 있을 수 있습니다 → 개인 PC·휴대폰 테더링으로 시도", "광고 차단 등 브라우저 확장 프로그램을 잠시 끄고 시도", "Ctrl + F5로 새로고침 후 다시 시도"];
function tokenSetup(after) {
  modal(`<h2>스캔 버튼 연결 (처음 한 번)</h2>
    <p class="muted small">대시보드에서 바로 스캔하려면 GitHub 토큰을 한 번 등록해야 합니다. 토큰은 <b>이 브라우저에만</b> 저장되고, 이 저장소의 실행 권한만 가집니다.</p>
    <ol>
      <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener"><b>토큰 만들기 페이지 열기 ↗</b></a></li>
      <li><b>Token name</b>: <code>edcf-scan</code> · <b>Expiration</b>: 원하는 기간 (예: 90 days)</li>
      <li><b>Repository access</b>: <b>Only select repositories</b> → <code>edcf-integrity-monitor</code> 선택</li>
      <li><b>Permissions</b> → <b>Repository permissions</b> → <b>Actions</b>를 <b>Read and write</b>로 변경</li>
      <li>맨 아래 <b>Generate token</b> → 나온 토큰(<code>github_pat_</code>로 시작)을 복사해 아래에 붙여넣기</li>
    </ol>
    <div class="add-row"><input id="tokenInput" placeholder="github_pat_..." autocomplete="off"><button class="btn primary" id="tokenSave">저장하고 실행</button></div>
    <p class="muted small">토큰 없이 하려면 <a href="${ACTIONS_URL}" target="_blank" rel="noopener">GitHub에서 직접 실행 ↗</a> (Run workflow → scan)</p>`);
  $("#tokenSave").onclick = async () => {
    const t = $("#tokenInput").value.trim();
    if (!t) return;
    setGhToken(t);
    let r;
    try { r = await gh(""); }
    catch (e) { setGhToken(""); return errorModal("GitHub에 연결하지 못했습니다", e.message, NET_TIPS); }
    if (!r.ok) {
      const d = await ghError(r); setGhToken("");
      if (r.status === 401) return toast("토큰이 올바르지 않습니다. 복사가 잘 됐는지 확인하세요", 5000);
      return errorModal("이 저장소에 접근할 수 없습니다", d, ["토큰의 <b>Repository access</b>에 <code>edcf-integrity-monitor</code>가 선택돼 있는지 확인"]);
    }
    closeModal(); toast("토큰을 저장했습니다"); after?.();
  };
}
// 실행 요청: ① 토큰이 있고 api.github.com에 닿으면 바로 실행(빠름)
//           ② 아니면 Firebase에 '실행 요청'을 남기고, GitHub가 10분마다 확인해 처리(회사망에서도 동작)
async function runWorkflow(inputs, label) {
  if (state.job && !state.job.done) return toast("이미 진행 중인 작업이 있습니다. 끝난 뒤 다시 눌러주세요");
  const full = { task: "scan", companies: "", test_to: "", ...inputs };
  if (ghToken()) {
    const started = Date.now();
    let r = null;
    try { r = await gh("/actions/workflows/monitor.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: "main", inputs: full }) }); }
    catch { r = null; } // 회사망 등에서 막힘 → 요청 방식으로
    if (r && r.ok) return startJob({ mode: "direct", label, started });
    if (r && r.status === 401) { setGhToken(""); toast("등록된 토큰이 만료돼 요청 방식으로 실행합니다", 4000); }
  }
  return queueRequest(full, label);
}
async function queueRequest(full, label) {
  try {
    // 같은 작업이 이미 대기 중이면 새로 만들지 않고 그것을 따라감
    const pend = docs(await getDocs(query(collection(db, "requests"), where("status", "==", "pending"))));
    const same = pend.find((r) => r.task === full.task && (r.companies || "") === full.companies && (r.test_to || "") === full.test_to);
    let id = same?.id;
    if (!id) {
      const ref = await addDoc(collection(db, "requests"), {
        ...full, label, status: "pending", requested_by: auth.currentUser?.email || "", requested_at: nowStr(), requested_ms: Date.now(),
      });
      id = ref.id;
    }
    const relayed = await pingRelay();
    startJob({ mode: "queue", label, started: same?.requested_ms || Date.now(), reqId: id, relayed });
  } catch (e) {
    errorModal("실행 요청을 저장하지 못했습니다", e.message, ["Ctrl + F5로 새로고침 후 다시 시도", "Firebase 보안 규칙(firestore.rules)이 게시돼 있는지 확인"]);
  }
}
// 즉시 실행 중계(Google Apps Script): 로그인 토큰을 보내면 중계기가 GitHub 실행을 바로 시작
async function pingRelay() {
  const url = (state.settings?.relay_url || "").trim();
  if (!url) return false;
  try {
    const idToken = await auth.currentUser.getIdToken();
    const r = await fetch(url, { method: "POST", body: JSON.stringify({ idToken }) }); // text/plain → 사전 확인 없이 전송
    const d = await r.json();
    if (!d.ok) console.warn("relay:", d.error);
    return !!d.ok;
  } catch (e) { console.warn("relay unreachable:", e); return false; }
}
function startJob(j) {
  state.job = { ...j, status: "queued" };
  try { localStorage.setItem(JOB_KEY, JSON.stringify(j)); } catch {}
  toast(j.mode === "direct" || j.relayed ? `${j.label}을(를) 시작했습니다. 1~2분 안에 실행되고, 끝나면 자동으로 반영됩니다`
    : `${j.label}을(를) 요청했습니다. GitHub 예약 확인 때 시작됩니다(늦어질 수 있음). 끝나면 자동으로 반영됩니다`, 5000);
  renderJob(); trackJob();
}
async function trackJob() {
  const j = state.job;
  if (!j || j.done) return;
  if (!auth.currentUser) return setTimeout(trackJob, 2000);
  try {
    if (j.mode === "queue") {
      const snap = await getDoc(doc(db, "requests", j.reqId));
      const d = snap.exists() ? snap.data() : null;
      if (d) {
        j.status = { pending: "queued", running: "in_progress", cancel_requested: "in_progress", done: "completed", error: "completed", cancelled: "completed" }[d.status] || "queued";
        j.conclusion = d.status === "done" ? "success" : d.status === "error" ? "failure" : d.status === "cancelled" ? "cancelled" : null;
        j.stopping = d.status === "cancel_requested";
        j.error = d.result?.error;
        j.progress = d.progress || null;
        j.result = d.result || null;
      }
    } else {
      const r = await gh("/actions/workflows/monitor.yml/runs?event=workflow_dispatch&per_page=5");
      if (r.ok) {
        const run = (await r.json()).workflow_runs?.find((x) => new Date(x.created_at).getTime() >= j.started - 20000);
        if (run) { j.status = run.status; j.conclusion = run.conclusion; j.url = run.html_url; j.runId = run.id; }
      }
      if (j.status === "in_progress") { const p = await getDoc(doc(db, "meta", "progress")); if (p.exists()) j.progress = p.data(); }
    }
  } catch {}
  const limit = j.mode === "queue" ? 90 * 60e3 : 45 * 60e3;
  if (j.status === "completed") {
    j.done = true;
    try { localStorage.removeItem(JOB_KEY); } catch {}
    if (j.conclusion === "success") {
      await loadAll(); rerender();
      const r = j.result || {};
      toast(`${j.label} 완료${r.seconds ? ` · ${Math.round(r.seconds)}초` : ""}${r.new_findings != null ? ` · 새 이슈 ${r.new_findings}건` : ""}`, 5000);
    } else if (j.conclusion === "cancelled") {
      await loadAll(); rerender();
      toast(`${j.label}을(를) 중지했습니다${j.progress?.done ? ` (${j.progress.done}곳까지 반영)` : ""}`, 5000);
    } else toast(`${j.label} 실패${j.error ? `: ${j.error}` : ""}`, 7000);
  } else if (Date.now() - j.started > limit) { j.done = true; j.status = "timeout"; try { localStorage.removeItem(JOB_KEY); } catch {} }
  else state.trackT = setTimeout(trackJob, j.status === "in_progress" ? 3000 : j.mode === "queue" ? 8000 : 6000);
  renderJob();
}
function renderJob() {
  const j = state.job, el = $("#jobState");
  $("#btnStop").classList.toggle("hidden", !(j && !j.done && (j.mode === "queue" || j.runId)));
  $("#btnStop").disabled = !!j?.stopping;
  $("#btnStop").textContent = j?.stopping ? "중지하는 중…" : "스캔 중지";
  $("#btnScan").disabled = !!(j && !j.done);
  if (!el) return;
  if (!j) { el.innerHTML = ""; return; }
  const sec = Math.round((Date.now() - j.started) / 1000), mmss = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const link = j.url ? `<a href="${esc(j.url)}" target="_blank" rel="noopener">GitHub 진행 보기 ↗</a>` : j.mode === "queue" ? `<a href="${ACTIONS_URL}" target="_blank" rel="noopener">GitHub ↗</a>` : "";
  if (j.done) {
    el.innerHTML = j.conclusion === "success"
      ? `<div class="job ok"><div class="row1">✓ <b>${esc(j.label)} 완료</b><span class="t">${mmss}</span></div></div>`
      : j.conclusion === "cancelled" ? `<div class="job"><div class="row1"><b>${esc(j.label)} 중지됨</b><span class="muted small">중지 전까지 검사한 업체 결과는 반영됐습니다</span><span class="t">${mmss}</span></div></div>`
      : `<div class="job bad"><div class="row1">✕ <b>${esc(j.label)} ${j.status === "timeout" ? "확인 시간 초과" : "실패"}</b><span class="t">${link}</span></div>${j.error ? `<div class="small">${esc(j.error)}</div>` : ""}</div>`;
    return;
  }
  const late = j.mode === "queue" && j.status !== "in_progress" && sec > 25 * 60;
  if (late) {
    el.innerHTML = `<div class="job bad"><div class="row1">⚠ <b>${esc(j.label)}</b> ${mmss}째 대기 — GitHub 예약 실행이 지연 중입니다</div><div class="small"><a href="${ACTIONS_URL}" target="_blank" rel="noopener">GitHub에서 직접 실행 ↗</a> (Run workflow → queue)</div></div>`;
    return;
  }
  const p = j.progress, running = j.status === "in_progress";
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;
  const what = running
    ? (j.stopping ? "중지 요청됨 — 진행 중인 업체까지 마치고 멈춥니다" : p && p.total ? `${p.done}/${p.total} · ${esc(p.current || "")}` : "준비 중")
    : j.mode === "queue" ? (j.relayed ? "곧 시작 (1~2분)" : "시작 대기 · GitHub 예약 확인") : "시작 대기";
  el.innerHTML = `<div class="job"><div class="row1"><span class="spinner"></span><b>${esc(j.label)}</b> ${what}<span class="t">${mmss}</span></div>
    <div class="pbar ${running && p && p.total ? "" : "indet"}"><i style="width:${pct}%"></i></div>
    ${link ? `<div class="small muted">${link}</div>` : ""}</div>`;
}
setInterval(() => { if (state.job && !state.job.done) renderJob(); }, 1000);
$("#btnScan").onclick = () => runWorkflow({ task: "scan" }, "전체 스캔");
// 스캔 중지: 대기 중이면 바로 취소, 실행 중이면 '중지 요청' → 스캐너가 업체 몇 곳마다 확인해 멈춤
$("#btnStop").onclick = async () => {
  const j = state.job;
  if (!j || j.done) return;
  if (!confirm("진행 중인 스캔을 중지할까요?\n(이미 검사한 업체 결과는 저장됩니다)")) return;
  try {
    if (j.mode === "queue") {
      const ref = doc(db, "requests", j.reqId), d = (await getDoc(ref)).data() || {};
      if (d.status === "pending") {
        await updateDoc(ref, { status: "cancelled", finished_at: nowStr(), result: { stopped: true } });
      } else if (d.status === "running") {
        await updateDoc(ref, { status: "cancel_requested" });
      }
    } else if (j.runId) {
      const r = await gh(`/actions/runs/${j.runId}/cancel`, { method: "POST" });
      if (!r.ok) throw new Error(await ghError(r));
    }
    j.stopping = true; renderJob(); toast("중지를 요청했습니다");
    clearTimeout(state.trackT); trackJob();
  } catch (e) { toast("중지 요청 실패: " + e.message, 5000); }
};
// 새로고침 후에도 진행 중이던 작업 이어서 추적
try { const s = JSON.parse(localStorage.getItem(JOB_KEY) || "null"); if (s && Date.now() - s.started < 90 * 60e3) { state.job = { ...s, status: "queued" }; setTimeout(trackJob, 1500); } } catch {}

// ---------- 설정 (드래그 앤 드롭) ----------
const STAGES = ["계약", "우선협상", "입찰중"];
const ROLES = ["컨설턴트", "본구매", "F/S"];

const categories = () => [...new Set(state.companies.map((c) => c.category).filter(Boolean))].sort();

// ---------- 업체·사업 ----------
function poolMatches(c) {
  const q = ($("#poolSearch").value || "").trim().toLowerCase(), qd = q.replace(/\D/g, "");
  if (q && !(c.name.toLowerCase().includes(q) || (c.aliases || "").toLowerCase().includes(q) || (c.name_en || "").toLowerCase().includes(q) || (qd.length >= 3 && String(c.biz_no || "").includes(qd)))) return false;
  const cat = $("#fCat").value, link = $("#fLink").value, risk = $("#fRisk").value, info = $("#fInfo").value;
  if (cat && (c.category || "분류 없음") !== cat) return false;
  if (link === "linked" && !c.engagements.length) return false;
  if (link === "base" && c.engagements.length) return false;
  if (risk && (scanned() ? c.risk : "none") !== risk) return false;
  if (info === "nobiz" && (c.biz_no || c.country !== "KR")) return false;
  if (info === "noen" && c.name_en) return false;
  if (info === "watch" && !c.focus) return false;
  return true;
}
function renderCompanies() {
  // 분류 필터 항목 (선택값 유지)
  const cur = $("#fCat").value, cats = categories();
  $("#fCat").innerHTML = `<option value="">분류: 전체</option>` + cats.map((k) => `<option ${k === cur ? "selected" : ""}>${esc(k)}</option>`).join("")
    + (state.companies.some((c) => !c.category) ? `<option ${cur === "분류 없음" ? "selected" : ""}>분류 없음</option>` : "");
  const list = state.companies.filter(poolMatches)
    .sort((a, b) => (b.engagements.length ? 1 : 0) - (a.engagements.length ? 1 : 0) || a.name.localeCompare(b.name));
  $("#poolCount").textContent = state.companies.length;
  $("#poolShown").textContent = list.length === state.companies.length ? `전체 ${list.length}곳` : `${state.companies.length}곳 중 ${list.length}곳`;
  const sc = scanned();
  $("#pool").innerHTML = !list.length ? `<div class="empty small">${state.companies.length ? "조건에 맞는 업체가 없습니다." : "업체가 없습니다. [+ 업체 추가] 또는 아래 '여러 업체 한 번에 붙여넣기'를 이용하세요."}</div>`
    : list.map((c) => `<div class="pchip ${c.engagements.length ? "linked" : ""}" draggable="true" data-cid="${c.id}" title="끌어서 사업에 놓기 · 누르면 상세">
      <span class="grip">⋮⋮</span>${sc ? `<span class="dot ${c.risk}"></span>` : ""}
      <span class="nm">${esc(c.name)}${c.watch ? ' <span class="muted" title="집중 감시">★</span>' : ""}</span>
      ${c.category ? `<span class="cat">${esc(c.category)}</span>` : ""}
      ${!c.biz_no && c.country === "KR" ? `<span class="miss" title="사업자번호 없음">번호</span>` : ""}${!c.name_en ? `<span class="miss" title="영문명 없음">영문</span>` : ""}
      <span class="n">${c.engagements.length ? `사업 ${new Set(c.engagements.map((e) => e.project_id)).size}` : ""}</span>
    </div>`).join("");

  // 사업 카드 (놓는 곳)
  $("#projCount").textContent = state.projects.length;
  $("#projBoard").innerHTML = state.projects.map((p) => {
    const rows = [];
    for (const c of state.companies) c.engagements.forEach((e, i) => { if (e.project_id === p.id) rows.push({ c, e, i }); });
    return `<div class="pbox">
      <div class="pbox-head pending"><div class="pname">${esc(p.name)}</div>${p.country ? `<span class="ctry">${esc(COUNTRY[p.country] || p.country)}</span>` : ""}</div>
      <div class="pbox-body">
        ${ROLES.map((role) => {
          const rr = rows.filter((r) => r.e.role === role);
          return `<div class="dropzone ${rr.length ? "" : "is-empty"}" data-pid="${p.id}" data-role="${esc(role)}">
            ${roleTag(role)}
            ${rr.map(({ c, e, i }) => `<div class="corow" draggable="true" data-cid="${c.id}" data-from="${p.id}|${i}">
              <span class="grip muted small">⋮⋮</span><span class="cn">${esc(c.name)}</span>
              <span class="right">
                <button class="stagebtn ${e.stage !== "계약" ? "on" : ""}" data-stage="${c.id}|${i}" title="눌러서 단계 변경">${esc(e.stage || "계약")}${e.stage === "우선협상" && e.rank ? " " + e.rank + "순위" : ""}</button>
                <button class="xbtn" data-unlink="${c.id}|${i}" title="이 사업에서 빼기">✕</button>
              </span></div>`).join("")}
            <div class="drop-hint">여기로 끌어다 놓기</div>
          </div>`;
        }).join("")}
      </div>
      <div class="pbox-foot"><span>업체 ${rows.length}개 · ${ownerTag(p)}${p.owner !== me() ? ` <button class="btn sm ghost" data-own="${p.id}">내 사업으로</button>` : ""}</span><button class="btn sm ghost danger" data-del-proj="${p.id}">사업 삭제</button></div>
    </div>`;
  }).join("") || `<div class="empty">사업이 없습니다. 위에서 사업을 추가하세요.</div>`;
  bindDnd();
}
["#poolSearch"].forEach((s) => $(s).addEventListener("input", () => renderCompanies()));
["#fCat", "#fLink", "#fRisk", "#fInfo"].forEach((s) => $(s).addEventListener("change", () => renderCompanies()));

// ---------- 설정 ----------
function renderSettings() {
  $("#rcList").innerHTML = state.recipients.map((r) => `<div class="srow"><span>${esc(r.email)}</span><button class="xbtn" data-del-rc="${r.id}" title="삭제">✕</button></div>`).join("") || `<div class="muted small">아직 없습니다.</div>`;
  $$("[data-del-rc]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "recipients", b.dataset.delRc)); state.recipients = state.recipients.filter((r) => r.id !== b.dataset.delRc); renderSettings(); });
  renderEdcfInfo();
  renderConnections();
  renderAdvanced();
}

async function saveEngagements(c) { await updateDoc(doc(db, "companies", c.id), { engagements: c.engagements }); }

async function placeCompany(cid, from, pid, role) {
  const c = state.companies.find((x) => x.id === cid);
  if (!c) return;
  let moved = null;
  if (from) { // 다른 사업 카드에서 끌어온 경우: 이동
    const [fpid, fi] = from.split("|");
    if (fpid === pid && c.engagements[+fi]?.role === role) return;
    moved = c.engagements.splice(+fi, 1)[0];
  }
  if (c.engagements.some((e) => e.project_id === pid && e.role === role)) {
    if (moved) await saveEngagements(c);
    toast(`'${c.name}'은(는) 이미 이 사업의 ${role}로 등록돼 있습니다`); rerender(); return;
  }
  c.engagements.push({ project_id: pid, role, stage: moved?.stage || "계약", rank: moved?.rank || null });
  await saveEngagements(c);
  toast(`'${c.name}' → ${projName(pid)} · ${role}${moved ? " (이동)" : ""}`);
  rerender();
}

function bindDnd() {
  const root = $("#view-companies");
  // 끌기 시작
  $$("[draggable=true]", root).forEach((el) => {
    el.addEventListener("dragstart", (ev) => {
      ev.dataTransfer.setData("text/plain", JSON.stringify({ cid: el.dataset.cid, from: el.dataset.from || null }));
      ev.dataTransfer.effectAllowed = "move";
      el.classList.add("dragging"); document.body.classList.add("dnd-active");
    });
    el.addEventListener("dragend", () => { el.classList.remove("dragging"); document.body.classList.remove("dnd-active"); $$(".dropzone.over").forEach((z) => z.classList.remove("over")); });
  });
  // 놓는 곳
  $$(".dropzone", root).forEach((z) => {
    z.addEventListener("dragover", (ev) => { ev.preventDefault(); z.classList.add("over"); });
    z.addEventListener("dragleave", (ev) => { if (!z.contains(ev.relatedTarget)) z.classList.remove("over"); });
    z.addEventListener("drop", async (ev) => {
      ev.preventDefault(); z.classList.remove("over"); document.body.classList.remove("dnd-active");
      let data; try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch { return; }
      await placeCompany(data.cid, data.from, z.dataset.pid, z.dataset.role);
    });
  });
  // 업체 목록: 누르면 상세(사업자번호·영문명 입력, 사업 연결)
  $$("#pool .pchip").forEach((el) => el.addEventListener("click", () => openCompany(el.dataset.cid)));
  // 담당자 지정
  $$("[data-own]", root).forEach((b) => b.onclick = async () => {
    const p = state.projects.find((x) => x.id === b.dataset.own);
    await updateDoc(doc(db, "projects", p.id), { owner: me() }); p.owner = me();
    toast(`'${p.name}'을(를) 내 사업으로 지정했습니다`); rerender();
  });
  // 사업 카드 안 업체 이름: 상세 열기
  $$("#projBoard .corow .cn").forEach((x) => x.addEventListener("click", () => openCompany(x.closest(".corow").dataset.cid)));
  // 단계 바꾸기
  $$("[data-stage]", root).forEach((b) => b.onclick = async () => {
    const [cid, i] = b.dataset.stage.split("|");
    const c = state.companies.find((x) => x.id === cid), e = c.engagements[+i];
    e.stage = STAGES[(STAGES.indexOf(e.stage || "계약") + 1) % STAGES.length];
    if (e.stage !== "우선협상") e.rank = null;
    await saveEngagements(c); rerender();
  });
  // 사업에서 빼기 → 다른 사업이 없으면 '미배정'으로 남음
  $$("[data-unlink]", root).forEach((b) => b.onclick = async () => {
    const [cid, i] = b.dataset.unlink.split("|");
    const c = state.companies.find((x) => x.id === cid);
    c.engagements.splice(+i, 1);
    await saveEngagements(c);
    toast(c.engagements.length ? `'${c.name}'을(를) 이 사업에서 뺐습니다` : `'${c.name}'은(는) EDCF 주요 업체(기본 감시)로 남겨뒀습니다`);
    rerender();
  });
  // 사업 삭제 → 소속 업체는 미배정으로
  $$("[data-del-proj]", root).forEach((b) => b.onclick = async () => {
    const pid = b.dataset.delProj;
    if (!confirm(`'${projName(pid)}' 사업을 삭제할까요?\n(소속 업체는 삭제되지 않고 EDCF 주요 업체로 남습니다)`)) return;
    for (const c of state.companies) {
      if (!c.engagements.some((e) => e.project_id === pid)) continue;
      c.engagements = c.engagements.filter((e) => e.project_id !== pid);
      await saveEngagements(c);
    }
    await deleteDoc(doc(db, "projects", pid));
    state.projects = state.projects.filter((p) => p.id !== pid);
    rerender();
  });
}

async function deleteCompany(cid) {
  const fsnap = await getDocs(query(collection(db, "findings"), where("company_id", "==", cid)));
  let batch = writeBatch(db), n = 0;
  for (const d of fsnap.docs) { batch.delete(d.ref); if (++n % 400 === 0) { await batch.commit(); batch = writeBatch(db); } }
  batch.delete(doc(db, "companies", cid));
  await batch.commit();
  state.companies = state.companies.filter((c) => c.id !== cid);
  state.findings = state.findings.filter((f) => f.company_id !== cid);
}

function cleanCompanyName(raw) {
  let rank = null, name = raw;
  const m = name.match(/\(\s*(\d+)\s*순위\s*\)/);
  if (m) { rank = +m[1]; name = name.replace(m[0], ""); }
  name = name.replace(/주식회사|\(주\)|㈜/g, "").replace(/\s+/g, " ").trim();
  return { name, rank };
}
const normName = (s) => s.replace(/\s+/g, "");
function newCompany(id, name, country) {
  const foreign = /^PT[.\s]/i.test(name) || /^[A-Za-z0-9 .,&()'-]+$/.test(name);
  const en = foreign ? name.replace(/^PT[.\s]+/i, "").trim() : null;
  return { id, name, name_en: en, aliases: en && en !== name ? en : null, context_keywords: null,
    country: foreign ? (country || "") : "KR", search_langs: foreign ? (country === "ID" ? "en,id" : "en") : "ko",
    corp_code: null, biz_no: null, ceo: null, note: null, engagements: [], created_at: nowStr() };
}
const companyData = (c) => { const { id, risk, open, total, focus, ...data } = c; return data; };

// 새 업체: 매뉴얼 기준 사업자등록번호·영문명을 함께 입력
$("#btnAddCompany").onclick = () => {
  modal(`<h2>업체 추가</h2>
    <p class="muted small">사업자등록번호와 영문명(사업자등록증 영문)이 있으면 조달청·MDB 제재 조회가 정확해집니다. 모르면 비워두세요. DART에 있는 업체는 스캔 때 자동으로 채워집니다.</p>
    <form id="addCoForm" class="form" autocomplete="off">
      <label>업체명 *<input name="name" required placeholder="예: 가나다엔지니어링"></label>
      <div class="row">
        <label>사업자등록번호<input name="biz_no" placeholder="000-00-00000"></label>
        <label>영문명<input name="name_en" placeholder="예: GANADA ENGINEERING CO., LTD."></label>
      </div>
      <div class="row">
        <label>분류<input name="category" list="catList2" placeholder="예: 엔지니어링·설계·CM·감리"></label>
        <label>별칭 (쉼표 구분)<input name="aliases" placeholder="예: 가나다ENG"></label>
      </div>
      <label style="flex-direction:row;align-items:center;gap:6px;font-weight:500"><input type="checkbox" name="foreign" style="width:auto"> 해외 업체 (조달청 조회 제외, 영문 뉴스 검색)</label>
      ${state.projects.length ? `<div class="row"><label>사업에 바로 연결 (선택)<select name="pid"><option value="">연결 안 함 — EDCF 주요 업체로 등록</option>${state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
        <label>역할<select name="role">${ROLES.map((r) => `<option>${r}</option>`).join("")}</select></label></div>` : ""}
      <datalist id="catList2">${categories().map((k) => `<option value="${esc(k)}">`).join("")}</datalist>
      <div class="actions"><button class="btn primary">추가</button></div>
    </form>`);
  $("#addCoForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target));
    const { name } = cleanCompanyName(fd.name || "");
    if (!name) return;
    if (state.companies.some((c) => normName(c.name) === normName(name))) return toast("이미 있는 업체입니다");
    const biz = (fd.biz_no || "").replace(/\D/g, "");
    if (fd.biz_no && biz.length !== 10) return toast("사업자등록번호는 숫자 10자리입니다");
    const ref = doc(collection(db, "companies"));
    const c = newCompany(ref.id, name, null);
    if (fd.foreign) { c.country = ""; c.search_langs = "en"; }
    if (fd.name_en?.trim()) { c.name_en = fd.name_en.trim(); if (!c.search_langs.includes("en")) c.search_langs += ",en"; }
    if (biz) { c.biz_no = biz; c.bizno_source = "직접 입력"; }
    if (fd.category?.trim()) c.category = fd.category.trim();
    if (fd.aliases?.trim()) c.aliases = fd.aliases.trim();
    if (fd.pid) c.engagements.push({ project_id: fd.pid, role: fd.role || "컨설턴트", stage: "계약", rank: null });
    await setDoc(ref, companyData(c));
    state.companies.push(c);
    closeModal();
    toast(`'${name}'을(를) 추가했습니다${fd.pid ? "" : ". 사업 카드로 끌어다 놓으면 연결됩니다"}`, 4000);
    rerender();
  };
  setTimeout(() => $("#addCoForm input[name=name]")?.focus(), 50);
};
// 새 사업
$("#projForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const name = ev.target.elements.name.value.trim();
  if (!name) return;
  if (state.projects.some((p) => p.name === name)) return toast("이미 있는 사업입니다");
  const data = { name, country: guessCountry(name), owner: me(), created_at: nowStr() };
  const ref = await addDoc(collection(db, "projects"), data);
  state.projects.push({ id: ref.id, ...data });
  ev.target.reset(); toast(`'${name}' 사업을 추가했습니다`); rerender();
};

// 여러 줄 붙여넣기 등록
async function registerRows(rows) {
  const batch = writeBatch(db);
  const pByName = Object.fromEntries(state.projects.map((p) => [p.name, p]));
  const cByName = Object.fromEntries(state.companies.map((c) => [normName(c.name), c]));
  const touched = new Set();
  let newP = 0, newC = 0, links = 0;
  for (const r of rows) {
    let p = pByName[r.project];
    if (!p) {
      const ref = doc(collection(db, "projects"));
      p = { id: ref.id, name: r.project, country: guessCountry(r.project), owner: me(), created_at: nowStr() };
      batch.set(ref, { name: p.name, country: p.country, owner: p.owner, created_at: p.created_at });
      pByName[p.name] = p; state.projects.push(p); newP++;
    }
    let c = cByName[normName(r.name)];
    if (!c) {
      c = newCompany(doc(collection(db, "companies")).id, r.name, p.country);
      cByName[normName(c.name)] = c; state.companies.push(c); newC++;
    }
    if (!c.engagements.some((e) => e.project_id === p.id && e.role === r.role)) {
      c.engagements.push({ project_id: p.id, role: r.role, stage: r.rank ? "우선협상" : "계약", rank: r.rank || null }); links++;
    }
    touched.add(c);
  }
  for (const c of touched) batch.set(doc(db, "companies", c.id), companyData(c), { merge: true });
  await batch.commit();
  return { newP, newC, links };
}

// 여러 업체 한 번에 붙여넣기 — 형식 자동 인식
//  ① 사업명 | 구분 | 업체명   (탭·쉼표 구분도 가능, 사업명 비우면 윗줄 사업)  → 사업 연결까지
//  ② 코랩 명단  # --- 분류 ---  /  "대표이름": ["별칭1", "별칭2"],              → EDCF 주요 업체(분류·별칭)
//  ③ 업체명만 한 줄에 하나                                                        → EDCF 주요 업체
function parseAny(text) {
  const links = [], base = [], errors = [];
  let cat = null, last = "";
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || /^[A-Z_]+\s*=\s*\{$/.test(t) || /^[{}]\s*,?$/.test(t)) return;
    const h = t.match(/^#\s*-{2,}\s*(.+?)\s*-{2,}\s*$/);
    if (h) { cat = h[1].trim(); return; }
    if (t.startsWith("#")) return;
    const m = t.match(/^["']([^"']+)["']\s*:\s*\[(.*)\]\s*,?\s*(#.*)?$/);
    if (m) {
      let name = m[1].trim(); const al = [...m[2].matchAll(/["']([^"']+)["']/g)].map((x) => x[1].trim());
      const paren = name.match(/^(.+?)\s*\((.+)\)$/);
      if (paren) { name = paren[1].trim(); al.push(paren[2].trim()); }
      name = name.replace(/주식회사|\(주\)|㈜/g, "").trim();
      base.push({ name, aliases: [...new Set(al.filter((a) => a && a !== name))], category: cat });
      return;
    }
    if (/["']\s*:\s*\[/.test(t)) { errors.push(`${i + 1}번째 줄을 읽지 못했습니다`); return; }
    const sep = line.includes("|") ? "|" : line.includes("\t") ? "\t" : line.split(",").length >= 3 ? "," : null;
    if (sep) {
      let [project, role, raw] = line.split(sep).map((x) => x.trim());
      if (/사업명/.test(project || "") && /업체/.test(raw || "")) return;
      if (project) last = project; else project = last;
      if (!project || !raw) { errors.push(`${i + 1}번째 줄: 사업명 또는 업체명이 비어 있습니다`); return; }
      const { name, rank } = cleanCompanyName(raw);
      links.push({ project, role: ROLES.includes(role) ? role : (role || "컨설턴트"), name, rank });
      return;
    }
    const { name } = cleanCompanyName(t);
    if (name) base.push({ name, aliases: [], category: cat });
  });
  return { links, base, errors };
}
const coreLen = (n) => (/^[\x00-\x7F]+$/.test(n) ? n.toLowerCase().replace(/[^a-z0-9]/g, "") : n.replace(/주식회사|\(주\)|㈜|\s/g, "")).length;
async function registerBase(rows) {
  const have = new Map(state.companies.map((c) => [normName(c.name), c]));
  const touched = new Map();
  let added = 0, updated = 0;
  for (const r of rows) {
    let c = have.get(normName(r.name));
    if (!c) { c = newCompany(doc(collection(db, "companies")).id, r.name, null); c.source = "붙여넣기"; state.companies.push(c); have.set(normName(c.name), c); added++; }
    else updated++;
    const al = new Set((c.aliases || "").split(",").map((x) => x.trim()).filter(Boolean));
    r.aliases.forEach((a) => al.add(a));
    c.aliases = [...al].join(", ") || null;
    if (r.category && !c.category) c.category = r.category;
    touched.set(c.id, c);
  }
  const list = [...touched.values()];
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(db);
    list.slice(i, i + 400).forEach((c) => batch.set(doc(db, "companies", c.id), companyData(c), { merge: true }));
    await batch.commit();
  }
  return { added, updated };
}
let parsed = null;
$("#btnImportPreview").onclick = () => {
  parsed = parseAny($("#importText").value);
  const { links, base, errors } = parsed;
  const have = new Set(state.companies.map((c) => normName(c.name)));
  const shortN = base.filter((r) => coreLen(r.name) <= 2);
  const cats = {}; base.forEach((r) => (cats[r.category || "분류 없음"] = (cats[r.category || "분류 없음"] || 0) + 1));
  $("#importPreview").innerHTML = (errors.length ? `<div class="notice">${errors.slice(0, 8).map(esc).join("<br>")}</div>` : "")
    + (links.length ? `<h3>사업 연결 ${links.length}건</h3><table class="tbl"><thead><tr><th>사업</th><th>구분</th><th>업체</th><th></th></tr></thead><tbody>${links.map((r) => `<tr>
      <td class="small">${esc(r.project)}</td><td>${roleTag(r.role)} ${r.rank ? `<span class="stage">우선협상 ${r.rank}순위</span>` : ""}</td>
      <td><b>${esc(r.name)}</b></td><td class="small muted">${have.has(normName(r.name)) ? "기존 업체" : "신규"}</td></tr>`).join("")}</tbody></table>` : "")
    + (base.length ? `<h3>EDCF 주요 업체 ${base.length}곳 <span class="muted small">(신규 ${base.filter((r) => !have.has(normName(r.name))).length} · 기존 업데이트 ${base.filter((r) => have.has(normName(r.name))).length})</span></h3>
      <div class="chips">${Object.entries(cats).map(([k, v]) => `<span class="tag">${esc(k)} ${v}</span>`).join("")}</div>
      ${shortN.length ? `<div class="notice" style="margin-top:8px">2자 이하 이름 ${shortN.length}곳 (${shortN.slice(0, 12).map((r) => esc(r.name)).join(", ")}${shortN.length > 12 ? " …" : ""}) — 동명 기사가 섞이지 않도록 업종 관련 단어가 함께 나온 기사만 인정합니다.</div>` : ""}` : "")
    + (!links.length && !base.length && !errors.length ? `<div class="muted small">읽을 내용이 없습니다.</div>` : "");
  const n = links.length + base.length;
  $("#btnImportRun").disabled = !n;
  $("#btnImportRun").textContent = n ? `${n}건 등록하기` : "등록하기";
};
$("#btnImportRun").onclick = async () => {
  if (!parsed || !(parsed.links.length + parsed.base.length)) return;
  $("#btnImportRun").disabled = true;
  try {
    const b = parsed.base.length ? await registerBase(parsed.base) : { added: 0, updated: 0 };
    const r = parsed.links.length ? await registerRows(parsed.links) : { newP: 0, newC: 0 };
    toast(`등록 완료: 사업 ${r.newP}개 · 업체 ${r.newC + b.added}개 추가${b.updated ? ` · ${b.updated}개 업데이트` : ""}`, 5000);
    $("#importText").value = ""; $("#importPreview").innerHTML = ""; parsed = null; $("#btnImportRun").textContent = "등록하기";
    rerender();
  } catch (e) { toast("등록 실패: " + e.message, 6000); $("#btnImportRun").disabled = false; }
};

$("#rcForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const email = ev.target.email.value.trim();
  if (state.recipients.some((r) => r.email === email)) return toast("이미 등록된 주소입니다");
  const data = { email, active: true };
  const ref = await addDoc(collection(db, "recipients"), data);
  state.recipients.push({ id: ref.id, ...data });
  ev.target.reset(); renderSettings();
};

// ---------- EDCF 부정당업자 명단 (EXIMIIS 엑셀) ----------
// EXIMIIS – 경협 – 업무지원 – 부정당업자조회 엑셀 열: 업체명, 상태, 제재기간, 제재사유, 경협사업번호, 관련사업명, 관련사업국가, 부정당업자등록기관, 대표자명, 사업자번호, 법인등록번호, 주소
const EDCF_COLS = { 업체명: "name", 상태: "status", 제재기간: "period", 제재사유: "reason", 경협사업번호: "project_no", 관련사업명: "project_name", 관련사업국가: "country", 부정당업자등록기관: "agency", 등록기관: "agency", 대표자명: "ceo", 사업자번호: "biz_no", 사업자등록번호: "biz_no", 법인등록번호: "corp_no", 주소: "address" };
function rowsToEdcf(rows) {
  const hi = rows.findIndex((r) => r.some((x) => String(x ?? "").replace(/\s/g, "") === "업체명"));
  if (hi < 0) throw new Error("'업체명' 열 제목을 찾지 못했습니다. EXIMIIS에서 내려받은 엑셀 그대로 올려주세요.");
  const head = rows[hi].map((x) => EDCF_COLS[String(x ?? "").replace(/\s/g, "")] || null);
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const e = {};
    head.forEach((k, i) => { if (k && r[i] != null && String(r[i]).trim()) e[k] = String(r[i]).trim(); });
    if (!e.name) continue;
    if (e.biz_no) e.biz_no = e.biz_no.replace(/\D/g, "") || null;
    out.push(e);
  }
  return out;
}
function loadScript(urls) {
  return urls.reduce((p, u) => p.catch(() => new Promise((ok, no) => { const s = document.createElement("script"); s.src = u; s.onload = ok; s.onerror = no; document.head.appendChild(s); })), Promise.reject());
}
async function readExcel(file) {
  if (!window.XLSX) await loadScript(["https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js", "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"]);
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
  return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
}
function edcfMatches(list) {
  const byBiz = new Map(), byName = new Map();
  for (const c of state.companies) { if (c.biz_no) byBiz.set(String(c.biz_no).replace(/\D/g, ""), c); byName.set(normName(cleanCompanyName(c.name).name), c); }
  return list.map((e) => ({ e, c: (e.biz_no && byBiz.get(e.biz_no)) || byName.get(normName(cleanCompanyName(e.name).name)) })).filter((x) => x.c);
}
function edcfPreview(list) {
  const active = list.filter((e) => /등록/.test(e.status || "")).length;
  const hits = edcfMatches(list);
  modal(`<h2>EDCF 부정당업자 명단 확인</h2>
    <p><b>${list.length}건</b> · 등록 ${active} · 해지 ${list.length - active} · 사업자번호 있음 ${list.filter((e) => e.biz_no).length}</p>
    ${hits.length ? `<div class="notice">우리 명단과 일치하는 업체 <b>${hits.length}곳</b>: ${hits.slice(0, 10).map((x) => `${esc(x.c.name)} (${esc(x.e.status || "-")})`).join(", ")}${hits.length > 10 ? " …" : ""}</div>` : `<p class="muted small">현재 우리 명단과 일치하는 업체는 없습니다.</p>`}
    <div class="import-preview"><table class="tbl"><thead><tr><th>업체명</th><th>상태</th><th>제재기간</th><th>사업자번호</th></tr></thead><tbody>
      ${list.slice(0, 50).map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(e.status || "")}</td><td class="small">${esc(e.period || "")}</td><td class="small">${esc(fmtBiz(e.biz_no))}</td></tr>`).join("")}
    </tbody></table>${list.length > 50 ? `<div class="muted small">외 ${list.length - 50}건</div>` : ""}</div>
    <p class="muted small">반영하면 기존 EDCF 명단을 이 내용으로 <b>교체</b>합니다. 다음 스캔부터 대조합니다.</p>
    <div class="actions"><button class="btn primary" id="edcfSave">명단 반영</button></div>`);
  $("#edcfSave").onclick = async () => {
    $("#edcfSave").disabled = true;
    try {
      const old = await getDocs(collection(db, "edcf_sanctions"));
      const ops = [...old.docs.map((d) => ["del", d.ref]), ...list.map((e) => ["set", doc(collection(db, "edcf_sanctions")), e])];
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach(([op, ref, data]) => op === "del" ? batch.delete(ref) : batch.set(ref, data));
        await batch.commit();
      }
      const meta = { edcf_sanctions_at: nowStr(), edcf_sanctions_count: list.length, edcf_sanctions_by: me() };
      await setDoc(doc(db, "meta", "settings"), meta, { merge: true });
      Object.assign(state.settings, meta); state.edcf = list;
      closeModal(); toast(`EDCF 명단 ${list.length}건을 반영했습니다. 다음 스캔부터 대조합니다`, 5000); rerender();
    } catch (e) { toast("저장 실패: " + e.message, 6000); $("#edcfSave").disabled = false; }
  };
}
$("#edcfFile").addEventListener("change", async (ev) => {
  const f = ev.target.files[0]; ev.target.value = "";
  if (!f) return;
  try {
    let rows;
    if (/\.csv$/i.test(f.name)) rows = (await f.text()).split(/\r?\n/).map((l) => l.split(",").map((x) => x.replace(/^"|"$/g, "")));
    else rows = await readExcel(f);
    const list = rowsToEdcf(rows);
    if (!list.length) throw new Error("업체 행이 없습니다");
    edcfPreview(list);
  } catch (e) {
    errorModal("엑셀을 읽지 못했습니다", e.message || String(e), [
      "사내 문서보안(DRM)이 걸린 파일은 브라우저에서 열 수 없습니다 → 엑셀에서 표 전체를 복사해 <b>[붙여넣기로 입력]</b>을 이용하세요",
      "엑셀에서 '다른 이름으로 저장 → CSV (쉼표로 분리)'로 저장해 올려도 됩니다",
      "회사망에서 엑셀 해석 도구(cdnjs.cloudflare.com)가 막혀 있을 수 있습니다 → 붙여넣기 이용"]);
  }
});
$("#edcfPasteBtn").onclick = () => {
  modal(`<h2>EDCF 부정당업자 명단 붙여넣기</h2>
    <p class="muted small">EXIMIIS 엑셀에서 <b>제목 줄(업체명, 상태, 제재기간 …)부터</b> 표 전체를 복사해 붙여넣으세요.</p>
    <textarea id="edcfText" placeholder="업체명	상태	제재기간	제재사유	경협사업번호	관련사업명	관련사업국가	부정당업자등록기관	대표자명	사업자번호	법인등록번호	주소"></textarea>
    <div class="actions"><button class="btn primary" id="edcfParse">확인</button></div>`);
  $("#edcfParse").onclick = () => {
    try {
      const list = rowsToEdcf($("#edcfText").value.split(/\r?\n/).map((l) => l.split("\t")));
      if (!list.length) throw new Error("업체 행이 없습니다");
      edcfPreview(list);
    } catch (e) { toast(e.message, 5000); }
  };
};
function renderEdcfInfo() {
  const st = state.settings || {}, list = state.edcf, hits = edcfMatches(list);
  const active = list.filter((e) => /등록/.test(e.status || "")).length;
  $("#edcfInfo").innerHTML = !list.length ? "아직 등록된 명단이 없습니다."
    : `${list.length}건 (등록 ${active} · 해지 ${list.length - active}) · ${esc(st.edcf_sanctions_at || "")} 반영${st.edcf_sanctions_by ? ` (${esc(st.edcf_sanctions_by.split("@")[0])})` : ""}
       ${hits.length ? `<div style="margin-top:6px;color:var(--red)">우리 명단과 일치 ${hits.length}곳: ${hits.slice(0, 8).map((x) => esc(x.c.name)).join(", ")}</div>` : `<div style="margin-top:6px">우리 명단과 일치하는 업체 없음</div>`}`;
}

// ---------- 연결 상태 (카테고리별) ----------
function renderConnections() {
  const s = state.status, c = s.connections || {}, known = !!s.connections, st = state.settings || {};
  const lists = s.sanction_lists ? Object.entries(s.sanction_lists) : [];
  const listOk = lists.length && lists.every(([, v]) => !/오류/.test(String(v)));
  const lastScanH = s.last_scan_at ? (Date.now() - Date.parse(s.last_scan_at.replace(" ", "T") + "+09:00")) / 3600e3 : null;
  // [이름, 상태(ok/warn/off/unknown), 설명, 미설정 시 할 일]
  const B = (v) => !known ? "unknown" : v ? "ok" : "off";
  const groups = [
    ["실행·저장", [
      ["Firebase (데이터 저장·로그인)", "ok", "이 화면이 보이면 정상"],
      ["GitHub Actions 매일 자동 스캔", lastScanH == null ? "unknown" : lastScanH < 26 ? "ok" : "warn",
        lastScanH == null ? "아직 실행 기록 없음" : `마지막 스캔 ${s.last_scan_at.slice(5, 16)}${lastScanH >= 26 ? " — 하루 넘게 안 돌았습니다" : ""}`,
        "GitHub 웹에서 .github/workflows/monitor.yml을 한 번 열어 수정·커밋(예약 실행 활성화)"],
      ["즉시 실행 중계 (Google Apps Script)", st.relay_url ? "ok" : "off",
        st.relay_url ? "[지금 스캔]이 1~2분 안에 시작됩니다" : "없으면 [지금 스캔]이 GitHub 예약 확인(10분 간격, 지연 잦음)까지 대기",
        "tools/relay.gs를 Apps Script에 붙여넣고 웹 앱으로 배포 → 아래에 주소 저장"],
    ]],
    ["뉴스", [
      ["Google 뉴스", B(c.google_news ?? true), "키 불필요"],
      ["네이버 뉴스", B(c.naver), "Secret NAVER_APIHUB_KEY_ID / NAVER_APIHUB_KEY", "네이버 클라우드 콘솔 → NAVER API HUB → 검색(뉴스) 키 발급 → GitHub Secrets 등록"],
    ]],
    ["공식 제재 명단", [
      ["EDCF 부정당업자 (EXIMIIS)", state.edcf.length ? "ok" : "off", state.edcf.length ? `${state.edcf.length}건 · ${st.edcf_sanctions_at || ""}` : "엑셀 업로드 필요", "왼쪽 'EDCF 부정당업자 명단'에 EXIMIIS 엑셀 올리기"],
      ["조달청 나라장터 부정당제재", B(c.pps), "Secret DATA_GO_KR_KEY · 사업자번호로 현재 유효한 제재 조회", "공공데이터포털 '나라장터 사용자정보 서비스' 활용신청 → Decoding 키를 Secret 등록"],
      ["MDB 상호제재 (WB·ADB·AfDB·IDB·EBRD)", !lists.length ? "unknown" : listOk ? "ok" : "warn", lists.length ? lists.map(([k, v]) => `${MDB_NAME[k] || k} ${v}`).join(" · ") : "스캔 때 자동으로 내려받음 (OpenSanctions)"],
    ]],
    ["업체 식별", [
      ["DART 기업정보", B(c.dart), "Secret DART_API_KEY · 사업자번호·영문명 자동 채움 (상장사 + 공시 대상 비상장사)", "opendart.fss.or.kr 인증키 신청 → Secret 등록"],
      ["나라장터 업체 기본정보", B(c.pps), "조달청 키로 함께 사용 · 영문명·대표자 보강"],
    ]],
    ["분석·알림", [
      ["AI 판정 (Claude)", B(c.claude), c.claude ? `모델 ${s.claude_model || ""} — 기사별 관련성·등급 판정` : "없으면 키워드 규칙으로 판정 (키워드 없는 기사는 놓칠 수 있음)", "console.anthropic.com에서 API 키 발급 → Secret ANTHROPIC_API_KEY"],
      ["메일 발송", B(c.smtp) === "ok" && !state.recipients.length ? "warn" : B(c.smtp), c.smtp ? `수신자 ${state.recipients.length}명` : "Secret SMTP_USER / SMTP_PASSWORD", "Gmail 앱 비밀번호 발급 → SMTP_USER(주소)·SMTP_PASSWORD Secret 등록 후 수신자 추가"],
    ]],
  ];
  const BADGE = { ok: `<span class="badge none">연결됨</span>`, warn: `<span class="badge yellow">확인 필요</span>`, off: `<span class="badge orange">미연결</span>`, unknown: `<span class="badge gray">확인 전</span>` };
  $("#connList").innerHTML = (known ? "" : `<div class="notice">아직 스캔이 실행되지 않아 GitHub 쪽 연결 상태는 첫 스캔 후 표시됩니다.</div>`)
    + groups.map(([g, rows]) => `<div class="conn-group"><h3>${g}</h3><div class="conn-list">${rows.map(([k, stt, d]) => `<div class="conn"><div><div class="k">${k}</div><div class="d">${esc(d)}</div></div>${BADGE[stt]}</div>`).join("")}</div></div>`).join("")
    + `<div class="conn-group"><h3>즉시 실행 중계 주소</h3>
        <div class="add-row" style="margin:0"><input id="relayUrl" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(st.relay_url || "")}"><button class="btn sm" id="relaySave">저장</button><button class="btn sm" id="relayTest">연결 테스트</button></div>
        <div class="muted small" style="margin-top:6px">개인망에서만: ${ghToken() ? `GitHub 토큰 등록됨 <button class="btn sm ghost" id="tokClear">삭제</button>` : `GitHub 토큰을 등록하면 바로 시작 <button class="btn sm ghost" id="tokSet">등록</button>`} (회사망은 api.github.com 차단)</div></div>
      <div class="conn-group"><h3>수동 실행</h3><div class="add-row" style="margin:0">
        <button class="btn sm" id="runTestMail">테스트 메일 받기 (내 주소)</button>
        <button class="btn sm" id="runMailAll">수신자 전체 발송</button>
        <button class="btn sm" id="runDart">DART 기업목록 갱신</button></div></div>`;
  // 추가로 연결할 것
  const todo = groups.flatMap(([g, rows]) => rows.filter(([, stt, , how]) => how && (stt === "off" || stt === "warn")).map(([k, , , how]) => ({ g, k, how })));
  $("#todo").innerHTML = !todo.length ? "" : `<div class="todo"><b>추가로 연결할 것 ${todo.length}개</b><ol>${todo.map((t) => `<li><b>${esc(t.k)}</b> <span class="muted">(${t.g})</span> — ${esc(t.how)}</li>`).join("")}</ol></div>`;

  $("#tokSet")?.addEventListener("click", () => tokenSetup(() => renderConnections()));
  $("#tokClear")?.addEventListener("click", () => { setGhToken(""); toast("토큰을 삭제했습니다"); renderConnections(); });
  $("#runTestMail").onclick = () => runWorkflow({ task: "report-test", test_to: me() }, "테스트 메일 발송");
  $("#runMailAll").onclick = () => { if (confirm("등록된 수신자 전체에게 지금 리포트를 보낼까요?")) runWorkflow({ task: "report" }, "리포트 발송"); };
  $("#runDart").onclick = () => runWorkflow({ task: "dart" }, "DART 기업목록 갱신");
  $("#relaySave").onclick = async () => {
    const url = $("#relayUrl").value.trim();
    if (url && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) return toast("웹 앱 URL은 https://script.google.com/macros/s/…/exec 형식입니다", 5000);
    await setDoc(doc(db, "meta", "settings"), { relay_url: url || null }, { merge: true });
    state.settings = { ...(state.settings || {}), relay_url: url || null };
    toast(url ? "저장했습니다. [연결 테스트]로 확인하세요" : "중계 주소를 지웠습니다"); renderConnections();
  };
  $("#relayTest").onclick = async () => {
    const url = $("#relayUrl").value.trim();
    if (!url) return toast("주소를 먼저 입력하세요");
    try {
      const d = await (await fetch(url)).json();
      toast(d.service === "edcf-relay" ? (d.token ? "중계기 연결됨 (GitHub 토큰 설정됨)" : "중계기는 연결됐지만 스크립트 속성에 GITHUB_TOKEN이 없습니다") : "응답이 올바르지 않습니다", 5000);
    } catch (e) { errorModal("중계기에 연결하지 못했습니다", e.message, ["배포 시 <b>액세스 권한: 모든 사용자</b>로 했는지 확인", "웹 앱 URL(…/exec)을 정확히 복사했는지 확인", "회사망에서 script.google.com이 막혀 있을 수 있음"]); }
  };
}
const DEFAULT_KEYWORDS = [
  ["부정당", "red", "ko", 1], ["입찰참가자격", "red", "ko", 0], ["참가자격제한", "red", "ko", 0], ["입찰참가제한", "red", "ko", 0], ["입찰제한", "red", "ko", 0],
  ["입찰 참가 제한", "red", "ko", 0], ["영업정지", "red", "ko", 0], ["회생절차", "red", "ko", 0], ["법정관리", "red", "ko", 0], ["부도", "red", "ko", 0],
  ["담합", "orange", "ko", 1], ["과징금", "orange", "ko", 1], ["압수수색", "orange", "ko", 1], ["기소", "orange", "ko", 0], ["구속", "orange", "ko", 0],
  ["뇌물", "orange", "ko", 1], ["횡령", "orange", "ko", 1], ["배임", "orange", "ko", 0], ["허위", "orange", "ko", 0], ["공정위", "orange", "ko", 0], ["제재", "orange", "ko", 1],
  ["등록말소", "orange", "ko", 0],
  ["의혹", "yellow", "ko", 0], ["고발", "yellow", "ko", 0], ["벌점", "yellow", "ko", 0], ["시정명령", "yellow", "ko", 0], ["중대재해", "yellow", "ko", 0], ["부실시공", "yellow", "ko", 0], ["소송", "yellow", "ko", 0], ["재해", "yellow", "ko", 0], ["위반", "yellow", "ko", 0],
  ["debar", "red", "en", 0], ["sanction", "orange", "en", 0], ["bribery", "orange", "en", 0], ["corruption", "orange", "en", 0], ["fraud", "orange", "en", 0],
  ["collusion", "orange", "en", 0], ["bid rigging", "orange", "en", 0], ["korupsi", "orange", "id", 0], ["tersangka", "orange", "id", 0], ["suap", "orange", "id", 0],
];
const KEYWORDS_VERSION = 3; // 3: 팀 매뉴얼 언론보도 키워드(재해·위반) 추가
async function loadDefaultKeywords() {
  // 처음이면 전체, 이미 있으면 새로 추가된 기본 키워드만 1회 보탬 (사용자가 지운 키워드는 되살리지 않음)
  const have = new Set(state.keywords.map((k) => k.word));
  const batch = writeBatch(db);
  for (const [word, level, lang, q] of DEFAULT_KEYWORDS) {
    if (have.has(word)) continue;
    const ref = doc(collection(db, "keywords"));
    const data = { word, level, lang, use_in_query: q };
    batch.set(ref, data); state.keywords.push({ id: ref.id, ...data });
  }
  batch.set(doc(db, "meta", "settings"), { keywords_version: KEYWORDS_VERSION }, { merge: true });
  await batch.commit();
  state.settings = { ...(state.settings || {}), keywords_version: KEYWORDS_VERSION };
}
$("#kwForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const word = String(fd.get("word")).trim();
  if (!word || state.keywords.some((k) => k.word === word)) return toast("이미 있는 키워드입니다");
  const data = { word, level: fd.get("level"), lang: fd.get("lang"), use_in_query: 0 };
  const ref = await addDoc(collection(db, "keywords"), data);
  state.keywords.push({ id: ref.id, ...data });
  ev.target.reset(); renderAdvanced();
};
function renderAdvanced() {
  const KIND = { scan: "스캔", report: "메일 발송", dart: "DART" };
  if (!$("#view-settings details.more-card")?.open) return; // 고급 설정을 펼쳤을 때만 그림
  $("#runList").innerHTML = state.runs.map((r) => `<div class="run"><b>${esc(KIND[r.kind] || r.kind)}</b> · ${esc(r.at)} ${r.ok ? `<span class="badge none">정상</span>` : `<span class="badge orange">일부 오류</span>`}<pre>${esc(JSON.stringify(r.detail, null, 1)).slice(0, 1200)}</pre></div>`).join("") || `<div class="muted small">아직 실행 기록이 없습니다.</div>`;
  $("#kwList").innerHTML = [...state.keywords].sort((a, b) => (LV[b.level] - LV[a.level]) || a.word.localeCompare(b.word))
    .map((k) => `<span class="kchip">${badge(k.level)} ${esc(k.word)}<button data-del-kw="${k.id}" title="삭제">✕</button></span>`).join("");
  $$("[data-del-kw]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "keywords", b.dataset.delKw)); state.keywords = state.keywords.filter((k) => k.id !== b.dataset.delKw); renderAdvanced(); });
  loadReportPreview();
}
$("#view-settings details.more-card").addEventListener("toggle", (e) => { if (e.target.open) renderAdvanced(); });
async function loadReportPreview() {
  const snap = await getDoc(doc(db, "meta", "report_preview"));
  const d = snap.exists() ? snap.data() : null;
  $("#reportFrame").srcdoc = d?.html || `<p style="font-family:sans-serif;color:#667085;padding:24px">스캔을 한 번 실행하면 메일 미리보기가 만들어집니다.</p>`;
  $("#reportMeta").textContent = d ? `${d.generated_at} 생성 · 신규 ${d.items}건` : "";
}
