// EDCF 부정당업자 모니터링 — GitHub Pages + Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ALLOWED_EMAILS, GITHUB_REPO } from "./firebase-config.js?v=20";

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
const byRole = (es) => [...es].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
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
  if (window.__DEMO && !$(".demo-banner")) $("#appView").insertAdjacentHTML("afterbegin", `<div class="demo-banner">DEMO · 가상 데이터로 보는 화면입니다 (실제 업체·Firebase와 연결되지 않음) · <a href="./">실제 화면으로</a></div>`);
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
    c.cat = normCat(c.category); // 업종이 아직 없으면 화면에는 이름으로 추정해 보여줌 (스캔 때 DART 업종으로 저장)
    c.catGuess = !c.cat; if (!c.cat) c.cat = guessCat(c.name) || guessCat(c.name_en) || "기타";
    c.mine = !!c.watch || c.engagements.some((e) => { const p = state.projects.find((x) => x.id === e.project_id); return p && isMine(p); });
    const fs = state.findings.filter((f) => f.company_id === c.id && f.status !== "dismissed");
    c.risk = fs.reduce((m, f) => (LV[f.level] || 0) > (LV[m] || 0) ? f.level : m, "none");
    c.open = groupFindings(fs.filter((f) => f.status === "new")).length; // 같은 이슈는 1건
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
  renderLive();
  v === "home" ? renderHome() : v === "companies" ? renderCompanies() : renderSettings();
}
const rerender = () => { compute(); showView($("#tabs button.active")?.dataset.view || "home"); if (state.openCid && $("#drawer").classList.contains("open")) openCompany(state.openCid); };
// 글자 크기: 상단 [가] 버튼으로 보통 → 크게 → 아주 크게 (모든 탭 같은 비율로)
const FONT_STEPS = [["", "가", "글자 크기: 보통"], ["lg", "가+", "글자 크기: 크게"], ["xl", "가++", "글자 크기: 아주 크게"]];
let fontStep = 0;
try { fontStep = Math.max(0, FONT_STEPS.findIndex(([k]) => k === (localStorage.getItem("edcf_font") || ""))); } catch {}
function applyFont() {
  const [k, label, title] = FONT_STEPS[fontStep];
  if (k) document.documentElement.dataset.font = k; else delete document.documentElement.dataset.font;
  $("#btnFont").textContent = label; $("#btnFont").title = `${title} — 누르면 바뀝니다`;
  requestAnimationFrame(() => { if (typeof fixLabels === "function") fixLabels(); });
}
$("#btnFont").onclick = () => { fontStep = (fontStep + 1) % FONT_STEPS.length; try { localStorage.setItem("edcf_font", FONT_STEPS[fontStep][0]); } catch {} applyFont(); toast(FONT_STEPS[fontStep][2]); };
applyFont();
// 가벼운 모드: 화면이 버벅이면(초당 30프레임 미만) 레이더 파동·발광 효과를 자동으로 줄임
let liteSaved = null;
try { liteSaved = localStorage.getItem("edcf_lite"); } catch {}
function setLite(on, how) {
  document.documentElement.classList.toggle("lite", on);
  try { localStorage.setItem("edcf_lite", how); } catch {}
  liteSaved = how;
  const t = $("#liteToggle"); if (t) t.checked = on;
}
if (liteSaved === "1" || liteSaved === "auto") document.documentElement.classList.add("lite");
function checkSmooth() {
  if (liteSaved || state.smoothChecked || document.visibilityState !== "visible") return;
  state.smoothChecked = true;
  setTimeout(() => {
    let n = 0; const t0 = performance.now();
    const f = (t) => { n++; if (t - t0 < 2000) requestAnimationFrame(f); else if (n / ((t - t0) / 1000) < 30) { setLite(true, "auto"); console.info("가벼운 모드 자동 적용 (fps", Math.round(n / 2), ")"); } };
    requestAnimationFrame(f);
  }, 1500);
}
$("#liteToggle").checked = document.documentElement.classList.contains("lite");
$("#liteToggle").addEventListener("change", (e) => { setLite(e.target.checked, e.target.checked ? "1" : "0"); toast(e.target.checked ? "가벼운 모드를 켰습니다" : "화면 효과를 모두 켰습니다"); });
// 상단 '자동 감시' 표시: 마지막 스캔이 하루 넘게 지났으면 주황
function renderLive() {
  const s = state.status.last_scan_at, h = s ? (Date.now() - Date.parse(s.replace(" ", "T") + "+09:00")) / 3600e3 : null;
  const el = $("#liveState"), ok = h != null && h < 26;
  el.classList.toggle("warn", !ok);
  el.lastElementChild.textContent = h == null ? "스캔 전" : ok ? "자동 감시 중 · 매일 아침" : "자동 스캔 확인 필요";
  el.title = s ? `마지막 스캔 ${s}` : "";
}
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
function applyThemeLabel() { $("#btnTheme").textContent = document.documentElement.dataset.theme === "light" ? "☾ 다크" : "☀ 라이트"; }
$("#btnTheme").onclick = () => {
  const t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("edcf_theme3", t); } catch {}
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
const PERIODS = [["all", "전체"], ["today", "오늘·어제"], ["7d", "7일"], ["30d", "30일"], ["old", "과거 이력"]];
const pubMs = (f) => { const d = f.published_at ? Date.parse(String(f.published_at).slice(0, 10) + "T00:00:00+09:00") : NaN; return Number.isFinite(d) ? d : (f.first_seen_ms || Date.now()); };
// ---------- 같은 이슈 묶기 (monitor/grouping.py 와 같은 기준) ----------
// 같은 기사·같은 사건이 여러 건으로 보이지 않게 한 줄로 묶음. 묶인 기사는 펼쳐서 보고, 처리 버튼은 묶음 전체에 적용
//  ① 제목이 같거나(매체 꼬리·[단독] 같은 머리표 제외) 원문 주소가 같은 기사 — 업체가 달라도 하나로 (업체 이름을 함께 표시)
//  ② 같은 업체 · 같은 분류(예: 입찰담합) · 보도일 3일 이내 — 여러 매체가 같은 사건을 보도한 경우
//  ③ 같은 업체 · 제목이 거의 같음 (업체명을 뺀 제목의 글자 쌍 60% 이상 일치)
//  ④ 같은 업체 · 같은 공식 명단의 기록 여러 건 (예: EDCF 제재 이력)
const normTitle = (t) => String(t || "").replace(/\s*[-|]\s*[^-|]{1,30}$/, "").replace(/\[[^\]]{1,12}\]/g, "").replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
const bigrams = (x) => { const o = new Set(); for (let i = 0; i < x.length - 1; i++) o.add(x.slice(i, i + 2)); return o; };
function titleSim(a, b, name) {
  const n = String(name || "").replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
  let x = normTitle(a), y = normTitle(b);
  if (n) { x = x.split(n).join(""); y = y.split(n).join(""); }
  const A = bigrams(x), B = bigrams(y);
  if (!A.size || !B.size) return 0;
  let k = 0; A.forEach((g) => { if (B.has(g)) k++; });
  return 2 * k / (A.size + B.size);
}
const urlKey = (u) => { try { const x = new URL(u); return x.pathname.replace(/\//g, "") ? u : null; } catch { return null; } };
const isOfficial = (f) => (f.source_type || "news") !== "news";
function sameCompanyIssue(a, b) {
  if (isOfficial(a) || isOfficial(b)) return isOfficial(a) && isOfficial(b) && a.source_name === b.source_name;
  if (a.category && a.category !== "기타" && a.category === b.category && Math.abs(pubMs(a) - pubMs(b)) <= 3 * DAY + 3600e3) return true;
  return titleSim(a.title, b.title, a.company_name) >= 0.6;
}
const issueRank = (a, b) => (LV[b.level] - LV[a.level]) || (isOfficial(b) - isOfficial(a)) || pubMs(b) - pubMs(a);
function groupFindings(list) {
  const parent = list.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (i, j) => { i = find(i); j = find(j); if (i !== j) parent[j] = i; };
  const buckets = new Map(), add = (k, i) => { if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(i); };
  list.forEach((f, i) => {
    const st = f.status || "new", t = normTitle(f.title), u = urlKey(f.url);
    if (t.length >= 8) add(`t|${st}|${t}`, i);
    if (u) add(`u|${st}|${u}`, i);
    add(`c|${st}|${f.company_id}`, i);
  });
  for (const [k, idx] of buckets) {
    if (k[0] !== "c") { idx.slice(1).forEach((j) => join(idx[0], j)); continue; }
    for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) if (sameCompanyIssue(list[idx[x]], list[idx[y]])) join(idx[x], idx[y]);
  }
  const m = new Map();
  list.forEach((f, i) => { const r = find(i); if (!m.has(r)) m.set(r, []); m.get(r).push(f); });
  return [...m.values()].map((items) => {
    items.sort(issueRank);
    const companies = []; items.forEach((f) => { if (!companies.some((c) => c.id === f.company_id)) companies.push({ id: f.company_id, name: f.company_name }); });
    return { rep: items[0], items, ids: items.map((f) => f.id), companies, newest: Math.max(0, ...items.map((f) => f.first_seen_ms || 0)) };
  }).sort((a, b) => issueRank(a.rep, b.rep));
}
const groupIn = (g, p) => g.items.some((f) => inPeriod(f, p));
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

// ---------- 대시보드 (한 화면) ----------
const ROLE_ABBR = { 컨설턴트: "컨", 본구매: "본", "F/S": "FS" };
// ---------- 리스크 레이더: 색 띠 = 등급(가운데일수록 위험), 주요 리스크 업체는 이름 표시 ----------
function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
const polar = (deg, r) => { const rad = (deg * Math.PI) / 180; return [50 + (Math.sin(rad) * r) / 2, 50 - (Math.cos(rad) * r) / 2]; };
const BANDS = { red: [8, 25], orange: [37, 52], yellow: [62, 74], none: [83, 93], pending: [70, 93] };
function renderRadar(cs) {
  const el = $("#radar"), sc = scanned();
  const n = { red: 0, orange: 0, yellow: 0, none: 0 };
  cs.forEach((c) => n[sc ? c.risk : "none"]++);
  const risky = sc ? cs.filter((c) => c.risk !== "none").sort((a, b) => (LV[b.risk] - LV[a.risk]) || b.open - a.open || a.name.localeCompare(b.name)) : [];
  const labeled = risky.slice(0, 6); // 이름은 가장 중요한 6곳만, 나머지는 마우스를 올리면
  const dot = (c, ang, lv, label) => {
    const [r0, r1] = BANDS[lv];
    const r = label ? (r0 + r1) / 2 : r0 + ((hash(c.id + "r") % 1000) / 1000) * (r1 - r0);
    const [x, y] = polar(ang, r), pids = c.engagements.map((e) => e.project_id).join(" ");
    const tip = `${c.name} · ${sc ? LEVEL[c.risk] : "스캔 전"}${c.open ? ` · 미확인 ${c.open}건` : ""}`;
    return `<button class="rdot ${lv}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--d:calc(${Math.round(ang)} * var(--sweep, 6s) / 360)" data-cid="${c.id}" data-pids="${pids}" data-tip="${esc(tip)}" aria-label="${esc(tip)}"></button>`
      + (label ? `<span class="rlabel ${lv} ${x >= 50 ? "r" : "l"}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%" data-cid="${c.id}" data-pids="${pids}">${esc(c.name)}</span>` : "");
  };
  // 이름표가 겹치지 않게 좌우를 번갈아 배치 (위쪽은 등급 글자 자리라 비움)
  const SLOTS = [100, 260, 145, 215, 62, 298];
  const dots = [
    ...labeled.map((c, i) => dot(c, SLOTS[i], c.risk, true)),
    ...risky.slice(6).map((c) => dot(c, 62 + (hash(c.id) % 236), c.risk, false)),
    ...cs.filter((c) => !risky.includes(c)).map((c) => dot(c, 32 + (hash(c.id) % 296), sc ? "none" : "pending", false)),
  ].join("");
  const t = (lv, y, label) => `<text class="bl ${lv}" x="100" y="${y}">${label} ${sc ? n[lv] : "-"}</text>`;
  el.innerHTML = `
    <svg class="grid" viewBox="0 0 200 200" aria-hidden="true">
      <circle class="band none" cx="100" cy="100" r="96"/><circle class="band yellow" cx="100" cy="100" r="79"/>
      <circle class="band orange" cx="100" cy="100" r="57"/><circle class="band red" cx="100" cy="100" r="31"/>
      <circle class="ring none" cx="100" cy="100" r="96"/><circle class="ring yellow" cx="100" cy="100" r="79"/>
      <circle class="ring orange" cx="100" cy="100" r="57"/><circle class="ring red" cx="100" cy="100" r="31"/>
      <line class="axis" x1="100" y1="4" x2="100" y2="196"/><line class="axis" x1="4" y1="100" x2="196" y2="100"/>
      ${t("none", 13, "정상")}${t("yellow", 33, "주의")}${t("orange", 55, "경고")}${t("red", 82, "위험")}
    </svg>
    <div class="sweep"></div><div class="radar-core"></div>
    ${dots}<div class="radar-tip hidden" id="radarTip"></div>`;
  const tip = $("#radarTip");
  $$(".rdot", el).forEach((d) => {
    d.addEventListener("mouseenter", () => { tip.textContent = d.dataset.tip; tip.style.left = d.style.left; tip.style.top = d.style.top; tip.classList.remove("hidden"); });
    d.addEventListener("mouseleave", () => tip.classList.add("hidden"));
  });
  $$("[data-cid]", el).forEach((d) => d.addEventListener("click", (e) => { e.stopPropagation(); openCompany(d.dataset.cid); }));
  el.onclick = () => radarBurst();
  el.classList.toggle("scanning", !!(state.job && !state.job.done));
  requestAnimationFrame(fixLabels);
  if (!state.radarIntro) { state.radarIntro = true; setTimeout(radarBurst, 350); } // 처음 열 때 한 번 훑기
}
// 이름표가 칸 밖으로 나가면 반대쪽으로, 다른 이름표와 겹치면 위아래로 비켜 놓기
function fixLabels() {
  const el = $("#radar");
  if (!el || !el.offsetWidth) return;
  const box = el.closest(".d-radar").getBoundingClientRect(), placed = [];
  const hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  $$(".rlabel", el).forEach((lb) => {
    lb.style.marginTop = "0px";
    let r = lb.getBoundingClientRect();
    if (r.right > box.right - 2 || r.left < box.left + 2) { lb.classList.toggle("r"); lb.classList.toggle("l"); r = lb.getBoundingClientRect(); }
    const h = r.height + 3;
    const dy = [0, h, -h, 2 * h, -2 * h, 3 * h].find((d) => {
      const m = { left: r.left, right: r.right, top: r.top + d, bottom: r.bottom + d };
      return m.top >= box.top && m.bottom <= box.bottom && !placed.some((p) => hit(m, p));
    }) ?? 0;
    lb.style.marginTop = dy + "px";
    placed.push({ left: r.left, right: r.right, top: r.top + dy, bottom: r.bottom + dy });
  });
}
let fixT = null;
window.addEventListener("resize", () => { clearTimeout(fixT); fixT = setTimeout(fixLabels, 150); });
function radarBurst() {
  const el = $("#radar");
  if (!el) return;
  el.classList.remove("burst"); void el.offsetWidth; el.classList.add("burst");
  clearTimeout(el._bt); el._bt = setTimeout(() => el.classList.remove("burst"), 2200);
}
// 사업에 마우스를 올리면 그 사업 업체만 레이더에서 강조
function focusProject(pid) {
  $$("#radar .rdot, #radar .rlabel").forEach((d) => d.classList.toggle("dim", !!pid && !(d.dataset.pids || "").split(" ").includes(pid)));
}

// ---------- 대시보드 ----------
const LEVEL_SHORT = { red: "제재·영업정지 등 직접 장애", orange: "최근 수사·담합·처분", yellow: "과거 이력·의혹·소송" };
const ICON_USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`;
const ICON_ORG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/></svg>`;
let levelFilter = null;
function renderHome() {
  const cs = scopeCompanies(), ps = scopeProjects(), s = state.status, sc = scanned();
  const ids = new Set(cs.map((c) => c.id));
  const mineN = state.companies.filter((c) => c.mine).length, myP = state.projects.filter(isMine).length;
  document.body.dataset.scope = scope;

  // 제목 · 보기 범위
  const now = new Date(Date.now() + 9 * 3600e3);
  $("#heroDate").textContent = `RISK BRIEFING · ${now.toISOString().slice(0, 10).replace(/-/g, ".")} (${weekday[now.getUTCDay()]})`;
  $("#sumSub").textContent = sc ? `마지막 스캔 ${s.last_scan_at.slice(5, 16).replace("-", "/")} · 매일 아침 자동 스캔` : "아직 스캔하지 않았습니다";
  $("#scopeSeg").innerHTML = !state.companies.length ? "" : [["mine", "내 담당 사업", mineN, ICON_USER], ["all", "EDCF 전체", state.companies.length, ICON_ORG]]
    .map(([k, l, cnt, ic]) => `<button data-s="${k}" class="sc-btn ${k} ${k === scope ? "active" : ""}"><span class="sc-ic">${ic}</span>${l}<span class="sc-n">${cnt}</span></button>`).join("");
  $$("#scopeSeg button").forEach((b) => b.onclick = () => { scope = b.dataset.s; levelFilter = null; try { localStorage.setItem("edcf_scope2", scope); } catch {} renderHome(); });
  $("#scopeDesc").textContent = !state.companies.length ? "" : scope === "mine"
    ? (myP ? `내가 담당하는 사업 ${myP}개에 참여한 업체 ${cs.length}곳` : "담당 사업이 없습니다 — 업체·사업 탭에서 [내 사업으로] 지정")
    : `등록된 업체 ${cs.length}곳 전체 (사업 ${ps.length}개 · 사업 미연결 업체 포함)`;

  if (!state.companies.length) showGuide(`<b>시작하기</b> — <b>업체·사업</b> 탭에서 [일괄 등록]으로 업체를 넣고 <b>지금 스캔</b>을 누르세요.`);
  else if (!sc) showGuide(`업체 ${cs.length}곳이 등록됐습니다. <b>지금 스캔</b>을 눌러 첫 스캔을 실행하세요.`);
  else showGuide("");

  // ① 리스크 업체: 위험·경고·주의를 한 판에 (숫자 · 해당 업체 · 등급 뜻)
  const open = state.findings.filter((f) => f.status === "new" && ids.has(f.company_id));
  const openG = groupFindings(open); // 같은 기사·같은 사건은 한 건으로
  const byLv = { red: [], orange: [], yellow: [], none: [] };
  cs.forEach((c) => byLv[c.risk].push(c));
  const riskyN = byLv.red.length + byLv.orange.length + byLv.yellow.length;
  const who = (l) => { const x = [...l].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)); return x.slice(0, 2).map((c) => c.name).join(" · ") + (x.length > 2 ? ` 외 ${x.length - 2}곳` : ""); };
  $("#kboard").innerHTML = `<div class="card-head"><h2>리스크 업체</h2><span class="muted small">${sc ? `${cs.length}곳 중 ${riskyN}곳` : "스캔 전"}</span></div>`
    + ["red", "orange", "yellow"].map((lv) => {
      const l = byLv[lv];
      return `<button class="rk ${lv} ${sc && l.length ? "on" : ""} ${levelFilter === lv ? "sel" : ""}" data-lv="${lv}" title="누르면 아래 이슈를 ${LEVEL[lv]}만 봅니다">
        <div class="rk-num">${sc ? `<span data-count="${l.length}">0</span>` : "-"}<small>곳</small></div>
        <div class="rk-lv">${LEVEL[lv]}</div>
        <div class="rk-names ${sc && l.length ? "" : "zero"}">${!sc ? "스캔 전" : l.length ? esc(who(l)) : "해당 업체 없음"}</div>
        <div class="rk-desc">${LEVEL_SHORT[lv]}</div></button>`;
    }).join("");
  // ② 확인할 이슈: 등급과 다른 '비고' 카드 (누르면 이슈 목록으로)
  const todayN = openG.filter((g) => groupIn(g, "today")).length;
  $("#noteCard").innerHTML = `<span class="nc-tag">비고</span>
    <div class="nc-num"><span data-count="${openG.length}">0</span><small>건</small></div>
    <div class="nc-t"><b>확인할 이슈</b><div>${!openG.length ? "모두 확인했습니다" : todayN ? `오늘·어제 새로 ${todayN}건` : "새로 들어온 이슈 없음"} · '확인했음·관련 없음' 처리 전</div></div>
    <span class="nc-go">이슈 목록 보기 ↓</span>`;
  const nums = [$("#kboard"), $("#noteCard")];
  if (!state.kpiAnimated) { state.kpiAnimated = true; nums.forEach(countUp); } // 숫자 올라가는 효과는 처음 한 번만
  else nums.forEach((el) => $$("[data-count]", el).forEach((e) => (e.textContent = e.dataset.count)));
  $$("#kboard .rk").forEach((b) => b.onclick = () => {
    levelFilter = levelFilter === b.dataset.lv ? null : b.dataset.lv;
    renderHome();
    if (levelFilter) $("#issuesCard").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#noteCard").onclick = () => { levelFilter = null; renderHome(); $("#issuesCard").scrollIntoView({ behavior: "smooth", block: "start" }); };

  // ③ 레이더
  renderRadar(cs);
  $("#radarCap").innerHTML = `<b>${scope === "mine" ? "내 담당" : "전체"} 업체 ${cs.length}곳</b> · 가운데로 갈수록 위험<br>점을 누르면 업체 상세, 빈 곳을 누르면 다시 훑어봅니다`;

  // ④ 확인이 필요한 이슈 (위험 → 공식 제재 → 최신)
  const counts = Object.fromEntries(PERIODS.map(([k]) => [k, openG.filter((g) => groupIn(g, k)).length]));
  if (!period || !counts.hasOwnProperty(period)) period = counts.today ? "today" : "all";
  $("#periodSeg").innerHTML = PERIODS.map(([k, label]) => `<button data-p="${k}" class="${k === period ? "active" : ""}">${label} <span class="n">${counts[k]}</span></button>`).join("");
  $$("#periodSeg button").forEach((b) => b.onclick = () => { period = b.dataset.p; try { localStorage.setItem("edcf_period", period); } catch {} renderHome(); });
  const shown = openG.filter((g) => groupIn(g, period) && (!levelFilter || g.rep.level === levelFilter));
  $("#issueCount").textContent = openG.length;
  $("#levelNote").innerHTML = levelFilter ? `<button class="chip-x" id="clearLv">${LEVEL[levelFilter]} 이슈만 보는 중 · 모두 보기 ✕</button>` : "";
  $("#clearLv")?.addEventListener("click", () => { levelFilter = null; renderHome(); });
  if (shown.length) renderGroups(shown, $("#feed"));
  else $("#feed").innerHTML = !sc ? `<div class="empty">스캔 후 이곳에 이슈가 출처와 함께 표시됩니다.</div>`
    : openG.length ? `<div class="ok-box">이 조건에는 확인할 이슈가 없습니다 <span class="muted small">(전체 ${openG.length}건)</span></div>`
    : `<div class="ok-box">확인이 필요한 이슈가 없습니다</div>`;
  const done = state.findings.filter((f) => f.status === "reviewed" && ids.has(f.company_id)).sort(byLevelDate);
  $("#doneWrap").classList.toggle("hidden", !done.length);
  if (done.length) renderFeed(done, $("#feedDone"));

  // ⑤ 담당 사업 (위험 업체가 많은 사업부터)
  $("#projTitle").textContent = scope === "mine" ? "내 담당 사업" : "전체 사업";
  $("#projN").textContent = ps.length;
  const tally = (p) => { const t = { red: 0, orange: 0, yellow: 0, none: 0 }; state.companies.forEach((c) => { if (c.engagements.some((e) => e.project_id === p.id)) t[c.risk]++; }); return t; };
  const tl = Object.fromEntries(ps.map((p) => [p.id, tally(p)]));
  const psSorted = [...ps].sort((a, b) => !sc ? a.name.localeCompare(b.name)
    : (tl[b.id].red - tl[a.id].red) || (tl[b.id].orange - tl[a.id].orange) || (tl[b.id].yellow - tl[a.id].yellow) || a.name.localeCompare(b.name));
  $("#projectMap").innerHTML = psSorted.map((p) => projectRow(p)).join("")
    || `<div class="empty small">${scope === "mine" ? "내가 담당하는 사업이 없습니다." : "등록된 사업이 없습니다."}</div>`;
  $$("#projectMap .pj").forEach((r) => { r.addEventListener("mouseenter", () => focusProject(r.dataset.pid)); r.addEventListener("mouseleave", () => focusProject(null)); });
  $$("#projectMap [data-cid]").forEach((x) => x.addEventListener("click", () => openCompany(x.dataset.cid)));

  // ⑥ 데이터 점검 (검사 범위·EDCF 명단·MDB 한국 국적) — 누르면 상세
  const cv = coverage(cs), gapN = cs.filter((c) => c.last_check && checkGaps(c).length).length;
  const warnN = gapN + (state.edcf.length ? 0 : 1);
  $("#dataCheck").innerHTML = !sc ? "" : `<button class="dcheck" id="btnDataCheck"><span class="dot ${warnN ? "orange" : "none"}"></span>데이터 점검 · ${warnN ? `보완 필요 ${warnN}` : "이상 없음"}<span class="go">무엇을 검사했나 ›</span></button>`;
  $("#btnDataCheck")?.addEventListener("click", () => showDataCheck(cs, cv, gapN));
  renderJob(); checkSmooth();
}
// 사업 한 줄: 업체 등급 분포(막대) + 등급별 업체 수. '하나라도 위험이면 사업 전체가 위험'처럼 보이지 않게
function projectRow(p) {
  const rows = [];
  for (const c of state.companies) c.engagements.forEach((e) => { if (e.project_id === p.id) rows.push({ c, e }); });
  rows.sort((a, b) => ROLE_ORDER.indexOf(a.e.role) - ROLE_ORDER.indexOf(b.e.role));
  const sc = scanned(), t = { red: 0, orange: 0, yellow: 0, none: 0 };
  new Set(rows.map((r) => r.c)).forEach((c) => t[c.risk]++);
  const total = t.red + t.orange + t.yellow + t.none;
  const bar = !total ? "" : !sc ? `<i class="pending" style="flex:1"></i>`
    : ["red", "orange", "yellow", "none"].filter((lv) => t[lv]).map((lv) => `<i class="${lv}" style="flex:${t[lv]}" title="${LEVEL[lv]} ${t[lv]}곳"></i>`).join("");
  const sum = !total ? `<span class="tot">연결된 업체 없음</span>`
    : !sc ? `<span class="tot">업체 ${total}곳 · 스캔 전</span>`
    : (["red", "orange", "yellow"].filter((lv) => t[lv]).map((lv) => `<span class="${lv}">${LEVEL[lv]} ${t[lv]}</span>`).join("") || `<span class="ok">이상 없음</span>`) + `<span class="tot">/ ${total}곳</span>`;
  return `<div class="pj" data-pid="${p.id}">
    <div class="pj-top"><span class="pj-name" title="${esc(p.name)}">${esc(p.name)}</span>${p.country ? `<span class="pj-ctry">${esc(COUNTRY[p.country] || p.country)}</span>` : ""}</div>
    ${total ? `<div class="pj-dist"><div class="pj-bar">${bar}</div><div class="pj-sum">${sum}</div></div>` : `<div class="pj-dist"><div class="pj-sum">${sum}</div></div>`}
    <div class="pcos">${rows.map(({ c, e }) => `<span class="cchip ${sc ? c.risk : ""}" data-cid="${c.id}" title="${esc(e.role)}${e.stage && e.stage !== "계약" ? " · " + esc(e.stage) : ""}"><span class="dot ${sc ? c.risk : ""}"></span>${esc(c.name)}<small>${ROLE_ABBR[e.role] || esc(e.role)}${e.rank ? " " + e.rank + "순위" : ""}</small></span>`).join("")}</div>
  </div>`;
}
function showDataCheck(cs, cv, gapN) {
  const row = (ok, k, d) => `<div class="chk-row ${ok}"><span class="ic">${{ ok: "✓", warn: "!", bad: "✕", na: "–" }[ok]}</span><div><b>${k}</b><div class="d">${d}</div></div></div>`;
  const st = (k, t) => !t ? "na" : k === t ? "ok" : k === 0 ? "bad" : "warn";
  const mk = state.mdbKorea;
  modal(`<h2>데이터 점검</h2>
    <p class="muted small">마지막 스캔에서 업체별로 무엇을 확인했는지입니다. '정상'은 아래 범위에서 발견되지 않았다는 뜻입니다.</p>
    ${row(st(cv.news, cv.scanned), "뉴스 검색", `${cv.news}/${cv.scanned}곳 — Google·네이버 뉴스에서 업체명과 제재 키워드 검색`)}
    ${row(st(cv.mdb, cv.scanned), "MDB 제재 리스트 대조", `${cv.mdb}/${cv.scanned}곳 — World Bank·ADB·AfDB·IDB·EBRD${cv.mdb < cv.scanned ? " (영문명이 없는 업체는 대조가 불완전)" : ""}`)}
    ${cv.ppsConnected ? row(st(cv.pps, cv.ppsTotal), "조달청 부정당제재 조회", `${cv.pps}/${cv.ppsTotal}곳 — 사업자번호로 현재 유효한 제재 조회${cv.pps < cv.ppsTotal ? " (사업자번호가 없는 업체는 조회 못 함)" : ""}`) : row("na", "조달청 부정당제재 조회", "미연결")}
    ${row(state.edcf.length ? "ok" : "warn", "EDCF 부정당업자 명단 (EXIMIIS)", state.edcf.length ? `${state.edcf.length}건과 대조` : "아직 등록되지 않음 → 설정에서 입력")}
    ${row(mk?.count ? "warn" : "ok", "MDB 한국 국적 제재 기업", mk ? `${mk.count || 0}곳 (우리 명단과 별개로 참고) <a href="#" id="dcMdb">목록 보기</a>` : "첫 스캔 후 표시")}
    ${gapN ? `<div class="actions left"><button class="btn sm" id="dcGaps">보완할 업체 ${gapN}곳 보기</button></div>` : ""}`);
  $("#dcMdb")?.addEventListener("click", (e) => { e.preventDefault(); showMdbKorea(); });
  $("#dcGaps")?.addEventListener("click", showGaps);
}

function showMdbKorea() {
  const mk = state.mdbKorea || {};
  modal(`<h2>MDB 한국 국적 제재 기업 <span class="count">${mk.count || 0}</span></h2>
    <p class="muted small">팀 매뉴얼: 영문명으로 MDB 제재 리스트 조회 후 결과가 없으면 국적 '대한민국'으로 최종 확인. World Bank·ADB·AfDB·IDB·EBRD 제재 리스트(OpenSanctions)에서 국적이 한국인 기업입니다. ${esc(mk.at || "")} 기준.</p>
    ${mk.items?.length ? `<div class="mk-list">${mk.items.map((e) => `<a class="mk-row" href="${esc(e.url)}" target="_blank" rel="noopener" title="${esc(e.sanctions || "")}"><span>${esc(e.name)}</span><span class="ds">${esc(MDB_NAME[e.dataset] || e.dataset)} ↗</span></a>`).join("")}</div>` : `<div class="empty">현재 한국 국적 제재 기업이 없습니다.</div>`}`);
}
const MDB_NAME = { worldbank_debarred: "World Bank", adb_sanctions: "ADB", afdb_sanctions: "AfDB", iadb_sanctions: "IDB", ebrd_ineligible: "EBRD" };

const ownerTag = (p) => `<span class="owner">${!p.owner ? "담당 미지정" : p.owner === me() ? "내 사업" : "담당 " + esc(p.owner.split("@")[0])}</span>`;

function findingHtml(g, showCompany = true) {
  const f = g.rep, more = g.items.slice(1);
  const official = isOfficial(f);
  const isNew = f.status === "new" && Date.now() - (g.newest || 0) < DAY;
  const why = [f.rationale && `판단 근거: ${f.rationale}`, f.title && `원문 제목: ${f.title}`].filter(Boolean).join("\n");
  const srcs = [...new Set(more.map((x) => String(x.source_name || "").replace(/\s*\((Google News|Naver|네이버)\)$/i, "")).filter(Boolean))];
  return `<div class="item lv-${f.level} ${f.status === "reviewed" ? "reviewed" : ""}" data-fid="${esc(f.id)}" data-fids="${esc(g.ids.join(","))}">
    <div class="item-head">
      ${badge(f.level)}
      ${showCompany ? g.companies.map((c) => `<span class="item-company" data-cid="${c.id}">${esc(c.name)}</span>`).join('<span class="co-sep">·</span>') : ""}
      ${official ? `<span class="tag official">${f.source_type === "manual" ? "수기 등록" : "공식 제재 명단"}</span>` : ""}
      ${f.category && f.category !== "기타" ? `<span class="tag">${esc(f.category)}</span>` : ""}
      ${isNew ? `<span class="new-pill">NEW</span>` : ""}
      <span class="item-age">${g.newest ? relTime(g.newest) : ""}</span>
    </div>
    <div class="item-summary">${esc(f.summary || f.title)}</div>
    <div class="item-meta">
      <span class="src">${esc(f.source_name || "-")} · ${esc(f.published_at || "날짜 미상")}${f.url ? ` · <a href="${esc(f.url)}" target="_blank" rel="noopener">원문 ↗</a>` : ""}${why ? ` · <span class="why" title="${esc(why)}">근거</span>` : ""}</span>
      <span class="item-actions">
        ${f.status !== "reviewed" ? `<button class="btn sm" data-act="reviewed" title="실제 이 업체의 리스크가 맞음 — 다음 AI 판정 때 참고 예시로 씁니다${more.length ? ` (같은 내용 ${g.items.length}건 함께)` : ""}">확인했음</button>` : ""}
        ${f.status !== "dismissed" ? `<button class="btn sm" data-act="dismissed" title="이 업체와 관계없음 — 다시 수집하지 않고, 다음 AI 판정 때 비슷한 기사를 걸러내는 예시로 씁니다${more.length ? ` (같은 내용 ${g.items.length}건 함께)` : ""}">관련 없음</button>` : ""}
        ${f.status && f.status !== "new" ? `<button class="btn sm ghost" data-act="new">되돌리기</button>` : ""}
      </span>
    </div>
    ${more.length ? `<details class="dup"><summary>같은 내용 ${more.length}건 더${srcs.length ? ` <span class="dup-src">${esc(srcs.slice(0, 3).join(" · "))}${srcs.length > 3 ? " 외" : ""}</span>` : ""}</summary>
      <div class="dup-list">${more.map((x) => `<div class="dup-row">${badge(x.level)}${showCompany && x.company_id !== f.company_id ? `<b>${esc(x.company_name)}</b>` : ""}
        ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.summary || "")}">${esc(x.title || x.summary || "-")}</a>` : `<span title="${esc(x.summary || "")}">${esc(x.title || x.summary || "-")}</span>`}
        <span class="muted">${esc(x.source_name || "")}${x.published_at ? " · " + esc(x.published_at) : ""}</span></div>`).join("")}</div></details>` : ""}
  </div>`;
}
// 이슈 목록: 같은 내용은 한 줄로 묶어서 표시
function renderFeed(list, el, showCompany = true) { renderGroups(groupFindings(list), el, showCompany); }
function renderGroups(groups, el, showCompany = true) {
  el.innerHTML = groups.map((g) => findingHtml(g, showCompany)).join("");
  $$(".item-company", el).forEach((x) => x.addEventListener("click", () => openCompany(x.dataset.cid)));
  $$("[data-act]", el).forEach((b) => b.addEventListener("click", async () => {
    const ids = b.closest(".item").dataset.fids.split(",").filter(Boolean), st = b.dataset.act;
    const patch = { status: st, reviewed_by: auth.currentUser.email, reviewed_at: nowStr() };
    b.disabled = true;
    const batch = writeBatch(db);
    ids.forEach((id) => batch.update(doc(db, "findings", id), patch));
    await batch.commit();
    ids.forEach((id) => Object.assign(state.findings.find((f) => f.id === id) || {}, patch));
    const both = ids.length > 1 ? ` (같은 내용 ${ids.length}건 함께)` : "";
    toast((st === "dismissed" ? "관련 없음 처리 — 다시 수집하지 않고, 다음 AI 판정 때 비슷한 기사를 걸러냅니다" : st === "reviewed" ? "확인 처리했습니다 — 다음 AI 판정 때 참고합니다" : "되돌렸습니다") + both, 4000);
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
    <div class="muted small">${byRole(c.engagements).map((e) => `${roleTag(e.role)} ${esc(projName(e.project_id))} ${stageTag(e)}`).join(" &nbsp; ") || "사업 미배정"}</div>`;
  $("#drawerBody").innerHTML = `
    <div class="muted small" style="margin-bottom:10px">${c.cat ? `${esc(c.cat)} · ` : ""}${c.focus ? "<b>집중 감시</b> — 매일 업체명 검색 + 주 1회 심층 검색" : "<b>기본 감시</b> — 매일 제재 키워드 기사·MDB 대조, 조달청 3일마다, 업체명 검색 주 1회"}</div>
    <div class="actions left" style="margin-top:0">
      <button class="btn primary" id="dScan">이 업체만 다시 스캔</button>
      ${c.engagements.length ? "" : `<button class="btn" id="dWatch">${c.watch ? "집중 감시 해제" : "집중 감시로 지정"}</button>`}
      <a class="btn" target="_blank" rel="noopener" href="https://search.naver.com/search.naver?where=news&query=${encodeURIComponent('"' + c.name + '"')}">네이버 뉴스 ↗</a>
    </div>

    <h2 style="margin-top:18px">이슈 <span class="count">${groupFindings(fs).length}</span></h2>
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
          <label>업종 <span class="muted">(${esc(c.catGuess ? "추정: " + c.cat : c.category_source || "명단")})</span><select name="category">${["", ...CATS].map((k) => `<option value="${k}" ${k === (c.catGuess ? "" : c.cat) ? "selected" : ""}>${k || "자동 분류 (DART·업체명)"}</option>`).join("")}</select></label>
          <label>메모<input name="note" value="${esc(c.note || "")}"></label>
        </div>
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
    if ((patch.category || "") !== (c.catGuess ? "" : c.cat)) {
      // 직접 고르면 그대로 유지, '자동'으로 되돌리면 우선 이름으로 추정하고 다음 스캔 때 DART 업종으로 다시 분류
      if (patch.category) patch.category_source = "직접 입력";
      else { patch.category = guessCat(c.name) || guessCat(patch.name_en) || "기타"; patch.category_source = "이름 추정"; }
      patch.cat_checked_at = null;
    } else delete patch.category;
    await updateDoc(doc(db, "companies", cid), patch); Object.assign(c, patch);
    toast("저장했습니다. 다음 스캔부터 적용됩니다"); rerender(); // 표와 상세를 함께 새로 그림
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
    : `${j.label}을(를) 요청했습니다. 보통 5분 안에 시작되고, 끝나면 자동으로 반영됩니다`, 5000);
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
        j.finishedAt = d.finished_at || null;
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
  $("#radar")?.classList.toggle("scanning", !!(j && !j.done));
  $("#btnStop").classList.toggle("hidden", !(j && !j.done && (j.mode === "queue" || j.runId)));
  $("#btnStop").disabled = !!j?.stopping;
  $("#btnStop").textContent = j?.stopping ? "중지하는 중…" : "중지";
  $("#btnScan").disabled = !!(j && !j.done);
  $("#btnScan").classList.toggle("busy", !!(j && !j.done));
  if (!el) return;
  if (!j) { el.innerHTML = ""; return; }
  const fmt = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return t < 60 ? `${t}초` : `${Math.floor(t / 60)}분 ${t % 60}초`; };
  if (j.done) {
    if (!j.hideT) j.hideT = setTimeout(() => { if (state.job === j) { state.job = null; renderJob(); } }, j.conclusion === "success" ? 20000 : 60000);
    const r = j.result || {}, at = (j.finishedAt || "").slice(11, 16);
    el.innerHTML = j.conclusion === "success"
      ? `<span class="jline ok">✓ ${at ? at + " " : ""}스캔 완료${r.seconds ? ` · ${Math.round(r.seconds)}초` : ""}${r.new_findings != null ? ` · 새 이슈 ${r.new_findings}건` : ""}</span>`
      : j.conclusion === "cancelled" ? `<span class="jline">중지됨 — 그때까지 검사한 결과는 반영</span>`
      : `<span class="jline bad">✕ ${j.status === "timeout" ? "응답 없음" : "실패"}${j.error ? `: ${esc(j.error.slice(0, 80))}` : ""} · <a href="${ACTIONS_URL}" target="_blank" rel="noopener">기록 ↗</a></span>`;
    return;
  }
  const wait = Date.now() - j.started, p = j.progress, running = j.status === "in_progress";
  const what = running
    ? (j.stopping ? "중지 요청됨" : p && p.total ? `스캔 중 ${p.done}/${p.total}` : "스캔 준비 중")
    : wait > 15 * 60e3 ? `대기 ${fmt(wait)} — 지연 중 (<a href="${ACTIONS_URL}" target="_blank" rel="noopener">GitHub에서 실행 ↗</a>)`
    : `시작 대기 · 보통 5분 안에 시작 (${fmt(wait)})`;
  const pct = running && p && p.total ? Math.round((p.done / p.total) * 100) : null;
  el.innerHTML = `<span class="jline"><span class="spinner"></span>${what}</span>${pct != null ? `<span class="jbar"><i style="width:${pct}%"></i></span>` : ""}`;
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
if (!window.__DEMO) try { const s = JSON.parse(localStorage.getItem(JOB_KEY) || "null"); if (s && Date.now() - s.started < 90 * 60e3) { state.job = { ...s, status: "queued" }; setTimeout(trackJob, 1500); } } catch {}

// ---------- 설정 (드래그 앤 드롭) ----------
const STAGES = ["계약", "우선협상", "입찰중"];
const ROLES = ["F/S", "컨설턴트", "본구매"]; // 사업 진행 순서

// ---------- 업종 분류 (monitor/category.py 와 같은 기준) ----------
const CATS = ["건설·시공", "엔지니어링·설계·감리", "ICT·시스템", "제조·플랜트", "상사·유통", "기타"];
const CAT_RULES = [
  ["엔지니어링·설계·감리", /엔지니어링|건설관리|ENG|E&C|이앤씨|기술단|기술공사|기술공단|기술원|설계|건축사|종합건축|감리|씨엠|CM|측량|항측|항업|공간정보|컨설턴트/i],
  ["건설·시공", /건설|토건|건영|종합개발|기업$|산업개발/i],
  ["ICT·시스템", /정보통신|정보기술|시스템|소프트|SDS|CNS|텔레콤|네트웍스|네트워크|통신|데이터|솔루션|유비텍|아이티|IT$|^KT$/i],
  ["제조·플랜트", /중공업|공업|조선|전기|전선|플랜트|기계|산전|기기|메디칼|제철|화학|자동차|로템|에너지|파워|에너빌리티|정밀/i],
  ["상사·유통", /상사|인터내셔널|무역|트레이딩|코퍼레이션|글로벌/i],
  ["기타", /대학교|산학협력단|연구원|연구소|교육|공사$|공단$|재단/i],
  ["엔지니어링·설계·감리", /기술$|기술개발$/i],
];
const guessCat = (name) => (CAT_RULES.find(([, re]) => re.test(name || "")) || [])[0] || null;
function normCat(cat) {
  const c = String(cat || "").trim();
  if (!c) return "";
  if (CATS.includes(c)) return c;
  if (c.includes("기타")) return ""; // '상사·교육·기타'처럼 묶인 이름은 업체별로 다시 분류
  for (const [t, re] of [["엔지니어링·설계·감리", /엔지니어링|설계|감리|CM/i], ["건설·시공", /건설|시공|토목/], ["ICT·시스템", /IT|ICT|시스템|통신|정보/i], ["제조·플랜트", /제조|플랜트|조선|전기|장비|기계/], ["상사·유통", /상사|유통|무역/]]) if (re.test(c)) return t;
  return "기타";
}
const CAT_SRC = { "DART 업종": "DART", "이름 추정": "추정", "명단": "명단", "직접 입력": "직접" };
const categories = () => CATS;
// 업종을 정하지 않았으면 이름으로 추정 (스캔 때 DART 업종코드가 있으면 그것으로 바꿈)
function applyCat(c, cat, source) {
  const n = normCat(cat);
  if (n) { c.category = n; c.category_source = source; }
  else if (!c.category) { c.category = guessCat(c.name) || guessCat(c.name_en) || "기타"; c.category_source = "이름 추정"; }
}

// ---------- 업체·사업 ----------
// 자주 쓰는 보기
const CO_VIEWS = [
  ["all", "전체", "등록된 모든 업체"],
  ["pre", "계약 전 점검", "입찰중·우선협상 단계 업체 — 부정당업자 확인이 가장 필요한 시점"],
  ["risk", "리스크 업체", "위험·경고·주의 업체"],
  ["open", "미확인 이슈", "'확인했음·관련 없음' 처리 전 이슈가 있는 업체"],
  ["info", "정보 보완 필요", "사업자번호 또는 영문명이 없어 조회가 불완전한 업체"],
];
const needInfo = (c) => (c.country === "KR" && !c.biz_no) || !c.name_en;
const inView = (c, v) => v === "all" ? true
  : v === "pre" ? c.engagements.some((e) => e.stage === "입찰중" || e.stage === "우선협상")
  : v === "risk" ? scanned() && c.risk !== "none"
  : v === "open" ? c.open > 0
  : v === "info" ? needInfo(c) : true;
const coState = { view: "all", sort: "risk", dir: 1 };
function poolMatches(c) {
  const q = ($("#poolSearch").value || "").trim().toLowerCase(), qd = q.replace(/\D/g, "");
  if (q && !(c.name.toLowerCase().includes(q) || (c.aliases || "").toLowerCase().includes(q) || (c.name_en || "").toLowerCase().includes(q) || (qd.length >= 3 && String(c.biz_no || "").includes(qd)))) return false;
  if (!inView(c, coState.view)) return false;
  const f = (id) => $(id).value;
  if (f("#fOwner") === "mine" && !c.mine) return false;
  const pj = f("#fProj");
  if (pj === "__none" && c.engagements.length) return false;
  if (pj && pj !== "__none" && !c.engagements.some((e) => e.project_id === pj)) return false;
  if (f("#fRole") && !c.engagements.some((e) => e.role === f("#fRole"))) return false;
  if (f("#fStage") && !c.engagements.some((e) => (e.stage || "계약") === f("#fStage"))) return false;
  if (f("#fRisk") && (scanned() ? c.risk : "none") !== f("#fRisk")) return false;
  if (f("#fCat") && (c.cat || "기타") !== f("#fCat")) return false;
  if (f("#fNat") === "KR" && c.country !== "KR") return false;
  if (f("#fNat") === "foreign" && c.country === "KR") return false;
  return true;
}
const CO_SORT = {
  name: (a, b) => a.name.localeCompare(b.name),
  cat: (a, b) => (a.cat || "").localeCompare(b.cat || "") || a.name.localeCompare(b.name),
  proj: (a, b) => b.engagements.length - a.engagements.length || a.name.localeCompare(b.name),
  risk: (a, b) => (LV[b.risk] - LV[a.risk]) || b.open - a.open || (b.engagements.length - a.engagements.length) || a.name.localeCompare(b.name),
  open: (a, b) => b.open - a.open || (LV[b.risk] - LV[a.risk]) || a.name.localeCompare(b.name),
};
function renderCompanies() {
  const sc = scanned();
  $("#coEyebrow").textContent = `COMPANIES · 업체 ${state.companies.length}곳 · 사업 ${state.projects.length}개`;
  // 필터 항목 (선택값 유지)
  const keep = (id, html) => { const v = $(id).value; $(id).innerHTML = html; if ([...$(id).options].some((o) => o.value === v)) $(id).value = v; };
  keep("#fProj", `<option value="">사업: 전체</option><option value="__none">사업 미연결 (EDCF 주요 업체)</option>` + state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join(""));
  keep("#fCat", `<option value="">업종: 전체</option>` + CATS.map((k) => `<option value="${k}">${k}</option>`).join(""));
  // 자주 쓰는 보기 (개수 표시)
  $("#coViews").innerHTML = CO_VIEWS.map(([k, l, d]) => `<button data-v="${k}" class="cv-btn ${k} ${k === coState.view ? "active" : ""}" title="${d}">${l}<span class="n">${state.companies.filter((c) => inView(c, k)).length}</span></button>`).join("");
  $$("#coViews button").forEach((b) => b.onclick = () => { coState.view = b.dataset.v; renderCompanies(); });
  $("#coViewDesc").textContent = CO_VIEWS.find(([k]) => k === coState.view)[2];

  const list = state.companies.filter(poolMatches).sort((a, b) => CO_SORT[coState.sort](a, b) * coState.dir);
  const anyFilter = ["#poolSearch", "#fOwner", "#fProj", "#fRole", "#fStage", "#fRisk", "#fCat", "#fNat"].some((id) => $(id).value);
  $("#fReset").classList.toggle("hidden", !anyFilter);
  $("#poolShown").textContent = list.length === state.companies.length ? `${list.length}곳` : `${state.companies.length}곳 중 ${list.length}곳`;
  $$("#coTable th[data-sort]").forEach((th) => th.classList.toggle("on", th.dataset.sort === coState.sort));
  const engChip = (e) => `<span class="ej" title="${esc(projName(e.project_id))} · ${esc(e.role)} · ${esc(e.stage || "계약")}">${roleTag(e.role)}<span class="ej-p">${esc(projName(e.project_id))}</span>${e.stage && e.stage !== "계약" ? `<span class="stage">${esc(e.stage)}${e.rank ? " " + e.rank + "순위" : ""}</span>` : ""}</span>`;
  $("#pool").innerHTML = !list.length ? `<tr><td colspan="7" class="empty">${state.companies.length ? "조건에 맞는 업체가 없습니다." : "업체가 없습니다. [일괄 등록] 또는 [+ 업체 추가]를 이용하세요."}</td></tr>`
    : list.map((c) => `<tr draggable="true" data-cid="${c.id}" title="끌어서 오른쪽 사업 칸에 놓기 · 누르면 상세">
      <td class="t-name"><span class="grip">⋮⋮</span><div><b>${esc(c.name)}</b>${c.watch ? ' <span class="muted" title="집중 감시">★</span>' : ""}${c.name_en ? `<div class="sub">${esc(c.name_en)}</div>` : ""}</div></td>
      <td class="t-cat">${esc(c.cat || "-")}${c.catGuess || c.category_source === "이름 추정" ? `<span class="src guess" title="업체명으로 추정 — 스캔 때 DART 업종이 있으면 바뀜">추정</span>` : CAT_SRC[c.category_source] ? `<span class="src" title="${esc(c.category_source)}">${CAT_SRC[c.category_source]}</span>` : ""}</td>
      <td class="t-proj">${c.engagements.length ? byRole(c.engagements).map(engChip).join("") : `<span class="muted">EDCF 주요 업체</span>`}</td>
      <td class="t-risk">${sc ? (c.risk !== "none" ? badge(c.risk) : `<span class="ok-t">정상</span>`) : `<span class="muted">-</span>`}</td>
      <td class="t-open">${c.open ? `<b>${c.open}</b>` : `<span class="muted">0</span>`}</td>
      <td class="t-id">${c.country !== "KR" ? `<span class="muted">해외</span>` : c.biz_no ? `<span title="${esc(c.bizno_source || "")}">${esc(fmtBiz(c.biz_no))}</span>` : `<span class="miss">없음</span>`}</td>
      <td class="t-id">${c.name_en ? `<span class="ok-t">✓</span>` : `<span class="miss">없음</span>`}</td>
    </tr>`).join("");

  // 사업 카드 (놓는 곳): 업체 등급 분포 + 역할 칸
  $("#projCount").textContent = state.projects.length;
  $("#projBoard").innerHTML = state.projects.map((p) => {
    const rows = [];
    for (const c of state.companies) c.engagements.forEach((e, i) => { if (e.project_id === p.id) rows.push({ c, e, i }); });
    const t = { red: 0, orange: 0, yellow: 0, none: 0 };
    new Set(rows.map((r) => r.c)).forEach((c) => t[c.risk]++);
    const total = t.red + t.orange + t.yellow + t.none;
    const dist = !total ? "" : `<div class="pj-dist"><div class="pj-bar">${sc ? ["red", "orange", "yellow", "none"].filter((lv) => t[lv]).map((lv) => `<i class="${lv}" style="flex:${t[lv]}"></i>`).join("") : `<i class="pending" style="flex:1"></i>`}</div>
      <div class="pj-sum">${sc ? (["red", "orange", "yellow"].filter((lv) => t[lv]).map((lv) => `<span class="${lv}">${LEVEL[lv]} ${t[lv]}</span>`).join("") || `<span class="ok">이상 없음</span>`) : ""}<span class="tot">/ ${total}곳</span></div></div>`;
    return `<div class="pbox">
      <div class="pbox-head"><div class="pname">${esc(p.name)}</div>${p.country ? `<span class="ctry">${esc(COUNTRY[p.country] || p.country)}</span>` : ""}</div>
      <div class="pbox-body">${dist}
        ${ROLES.map((role) => {
          const rr = rows.filter((r) => r.e.role === role);
          return `<div class="dropzone ${rr.length ? "" : "is-empty"}" data-pid="${p.id}" data-role="${esc(role)}">
            ${roleTag(role)}
            ${rr.map(({ c, e, i }) => `<div class="corow" draggable="true" data-cid="${c.id}" data-from="${p.id}|${i}">
              <span class="dot ${sc ? c.risk : ""}"></span><span class="cn">${esc(c.name)}</span>
              <span class="right">
                <button class="stagebtn ${e.stage !== "계약" ? "on" : ""}" data-stage="${c.id}|${i}" title="눌러서 단계 변경">${esc(e.stage || "계약")}${e.stage === "우선협상" && e.rank ? " " + e.rank + "순위" : ""}</button>
                <button class="xbtn" data-unlink="${c.id}|${i}" title="이 사업에서 빼기">✕</button>
              </span></div>`).join("")}
            <div class="drop-hint">여기로 끌어다 놓기</div>
          </div>`;
        }).join("")}
      </div>
      <div class="pbox-foot"><span>${ownerTag(p)}${p.owner !== me() ? ` <button class="btn sm ghost" data-own="${p.id}">내 사업으로</button>` : ""}</span><button class="btn sm ghost danger" data-del-proj="${p.id}">사업 삭제</button></div>
    </div>`;
  }).join("") || `<div class="empty">사업이 없습니다. 위에서 사업을 추가하세요.</div>`;
  bindDnd();
}
$("#poolSearch").addEventListener("input", () => renderCompanies());
["#fOwner", "#fProj", "#fRole", "#fStage", "#fRisk", "#fCat", "#fNat"].forEach((s) => $(s).addEventListener("change", () => renderCompanies()));
$("#fReset").onclick = () => { ["#poolSearch", "#fOwner", "#fProj", "#fRole", "#fStage", "#fRisk", "#fCat", "#fNat"].forEach((id) => ($(id).value = "")); renderCompanies(); };
$$("#coTable th[data-sort]").forEach((th) => th.addEventListener("click", () => {
  if (coState.sort === th.dataset.sort) coState.dir *= -1; else { coState.sort = th.dataset.sort; coState.dir = 1; }
  renderCompanies();
}));


// ---------- 설정 ----------
function renderSettings() {
  $("#rcList").innerHTML = state.recipients.map((r) => `<div class="srow"><span>${esc(r.email)}</span><button class="xbtn" data-del-rc="${r.id}" title="삭제">✕</button></div>`).join("") || `<div class="muted small">아직 없습니다.</div>`;
  $$("[data-del-rc]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "recipients", b.dataset.delRc)); state.recipients = state.recipients.filter((r) => r.id !== b.dataset.delRc); renderSettings(); });
  renderEdcfInfo();
  renderConnections();
  renderAdvanced();
  renderTasks();
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
  $$("#pool tr[data-cid]").forEach((el) => el.addEventListener("click", () => openCompany(el.dataset.cid)));
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
  // 영문으로만 된 이름은 해외 업체로 봄. 단 KT·LG CNS 같은 대문자 약칭은 국내 업체
  const krAbbr = /^[A-Z0-9]{2,4}( [A-Z0-9]{2,4})?$/.test(name.trim());
  const foreign = /^PT[.\s]/i.test(name) || (/^[A-Za-z0-9 .,&()'-]+$/.test(name) && !krAbbr);
  const en = foreign ? name.replace(/^PT[.\s]+/i, "").trim() : null;
  return { id, name, name_en: en, aliases: en && en !== name ? en : null, context_keywords: null,
    country: foreign ? (country || "") : "KR", search_langs: foreign ? (country === "ID" ? "en,id" : "en") : "ko",
    corp_code: null, biz_no: null, ceo: null, note: null, engagements: [], created_at: nowStr() };
}
const companyData = (c) => { const { id, risk, open, total, focus, mine, cat, catGuess, ...data } = c; return data; }; // 계산값은 저장하지 않음

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
        <label>업종<select name="category"><option value="">자동 분류 (DART·업체명)</option>${CATS.map((k) => `<option>${k}</option>`).join("")}</select></label>
        <label>별칭 (쉼표 구분)<input name="aliases" placeholder="예: 가나다ENG"></label>
      </div>
      <label style="flex-direction:row;align-items:center;gap:6px;font-weight:500"><input type="checkbox" name="foreign" style="width:auto"> 해외 업체 (조달청 조회 제외, 영문 뉴스 검색)</label>
      ${state.projects.length ? `<div class="row"><label>사업에 바로 연결 (선택)<select name="pid"><option value="">연결 안 함 — EDCF 주요 업체로 등록</option>${state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
        <label>역할<select name="role">${ROLES.map((r) => `<option>${r}</option>`).join("")}</select></label></div>` : ""}
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
    applyCat(c, fd.category, "직접 입력");
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
  const ops = [], batch = { set: (ref, data, o) => ops.push([ref, data, o]) };
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
      c = newCompany(doc(collection(db, "companies")).id, r.name, p.country); applyCat(c, null);
      cByName[normName(c.name)] = c; state.companies.push(c); newC++;
    }
    if (!c.engagements.some((e) => e.project_id === p.id && e.role === r.role)) {
      c.engagements.push({ project_id: p.id, role: r.role, stage: STAGES.includes(r.stage) ? r.stage : r.rank ? "우선협상" : "계약", rank: r.rank || null }); links++;
    }
    touched.add(c);
  }
  for (const c of touched) batch.set(doc(db, "companies", c.id), companyData(c), { merge: true });
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach(([ref, data, o]) => o ? b.set(ref, data, o) : b.set(ref, data));
    await b.commit();
  }
  return { newP, newC, links };
}

// ---------- 업체 일괄 등록 ----------
// 형식 자동 인식
//  ① 표(엑셀 양식): 제목 줄에 '업체명'이 있으면 열 이름으로 읽음 — 업체명·사업자번호·영문명·분류·별칭·사업명·역할
//  ② 사업명 | 구분 | 업체명  (탭·쉼표 구분, 사업명 비우면 윗줄 사업)
//  ③ 분류 묶음 명단  # --- 분류 ---  /  "대표이름": ["별칭1", "별칭2"],
//  ④ 업체명만 한 줄에 하나
const BULK_COLS = { 업체명: "name", 회사명: "name", 사업자번호: "biz_no", 사업자등록번호: "biz_no", 영문명: "name_en", 영문업체명: "name_en", 분류: "category", 업종: "category", 별칭: "aliases", 사업명: "project", 사업: "project", 역할: "role", 구분: "role", 단계: "stage" };
function rowsToBulk(rows) {
  const links = [], base = [], errors = [];
  const hi = rows.findIndex((r) => r.some((x) => /^(업체명|회사명)$/.test(String(x ?? "").replace(/\s/g, ""))));
  const head = rows[hi].map((x) => BULK_COLS[String(x ?? "").replace(/\s/g, "")] || null);
  let last = "";
  rows.slice(hi + 1).forEach((r, i) => {
    const o = {}; head.forEach((k, j) => { if (k && r[j] != null && String(r[j]).trim()) o[k] = String(r[j]).trim(); });
    if (!o.name) return;
    if (/\(예시\)/.test(o.name)) return; // 양식의 예시 줄
    const { name, rank } = cleanCompanyName(o.name);
    const biz = (o.biz_no || "").replace(/\D/g, "");
    if (o.biz_no && biz.length !== 10) errors.push(`${hi + i + 2}번째 줄 '${name}': 사업자번호가 10자리가 아니어서 비워둡니다`);
    base.push({ name, aliases: (o.aliases || "").split(/[,，]/).map((x) => x.trim()).filter(Boolean), category: o.category || null, biz_no: biz.length === 10 ? biz : null, name_en: o.name_en || null });
    if (o.project) last = o.project;
    const project = o.project || (o.role ? last : "");
    if (project) links.push({ project, role: ROLES.includes(o.role) ? o.role : (o.role || "컨설턴트"), name, rank, stage: o.stage });
  });
  return { links, base, errors };
}
function parseAny(text) {
  const lines = text.split(/\r?\n/);
  const first = lines.find((l) => l.trim());
  if (first && /(^|\t|,)\s*(업체명|회사명)\s*(\t|,|$)/.test(first)) return rowsToBulk(first.includes("\t") ? lines.map((l) => l.split("\t")) : parseCSV(text));
  const links = [], base = [], errors = [];
  let cat = null, last = "";
  lines.forEach((line, i) => {
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
    if (!c) { c = newCompany(doc(collection(db, "companies")).id, r.name, null); c.source = "일괄 등록"; state.companies.push(c); have.set(normName(c.name), c); added++; }
    else updated++;
    const al = new Set((c.aliases || "").split(",").map((x) => x.trim()).filter(Boolean));
    r.aliases.forEach((a) => al.add(a));
    c.aliases = [...al].join(", ") || null;
    if (r.biz_no && !c.biz_no) { c.biz_no = r.biz_no; c.bizno_source = "일괄 등록"; }
    if (r.name_en && !c.name_en) { c.name_en = r.name_en; if (!(c.search_langs || "").includes("en")) c.search_langs = (c.search_langs || "ko") + ",en"; }
    if (r.category && (!c.category || c.category_source === "이름 추정")) applyCat(c, r.category, "명단");
    else applyCat(c, null);
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
// 엑셀 양식 (CSV, 엑셀에서 바로 열림) — 예시는 가상 데이터
function downloadTemplate() {
  const rows = [["업체명", "사업자번호", "영문명", "업종", "별칭", "사업명", "역할"],
    ["가나다엔지니어링(예시)", "000-00-00000", "GANADA ENGINEERING CO., LTD.", "엔지니어링·설계·감리", "가나다ENG, 예시", "가나국 스마트시티 구축사업(예시)", "컨설턴트"],
    ["라마바건설(예시)", "", "", "건설·시공", "예시", "", ""]];
  const csv = "﻿" + rows.map((r) => r.map((x) => /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "EDCF_업체_일괄등록_양식.csv"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
let parsed = null;
function bulkPreview(p) {
  parsed = p;
  const { links, base, errors } = p;
  const have = new Set(state.companies.map((c) => normName(c.name)));
  const shortN = base.filter((r) => coreLen(r.name) <= 2);
  const cats = {}; base.forEach((r) => { const k = normCat(r.category) || "업종 자동 분류"; cats[k] = (cats[k] || 0) + 1; });
  const newN = base.filter((r) => !have.has(normName(r.name))).length;
  $("#bulkOut").innerHTML = (errors.length ? `<div class="notice">${errors.slice(0, 8).map(esc).join("<br>")}</div>` : "")
    + (base.length ? `<h3>업체 ${base.length}곳 <span class="muted small">(신규 ${newN} · 기존 업데이트 ${base.length - newN} · 사업자번호 ${base.filter((r) => r.biz_no).length} · 영문명 ${base.filter((r) => r.name_en).length})</span></h3>
      <div class="chips">${Object.entries(cats).map(([k, v]) => `<span class="tag">${esc(k)} ${v}</span>`).join("")}</div>
      ${shortN.length ? `<div class="notice" style="margin-top:8px">2자 이하 이름 ${shortN.length}곳 (${shortN.slice(0, 12).map((r) => esc(r.name)).join(", ")}${shortN.length > 12 ? " …" : ""}) — 동명 기사가 섞이지 않도록 업종 관련 단어가 함께 나온 기사만 인정합니다.</div>` : ""}` : "")
    + (links.length ? `<h3>사업 연결 ${links.length}건</h3><table class="tbl"><thead><tr><th>사업</th><th>역할</th><th>업체</th><th></th></tr></thead><tbody>${links.slice(0, 60).map((r) => `<tr>
      <td class="small">${esc(r.project)}</td><td>${roleTag(r.role)} ${r.rank ? `<span class="stage">우선협상 ${r.rank}순위</span>` : ""}</td>
      <td><b>${esc(r.name)}</b></td><td class="small muted">${state.projects.some((x) => x.name === r.project) ? "기존 사업" : "새 사업"}</td></tr>`).join("")}</tbody></table>` : "")
    + (!links.length && !base.length && !errors.length ? `<div class="muted small">읽을 내용이 없습니다.</div>` : "");
  const n = links.length + base.length;
  $("#bulkRun").disabled = !n;
  $("#bulkRun").textContent = n ? `등록하기 (업체 ${base.length || new Set(links.map((l) => l.name)).size}곳)` : "등록하기";
}
$("#btnBulk").onclick = () => {
  parsed = null;
  modal(`<h2>업체 일괄 등록</h2>
    <div class="steps-mini">
      <div><b>STEP 1</b>양식 내려받기 (엑셀에서 열림)</div>
      <div><b>STEP 2</b>업체명·사업자번호·영문명 등 채우기 — 업체명만 있어도 됨</div>
      <div><b>STEP 3</b>파일을 올리거나 표를 복사해 붙여넣기</div>
    </div>
    <div class="add-row"><button class="btn" id="bulkTpl">양식 내려받기</button><label class="btn primary">엑셀·CSV 파일 올리기<input type="file" id="bulkFile" accept=".xlsx,.xls,.csv" hidden></label></div>
    <textarea id="bulkText" placeholder="엑셀 표를 그대로 복사해 붙여넣거나(제목 줄 포함), 아래처럼 입력하세요. 예시는 가상 데이터입니다.

가나국 스마트시티 구축사업 | 컨설턴트 | 가나다엔지니어링
 | 본구매 | 사아자건설(1순위)

라마바엔지니어링
차카타정보통신"></textarea>
    <p class="muted small">사업명·역할을 함께 적으면 사업에 바로 연결되고, 없으면 'EDCF 주요 업체'로 등록됩니다. 이미 있는 업체는 빈 정보(사업자번호·영문명·업종·별칭)만 채웁니다. 업종을 비워두면 업체명·DART 업종코드로 자동 분류합니다. 사내 보안(DRM)으로 파일이 안 열리면 표를 복사해 붙여넣으세요.</p>
    <div class="actions left" style="margin-top:4px"><button class="btn" id="bulkPrev">미리보기</button><button class="btn primary" id="bulkRun" disabled>등록하기</button></div>
    <div id="bulkOut" class="import-preview"></div>`);
  $("#bulkTpl").onclick = downloadTemplate;
  $("#bulkPrev").onclick = () => bulkPreview(parseAny($("#bulkText").value));
  $("#bulkFile").addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; ev.target.value = "";
    if (!f) return;
    try {
      const rows = /\.csv$/i.test(f.name)
        ? parseCSV(await readText(f))
        : await readExcel(f);
      if (!rows.some((r) => r.some((x) => /^(업체명|회사명)$/.test(String(x ?? "").replace(/\s/g, ""))))) throw new Error("'업체명' 제목 줄을 찾지 못했습니다. 양식을 내려받아 사용하세요.");
      bulkPreview(rowsToBulk(rows));
    } catch (e) {
      toast("파일을 읽지 못했습니다: " + (e.message || e) + " — 표를 복사해 붙여넣어 보세요", 7000);
    }
  });
  $("#bulkRun").onclick = async () => {
    if (!parsed || !(parsed.links.length + parsed.base.length)) return;
    $("#bulkRun").disabled = true;
    try {
      const b = parsed.base.length ? await registerBase(parsed.base) : { added: 0, updated: 0 };
      const r = parsed.links.length ? await registerRows(parsed.links) : { newP: 0, newC: 0 };
      closeModal();
      toast(`등록 완료: 업체 ${r.newC + b.added}곳 추가${b.updated ? ` · ${b.updated}곳 정보 보완` : ""}${r.newP ? ` · 사업 ${r.newP}개 추가` : ""}`, 5000);
      parsed = null; rerender();
    } catch (e) { toast("등록 실패: " + e.message, 6000); $("#bulkRun").disabled = false; }
  };
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
// CSV 한 줄씩: "따옴표, 안의 쉼표" 와 "" 처리, 앞의 BOM 제거
function parseCSV(text) {
  return String(text).replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  });
}
// 파일 글자 읽기: UTF-8이 아니면(엑셀에서 저장한 CSV) EUC-KR로
async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { return new TextDecoder("euc-kr").decode(buf); }
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
// 같은 업체의 여러 제재 기록을 업체 하나로 묶음 (현재 '등록' 상태가 하나라도 있으면 제재 중)
function edcfByCompany(hits) {
  const m = new Map();
  for (const { e, c } of hits) { const x = m.get(c.id) || { c, n: 0, active: false }; x.n++; x.active = x.active || /등록/.test(e.status || ""); m.set(c.id, x); }
  return [...m.values()].sort((a, b) => b.active - a.active || b.n - a.n || a.c.name.localeCompare(b.c.name));
}
const edcfHitText = (g) => g.map((x) => `${esc(x.c.name)} <span class="muted">(${x.active ? "제재 중" : "해지"}${x.n > 1 ? ` · ${x.n}건` : ""})</span>`).join(", ");
function edcfPreview(list) {
  const active = list.filter((e) => /등록/.test(e.status || "")).length;
  const hits = edcfMatches(list), g = edcfByCompany(hits), act = g.filter((x) => x.active);
  modal(`<h2>EDCF 부정당업자 명단 확인</h2>
    <p><b>${list.length}건</b> · 등록 ${active} · 해지 ${list.length - active} · 사업자번호 있음 ${list.filter((e) => e.biz_no).length}</p>
    ${g.length ? `<div class="notice">우리 명단과 일치하는 업체 <b>${g.length}곳</b> (기록 ${hits.length}건)${act.length ? ` — 현재 제재 중 <b style="color:var(--red)">${act.map((x) => esc(x.c.name)).join(", ")}</b>` : ""}<br>${edcfHitText(g)}</div>` : `<p class="muted small">현재 우리 명단과 일치하는 업체는 없습니다.</p>`}
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
    if (/\.csv$/i.test(f.name)) rows = parseCSV(await readText(f));
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
    <textarea id="edcfText" placeholder="엑셀 표를 제목 줄부터 복사해 붙여넣으세요.
복사가 막히면 쉼표로 직접 입력해도 됩니다 (제목 줄 필수, 예시는 가상 데이터):

업체명, 상태, 제재기간, 사업자번호
가나다건설, 등록, 2026.01.01 ~ 2027.12.31, 000-00-00000"></textarea>
    <div class="actions"><button class="btn primary" id="edcfParse">확인</button></div>`);
  $("#edcfParse").onclick = () => {
    try {
      const list = rowsToEdcf($("#edcfText").value.split(/\r?\n/).map((l) => l.split(l.includes("\t") ? "\t" : l.includes("|") ? "|" : ",").map((x) => x.trim())));
      if (!list.length) throw new Error("업체 행이 없습니다");
      edcfPreview(list);
    } catch (e) { toast(e.message, 5000); }
  };
};
function renderEdcfInfo() {
  const st = state.settings || {}, list = state.edcf, g = edcfByCompany(edcfMatches(list)), act = g.filter((x) => x.active);
  const active = list.filter((e) => /등록/.test(e.status || "")).length;
  $("#edcfInfo").innerHTML = !list.length ? "아직 등록된 명단이 없습니다."
    : `${list.length}건 (등록 ${active} · 해지 ${list.length - active}) · ${esc(st.edcf_sanctions_at || "")} 반영${st.edcf_sanctions_by ? ` (${esc(st.edcf_sanctions_by.split("@")[0])})` : ""}
       ${g.length ? `<div style="margin-top:6px">우리 명단과 일치 <b>${g.length}곳</b>${act.length ? ` · <b style="color:var(--red)">현재 제재 중 ${act.map((x) => esc(x.c.name)).join(", ")}</b>` : ""}<br>${edcfHitText(g)}</div>` : `<div style="margin-top:6px">우리 명단과 일치하는 업체 없음</div>`}`;
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
      ["AI 판정 (Claude)", c.claude && s.claude_error ? "warn" : B(c.claude), c.claude ? (s.claude_error ? `키는 등록됨, 호출 실패: ${s.claude_error} (지금은 키워드 규칙으로 판정)` : `모델 ${s.claude_model || ""} — 기사별 관련성·등급 판정`) : "없으면 키워드 규칙으로 판정 (키워드 없는 기사는 놓칠 수 있음)", "console.anthropic.com에서 API 키 발급 → Secret ANTHROPIC_API_KEY"],
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
// ---------- 연결 작업 목록 (설정 맨 아래) ----------
const REPO_URL = `https://github.com/${GITHUB_REPO}`;
const hoursSince = (t) => t ? (Date.now() - Date.parse(String(t).replace(" ", "T") + "+09:00")) / 3600e3 : null;
const L = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text} ↗</a>`;
function renderTasks() {
  const s = state.status, c = s.connections || {}, st = state.settings || {};
  const dailyH = hoursSince(s.last_daily_at);
  const dom = state.companies.filter((x) => x.country === "KR");
  const noBiz = dom.filter((x) => !x.biz_no).length, noEn = state.companies.filter((x) => !x.name_en).length;
  // [제목, 상태(done/todo/warn/opt), 중요도, 어디서, 왜, 단계[], 참고]
  const T = [
    ["매일 아침 자동 스캔 켜기", dailyH != null && dailyH < 26 ? "done" : "todo", "필수", "Google Apps Script",
      dailyH != null ? `마지막 매일 실행 ${s.last_daily_at.slice(5, 16)}` : "GitHub 자체 예약(07:30)이 자주 건너뛰어져서, 5분 확인(tick)처럼 Apps Script 타이머로 매일 아침 실행합니다.",
      [`Apps Script 편집기에서 기존 코드를 모두 지우고 ${L(`${REPO_URL}/raw/main/tools/relay.gs`, "최신 relay.gs")} 내용을 붙여넣기 → 💾 저장 (스크립트 속성 GITHUB_TOKEN은 그대로 유지됨)`,
        `왼쪽 ⏰ <b>트리거 → 트리거 추가</b> → 실행할 함수 <code>daily</code> / 이벤트 소스 <b>시간 기반</b> / 트리거 유형 <b>일 단위 타이머</b> / 시간 <b>오전 7시~8시</b> → 저장`,
        `⚙ 프로젝트 설정에서 시간대가 <b>(GMT+09:00) 서울</b>인지 확인`,
        `다음 날 아침 이 항목이 '완료'로 바뀌는지 확인 (${L(ACTIONS_URL, "Actions 실행 기록")}에 08시 전후 daily 실행)`],
      "GitHub 예약과 Apps Script가 같은 날 둘 다 돌아도 하루 한 번만 실행됩니다. 메일은 '메일 받는 사람'에 등록된 주소로만 가고, 비어 있으면 스캔만 합니다."],
    ["즉시 실행 중계 설정 (Google Apps Script)", st.relay_url ? "done" : "todo", "필수", "Google Apps Script · GitHub",
      "회사망은 GitHub 접속이 막혀 있어 [지금 스캔]이 GitHub 예약 확인(10분 간격, 자주 지연)까지 기다립니다. 중계기를 두면 1~2분 안에 시작합니다.",
      [`GitHub 토큰 만들기: ${L("https://github.com/settings/personal-access-tokens/new", "토큰 만들기")} → Token name <code>edcf-relay</code> → Repository access <b>Only select repositories</b> → <code>edcf-integrity-monitor</code> → Permissions → Repository permissions → <b>Actions: Read and write</b> → <b>Generate token</b> → 복사`,
        `${L("https://script.google.com/home/projects/create", "Apps Script 새 프로젝트")} → 기본 코드를 지우고 ${L(`${REPO_URL}/blob/main/tools/relay.gs`, "tools/relay.gs")} 내용을 전부 붙여넣기 → 저장(💾)`,
        `왼쪽 <b>⚙ 프로젝트 설정</b> → 맨 아래 <b>스크립트 속성 추가</b> → 속성 <code>GITHUB_TOKEN</code>, 값 = 1번 토큰 → 저장`,
        `편집기로 돌아와 위쪽 함수 목록에서 <code>authorize</code> 선택 → <b>▶ 실행</b> → 권한 검토 → 계정 선택 → 경고 화면에서 <b>고급 → (안전하지 않음)으로 이동</b> → 허용`,
        `오른쪽 위 <b>배포 → 새 배포</b> → 유형 톱니 → <b>웹 앱</b> → 실행 계정 <b>나</b>, 액세스 권한 <b>모든 사용자</b> → 배포 → <b>웹 앱 URL</b>(…/exec) 복사`,
        `이 화면 위쪽 <b>연결 상태 → 즉시 실행 중계 주소</b>에 붙여넣기 → 저장 → <b>연결 테스트</b>`],
      "중계기는 대시보드에 로그인한 허용 이메일만 실행할 수 있습니다. 회사망에서 script.google.com이 막혀 있으면 이 방법도 안 되니, 연결 테스트로 먼저 확인하세요."],
    ["EDCF 부정당업자 명단(EXIMIIS) 올리기", state.edcf.length ? "done" : "todo", "필수", "EXIMIIS · 이 화면",
      state.edcf.length ? `${state.edcf.length}건 반영됨 (${st.edcf_sanctions_at || ""})` : "매뉴얼 ①번 확인(EDCF 제재 여부)을 자동으로 하기 위한 내부 명단입니다.",
      ["EXIMIIS 로그인 → <b>경협 → 업무지원 → 부정당업자 → 부정당업자조회</b>",
        "조건 없이 <b>조회</b> → <b>엑셀 다운로드</b>",
        "이 화면 위쪽 <b>EDCF 부정당업자 명단 → 엑셀 파일 올리기</b> → 미리보기에서 건수·일치 업체 확인 → <b>명단 반영</b>",
        "명단이 바뀔 때(예: 월 1회) 다시 올리면 기존 명단을 새 내용으로 교체합니다"],
      "사내 문서보안(DRM)으로 파일이 열리지 않으면 엑셀에서 표 전체(제목 줄 포함)를 복사해 <b>표 붙여넣기로 입력</b>을 쓰세요. 명단은 로그인해야 볼 수 있는 Firebase에만 저장되고 공개 저장소에는 올라가지 않습니다."],
    ["감시할 업체 명단 등록", state.companies.length ? "done" : "todo", "필수", "업체·사업 탭",
      state.companies.length ? `업체 ${state.companies.length}곳 · 사업 ${state.projects.length}개 등록됨` : "감시할 업체(EDCF 주요 업체)와 진행중 사업을 넣습니다.",
      ["<b>업체·사업 → 일괄 등록 → 양식 내려받기</b>",
        "엑셀에서 열어 업체명(필수), 사업자번호·영문명·업종(있으면)을 채웁니다. 업종을 비우면 자동 분류되고, 사업명·역할을 적으면 사업에 바로 연결됩니다",
        "저장 후 <b>엑셀·CSV 파일 올리기</b> (또는 표를 복사해 붙여넣기) → <b>미리보기</b> → <b>등록하기</b>",
        "진행중 사업은 사업 카드를 만들고 업체를 역할 칸으로 끌어다 놓습니다. 기존 사업은 카드 아래 <b>내 사업으로</b>를 눌러 담당자를 지정합니다"],
      "이미 있는 업체를 다시 올리면 새로 만들지 않고 빈 정보만 채웁니다."],
    ["사업자번호·영문명 보완", !state.companies.length ? "opt" : noBiz || noEn ? "warn" : "done", "권장", "업체·사업 탭",
      state.companies.length ? `사업자번호 없음 ${noBiz}곳 · 영문명 없음 ${noEn}곳 — 매뉴얼 기준 필요자료(사업자등록번호, 영문명)` : "업체 등록 후 진행",
      ["업체·사업 탭 필터에서 <b>정보: 사업자번호 없음</b>(또는 영문명 없음) 선택",
        "업체를 눌러 <b>식별 정보</b>에 사업자등록증 기준 번호·영문명 입력 → 저장",
        "여러 곳이면 양식에 업체명+사업자번호+영문명만 채워 <b>일괄 등록</b>으로 한 번에 보완"],
      "사업자번호가 있어야 조달청(나라장터) 제재 조회와 EDCF 명단 대조가 정확하고, 영문명이 있어야 MDB 제재 리스트 대조가 정확합니다. DART에 등록된 업체는 스캔 때 자동으로 채워집니다."],
    ["메일 발송 연결 (Gmail)", c.smtp && state.recipients.length ? "done" : c.smtp ? "warn" : "todo", "필수", "Google 계정 · GitHub Secrets",
      c.smtp ? `메일 서버 연결됨 · 받는 사람 ${state.recipients.length}명` : "매일 아침 리포트 메일을 보내려면 발송용 계정이 필요합니다.",
      [`발송용 Gmail 계정으로 ${L("https://myaccount.google.com/signinoptions/twosv", "2단계 인증")} 켜기`,
        `${L("https://myaccount.google.com/apppasswords", "앱 비밀번호")} → 앱 이름 <code>EDCF</code> → 만들기 → 16자리 비밀번호 복사`,
        `${L(SECRETS_URL, "GitHub Secrets")} → <b>New repository secret</b> 두 개: <code>SMTP_USER</code> = Gmail 주소, <code>SMTP_PASSWORD</code> = 16자리(띄어쓰기 없이)`,
        "이 화면 <b>메일 받는 사람</b>에 받을 주소 추가",
        "연결 상태 아래 <b>테스트 메일 받기</b> → 메일함 확인 (스팸함도 확인)"],
      "회사 메일 서버를 쓰려면 SMTP_HOST·SMTP_PORT Secret을 추가합니다(기본값 smtp.gmail.com:587)."],
    ["네이버 뉴스 연결", c.naver ? "done" : "opt", "선택", "네이버 클라우드 · GitHub Secrets",
      "Google 뉴스만으로도 동작하지만, 국내 지역·전문지 기사를 더 많이 잡습니다.",
      [`${L("https://www.ncloud.com", "네이버 클라우드 플랫폼")} 가입·로그인 → 콘솔`,
        "<b>Menu → All Services → Application Services → NAVER API HUB</b> → <b>검색(뉴스)</b> API 이용 신청(구독)",
        "같은 메뉴에서 <b>Application 등록</b> → 인증 정보의 <b>Client ID / Client Secret</b> 확인 (계정 Access Key가 아니라 Application 키를 씁니다). 무료 한도를 넘으면 과금될 수 있으니 <b>이용 한도</b>를 설정해 두세요",
        `${L(SECRETS_URL, "GitHub Secrets")}에 <code>NAVER_APIHUB_KEY_ID</code> = Client ID, <code>NAVER_APIHUB_KEY</code> = Client Secret 등록`,
        "다음 스캔 후 연결 상태에서 '네이버 뉴스 연결됨' 확인"],
      "네이버 개발자센터의 검색 API 신규 발급이 2026-07-31에 종료되어 API HUB로 신청합니다. 예전에 받은 개발자센터 키가 있으면 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET로 넣어도 됩니다."],
    ["AI 판정 연결 (Claude)", c.claude && s.claude_error ? "warn" : c.claude ? "done" : "opt", "선택", "Anthropic Console · GitHub Secrets",
      c.claude && s.claude_error ? `키는 등록됐지만 호출 실패: ${s.claude_error}` : "키워드가 없는 기사도 관련성·등급을 판단해 놓치는 기사와 오탐을 줄입니다. 없으면 키워드 규칙으로 판정합니다.",
      [`${L("https://console.anthropic.com", "Anthropic Console")} 가입 → Billing에서 결제 수단 등록`,
        "<b>API Keys → Create Key</b> → 키 복사",
        `${L(SECRETS_URL, "GitHub Secrets")}에 <code>ANTHROPIC_API_KEY</code> 등록`,
        "다음 스캔부터 대시보드 위 '판정 AI'로 표시됩니다"],
      "새로 수집된 기사만 판정하므로 매일 호출량은 많지 않습니다. 사용량은 Console에서 확인·한도 설정할 수 있습니다."],
    ["팀원 계정 추가", ALLOWED_EMAILS.length > 1 ? "done" : "opt", "선택", "Firebase · GitHub · Apps Script",
      `현재 접속 허용 ${ALLOWED_EMAILS.length}명. 팀원이 대시보드를 보려면 세 곳에 이메일을 넣어야 합니다.`,
      [`Firebase 콘솔 → Firestore Database → <b>규칙</b> → 이메일 목록에 추가 → <b>게시</b>`,
        `${L(`${REPO_URL}/edit/main/assets/firebase-config.js`, "firebase-config.js")}의 <code>ALLOWED_EMAILS</code>에 추가 → Commit`,
        "Apps Script 중계기 코드의 <code>ALLOWED_EMAILS</code>에 추가 → <b>배포 관리 → 수정 → 새 버전</b>"],
      "이메일 목록을 알려주시면 1·2번은 대신 수정해 드릴 수 있습니다."],
  ];
  const ST = { done: `<span class="badge none">완료</span>`, todo: `<span class="badge orange">해야 함</span>`, warn: `<span class="badge yellow">보완 필요</span>`, opt: `<span class="badge gray">선택</span>` };
  const rank = { todo: 0, warn: 1, opt: 2, done: 3 };
  const list = T.map((t, i) => ({ t, i })).sort((a, b) => rank[a.t[1]] - rank[b.t[1]] || a.i - b.i);
  const left = T.filter((t) => t[1] === "todo" || t[1] === "warn").length;
  $("#taskCount").textContent = left ? `남은 일 ${left}` : "모두 완료";
  let opened = false;
  $("#tasks").innerHTML = list.map(({ t: [title, stt, imp, where, why, steps, note] }, k) => {
    const open = !opened && stt === "todo"; if (open) opened = true;
    return `<details class="task ${stt === "done" ? "done" : ""}" ${open ? "open" : ""}>
      <summary><span class="tno">${stt === "done" ? "✓" : k + 1}</span>
        <div class="tt"><b>${title}</b><div class="why">${why}</div></div>
        <div class="tmeta"><span class="twhere">${imp} · ${where}</span>${ST[stt]}</div></summary>
      <div class="tbody"><ol>${steps.map((x) => `<li>${x}</li>`).join("")}</ol>${note ? `<div class="note">${note}</div>` : ""}</div>
    </details>`;
  }).join("");
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
