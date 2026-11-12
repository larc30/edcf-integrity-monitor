// EDCF 부정당업자 모니터링 — GitHub Pages + Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ALLOWED_EMAILS, GITHUB_REPO } from "./firebase-config.js?v=30";
import { initGeo, renderGeo, mountSitePicker, GEO_CITY, GEO_COUNTRY } from "./geo.js?v=40";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const ACTIONS_URL = `https://github.com/${GITHUB_REPO}/actions/workflows/monitor.yml`;
const SECRETS_URL = `https://github.com/${GITHUB_REPO}/settings/secrets/actions`;

// ---------- 공통 ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 등급은 3단계(위험·경고·정상). yellow 는 등급이 아니라 "참고 이력"으로만 남김 (업체 등급에는 넣지 않음)
const LEVEL = { red: "위험", orange: "경고", yellow: "참고", none: "정상" };
const LEVEL_DESC = { red: "지금 제재 중", orange: "제재로 이어질 수 있는 진행 중 사안", yellow: "참고 이력 (등급에 넣지 않음)", none: "위험·경고 이슈 없음" };
// 등급 뜻 (i 에 마우스를 올리면): 위험은 실제로 지금 제재를 받고 있는 경우만
const LEVEL_DEF = {
  red: "<b>확정된 제재</b><br>입찰참가자격 제한(부정당업자 제재), MDB 제재, 영업정지, 등록말소. 공식 명단(EXIMIIS '등록', 조달청, MDB)에 있거나, 기사로 처분 확정이 확인된 경우. 시작일 전이어도 확정이면 위험",
  orange: "<b>제재로 이어질 수 있는 진행 중 사안</b><br>최근 1년 내 수사, 압수수색, 기소, 유죄판결, 담합 적발, 공정위 과징금, 처분 예고와 청문, 집행정지로 멈춘 제재, 부도와 회생절차",
  none: "<b>위험·경고 이슈 없음</b><br>아래 참고 이력만 있는 업체도 정상",
  yellow: "기록만 남기는 이력: 1년 지난 제재와 처분(EXIMIIS '해지' 포함), 계열사가 받은 처분, 의혹과 고발, 소송과 분쟁, 중대재해와 부실시공, 재무 악화",
};
const levelTip = () => ["red", "orange", "none"].map((lv) => `<div class="tip-row">${badge(lv)}<span>${LEVEL_DEF[lv]}</span></div>`).join("")
  + `<div class="tip-sep">등급이 아닌 표시</div><div class="tip-row">${badge("yellow")}<span>${LEVEL_DEF.yellow}</span></div>`;
// i 버튼: 마우스를 올리거나 누르면 설명 (cls 'r' = 오른쪽 맞춤)
const info = (html, cls = "") => `<span class="itip ${cls}" tabindex="0" role="note" aria-label="설명">i<span class="tip">${html}</span></span>`;
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
// 창: 닫기 버튼은 마지막 버튼 줄에 나란히 (주 버튼은 오른쪽 끝)
function modal(html) {
  const m = $("#modal"); m.className = "modal"; m.innerHTML = html;
  const rows = $$(".actions", m), row = rows[rows.length - 1];
  const close = document.createElement("button"); close.type = "button"; close.className = "btn"; close.id = "modalClose"; close.textContent = "닫기";
  if (!row) { const d = document.createElement("div"); d.className = "actions"; d.appendChild(close); m.appendChild(d); }
  else if (row.classList.contains("left")) { close.style.marginLeft = "auto"; row.appendChild(close); }
  else row.insertBefore(close, row.firstChild);
  $("#modalBg").classList.add("open"); close.onclick = closeModal;
}
function closeModal() { $("#modalBg").classList.remove("open"); $("#modal").classList.remove("report"); }
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
  let allowed = ALLOWED_EMAILS.includes(user.email);
  if (!allowed) { // 설정에서 추가한 계정 (Firestore 규칙이 허용해야 읽힘)
    try { const a = await getDoc(doc(db, "meta", "access")); allowed = a.exists() && (a.data().emails || []).includes(String(user.email).toLowerCase()); } catch {}
  }
  if (!allowed) return showLogin(`<b>${esc(user.email)}</b> 계정은 접근 권한이 없습니다.<br>관리자에게 허용 목록 추가를 요청하세요.`, true);
  $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
  if (window.__DEMO && !$(".demo-banner")) $("#appView").insertAdjacentHTML("afterbegin", `<div class="demo-banner">DEMO · 가상 데이터로 보는 화면입니다 (실제 업체·Firebase와 연결되지 않음) · <a href="./">실제 화면으로</a></div>`);
  $("#userEmail").textContent = user.email;
  // 관리자(firebase-config.js ALLOWED_EMAILS)만 [관리자 모드] 버튼이 보임 — 다른 계정은 업체·수원국 리스크 화면만
  state.admin = ALLOWED_EMAILS.includes(user.email);
  $("#btnAdmin").classList.toggle("hidden", !state.admin);
  setAdmin(state.admin && adminSaved());
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
  const [p, c, f, k, r, st, runs, cfg, ed, mk, acc, geo, guide] = await Promise.all([
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
    getDoc(doc(db, "meta", "access")),
    getDoc(doc(db, "meta", "geo")), // 수원국 리스크 (여행경보·지진·뉴스 이벤트) — 문서 1개라 읽기 1회
    getDoc(doc(db, "meta", "ai_guide")), // AI 판정 지침 (직접 쓴 것 + 담당자 판단을 AI가 요약한 것)
  ]);
  state.guide = guide.exists() ? guide.data() : {};
  state.projects = docs(p).sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || a.name.localeCompare(b.name));
  state.companies = docs(c);
  state.findings = docs(f);
  state.keywords = docs(k);
  state.recipients = docs(r);
  state.status = st.exists() ? st.data() : {};
  state.runs = docs(runs);
  state.settings = cfg.exists() ? cfg.data() : {};
  state.edcf = docs(ed);
  // 잘못된 명단(상태·제재기간 없음) 때문에 생긴 EDCF 기록은 바로 숨김 — 실제 삭제는 다음 스캔 또는 [잘못된 명단 비우기]
  const okEdcf = new Set(edcfMatches(state.edcf).map((x) => x.c.id));
  state.findings = state.findings.filter((f) => !String(f.dedup_key || "").startsWith("edcf-") || okEdcf.has(f.company_id));
  state.mdbKorea = mk.exists() ? mk.data() : null;
  state.access = acc.exists() ? (acc.data().emails || []) : [];
  state.geo = geo.exists() ? geo.data() : null;
  state.loadedAt = Date.now();
  if ((state.settings?.keywords_version || 0) < KEYWORDS_VERSION) await loadDefaultKeywords(); // 키워드를 모두 지워도 되살리지 않음
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
    c.risk = fs.reduce((m, f) => (f.level === "red" || f.level === "orange") && LV[f.level] > (LV[m] || 0) ? f.level : m, "none"); // 3단계: 참고(yellow)는 정상
    c.ref = fs.filter((f) => f.level === "yellow").length;
    c.open = groupFindings(fs.filter((f) => f.status === "new" && (f.level === "red" || f.level === "orange"))).length; // 확인할 일 = 위험·경고 (같은 이슈는 1건)
    c.total = fs.length;
  }
}
const byLevelDate = (a, b) => (LV[b.level] - LV[a.level]) || String(b.published_at || "").localeCompare(String(a.published_at || ""));
const worstOf = (cs) => cs.reduce((m, c) => LV[c.risk] > LV[m] ? c.risk : m, "none");

// ---------- 화면 전환 ----------
$$("#tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
$("#logoHome").addEventListener("click", () => { showView("home"); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("#logoHome").addEventListener("keydown", (e) => { if (e.key === "Enter") showView("home"); });
const ADMIN_VIEWS = ["companies", "projects", "settings"];
const adminSaved = () => { try { return localStorage.getItem("edcf_admin") === "1"; } catch { return false; } };
function setAdmin(on) {
  state.adminOn = !!(on && state.admin);
  document.body.classList.toggle("admin-on", state.adminOn);
  const b = $("#btnAdmin"); b.classList.toggle("on", state.adminOn);
  $(".ab-t", b).textContent = state.adminOn ? "관리자 모드 나가기" : "관리자 모드";
  b.title = state.adminOn ? "누르면 업체 리스크 화면으로 돌아갑니다" : "업체 관리·사업 관리·설정 (관리자 계정에만 보임)";
  try { localStorage.setItem("edcf_admin", state.adminOn ? "1" : "0"); } catch {}
}
$("#btnAdmin").onclick = () => {
  setAdmin(!state.adminOn);
  const cur = $("#tabs button.active")?.dataset.view || "home";
  showView(state.adminOn ? "companies" : ADMIN_VIEWS.includes(cur) ? "home" : cur);
};
// 업체 리스크 ↔ 수원국 리스크: 카드를 뒤집듯 전환 (가벼운 모드·움직임 줄이기 설정이면 바로 전환)
const FLIP = ["home", "geo"];
function showView(v) {
  if (!$(`#view-${v}`)) v = "home";
  if (ADMIN_VIEWS.includes(v) && !state.adminOn) v = "home"; // 관리자 모드가 아니면 관리 화면은 열지 않음
  const prev = $(".view.active")?.id?.slice(5);
  $("#modeSwitch").dataset.mode = v === "geo" ? "geo" : v === "home" ? "home" : "off";
  const flip = prev && prev !== v && FLIP.includes(prev) && FLIP.includes(v) && !document.documentElement.classList.contains("lite") && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (flip) {
    if (state.flipping) return;
    state.flipping = true;
    $$("#tabs button").forEach((x) => x.classList.toggle("active", x.dataset.view === v));
    const out = $(`#view-${prev}`);
    out.classList.add("flip-out");
    setTimeout(() => {
      out.classList.toggle("flip-out", false);
      state.flipping = false;
      openView(v);
      const inn = $(`#view-${v}`);
      inn.classList.add("flip-in");
      setTimeout(() => inn.classList.toggle("flip-in", false), 520);
    }, 260);
    return;
  }
  openView(v);
}
function openView(v) {
  if (state.adminOn && !ADMIN_VIEWS.includes(v)) setAdmin(false); // 대시보드로 가면 관리자 모드에서 나옴 (로고 등)
  $$("#tabs button").forEach((x) => x.classList.toggle("active", x.dataset.view === v));
  $$(".view").forEach((x) => x.classList.toggle("active", x.id === `view-${v}`));
  try { localStorage.setItem("view3", v); } catch {}
  $("#tabCnt").textContent = state.companies.length;
  $("#tabCntP").textContent = state.projects.length;
  v === "home" ? renderHome() : v === "geo" ? renderGeo() : v === "companies" ? renderCompanies() : v === "projects" ? renderProjects() : renderSettings();
}
const rerender = () => {
  compute(); showView($("#tabs button.active")?.dataset.view || "home");
  if (!$("#drawer").classList.contains("open")) return;
  if (state.openCid) openCompany(state.openCid, state.drawerBack);
  else if (state.riskList) openRiskList(state.riskList, "keep");
};
// 글자 크기: 상단 [가] 버튼으로 보통 → 크게 → 아주 크게 (모든 탭 같은 비율로)
const FONT_STEPS = [["sm", "작게"], ["", "보통"], ["lg", "크게"], ["xl", "아주 크게"]];
let fontStep = 1;
try { fontStep = Math.max(0, FONT_STEPS.findIndex(([k]) => k === (localStorage.getItem("edcf_font") || ""))); } catch {}
function applyFont() {
  const [k, label] = FONT_STEPS[fontStep];
  if (k) document.documentElement.dataset.font = k; else delete document.documentElement.dataset.font;
  $("#fontDown").disabled = fontStep === 0; $("#fontUp").disabled = fontStep === FONT_STEPS.length - 1;
  $("#fontDown").title = $("#fontUp").title = `글자 크기: ${label}`;
  $("#fontReset").textContent = label + (k ? "" : " (기본)"); $("#fontReset").classList.toggle("def", !k);
  $("#fontReset").title = k ? "누르면 기본 크기(보통)로" : "기본 글자 크기";
  requestAnimationFrame(() => { if (typeof fixLabels === "function") fixLabels(); });
}
const stepFont = (d) => { fontStep = Math.min(FONT_STEPS.length - 1, Math.max(0, fontStep + d)); try { localStorage.setItem("edcf_font", FONT_STEPS[fontStep][0]); } catch {} applyFont(); toast(`글자 크기: ${FONT_STEPS[fontStep][1]}`, 1500); };
$("#fontDown").onclick = () => stepFont(-1); $("#fontUp").onclick = () => stepFont(1);
$("#fontReset").onclick = () => stepFont(1 - fontStep); // 기본(보통)으로
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
// 자동 새로고침: 창으로 돌아올 때(1분 이상 지났으면)와 5분마다. 끌기·입력 중에는 건너뜀
// Firestore 무료 한도(하루 읽기 5만 건)를 아끼려고: 평소엔 상태 문서 1건만 확인하고, 새 스캔이 끝났을 때만 전체를 다시 읽음
async function autoRefresh(minAge) {
  if (!auth.currentUser || $("#appView").classList.contains("hidden")) return;
  if (Date.now() - state.loadedAt < minAge || document.body.classList.contains("dnd-active") || $("#modalBg").classList.contains("open")) return;
  const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  try {
    const snap = await getDoc(doc(db, "meta", "status")), s = snap.exists() ? snap.data() : {};
    if ((s.last_scan_at || "") === (state.status.last_scan_at || "")) { state.status = s; state.loadedAt = Date.now(); return; }
    await loadAll(); rerender();
  } catch (e) { console.warn("auto refresh", e); }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") autoRefresh(5 * 60e3); });
setInterval(() => { if (document.visibilityState === "visible") autoRefresh(10 * 60e3); }, 60e3);
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
const PERIODS = [["all", "전체"], ["7d", "최근 7일"], ["30d", "최근 30일"], ["old", "30일 이전"]]; // 수원국 리스크(geo.js)와 같은 구분
const pubMs = (f) => { const d = f.published_at ? Date.parse(String(f.published_at).slice(0, 10) + "T00:00:00+09:00") : NaN; return Number.isFinite(d) ? d : (f.first_seen_ms || Date.now()); };
// ---------- 같은 이슈 묶기 (monitor/grouping.py 와 같은 기준) ----------
// 같은 기사·같은 사건이 여러 건으로 보이지 않게 한 줄로 묶음. 묶인 기사는 펼쳐서 보고, 처리 버튼은 묶음 전체에 적용
//  ① 제목이 같거나(매체 꼬리·[단독] 같은 머리표 제외) 원문 주소가 같은 기사 — 업체가 달라도 하나로 (업체 이름을 함께 표시)
//  ② 같은 업체 · 같은 분류(예: 입찰담합) · 보도일 3일 이내 — 여러 매체가 같은 사건을 보도한 경우
//  ③ 같은 업체 · 제목이 거의 같음 (업체명을 뺀 제목의 글자 쌍 60% 이상 일치)
//  ④ 같은 업체 · 같은 공식 명단의 기록 여러 건 (예: EDCF 제재 이력)
//  ⑤ AI(Claude)가 판정할 때 '같은 사건'으로 표시한 기록 (same_as)
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
    // 제재는 법인 단위라서 같은 기사라도 업체마다 따로 한 건 (업체가 다르면 묶지 않음)
    if (t.length >= 8) add(`t|${st}|${f.company_id}|${t}`, i);
    if (u) add(`u|${st}|${f.company_id}|${u}`, i);
    add(`c|${st}|${f.company_id}`, i);
  });
  // ⑤ AI가 판정 때 '같은 사건'으로 표시한 기록 (same_as = 다른 기록 id)
  const byId = new Map(list.map((f, i) => [f.id, i]));
  list.forEach((f, i) => { const j = byId.get(f.same_as); if (j != null && list[j].company_id === f.company_id && (list[j].status || "new") === (f.status || "new")) join(j, i); });
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
  if (p === "old") return !official && age > 30 * DAY;
  if (official) return true; // 공식 제재·수기 기록은 기간과 무관하게 항상 표시
  return age <= { "7d": 7 * DAY, "30d": 30 * DAY }[p];
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
const BANDS = { red: [8, 25], orange: [38, 56], none: [68, 86], pending: [68, 86] };
const RADAR_MAX = 80; // 점이 너무 많으면 읽기 어려워서 — 등급 높은 순으로
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
    ...risky.slice(labeled.length, RADAR_MAX).map((c) => dot(c, 62 + (hash(c.id) % 236), c.risk, false)),
    ...(sc ? [] : cs.slice(0, RADAR_MAX).map((c) => dot(c, 32 + (hash(c.id) % 296), "pending", false))), // 정상 업체는 점 없이 바깥 원 숫자로
  ].join("");
  const t = (lv, y, label) => `<text class="bl ${lv}" x="100" y="${y}">${label} ${sc ? n[lv] : "-"}</text>`;
  // 바깥 테: 5도마다 눈금, 30도마다 긴 눈금 (계기판 느낌)
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = (i * 5 * Math.PI) / 180, major = i % 6 === 0, r1 = major ? 91.5 : 94.5, r2 = 97.5;
    return `<line class="tick ${major ? "major" : ""}" x1="${(100 + Math.sin(a) * r1).toFixed(2)}" y1="${(100 - Math.cos(a) * r1).toFixed(2)}" x2="${(100 + Math.sin(a) * r2).toFixed(2)}" y2="${(100 - Math.cos(a) * r2).toFixed(2)}"/>`;
  }).join("");
  const rg = (id, v, a, b) => `<radialGradient id="${id}" cx="50%" cy="50%" r="50%"><stop offset="${a}%" style="stop-color:var(${v});stop-opacity:.02"/><stop offset="${b}%" style="stop-color:var(${v});stop-opacity:.26"/><stop offset="100%" style="stop-color:var(${v});stop-opacity:.06"/></radialGradient>`;
  el.innerHTML = `
    <svg class="grid" viewBox="0 0 200 200" aria-hidden="true">
      <defs>${rg("rgNone", "--green", 66, 96)}${rg("rgOrange", "--orange", 48, 94)}${rg("rgRed", "--red", 0, 90)}
        <linearGradient id="rgBezel" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" style="stop-color:var(--accent)"/><stop offset="55%" style="stop-color:var(--accent-2);stop-opacity:.25"/><stop offset="100%" style="stop-color:var(--accent-2)"/></linearGradient>
        <linearGradient id="rgMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity=".55"/><stop offset="35%" stop-color="#94A3B8" stop-opacity=".18"/><stop offset="65%" stop-color="#0F172A" stop-opacity=".55"/><stop offset="100%" stop-color="#fff" stop-opacity=".3"/></linearGradient></defs>
      <circle class="metal" cx="100" cy="100" r="99.3"/><circle class="bezel" cx="100" cy="100" r="99"/><circle class="bezel-in" cx="100" cy="100" r="97.8"/><g class="ticks">${ticks}</g>
      <circle class="band none" cx="100" cy="100" r="90" fill="url(#rgNone)"/>
      <circle class="band orange" cx="100" cy="100" r="62" fill="url(#rgOrange)"/><circle class="band red" cx="100" cy="100" r="31" fill="url(#rgRed)"/>
      <circle class="sub" cx="100" cy="100" r="15.5"/><circle class="sub" cx="100" cy="100" r="46.5"/><circle class="sub" cx="100" cy="100" r="76"/>
      <circle class="ring glow none" cx="100" cy="100" r="90"/><circle class="ring glow orange" cx="100" cy="100" r="62"/><circle class="ring glow red" cx="100" cy="100" r="31"/>
      <circle class="ring none" cx="100" cy="100" r="90"/>
      <circle class="ring orange" cx="100" cy="100" r="62"/><circle class="ring red" cx="100" cy="100" r="31"/>
      <line class="axis" x1="100" y1="10" x2="100" y2="190"/><line class="axis" x1="10" y1="100" x2="190" y2="100"/>
      <line class="axis diag" x1="36.4" y1="36.4" x2="163.6" y2="163.6"/><line class="axis diag" x1="163.6" y1="36.4" x2="36.4" y2="163.6"/>
    </svg>
    <div class="sweep"></div><div class="radar-core"></div>
    <svg class="grid labels" viewBox="0 0 200 200" aria-hidden="true">${t("none", 20, "정상")}${t("orange", 50, "경고")}${t("red", 81, "위험")}</svg>
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
const LEVEL_SHORT = { red: "지금 제재 중 (입찰제한·MDB·영업정지)", orange: "수사·기소·과징금·처분 예고·부도", none: "위험·경고 이슈 없음" };
const ICON_USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`;
const ICON_ORG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/></svg>`;
function renderHome() {
  const cs = scopeCompanies(), ps = scopeProjects(), s = state.status, sc = scanned();
  const ids = new Set(cs.map((c) => c.id));
  const mineN = state.companies.filter((c) => c.mine).length, myP = state.projects.filter(isMine).length;
  document.body.dataset.scope = scope;

  // 제목 · 보기 범위
  const now = new Date(Date.now() + 9 * 3600e3);
  $("#heroDate").textContent = `RISK BRIEFING · ${now.toISOString().slice(0, 10).replace(/-/g, ".")} (${weekday[now.getUTCDay()]})`;
  // 마지막 스캔 시각 (하루 넘게 안 돌았으면 알림)
  $("#sumSub").textContent = sc ? `마지막 스캔 ${s.last_scan_at.slice(5, 16).replace("-", "/")}${hoursSince(s.last_scan_at) > 26 ? " · 자동 스캔이 하루 넘게 안 돌았습니다" : ""}` : "아직 스캔하지 않았습니다";
  $("#scopeSeg").innerHTML = !state.companies.length ? "" : [["mine", "내 담당 사업", mineN, myP, ICON_USER], ["all", "EDCF 전체", state.companies.length, state.projects.length, ICON_ORG]]
    .map(([k, l, cnt, pn, ic]) => `<button data-s="${k}" class="sc-btn ${k} ${k === scope ? "active" : ""}" title="${l}: 사업 ${pn}개 · 업체 ${cnt}곳"><span class="sc-ic">${ic}</span>${l}<span class="sc-n">업체 ${cnt}</span></button>`).join("");
  $$("#scopeSeg button").forEach((b) => b.onclick = () => { scope = b.dataset.s; try { localStorage.setItem("edcf_scope2", scope); } catch {} renderHome(); });
  $("#scopeInfo").innerHTML = !state.companies.length ? "" : info(`<b>내 담당 사업</b> — ${myP ? `내가 담당하는 사업 ${myP}개에 참여한 업체 ${mineN}곳` : "담당 사업이 없습니다 (사업 관리에서 [내 사업으로] 지정)"}<br><b>EDCF 전체</b> — 등록된 업체 ${state.companies.length}곳 전체 (사업 미연결 업체 포함)`, "r");

  if (!state.companies.length) showGuide(`<b>시작하기</b> — <b>업체 관리</b>에서 [일괄 등록]으로 업체를 넣고 <b>지금 스캔</b>을 누르세요.`);
  else if (!sc) showGuide(`업체 ${cs.length}곳이 등록됐습니다. <b>지금 스캔</b>을 눌러 첫 스캔을 실행하세요.`);
  else showGuide("");

  // ① 업체 등급: 위험·경고·정상 3단계를 한 판에 (숫자 · 해당 업체 · 등급 뜻)
  const open = state.findings.filter((f) => f.status === "new" && ids.has(f.company_id));
  // 확인할 일은 위험·경고만 — 참고(yellow)는 '참고 이력'으로 따로 모음 (처리하지 않아도 됨)
  const isAct = (f) => f.level === "red" || f.level === "orange";
  const openG = groupFindings(open.filter(isAct)); // 같은 기사·같은 사건은 한 건으로
  const refG = groupFindings(open.filter((f) => !isAct(f)));
  const byLv = { red: [], orange: [], none: [] };
  cs.forEach((c) => byLv[c.risk].push(c));
  const riskyN = byLv.red.length + byLv.orange.length;
  const who = (l) => { const x = [...l].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)); return x.slice(0, 2).map((c) => c.name).join(" · ") + (x.length > 2 ? ` 외 ${x.length - 2}` : ""); };
  $("#kboard").innerHTML = `<div class="card-head"><h2>업체 등급 ${info(levelTip())}</h2><span class="muted small">${sc ? `업체 ${cs.length} · 위험·경고 ${riskyN}` : "스캔 전"}</span></div>`
    + ["red", "orange", "none"].map((lv) => {
      const l = byLv[lv];
      return `<button class="rk ${lv} ${sc && l.length ? "on" : ""}" data-lv="${lv}" ${sc && l.length ? `title="누르면 ${LEVEL[lv]} 업체 ${l.length}개를 봅니다"` : "disabled"}>
        <div class="rk-num">${sc ? `<span data-count="${l.length}">0</span>` : "-"}</div>
        <div class="rk-lv">${LEVEL[lv]}</div>
        <div class="rk-names ${sc && l.length && lv !== "none" ? "" : "zero"}">${!sc ? "스캔 전" : lv === "none" ? (l.length ? `위험·경고 이슈 없음${l.filter((c) => c.ref).length ? ` · 참고 이력 ${l.filter((c) => c.ref).length}` : ""}` : "해당 업체 없음") : l.length ? esc(who(l)) : "해당 업체 없음"}</div></button>`;
    }).join("");
  // ② 공식 제재 명단 대조: 출처별(EXIMIIS·조달청·MDB) 현황만 — 아래 이슈 목록과 겹치지 않게
  const off = state.findings.filter((f) => ids.has(f.company_id) && f.source_type !== "news" && f.status !== "dismissed");
  const oc = { edcf: [new Set(), new Set()], pps: [new Set(), new Set()], mdb: [new Set(), new Set()] }; // [지금 제재 중, 그 밖]
  off.forEach((f) => oc[officialSrc(f)][f.level === "red" ? 0 : 1].add(f.company_id));
  const evN = state.edcf.filter(edcfValid).length;
  const ocRow = (name, k, other, extra) => `<div class="oc-row"><span class="oc-k">${name}</span><span class="oc-v">${oc[k][0].size ? `<b class="red-t">제재 중 ${oc[k][0].size}</b>` : `<span class="muted">제재 중 0</span>`}${oc[k][1].size ? ` <span class="muted">· ${other} ${oc[k][1].size}</span>` : ""}</span>${extra || ""}</div>`;
  $("#noteCard").innerHTML = `<div class="oc-head"><h2>공식 제재 명단 ${info(`<div class="tip-p">우리 업체를 공식 제재 명단과 대조한 결과입니다.</div><div class="tip-grid"><b>EDCF</b><span>EXIMIIS 부정당업자 명단</span><b>조달청</b><span>나라장터 현재 제재</span><b>MDB</b><span>World Bank · ADB · AfDB · IDB · EBRD</span></div><div class="tip-p muted">'제재 중'은 지금 유효한 제재(= 위험)입니다. 카드를 누르면 업체별 내용을 봅니다.</div>`)}</h2>${evN ? "" : `<span class="oc-x"><span class="warn-t">EXIMIIS 명단 없음</span></span>`}</div>
    <div class="oc-rows">${ocRow("EDCF (EXIMIIS)", "edcf", "과거")}${ocRow("조달청", "pps", "집행정지")}${ocRow("MDB", "mdb", "이름 유사")}</div>`;
  const nums = [$("#kboard"), $("#noteCard")];
  if (!state.kpiAnimated) { state.kpiAnimated = true; nums.forEach(countUp); } // 숫자 올라가는 효과는 처음 한 번만
  else nums.forEach((el) => $$("[data-count]", el).forEach((e) => (e.textContent = e.dataset.count)));
  $$("#kboard .rk:not(:disabled)").forEach((b) => b.onclick = () => openRiskList(b.dataset.lv));
  $("#noteCard").onclick = (e) => { if (!e.target.closest(".itip")) openOfficial(cs); };
  $("#noteCard").onkeydown = (e) => { if (e.key === "Enter") openOfficial(cs); };

  // ③ 레이더 + 귀퉁이 정보 (범위 · 범례 · 마지막 스캔)
  renderRadar(cs);
  $("#radarHud").innerHTML = `<span class="hud tl"><b>RISK RADAR</b><i>${scope === "mine" ? "내 담당" : "EDCF 전체"} · 업체 ${cs.length}</i></span>
    <span class="hud bl"><span><i class="lg red"></i>위험 ${sc ? byLv.red.length : "-"}</span><span><i class="lg orange"></i>경고 ${sc ? byLv.orange.length : "-"}</span><span><i class="lg none"></i>정상 ${sc ? byLv.none.length : "-"}</span></span>
    <span class="hud br"><i>마지막 스캔</i><b>${sc ? esc(String(state.status.last_scan_at || "-").slice(5, 16)) : "스캔 전"}</b></span>`;
  $("#radarInfo").innerHTML = info(`<b>${scope === "mine" ? "내 담당" : "전체"} 업체 ${cs.length}곳</b> — 가운데로 갈수록 위험합니다.<br>점은 위험·경고 업체만 표시하고(최대 ${RADAR_MAX}곳), 정상 업체는 바깥 원에 숫자로만 보여줍니다.<br>점을 누르면 업체 상세, 빈 곳을 누르면 다시 훑어봅니다.`, "r");

  // ④ 확인이 필요한 이슈 (위험 → 공식 제재 → 최신)
  const counts = Object.fromEntries(PERIODS.map(([k]) => [k, openG.filter((g) => groupIn(g, k)).length]));
  if (!period || !counts.hasOwnProperty(period)) period = counts["7d"] ? "7d" : "all";
  $("#periodSeg").innerHTML = PERIODS.map(([k, label]) => `<button data-p="${k}" class="${k === period ? "active" : ""}">${label} <span class="n">${counts[k]}</span></button>`).join("");
  $$("#periodSeg button").forEach((b) => b.onclick = () => { period = b.dataset.p; try { localStorage.setItem("edcf_period", period); } catch {} renderHome(); });
  const shown = openG.filter((g) => groupIn(g, period));
  $("#issueCount").textContent = openG.length;
  $("#actHelp").innerHTML = info(`<div class="tip-p"><b>두 버튼의 차이</b></div><div class="tip-grid wide"><b>✓ 확인 완료</b><span>이 업체 이야기가 <b>맞음</b>. 목록에서 내려가고 <b>등급은 유지</b>. 비슷한 유형의 <b>새</b> 사건은 계속 알려줌</span><b>✕ 관련 없음</b><span>이 업체 이야기가 <b>아님</b>(동명이인·다른 회사·단순 언급). <b>등급에서 빠지고</b>, AI가 비슷한 유형을 앞으로 걸러냄</span></div><div class="tip-p muted">둘 다 같은 기사는 다시 가져오지 않고, 업체 상세에서 되돌릴 수 있습니다.</div>`);
  if (shown.length) renderGroups(shown, $("#feed"));
  else $("#feed").innerHTML = !sc ? `<div class="empty">스캔 후 이곳에 이슈가 출처와 함께 표시됩니다.</div>`
    : openG.length ? `<div class="ok-box">이 조건에는 확인할 이슈가 없습니다 <span class="muted small">(전체 ${openG.length}건)</span></div>`
    : `<div class="ok-box">확인이 필요한 이슈가 없습니다</div>`;
  if (period === "old" && shown.length) { // 30일 지난 기사: 이미 아는 과거 이력이면 한 번에 정리
    $("#feed").insertAdjacentHTML("afterbegin", `<div class="bulk-bar"><span>30일 지난 기사 <b>${shown.length}건</b> · 이미 아는 과거 이력이면 한 번에 정리할 수 있습니다</span><button class="btn sm" id="bulkOld">모두 확인 완료</button></div>`);
    $("#bulkOld").onclick = () => bulkReview(shown);
  }
  // 참고 이력: 처리하지 않아도 되는 목록 — 펼칠 때만 그림
  const refW = $("#refWrap");
  refW.classList.toggle("hidden", !refG.length);
  $("#refN").textContent = refG.length;
  refW.ontoggle = () => { if (!refW.open) return; renderGroups(refG.slice(0, 100), $("#feedRef")); if (refG.length > 100) $("#feedRef").insertAdjacentHTML("beforeend", `<div class="muted small">앞의 100건만 보여줍니다 (전체 ${refG.length}건 · 업체 상세에서 모두 볼 수 있음)</div>`); };
  if (refW.open) refW.ontoggle();
  const done = state.findings.filter((f) => f.status === "reviewed" && ids.has(f.company_id)).sort(byLevelDate);
  $("#doneWrap").classList.toggle("hidden", !done.length);
  if (done.length) renderFeed(done, $("#feedDone"));

  // ⑤ 담당 사업 (위험 업체가 많은 사업부터)
  $("#projTitle").textContent = scope === "mine" ? "내 담당 사업" : "전체 사업";
  $("#projN").textContent = ps.length;
  const tally = (p) => { const t = { red: 0, orange: 0, yellow: 0, none: 0 }; state.companies.forEach((c) => { if (c.engagements.some((e) => e.project_id === p.id)) t[c.risk]++; }); return t; };
  const tl = Object.fromEntries(ps.map((p) => [p.id, tally(p)]));
  const psSorted = [...ps].sort((a, b) => !sc ? a.name.localeCompare(b.name)
    : (tl[b.id].red - tl[a.id].red) || (tl[b.id].orange - tl[a.id].orange) || a.name.localeCompare(b.name));
  $("#projectMap").innerHTML = psSorted.map((p) => projectRow(p)).join("")
    || `<div class="empty small">${scope === "mine" ? "내가 담당하는 사업이 없습니다." : "등록된 사업이 없습니다."}</div>`;
  $$("#projectMap .pj").forEach((r) => { r.addEventListener("mouseenter", () => focusProject(r.dataset.pid)); r.addEventListener("mouseleave", () => focusProject(null)); });
  $$("#projectMap [data-cid]").forEach((x) => x.addEventListener("click", () => openCompany(x.dataset.cid)));

  renderJob(); checkSmooth();
}
// 사업 한 줄: 업체 등급 분포(막대) + 등급별 업체 수. '하나라도 위험이면 사업 전체가 위험'처럼 보이지 않게
function projectRow(p) {
  const rows = [];
  for (const c of state.companies) c.engagements.forEach((e) => { if (e.project_id === p.id) rows.push({ c, e }); });
  rows.sort((a, b) => ROLE_ORDER.indexOf(a.e.role) - ROLE_ORDER.indexOf(b.e.role) || byOrder(a, b));
  const sc = scanned(), t = { red: 0, orange: 0, yellow: 0, none: 0 };
  new Set(rows.map((r) => r.c)).forEach((c) => t[c.risk]++);
  const total = t.red + t.orange + t.none;
  const bar = !total ? "" : !sc ? `<i class="pending" style="flex:1"></i>`
    : ["red", "orange", "none"].filter((lv) => t[lv]).map((lv) => `<i class="${lv}" style="flex:${t[lv]}" title="${LEVEL[lv]} ${t[lv]}곳"></i>`).join("");
  const sum = !total ? `<span class="tot">연결된 업체 없음</span>`
    : !sc ? `<span class="tot">업체 ${total}곳 · 스캔 전</span>`
    : (["red", "orange"].filter((lv) => t[lv]).map((lv) => `<span class="${lv}">${LEVEL[lv]} ${t[lv]}</span>`).join("") || `<span class="ok">이상 없음</span>`) + `<span class="tot">/ ${total}곳</span>`;
  return `<div class="pj" data-pid="${p.id}">
    <div class="pj-top"><span class="pj-name" title="${esc(p.name)}">${esc(p.name)}</span>${p.country ? `<span class="pj-ctry">${esc(COUNTRY[p.country] || p.country)}</span>` : ""}</div>
    ${total ? `<div class="pj-dist"><div class="pj-bar">${bar}</div><div class="pj-sum">${sum}</div></div>` : `<div class="pj-dist"><div class="pj-sum">${sum}</div></div>`}
    <div class="pj-roles">${pjRoles(rows, sc)}</div>
  </div>`;
}
// 사업 카드 안 업체: 역할(F/S → 컨설턴트 → 본구매)별로 한 줄씩 — 역할이 섞여 보이지 않게
function pjRoles(rows, sc) {
  const roles = [...ROLE_ORDER, ...new Set(rows.map((r) => r.e.role).filter((r) => !ROLE_ORDER.includes(r)))];
  return roles.map((role) => {
    const l = rows.filter((r) => r.e.role === role);
    if (!l.length) return "";
    return `<div class="pj-role">${roleTag(role || "기타")}<div class="pcos">${l.map(({ c, e }) => `<span class="cchip ${sc ? c.risk : ""}" data-cid="${c.id}" title="${esc(c.name)}${sc ? " · " + LEVEL[c.risk] : ""}${e.stage && e.stage !== "계약" ? " · " + esc(e.stage) : ""}"><span class="dot ${sc ? c.risk : ""}"></span>${esc(c.name)}${e.rank ? `<small>${e.rank}순위</small>` : e.stage && e.stage !== "계약" ? `<small>${esc(e.stage)}</small>` : ""}</span>`).join("")}</div></div>`;
  }).join("");
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
    ${row(state.edcf.length ? "ok" : "warn", "EDCF 부정당업자 명단 (EXIMIIS)", state.edcf.length ? `${state.edcf.length}건과 대조` : "아직 등록되지 않음 → 업체 관리 [EXIMIIS 제재 명단]에서 올리기")}
    ${row(mk?.count ? "warn" : "ok", "MDB 한국 국적 제재 기업", mk ? `${mk.count || 0}곳 (우리 명단과 별개로 참고) <a href="#" id="dcMdb">목록 보기</a>` : "첫 스캔 후 표시")}
    ${gapN ? `<div class="actions left"><button class="btn sm" id="dcGaps">보완할 업체 ${gapN}곳 보기</button></div>` : ""}`);
  $("#dcMdb")?.addEventListener("click", (e) => { e.preventDefault(); showMdbKorea(); });
  $("#dcGaps")?.addEventListener("click", showGaps);
}

const officialSrc = (f) => /EXIMIIS|EDCF/.test(f.source_name || "") ? "edcf" : /조달청|나라장터/.test(f.source_name || "") ? "pps" : "mdb";
function openOfficial(cs = scopeCompanies()) {
  const ids = new Set(cs.map((c) => c.id)), st = state.settings || {};
  const off = state.findings.filter((f) => ids.has(f.company_id) && f.source_type !== "news" && f.status !== "dismissed")
    .sort((a, b) => (LV[b.level] - LV[a.level]) || String(a.company_name).localeCompare(String(b.company_name)));
  const ev = state.edcf.filter(edcfValid), bad = state.edcf.length - ev.length;
  const matchBy = new Map(edcfMatches(state.edcf).map((x) => [x.e, x.c]));
  const cv = coverage(cs), gapN = cs.filter((c) => c.last_check && checkGaps(c).length).length, mk = state.mdbKorea;
  const row = (ok, k, d) => `<div class="chk-row ${ok}"><span class="ic">${{ ok: "✓", warn: "!", bad: "✕", na: "–" }[ok]}</span><div><b>${k}</b><div class="d">${d}</div></div></div>`;
  const stt = (k, t) => !t ? "na" : k === t ? "ok" : k === 0 ? "bad" : "warn";
  // 출처별 한 칸: 우리 업체 가운데 그 명단에 있는 업체만 (같은 업체·같은 내용은 한 줄)
  const STATE = { edcf: { red: "제재 중", orange: "확인 필요", yellow: "과거 (해지)" }, pps: { red: "제재 중", orange: "집행정지 확인", yellow: "과거" }, mdb: { red: "제재 중", orange: "이름 유사", yellow: "이름 유사" } };
  const src = (k, name, desc) => {
    const seen = new Set(), l = off.filter((f) => officialSrc(f) === k && !seen.has(f.company_id + "|" + f.title) && seen.add(f.company_id + "|" + f.title));
    const now = new Set(l.filter((f) => f.level === "red").map((f) => f.company_id)).size;
    return `<div class="oc-src"><div class="oc-src-h"><b>${name}</b><span class="d">${desc}</span><span class="n ${now ? "red-t" : "muted"}">제재 중 ${now}${l.length - now > 0 ? ` <span class="muted">· 그 밖 ${new Set(l.filter((f) => f.level !== "red").map((f) => f.company_id)).size}</span>` : ""}</span></div>
      ${l.length ? `<div class="tbl-wrap"><table class="tbl oc-tbl"><thead><tr><th>업체</th><th>상태</th><th>내용</th></tr></thead><tbody>${l.map((f) => `<tr><td class="nowrap"><a href="#" data-oc="${f.company_id}">${esc(f.company_name)}</a></td><td class="nowrap"><span class="badge ${f.level}">${STATE[k][f.level] || LEVEL[f.level]}</span></td><td class="small">${esc(String(f.title || "").replace(/^\[[^\]]*\]\s*/, "").replace(/\s—\s/g, " · "))}</td></tr>`).join("")}</tbody></table></div>`
        : `<div class="oc-none">이 명단에 있는 업체가 없습니다</div>`}</div>`;
  };
  modal(`<h2>공식 제재 명단</h2>
    <p class="muted small">${scope === "mine" ? "내 담당 사업" : "EDCF 전체"} 업체 ${cs.length}개를 공식 제재 명단 세 곳과 맞춰 본 결과입니다. 명단에 있는 업체만 보입니다.</p>
    ${src("edcf", "EDCF", "EXIMIIS 부정당업자 명단" + (st.edcf_sanctions_at && ev.length ? ` · ${esc(st.edcf_sanctions_at.slice(0, 10))} 올린 명단 ${ev.length}건` : ev.length ? "" : " · 아직 올리지 않음"))}
    ${src("pps", "조달청", "나라장터 부정당제재 · 사업자번호로 매일 조회")}
    ${src("mdb", "MDB", "World Bank, ADB, AfDB, IDB, EBRD 제재 리스트 · 영문명으로 매일 대조")}
    <details class="oc-more" ${ev.length ? "" : "open"}><summary>EXIMIIS 명단 올리기 · 올린 명단 ${ev.length}건 보기</summary>
      <div class="oc-btns"><button class="btn sm" id="edcfUp">엑셀 올리기</button><button class="btn sm" id="edcfPaste">표 붙여넣기</button><span class="muted small">EXIMIIS → 경협 → 업무지원 → 부정당업자조회 엑셀. 새로 올리면 기존 명단을 바꿉니다.</span></div>
      ${bad ? `<div class="edcf-bad"><b>제재 기록이 아닌 행 ${bad}건</b>(상태·제재기간 없음)이 들어 있습니다. 대조에는 쓰지 않습니다. <button class="btn sm danger" id="edcfClear">잘못된 명단 비우기</button></div>` : ""}
      ${ev.length ? `<div class="tbl-wrap"><table class="tbl oc-tbl"><thead><tr><th>업체명</th><th>상태</th><th>제재기간</th><th>관련 사업</th><th>사업자번호</th><th>우리 업체</th></tr></thead><tbody>${ev.map((e) => {
        const c = matchBy.get(e);
        return `<tr><td class="nowrap">${esc(e.name)}</td><td>${/등록/.test(e.status || "") ? `<span class="badge red">등록</span>` : `<span class="muted">${esc(e.status || "-")}</span>`}</td><td class="small nowrap">${esc(e.period || "")}</td><td class="small">${esc(e.project_name || "")}${e.country ? ` <span class="muted">(${esc(e.country)})</span>` : ""}</td><td class="small nowrap">${esc(fmtBiz(e.biz_no))}</td><td class="nowrap">${c ? `<a href="#" data-oc="${c.id}">${esc(c.name)}</a>` : `<span class="muted">-</span>`}</td></tr>`;
      }).join("")}</tbody></table></div>` : ""}
    </details>
    <details class="oc-more"><summary>검사 범위 보기 (마지막 스캔 기준)</summary>
      ${row(stt(cv.news, cv.scanned), "뉴스 검색", `${cv.news}/${cv.scanned} · Google, 네이버 뉴스에서 업체명과 제재 키워드 검색`)}
      ${row(stt(cv.mdb, cv.scanned), "MDB 제재 리스트", `${cv.mdb}/${cv.scanned} · 영문명으로 대조${cv.mdb < cv.scanned ? " (영문명이 없는 업체는 불완전)" : ""}`)}
      ${cv.ppsConnected ? row(stt(cv.pps, cv.ppsTotal), "조달청 부정당제재", `${cv.pps}/${cv.ppsTotal} · 사업자번호로 현재 유효한 제재 조회${cv.pps < cv.ppsTotal ? " (사업자번호가 없는 업체는 조회 못 함)" : ""}`) : row("na", "조달청 부정당제재", "미연결")}
      ${row(mk?.count ? "warn" : "ok", "MDB 한국 국적 제재 기업", mk ? `${mk.count || 0}개 (우리 명단과 별개로 참고) <a href="#" id="dcMdb">목록 보기</a>` : "첫 스캔 후 표시")}
      ${gapN ? `<div class="actions left"><button class="btn sm" id="dcGaps">사업자번호·영문명 보완할 업체 ${gapN}</button></div>` : ""}
    </details>`);
  $("#modal").classList.add("wide");
  $$("#modal [data-oc]").forEach((a) => a.onclick = (e) => { e.preventDefault(); closeModal(); openCompany(a.dataset.oc); });
  $("#edcfUp").onclick = () => $("#edcfFile").click();
  $("#edcfPaste").onclick = openEdcfPaste;
  $("#edcfClear")?.addEventListener("click", clearEdcf);
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
        ${f.status !== "reviewed" ? `<button class="btn sm act-ok" data-act="reviewed" title="이 업체 이야기가 맞고 내용을 확인함. 목록에서 내려가고 등급은 그대로 남습니다. 비슷한 유형의 새 기사는 앞으로도 알려줍니다${more.length ? ` (같은 내용 ${g.items.length}건 함께)` : ""}">✓ 확인 완료</button>` : ""}
        ${f.status !== "dismissed" ? `<button class="btn sm act-no" data-act="dismissed" title="이 업체 이야기가 아님(동명이인·다른 회사·단순 언급). 등급에서 빠지고, AI가 비슷한 유형을 앞으로 걸러냅니다${more.length ? ` (같은 내용 ${g.items.length}건 함께)` : ""}">✕ 관련 없음</button>` : ""}
        ${f.status && f.status !== "new" ? `<button class="btn sm ghost" data-act="new">되돌리기</button>` : ""}
      </span>
    </div>
    ${more.length ? `<details class="dup"><summary>같은 내용 ${more.length}건 더${srcs.length ? ` <span class="dup-src">${esc(srcs.slice(0, 3).join(" · "))}${srcs.length > 3 ? " 외" : ""}</span>` : ""}</summary>
      <div class="dup-list">${more.map((x) => `<div class="dup-row">${badge(x.level)}${showCompany && x.company_id !== f.company_id ? `<b>${esc(x.company_name)}</b>` : ""}
        ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.summary || "")}">${esc(x.title || x.summary || "-")}</a>` : `<span title="${esc(x.summary || "")}">${esc(x.title || x.summary || "-")}</span>`}
        <span class="muted">${esc(x.source_name || "")}${x.published_at ? " · " + esc(x.published_at) : ""}</span></div>`).join("")}</div></details>` : ""}
  </div>`;
}
// 과거 이력 일괄 정리 ('확인했음'으로 — 등급은 그대로, AI 판정 예시에는 쓰지 않음)
async function bulkReview(groups) {
  const ids = groups.flatMap((g) => g.items.map((x) => x.id));
  if (!ids.length || !confirm(`30일 지난 기사 ${groups.length}건(기록 ${ids.length}개)을 '확인 완료'로 처리할까요?\n등급은 그대로 남고, '확인 완료한 이슈'에서 되돌릴 수 있습니다.`)) return;
  const patch = { status: "reviewed", reviewed_by: auth.currentUser.email, reviewed_at: nowStr(), review_note: "과거 이력 일괄 정리" };
  for (let i = 0; i < ids.length; i += 400) { const b = writeBatch(db); ids.slice(i, i + 400).forEach((id) => b.update(doc(db, "findings", id), patch)); await b.commit(); }
  ids.forEach((id) => Object.assign(state.findings.find((f) => f.id === id) || {}, patch));
  toast(`30일 지난 기사 ${groups.length}건을 확인 완료로 처리했습니다`);
  rerender();
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
    toast((st === "dismissed" ? "관련 없음: 등급에서 빠지고, AI가 비슷한 유형을 앞으로 걸러냅니다" : st === "reviewed" ? "확인 완료: 목록에서 내려가고 등급은 그대로 남습니다" : "되돌렸습니다") + both, 4000);
    rerender();
  }));
}

// ---------- 보고서 (PDF로 저장) — 대시보드에서 고른 범위 기준, 메일과 같은 디자인 ----------
const REPORT_PERIODS = [["all", "전체 기간"], ["30", "최근 30일"], ["7", "최근 7일"]];
// 보고서: 왼쪽에서 고르면 오른쪽 미리보기(A4)가 바로 바뀜 → [PDF로 저장]
function openReport() {
  modal(`<div class="rp-wrap">
    <form id="rpForm" class="form rp-opts" autocomplete="off">
      <h2>보고서 내려받기</h2>
      <p class="muted small">기본은 <b>한 장 요약</b>(위험·경고 이슈 + 사업별 현황)입니다. 오른쪽에서 미리 본 뒤 저장하세요.</p>
      <label>범위<select name="scope"><option value="mine" ${scope === "mine" ? "selected" : ""}>내 담당 사업</option><option value="all" ${scope === "all" ? "selected" : ""}>EDCF 전체</option></select></label>
      <label>이슈 기간<select name="period">${REPORT_PERIODS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" name="detail"> 자세한 목록 포함 (이슈 전체 · 리스크 업체 · 사업별 업체)</label>
      <label class="check"><input type="checkbox" name="done"> 확인 완료한 이슈도 포함</label>
      <p class="muted small rp-hint">저장: 인쇄 창의 <b>대상</b>에서 <b>PDF로 저장</b>을 고르세요.</p>
      <div class="actions"><button class="btn primary">PDF로 저장</button></div>
    </form>
    <div class="rp-prev"><div class="rp-prev-h"><span>미리보기</span><span class="muted small" id="rpPages"></span></div><div class="rp-scroll" id="rpScroll"><div class="rp-paper" id="rpPaper"><iframe id="rpFrame" title="보고서 미리보기" tabindex="-1"></iframe></div></div></div>
  </div>`);
  $("#modal").classList.add("report");
  const opts = () => { const fd = Object.fromEntries(new FormData($("#rpForm"))); return { scope: fd.scope, period: fd.period, done: !!fd.done, detail: !!fd.detail }; };
  const A4W = 794, A4H = 1123; // A4 (96dpi)
  const draw = () => {
    const f = $("#rpFrame"); if (!f) return;
    const fit = () => {
      if (!f.isConnected || !f.contentDocument?.body) return;
      const box = $("#rpScroll"), k = Math.min(1, (box.clientWidth - 24) / A4W);
      f.style.width = A4W + "px"; f.style.height = A4H + "px"; // 먼저 A4 폭·한 쪽 높이로 맞춘 뒤 내용 높이를 잼 (좁은 폭에서 재면 빈 쪽이 생김)
      const h = Math.max(A4H, Math.ceil(f.contentDocument.body.getBoundingClientRect().height));
      f.style.height = h + "px"; f.style.transform = `scale(${k})`;
      $("#rpPaper").style.width = A4W * k + "px"; $("#rpPaper").style.height = h * k + "px";
      $("#rpPages").textContent = `약 ${Math.max(1, Math.ceil((h - 8) / A4H))}쪽`;
    };
    f.onload = () => { fit(); setTimeout(fit, 600); }; // 글꼴이 늦게 오면 한 번 더
    // 화면 미리보기에도 인쇄 여백(@page 13mm 12mm)을 똑같이
    f.srcdoc = buildReport(opts()).html.replace("</head>", "<style>@media screen { html { background: #fff; } body { margin: 0; padding: 13mm 12mm; } }</style></head>");
  };
  $("#rpForm").onchange = draw;
  draw();
  $("#rpForm").onsubmit = (ev) => {
    ev.preventDefault();
    closeModal();
    printReport(buildReport(opts()));
  };
}
function buildReport({ scope: sc0, period, done, detail = false }) {
  const C = { red: ["#D92D20", "#FDE8E6", "위험"], orange: ["#E2660A", "#FEEFE0", "경고"], yellow: ["#64748B", "#EEF1F5", "참고"], none: ["#0D9488", "#E2F4F2", "정상"] };
  const BF = { red: ["#D92D20", "#FFFFFF"], orange: ["#F57C00", "#2B1400"], yellow: ["#E2E8F0", "#475569"], none: ["#E2F4F2", "#0D9488"] }; // 대시보드와 같은 꽉 찬 배지 (참고는 회색)
  const bd = (lv) => { const [bg, fg] = BF[lv || "none"] || BF.none, l = (C[lv || "none"] || C.none)[2]; return `<span class="bd" style="color:${fg};background:${bg}">● ${l}</span>`; };
  const ROLE_C = { "F/S": "#0E7490", 컨설턴트: "#1D4ED8", 본구매: "#A21CAF" };
  const role = (r) => `<span class="role" style="color:${ROLE_C[r] || "#3D4A63"}">${esc(r)}</span>`;
  const sc = scanned();
  const cs = sc0 === "mine" ? state.companies.filter((c) => c.mine) : state.companies;
  const ps = sc0 === "mine" ? state.projects.filter(isMine) : state.projects;
  const ids = new Set(cs.map((c) => c.id));
  const days = period === "all" ? null : +period;
  const fs = state.findings.filter((f) => ids.has(f.company_id) && (f.status === "new" || (done && f.status === "reviewed")) && (!days || Date.now() - pubMs(f) <= days * DAY));
  const groups = groupFindings(fs), MAX = 300;
  const t = { red: 0, orange: 0, none: 0 };
  cs.forEach((c) => { if (sc && t[c.risk] != null) t[c.risk]++; });
  const risky = cs.filter((c) => sc && c.risk !== "none").sort((a, b) => LV[b.risk] - LV[a.risk] || b.open - a.open || a.name.localeCompare(b.name));
  const now = nowStr(), scopeL = sc0 === "mine" ? "내 담당 사업" : "EDCF 전체", periodL = REPORT_PERIODS.find(([k]) => k === period)[1];
  const projRows = ps.map((p) => {
    const rows = [];
    for (const c of state.companies) c.engagements.forEach((e) => { if (e.project_id === p.id) rows.push({ c, e }); });
    rows.sort((a, b) => ROLE_ORDER.indexOf(a.e.role) - ROLE_ORDER.indexOf(b.e.role) || byOrder(a, b));
    const k = { red: 0, orange: 0 }; new Set(rows.map((r) => r.c)).forEach((c) => { if (sc && k[c.risk] != null) k[c.risk]++; });
    return `<tr><td><b>${esc(p.name)}</b>${p.country ? `<div class="mu">${esc(COUNTRY[p.country] || p.country)}</div>` : ""}</td>
      <td>${rows.map(({ c, e }) => `<div>${role(e.role)} ${esc(c.name)}${e.stage && e.stage !== "계약" ? ` <span class="mu">(${esc(e.stage)}${e.rank ? " " + e.rank + "순위" : ""})</span>` : ""} ${sc && c.risk !== "none" ? bd(c.risk) : ""}</div>`).join("") || `<span class="mu">연결된 업체 없음</span>`}</td>
      <td class="c">${["red", "orange"].map((lv) => k[lv] ? `<span style="color:${C[lv][0]};font-weight:700">${C[lv][2]} ${k[lv]}</span>` : "").filter(Boolean).join(" · ") || `<span style="color:${C.none[0]}">이상 없음</span>`}</td></tr>`;
  }).join("");
  const engL = (c) => byRole(c.engagements).map((e) => `${role(e.role)} ${esc(projName(e.project_id))}${e.stage && e.stage !== "계약" ? ` <span class="mu">(${esc(e.stage)})</span>` : ""}`).join("<br>") || `<span class="mu">사업 미연결</span>`;
  const issue = (g) => {
    const f = g.rep, [fg] = C[f.level] || C.none, more = g.items.slice(1);
    return `<div class="is" style="border-left-color:${fg}">
      <div class="is-h">${bd(f.level)} <b>${esc(g.companies.map((c) => c.name).join(" · "))}</b>${f.source_type !== "news" ? ` <span class="tg red">공식 제재 명단</span>` : ""}${f.category && f.category !== "기타" ? ` <span class="tg">${esc(f.category)}</span>` : ""}${f.status === "reviewed" ? ` <span class="tg">확인 완료</span>` : ""}</div>
      <div class="is-s">${esc(f.summary || f.title)}</div>
      <div class="mu">${esc(f.source_name || "-")} · ${esc(f.published_at || "날짜 미상")}${f.url ? ` · <a href="${esc(f.url)}">원문</a>` : ""}</div>
      <div class="mu">「${esc(f.title || "")}」</div>
      ${more.length ? `<div class="dup">같은 내용 ${more.length}건 더: ${more.slice(0, 5).map((x) => esc(String(x.source_name || "").replace(/\s*\((Google News|Naver|네이버)\)$/i, "")) + (x.published_at ? " " + esc(x.published_at) : "")).join(" · ")}${more.length > 5 ? " 외" : ""}</div>` : ""}
    </div>`;
  };
  // 한 장 요약 (기본): 위험·경고 이슈 한 줄씩 + 사업별 리스크 수
  const hotG = groups.filter((g) => g.rep.level === "red" || g.rep.level === "orange"), yelN = groups.length - hotG.length;
  const pStat = (p) => { const s = new Set(); state.companies.forEach((c) => { if (c.engagements.some((e) => e.project_id === p.id)) s.add(c); }); const k = { red: 0, orange: 0 }; s.forEach((c) => { if (sc && k[c.risk] != null) k[c.risk]++; }); return { n: s.size, k }; };
  const simpleBody = `<h2>확인이 필요한 이슈 <span class="mu">위험·경고 ${hotG.length}건${yelN ? ` · 참고 이력 ${yelN}건은 생략` : ""}</span></h2>
${hotG.length ? `<table><tr><th style="width:10%">등급</th><th style="width:22%">업체</th><th>내용</th><th class="c" style="width:13%">날짜</th></tr>${hotG.slice(0, 20).map((g) => `<tr><td>${bd(g.rep.level)}</td><td><b>${esc(g.companies.map((c) => c.name).join(" · "))}</b></td><td>${esc(g.rep.summary || g.rep.title || "")}${g.rep.source_type !== "news" ? ` <span class="tg red">공식 명단</span>` : ""}</td><td class="c">${esc(g.rep.published_at || "-")}</td></tr>`).join("")}</table>${hotG.length > 20 ? `<div class="mu" style="margin-top:6px">외 ${hotG.length - 20}건은 대시보드 또는 '자세한 목록 포함'으로 확인</div>` : ""}` : `<div class="empty">해당 기간에 확인할 위험·경고 이슈가 없습니다</div>`}
${ps.length ? `<h2>사업별 현황 <span class="mu">${ps.length}개</span></h2><table><tr><th>사업</th><th class="c" style="width:12%">업체</th><th class="c" style="width:28%">리스크</th></tr>${ps.map((p) => { const { n, k } = pStat(p); return `<tr><td><b>${esc(p.name)}</b>${p.country ? ` <span class="mu">${esc(COUNTRY[p.country] || p.country)}</span>` : ""}</td><td class="c">${n}</td><td class="c">${["red", "orange"].map((lv) => k[lv] ? `<span style="color:${C[lv][0]};font-weight:700">${C[lv][2]} ${k[lv]}</span>` : "").filter(Boolean).join(" · ") || `<span style="color:${C.none[0]}">이상 없음</span>`}</td></tr>`; }).join("")}</table>` : ""}
`;
  const detailBody = `<h2>${done ? "이슈" : "확인할 이슈"} <span class="mu">${groups.length}건 · 등급 높은 순${groups.length > MAX ? ` · 앞의 ${MAX}건` : ""}</span></h2>
${groups.length ? groups.slice(0, MAX).map(issue).join("") : `<div class="empty">해당 기간에 ${done ? "" : "확인할 "}이슈가 없습니다</div>`}
<h2>리스크 업체 <span class="mu">${risky.length}곳 · 정상 ${cs.length - risky.length}곳은 생략</span></h2>
${risky.length ? `<table><tr><th style="width:11%">등급</th><th style="width:24%">업체</th><th>참여 사업 · 역할</th><th class="c" style="width:10%">미확인</th></tr>
${risky.map((c) => `<tr><td>${bd(c.risk)}</td><td><b>${esc(c.name)}</b>${c.name_en ? `<div class="mu">${esc(c.name_en)}</div>` : ""}</td><td>${engL(c)}</td><td class="c">${c.open}</td></tr>`).join("")}</table>` : `<div class="empty">${sc ? "리스크 업체가 없습니다" : "아직 스캔하지 않았습니다"}</div>`}
${ps.length ? `<h2>사업별 현황 <span class="mu">${ps.length}개</span></h2><table><tr><th style="width:32%">사업</th><th>참여 업체 (역할 · 등급)</th><th class="c" style="width:18%">리스크</th></tr>${projRows}</table>` : ""}
`;
  const title = `EDCF_리스크보고서_${sc0 === "mine" ? "내담당" : "전체"}_${now.slice(0, 10)}`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
@page { size: A4; margin: 13mm 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #0B1220; font: 12.5px/1.55 "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
a { color: #5B5BF0; text-decoration: none; }
.hd { background: #0A0F1E; color: #fff; border-radius: 12px; padding: 16px 20px; }
.hd .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 13px; }
.hd .mk { width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, #7C83FF, #22D3EE); display: grid; place-items: center; font-size: 15px; }
.hd .eb { margin-top: 14px; font-size: 10px; font-weight: 800; letter-spacing: .12em; color: #22D3EE; }
.hd h1 { margin: 4px 0 2px; font-size: 22px; letter-spacing: -.02em; } .hd h1 span { color: #9AA3FF; }
.hd .meta { font-size: 11.5px; color: #B3BCCD; }
.kpi { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0 4px; }
.kpi p { margin: 2px 0 0; font-size: 11px; color: #6B7690; line-height: 1.45; }
.kpi div { border: 1px solid #E3E7EF; border-radius: 10px; padding: 9px 12px; }
.kpi small { display: block; font-size: 11px; color: #6B7690; font-weight: 700; } .kpi b { font-size: 22px; } .kpi i { font-style: normal; font-size: 12px; color: #6B7690; }
h2 { font-size: 14.5px; margin: 18px 0 8px; } h2 .mu { font-weight: 500; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { text-align: left; font-size: 11px; color: #6B7690; font-weight: 700; background: #F3F5FA; padding: 6px 8px; border-bottom: 1px solid #E3E7EF; }
td { padding: 7px 8px; border-bottom: 1px solid #EEF1F6; vertical-align: top; } td.c, th.c { text-align: center; white-space: nowrap; }
tr { break-inside: avoid; }
.mu { color: #6B7690; font-size: 11.5px; }
.bd { display: inline-block; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 700; line-height: 17px; white-space: nowrap; }
.role { font-weight: 700; font-size: 11px; }
.tg { display: inline-block; padding: 0 6px; border-radius: 5px; font-size: 11px; background: #EEF1F6; color: #3D4A63; } .tg.red { background: #FDE8EE; color: #E11D48; }
.is { border: 1px solid #E3E7EF; border-left: 4px solid; border-radius: 10px; padding: 9px 12px; margin-bottom: 7px; break-inside: avoid; }
.is-h b { font-size: 13px; } .is-s { font-size: 13px; margin: 4px 0 3px; }
.dup { margin-top: 5px; padding-top: 5px; border-top: 1px dashed #E3E7EF; font-size: 11px; color: #0891B2; }
.empty { border: 1px dashed #E3E7EF; border-radius: 10px; padding: 14px; text-align: center; color: #0D9488; }
.ft { margin-top: 18px; padding-top: 10px; border-top: 1px solid #E3E7EF; font-size: 10.5px; color: #6B7690; }
</style></head><body>
<div class="hd"><div class="brand"><span class="mk">◎</span>EDCF RADAR · 업체 리스크 자동감지</div>
  <div class="eb">RISK REPORT · ${esc(now.slice(0, 10).replace(/-/g, "."))}</div>
  <h1>EDCF <span>업체 리스크 보고서</span></h1>
  <div class="meta">범위 ${esc(scopeL)} (업체 ${cs.length} · 사업 ${ps.length}) · 이슈 ${esc(periodL)}${done ? " · 확인 완료 포함" : ""} · 마지막 스캔 ${esc((state.status.last_scan_at || "-").slice(0, 16))} · 작성 ${esc(now.slice(0, 16))} ${esc(me().split("@")[0])}</div></div>
<h2>업체 등급 <span class="mu">업체 ${cs.length}</span></h2>
<div class="kpi">${["red", "orange", "none"].map((lv) => { const l = cs.filter((c) => sc && c.risk === lv).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)); return `<div style="border-top:3px solid ${C[lv][0]}"><small>${C[lv][2]}</small><b style="color:${C[lv][0]}">${t[lv]}</b><p>${lv === "none" ? "위험·경고 이슈 없음" : l.length ? esc(l.slice(0, 6).map((c) => c.name).join(", ")) + (l.length > 6 ? ` 외 ${l.length - 6}` : "") : "해당 업체 없음"}</p></div>`; }).join("")}</div>
${detail ? detailBody : simpleBody}
<div class="ft">뉴스 기반 항목은 '제재 확정'이 아니라 '검토가 필요한 신호'입니다. 원문과 공식 자료(EXIMIIS, 나라장터, 각 MDB 제재 리스트)로 확인하시기 바랍니다.<br>데이터: EDCF 부정당업자(EXIMIIS) · 조달청 나라장터 · OpenSanctions(World Bank·ADB·AfDB·IDB·EBRD) · Google 뉴스 · 네이버 뉴스 · AI 판정(Claude)</div>
</body></html>`;
  return { title, html };
}
// 숨긴 창에서 인쇄 → 'PDF로 저장' (한글 글꼴이 그대로 나오도록 브라우저 인쇄 사용)
function printReport({ title, html }) {
  if (window.__DEMO) window.__lastReport = html; // 데모 확인용
  $("#printFrame")?.remove();
  const f = document.createElement("iframe");
  f.id = "printFrame"; f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const d = f.contentDocument; d.open(); d.write(html); d.close();
  const old = document.title;
  const go = async () => {
    try { await Promise.race([d.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]); } catch {}
    document.title = title; // 저장할 때 파일 이름
    f.contentWindow.focus(); f.contentWindow.print();
    setTimeout(() => { document.title = old; }, 1000);
  };
  setTimeout(go, 200);
  toast("인쇄 창에서 '대상: PDF로 저장'을 고르세요", 5000);
}
$("#btnReport").onclick = openReport;

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
// 검사 결과: 출처별 한 칸씩 (상태 + 한 줄)
function checkGrid(c) {
  const lc = c.last_check;
  if (!lc) return `<div class="empty small">아직 스캔하지 않았습니다.</div>`;
  const n = lc.news || {}, m = lc.mdb || {}, p = lc.pps || {};
  const cell = (st, k, d) => `<div class="ck ${st}"><span class="ic">${{ ok: "✓", warn: "!", bad: "✕", na: "–" }[st]}</span><div><b>${k}</b><div class="d">${d}</div></div></div>`;
  const hits = edcfByCompany(edcfMatches(state.edcf)).find((x) => x.c.id === c.id);
  const pps = {
    ok: () => cell(p.hits ? "bad" : "ok", "조달청 부정당제재", p.hits ? `현재 제재 ${p.hits}건` : "현재 제재 없음"),
    no_bizno: () => cell("warn", "조달청 부정당제재", "사업자번호 없음"),
    not_connected: () => cell("na", "조달청 부정당제재", "미연결"),
    foreign: () => cell("na", "조달청 부정당제재", "해외 업체"),
    error: () => cell("bad", "조달청 부정당제재", "조회 오류"),
  }[p.status || "not_connected"]();
  return `<div class="ck-grid">
    ${cell(n.engines?.length ? "ok" : "bad", "뉴스", n.engines?.length ? `${esc(n.engines.join("·"))} 기사 ${n.fetched ?? 0}건 확인` : "검색 실패")}
    ${cell("ok", "판정", lc.analyzer === "claude" ? "AI 판정 (Claude)" : "키워드 규칙")}
    ${cell(m.status === "ok" ? "ok" : m.status === "no_lists" ? "bad" : "warn", "MDB 제재 리스트", m.status === "ok" ? `${m.lists}개 리스트 대조` : m.status === "no_lists" ? "리스트 오류" : "영문명 없음")}
    ${pps}
    ${cell(!state.edcf.length ? "na" : hits ? (hits.active ? "bad" : "warn") : "ok", "EDCF 부정당업자", !state.edcf.length ? "명단 없음" : hits ? `${hits.active ? "제재 중" : "과거 이력"} ${hits.n}건` : "일치 없음")}
  </div>
  ${(lc.identity?.notes || []).slice(0, 1).map((t) => `<div class="ck-note">${esc(t)}</div>`).join("")}`;
}
// 리스크 업체 목록: 대시보드의 위험·경고·정상을 누르면 오른쪽 창에 그 등급 업체들 (업체를 누르면 상세, ← 로 목록)
// scroll: "top" 처음 열 때 / "back" 상세에서 돌아올 때(보던 위치) / "keep" 다시 그릴 때
function openRiskList(lv, scroll = "top") {
  const list = scopeCompanies().filter((c) => c.risk === lv).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  state.openCid = null; state.drawerBack = null; state.riskList = lv;
  $("#drawerTitle").innerHTML = `<div class="d-name"><span class="nm">${LEVEL[lv]} 업체</span><span class="cnt">${list.length}곳</span><span class="tag">${scope === "mine" ? "내 담당 사업" : "EDCF 전체"}</span></div>
    <div class="d-sub">${LEVEL_DEF[lv]}</div>`;
  const body = $("#drawerBody");
  body.innerHTML = list.length ? `<div class="rl">${list.map(riskRow).join("")}</div>` : `<div class="empty small">해당 업체가 없습니다</div>`;
  $$("[data-rl]", body).forEach((x) => {
    const go = () => { state.rlScroll = body.scrollTop; openCompany(x.dataset.rl, lv); };
    x.onclick = go; x.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
  if (scroll === "top") body.scrollTop = 0; else if (scroll === "back") body.scrollTop = state.rlScroll || 0;
  $("#drawer").classList.add("open"); $("#drawerBg").classList.add("open");
}
// 목록 한 줄: 업체명 · 업종 · 미확인 건수 / 참여 사업 / 이 등급이 된 대표 이슈
function riskRow(c) {
  const groups = groupFindings(state.findings.filter((f) => f.company_id === c.id && f.status !== "dismissed"));
  const top = groups[0]?.rep, engs = byRole(c.engagements);
  return `<div class="rl-row ${c.risk}" data-rl="${c.id}" role="button" tabindex="0">
    <div class="rl-top"><b class="rl-name">${esc(c.name)}</b><span class="rl-cat">${esc(c.cat || "")}</span>${c.open ? `<span class="rl-open">미확인 ${c.open}</span>` : `<span class="rl-done">확인 완료</span>`}<span class="rl-arr">›</span></div>
    ${engs.length ? `<div class="rl-engs">${engs.slice(0, 3).map((e) => `<span class="d-eng">${roleTag(e.role)}<span>${esc(projName(e.project_id))}</span>${stageTag(e)}</span>`).join("")}${engs.length > 3 ? `<span class="muted small">외 ${engs.length - 3}</span>` : ""}</div>` : ""}
    ${top ? `<div class="rl-why">${esc(top.summary || top.title || "")}</div>
    <div class="rl-src">${esc(top.source_name || "-")} · ${esc(top.published_at || "날짜 미상")}${groups.length > 1 ? ` · 이슈 ${groups.length}건` : ""}</div>` : ""}
  </div>`;
}
function openCompany(cid, back = null) {
  const c = state.companies.find((x) => x.id === cid);
  if (!c) return;
  const switching = state.openCid !== cid; // 다른 업체로 바꿀 때만 맨 위로 (다시 그릴 때는 보던 위치 유지)
  state.openCid = cid; state.drawerBack = back; if (!back) state.riskList = null;
  const fs = state.findings.filter((f) => f.company_id === cid && f.status !== "dismissed");
  const dismissed = state.findings.filter((f) => f.company_id === cid && f.status === "dismissed");
  const groups = groupFindings(fs), sc = scanned();
  const hint = (t) => t ? `<em>${esc(t)}</em>` : "";
  $("#drawerTitle").innerHTML = `${back ? `<button type="button" class="d-back" id="dBack">← ${LEVEL[back]} 업체 목록</button>` : ""}<div class="d-name"><span class="nm">${esc(c.name)}</span>${sc ? badge(c.risk) : ""}</div>
    ${c.engagements.length ? `<div class="d-engs">${byRole(c.engagements).map((e) => `<span class="d-eng">${roleTag(e.role)}<span>${esc(projName(e.project_id))}</span>${stageTag(e)}</span>`).join("")}</div>` : ""}`;
  $("#drawerBody").innerHTML = `
    <div class="d-actions">
      <button class="btn sm primary" id="dScan">다시 스캔</button>
      <a class="btn sm" target="_blank" rel="noopener" href="https://search.naver.com/search.naver?where=news&query=${encodeURIComponent('"' + c.name + '"')}">네이버 뉴스 ↗</a>
      ${c.engagements.length ? "" : `<button class="btn sm ${c.watch ? "on" : ""}" id="dWatch" title="사업에 연결되지 않은 업체도 매일 업체명으로 검색">${c.watch ? "★ 집중 감시 중" : "☆ 집중 감시"}</button>`}
    </div>

    <section class="d-sec">
      <div class="d-sec-head"><h3>이슈</h3><span class="count">${groups.length}</span></div>
      <div id="dFeed" class="feed">${groups.length ? "" : `<div class="empty small">${c.last_check ? "발견된 이슈가 없습니다" : "아직 스캔하지 않았습니다"}</div>`}</div>
      ${dismissed.length ? `<details class="d-more"><summary>관련 없음 처리한 기사 ${dismissed.length}건</summary><div id="dDismissed" class="feed"></div></details>` : ""}
    </section>

    <section class="d-sec">
      <div class="d-sec-head"><h3>검사 결과</h3>${c.last_check?.at ? `<span class="d-sec-meta">${esc(String(c.last_check.at).slice(5, 16))}</span>` : ""}</div>
      ${checkGrid(c)}
    </section>

    <section class="d-sec">
      <div class="d-sec-head"><h3>참여 사업</h3></div>
      ${c.engagements.length ? `<div class="d-list">${c.engagements.map((e, i) => `<div class="d-row"><span>${roleTag(e.role)} ${esc(projName(e.project_id))} ${stageTag(e)}</span><button class="xbtn" data-dunlink="${i}" title="이 사업에서 빼기">✕</button></div>`).join("")}</div>` : ""}
      ${state.projects.length ? `<form id="linkForm" class="d-link"><select name="pid">${state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select><select name="role">${ROLES.map((r) => `<option>${r}</option>`).join("")}</select><button class="btn sm">연결</button></form>` : `<div class="muted small">사업 관리에서 사업을 먼저 만드세요</div>`}
    </section>

    <section class="d-sec">
      <div class="d-sec-head"><h3>식별 정보</h3></div>
      <form id="advForm" class="d-form" autocomplete="off">
        <label><span>사업자등록번호 ${hint(c.bizno_source)}</span><input name="biz_no" value="${esc(fmtBiz(c.biz_no))}" placeholder="000-00-00000"></label>
        <label><span>영문명</span><input name="name_en" value="${esc(c.name_en || "")}" placeholder="예: GANADA ENGINEERING CO., LTD."></label>
        <label><span>업종 ${hint(c.catGuess ? "추정" : c.category_source)}</span><select name="category">${["", ...CATS].map((k) => `<option value="${k}" ${k === (c.catGuess ? "" : c.cat) ? "selected" : ""}>${k || `자동 분류${c.catGuess ? ` (추정: ${c.cat})` : ""}`}</option>`).join("")}</select></label>
        <label><span>대표자</span><input name="ceo" value="${esc(c.ceo || "")}"></label>
        <label><span>별칭 ${hint("쉼표로 구분")}</span><input name="aliases" value="${esc(c.aliases || "")}"></label>
        <label><span>보조 키워드 ${hint("동명 업체 구분")}</span><input name="context_keywords" value="${esc(c.context_keywords || "")}" placeholder="예: 감리, 대표자명"></label>
        <label><span>검색 언어</span><input name="search_langs" value="${esc(c.search_langs || "ko")}" placeholder="ko,en,id"></label>
        <label><span>메모</span><input name="note" value="${esc(c.note || "")}"></label>
        <div class="d-form-foot"><span class="muted small">DART에 있는 업체는 스캔 때 자동으로 채워집니다</span><button class="btn primary">저장</button></div>
      </form>
    </section>

    <div class="d-danger"><button class="btn sm ghost danger" id="dDelete">업체 삭제</button></div>`;
  if (fs.length) renderGroups(groups, $("#dFeed"), false);
  if (dismissed.length) renderFeed(dismissed, $("#dDismissed"), false);
  $$("#drawerBody [data-open]").forEach((x) => x.onclick = () => openCompany(x.dataset.open));
  $("#dScan").onclick = () => runWorkflow({ task: "scan", companies: c.name }, `'${c.name}' 재스캔`);
  $("#dWatch")?.addEventListener("click", async () => {
    c.watch = !c.watch; await updateDoc(doc(db, "companies", cid), { watch: c.watch });
    toast(c.watch ? "집중 감시로 지정했습니다 (매일 업체명 검색)" : "집중 감시를 해제했습니다"); rerender();
  });
  $("#linkForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    await placeCompany(cid, null, fd.get("pid"), fd.get("role"));
  });
  $$("[data-dunlink]").forEach((b) => b.onclick = async () => {
    c.engagements.splice(+b.dataset.dunlink, 1); await saveEngagements(c); toast("사업 연결을 뺐습니다"); rerender();
  });
  $("#dDelete").onclick = () => deleteCompanies([cid]);
  $("#dBack")?.addEventListener("click", () => openRiskList(back, "back"));
  if (switching) $("#drawerBody").scrollTop = 0;
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
  $("#drawer").classList.add("open"); $("#drawerBg").classList.add("open");
}
function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawerBg").classList.remove("open"); state.openCid = null; state.riskList = null; state.drawerBack = null; }
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
const QUEUE_ONLY = ["quick", "dartfill"];
async function runWorkflow(inputs, label) {
  if (state.job && !state.job.done) return toast("이미 진행 중인 작업이 있습니다. 끝난 뒤 다시 눌러주세요");
  const full = { task: "scan", companies: "", test_to: "", ...inputs };
  // 빠른 스캔·DART 채움은 '요청'으로 남기고 요청 처리(queue)를 바로 깨움
  if (QUEUE_ONLY.includes(full.task)) return queueRequest(full, label);
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
    let relayed = await pingRelay();
    if (!relayed && ghToken()) { // 중계기가 안 닿아도 토큰이 있으면 요청 처리를 바로 시작
      try { const r = await gh("/actions/workflows/monitor.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: "main", inputs: { task: "queue", companies: "", test_to: "" } }) }); relayed = !!(r && r.ok); } catch {}
    }
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
  renderJob0();
  const g = $("#geoJobState"); if (g) g.innerHTML = $("#jobState").innerHTML; // 수원국 화면에도 같은 진행 표시
  const busy = !!(state.job && !state.job.done);
  $("#geoScan").disabled = busy; $("#geoScan").classList.toggle("busy", busy);
}
function renderJob0() {
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
// [지금 스캔] = 빠른 스캔: 새 제재 기사 + 공식 명단만 (업체명 검색까지 하는 전체 스캔은 매일 아침 자동, 또는 설정 > 고급)
$("#btnScan").onclick = () => runWorkflow({ task: "quick" }, "빠른 스캔");
$("#btnScan").title = "새로 나온 제재 기사와 공식 명단(EXIMIIS, 조달청, MDB)만 빠르게 확인합니다. 업체명으로 하나씩 찾는 전체 스캔은 매일 아침 자동으로 돕니다";
$("#btnFullScan").onclick = () => { if (confirm("업체명으로 하나씩 뉴스를 찾는 전체 스캔을 지금 돌릴까요? 4~5분쯤 걸립니다. (매일 아침 자동으로 한 번 돕니다)")) runWorkflow({ task: "scan" }, "전체 스캔"); };
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

// ---------- 업체 탭 ----------
// 자주 쓰는 보기
const CO_VIEWS = [
  ["all", "전체", "등록된 모든 업체"],
  ["pre", "계약 전 점검", "입찰중·우선협상 단계 업체 — 부정당업자 확인이 가장 필요한 시점"],
  ["risk", "리스크 업체", "위험·경고 업체"],
  ["open", "미확인 이슈", "'확인 완료·관련 없음' 처리 전 이슈가 있는 업체"],
  ["info", "정보 보완 필요", "사업자번호 또는 영문명이 없어 조회가 불완전한 업체"],
];
const needInfo = (c) => (c.country === "KR" && !c.biz_no) || !c.name_en;
const inView = (c, v) => v === "all" ? true
  : v === "pre" ? c.engagements.some((e) => e.stage === "입찰중" || e.stage === "우선협상")
  : v === "risk" ? scanned() && c.risk !== "none"
  : v === "open" ? c.open > 0
  : v === "info" ? needInfo(c) : true;
const coState = { view: "all", sort: "risk", dir: 1, sel: new Set() };
const CO_FILTERS = ["#poolSearch", "#fOwner", "#fProj", "#fRole", "#fStage", "#fRisk", "#fCat", "#fNat"];
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
const TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>`;
function renderCompanies() {
  const sc = scanned();
  $("#coTotal").textContent = state.companies.length;
  renderDartBar();
  // 필터 항목 (선택값 유지)
  const keep = (id, html) => { const v = $(id).value; $(id).innerHTML = html; if ([...$(id).options].some((o) => o.value === v)) $(id).value = v; };
  keep("#fProj", `<option value="">사업 전체</option><option value="__none">사업 미연결</option>` + state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join(""));
  keep("#fCat", `<option value="">업종 전체</option>` + CATS.map((k) => `<option value="${k}">${k}</option>`).join(""));
  $("#coViews").innerHTML = CO_VIEWS.map(([k, l, d]) => `<button data-v="${k}" class="cv-btn ${k} ${k === coState.view ? "active" : ""}" title="${d}">${l}<span class="n">${state.companies.filter((c) => inView(c, k)).length}</span></button>`).join("");
  $$("#coViews button").forEach((b) => b.onclick = () => { coState.view = b.dataset.v; renderCompanies(); });

  const list = state.companies.filter(poolMatches).sort((a, b) => CO_SORT[coState.sort](a, b) * coState.dir);
  for (const id of [...coState.sel]) if (!state.companies.some((c) => c.id === id)) coState.sel.delete(id);
  $("#fReset").classList.toggle("hidden", !CO_FILTERS.some((id) => $(id).value));
  $("#poolShown").textContent = list.length === state.companies.length ? `${list.length}곳` : `${state.companies.length}곳 중 ${list.length}곳`;
  $$("#coTable th[data-sort]").forEach((th) => { th.classList.toggle("on", th.dataset.sort === coState.sort); th.classList.toggle("desc", th.dataset.sort === coState.sort && coState.dir < 0); });
  const engChip = (e) => `<span class="ej" title="${esc(projName(e.project_id))} · ${esc(e.role)} · ${esc(e.stage || "계약")}">${roleTag(e.role)}<span class="ej-p">${esc(projName(e.project_id))}</span>${stageTag(e)}</span>`;
  $("#pool").innerHTML = !list.length ? `<tr><td colspan="9" class="empty">${state.companies.length ? "조건에 맞는 업체가 없습니다." : "업체가 없습니다. [일괄 등록] 또는 [+ 업체 추가]를 이용하세요."}</td></tr>`
    : list.map((c) => `<tr data-cid="${c.id}" class="${coState.sel.has(c.id) ? "sel" : ""}">
      <td class="t-chk"><input type="checkbox" data-sel="${c.id}" ${coState.sel.has(c.id) ? "checked" : ""} aria-label="${esc(c.name)} 선택"></td>
      <td class="t-name"><button class="co-name" data-open="${c.id}">${esc(c.name)}</button>${c.watch ? `<span class="watch" title="집중 감시">★</span>` : ""}${c.name_en ? `<div class="sub">${esc(c.name_en)}</div>` : ""}</td>
      <td class="t-cat">${esc(c.cat || "-")}${c.catGuess || c.category_source === "이름 추정" ? `<span class="src guess" title="업체명으로 추정 — 스캔 때 DART 업종이 있으면 바뀜">추정</span>` : ""}</td>
      <td class="t-proj">${c.engagements.length ? byRole(c.engagements).map(engChip).join("") : `<span class="muted">-</span>`}</td>
      <td class="t-risk">${sc ? (c.risk !== "none" ? badge(c.risk) : `<span class="ok-t">정상</span>`) : `<span class="muted">-</span>`}</td>
      <td class="t-open">${c.open ? `<b>${c.open}</b>` : `<span class="muted">0</span>`}</td>
      <td class="t-id">${c.country !== "KR" ? `<span class="muted">해외</span>` : c.biz_no ? esc(fmtBiz(c.biz_no)) : `<span class="miss">없음</span>`}</td>
      <td class="t-id">${c.name_en ? `<span class="ok-t">✓</span>` : `<span class="miss">없음</span>`}</td>
      <td class="t-act"><button class="icon-btn danger" data-del="${c.id}" title="삭제" aria-label="${esc(c.name)} 삭제">${TRASH}</button></td>
    </tr>`).join("");
  // 선택 (일괄 삭제)
  const visible = list.map((c) => c.id), nSel = visible.filter((id) => coState.sel.has(id)).length;
  $("#coChkAll").checked = !!visible.length && nSel === visible.length;
  $("#coChkAll").indeterminate = nSel > 0 && nSel < visible.length;
  $("#coBulkbar").classList.toggle("hidden", !coState.sel.size);
  $("#coSelN").textContent = coState.sel.size;
  $("#coChkAll").onchange = (e) => { visible.forEach((id) => e.target.checked ? coState.sel.add(id) : coState.sel.delete(id)); renderCompanies(); };
  $$("#pool [data-sel]").forEach((x) => x.onchange = () => { x.checked ? coState.sel.add(x.dataset.sel) : coState.sel.delete(x.dataset.sel); renderCompanies(); });
  $$("#pool [data-open]").forEach((x) => x.onclick = () => openCompany(x.dataset.open));
  $$("#pool [data-del]").forEach((x) => x.onclick = () => deleteCompanies([x.dataset.del]));
}
// 여러 업체 삭제 (수집된 이슈도 함께)
async function deleteCompanies(ids) {
  const names = ids.map((id) => state.companies.find((c) => c.id === id)?.name).filter(Boolean);
  if (!names.length) return;
  const msg = names.length === 1 ? `'${names[0]}' 업체와 수집된 이슈를 삭제할까요?`
    : `선택한 ${names.length}곳(${names.slice(0, 3).join(", ")}${names.length > 3 ? " 등" : ""})과 수집된 이슈를 삭제할까요?`;
  if (!confirm(msg + "\n삭제하면 되돌릴 수 없습니다.")) return;
  if (names.length > 5) toast(`${names.length}곳 삭제 중…`, 8000);
  for (let i = 0; i < ids.length; i += 8) await Promise.all(ids.slice(i, i + 8).map((id) => deleteCompany(id)));
  ids.forEach((id) => coState.sel.delete(id));
  if (state.openCid && ids.includes(state.openCid)) closeDrawer();
  toast(`${names.length}곳을 삭제했습니다`); rerender();
}
$("#poolSearch").addEventListener("input", () => renderCompanies());
CO_FILTERS.slice(1).forEach((s) => $(s).addEventListener("change", () => renderCompanies()));
$("#fReset").onclick = () => { CO_FILTERS.forEach((id) => ($(id).value = "")); renderCompanies(); };
$("#coDelSel").onclick = () => deleteCompanies([...coState.sel]);
$("#coSelClear").onclick = () => { coState.sel.clear(); renderCompanies(); };
$$("#coTable th[data-sort]").forEach((th) => th.addEventListener("click", () => {
  if (coState.sort === th.dataset.sort) coState.dir *= -1; else { coState.sort = th.dataset.sort; coState.dir = 1; }
  renderCompanies();
}));

// ---------- 사업 탭: 왼쪽 업체 이름을 끌어서 사업의 역할 칸에 놓기 ----------
const pjState = { scope: "all" };
function renderProjects() {
  const sc = scanned();
  $("#pjTotal").textContent = state.projects.length;
  const q = ($("#sideSearch").value || "").trim().toLowerCase();
  const side = state.companies.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.aliases || "").toLowerCase().includes(q) || (c.name_en || "").toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  $("#sideN").textContent = q ? `${side.length} / ${state.companies.length}곳` : `${state.companies.length}곳`;
  $("#sideList").innerHTML = side.map((c) => `<div class="side-co" draggable="true" data-cid="${c.id}" title="끌어서 사업의 역할 칸에 놓기"><span class="dot ${sc ? c.risk : ""}"></span><span class="nm">${esc(c.name)}</span></div>`).join("")
    || `<div class="empty small">${state.companies.length ? "검색 결과가 없습니다" : "업체 관리에서 업체를 먼저 등록하세요"}</div>`;
  const mineN = state.projects.filter(isMine).length;
  $("#pjScope").innerHTML = [["all", "전체", state.projects.length], ["mine", "내 사업", mineN]].map(([k, l, n]) => `<button data-s="${k}" class="${pjState.scope === k ? "active" : ""}">${l} <span class="n">${n}</span></button>`).join("");
  $$("#pjScope button").forEach((b) => b.onclick = () => { pjState.scope = b.dataset.s; renderProjects(); });
  const ps = state.projects.filter((p) => pjState.scope === "all" || isMine(p));
  $("#projBoard").innerHTML = ps.map((p) => projectCard(p, sc)).join("")
    || `<div class="empty">${state.projects.length ? "내 사업으로 지정한 사업이 없습니다." : "사업이 없습니다. 오른쪽 위에서 새 사업을 추가하세요."}</div>`;
  bindDnd();
}
// 단계 선택 상자 (진행 순서: 입찰중 → 우선협상 → 계약)
const STAGE_OPTS = [["입찰중", "입찰중"], ["우선협상", "우선협상"], ["계약", "계약"]];
const stageVal = (e) => e.stage || "계약";
// 사업·역할 칸 안의 업체 순서 (맨 위가 대표사). 순서 없는 업체는 이름순으로 뒤에
const byOrder = (a, b) => (a.e.order ?? 1e9) - (b.e.order ?? 1e9) || a.c.name.localeCompare(b.c.name);
function zoneRows(pid, role) {
  const rr = [];
  for (const c of state.companies) c.engagements.forEach((e, i) => { if (e.project_id === pid && e.role === role) rr.push({ c, e, i }); });
  return rr.sort(byOrder);
}
// cid 업체를 beforeCid 업체 앞으로 (없으면 맨 뒤로) 옮기고 순서 저장
async function reorderZone(pid, role, cid, beforeCid) {
  const all = zoneRows(pid, role), mv = all.find((r) => r.c.id === cid);
  if (!mv) return;
  const rr = all.filter((r) => r !== mv);
  let at = beforeCid ? rr.findIndex((r) => r.c.id === beforeCid) : rr.length;
  if (at < 0) at = rr.length;
  rr.splice(at, 0, mv);
  const touched = new Set();
  rr.forEach((r, k) => { if (r.e.order !== k) { r.e.order = k; touched.add(r.c); } });
  if (!touched.size) return;
  const b = writeBatch(db);
  touched.forEach((c) => b.update(doc(db, "companies", c.id), { engagements: c.engagements }));
  await b.commit(); rerender();
}
function projectCard(p, sc) {
  const rows = [];
  for (const c of state.companies) c.engagements.forEach((e, i) => { if (e.project_id === p.id) rows.push({ c, e, i }); });
  const t = { red: 0, orange: 0, yellow: 0, none: 0 };
  new Set(rows.map((r) => r.c)).forEach((c) => t[c.risk]++);
  const total = t.red + t.orange + t.yellow + t.none;
  const dist = !total ? "" : `<div class="pj-dist"><div class="pj-bar">${sc ? ["red", "orange", "none"].filter((lv) => t[lv]).map((lv) => `<i class="${lv}" style="flex:${t[lv]}"></i>`).join("") : `<i class="pending" style="flex:1"></i>`}</div>
    <div class="pj-sum">${sc ? (["red", "orange"].filter((lv) => t[lv]).map((lv) => `<span class="${lv}">${LEVEL[lv]} ${t[lv]}</span>`).join("") || `<span class="ok">이상 없음</span>`) : ""}<span class="tot">/ ${total}곳</span></div></div>`;
  return `<div class="pbox">
    <div class="pbox-head"><button class="pname" data-edit-proj="${p.id}" title="눌러서 사업명·수원국·담당 수정">${esc(p.name)}</button>${p.country ? `<span class="ctry">${esc(COUNTRY[p.country] || p.country)}</span>` : ""}</div>
    ${dist}
    <div class="pbox-body">${ROLES.map((role) => {
      const rr = rows.filter((r) => r.e.role === role).sort(byOrder);
      return `<div class="dropzone ${rr.length ? "" : "is-empty"}" data-pid="${p.id}" data-role="${esc(role)}">
        <div class="dz-head">${roleTag(role)}${rr.length > 1 ? `<span class="dz-note">맨 위가 대표사 · 끌거나 ▲로 순서 변경</span>` : ""}</div>
        ${rr.map(({ c, e, i }, k) => `<div class="corow" draggable="true" data-cid="${c.id}" data-from="${p.id}|${i}">
          <span class="dot ${sc ? c.risk : ""}"></span>${rr.length > 1 && k === 0 ? `<span class="lead" title="대표사">대표</span>` : ""}<button class="cn" data-open="${c.id}">${esc(c.name)}</button>
          <span class="right">
            ${k > 0 ? `<button class="upbtn" data-up="${p.id}|${esc(role)}|${c.id}|${rr[k - 1].c.id}" title="위로 (맨 위 = 대표사)">▲</button>` : ""}
            <select class="stage-sel ${e.stage && e.stage !== "계약" ? "on" : ""}" data-stage-sel="${c.id}|${i}" title="단계${e.stage === "우선협상" && e.rank ? ` · ${e.rank}순위` : ""}" aria-label="단계">${STAGE_OPTS.map(([v, l]) => `<option value="${v}" ${v === stageVal(e) ? "selected" : ""}>${l}</option>`).join("")}</select>
            <button class="xbtn" data-unlink="${c.id}|${i}" title="이 사업에서 빼기">✕</button>
          </span></div>`).join("")}
        <div class="drop-hint">여기로 끌어다 놓기</div>
      </div>`;
    }).join("")}</div>
    <div class="pbox-foot">${ownerTag(p)}${p.owner !== me() ? `<button class="btn sm ghost" data-own="${p.id}">내 사업으로</button>` : ""}<span class="pf-act"><button class="btn sm ghost" data-edit-proj="${p.id}">수정</button><button class="btn sm ghost danger" data-del-proj="${p.id}">삭제</button></span></div>
  </div>`;
}
$("#sideSearch").addEventListener("input", () => renderProjects());


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
  const root = $("#view-projects");
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
      const target = ev.target.closest?.(".corow"), before = target && target.dataset.cid !== data.cid ? target.dataset.cid : null;
      const [fpid] = String(data.from || "").split("|");
      const c = state.companies.find((x) => x.id === data.cid), same = data.from && fpid === z.dataset.pid && c?.engagements[+String(data.from).split("|")[1]]?.role === z.dataset.role;
      if (!same) await placeCompany(data.cid, data.from, z.dataset.pid, z.dataset.role);
      if (before || same) await reorderZone(z.dataset.pid, z.dataset.role, data.cid, before);
    });
  });
  // 담당자 지정
  $$("[data-own]", root).forEach((b) => b.onclick = async () => {
    const p = state.projects.find((x) => x.id === b.dataset.own);
    await updateDoc(doc(db, "projects", p.id), { owner: me() }); p.owner = me();
    toast(`'${p.name}'을(를) 내 사업으로 지정했습니다`); rerender();
  });
  // 사업 카드 안 업체 이름: 상세 열기
  $$("#projBoard [data-open]").forEach((x) => x.addEventListener("click", () => openCompany(x.dataset.open)));
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
    toast(c.engagements.length ? `'${c.name}'을(를) 이 사업에서 뺐습니다` : `'${c.name}'은(는) 사업 연결 없이 업체 관리에 남아 있습니다`);
    rerender();
  });
  // 사업 삭제 → 소속 업체는 미배정으로
  $$("[data-edit-proj]", root).forEach((b) => b.onclick = () => openProjectEdit(b.dataset.editProj));
  $$("[data-del-proj]", root).forEach((b) => b.onclick = () => deleteProject(b.dataset.delProj));
  $$("[data-up]", root).forEach((b) => b.onclick = () => { const [pid, role, cid, prev] = b.dataset.up.split("|"); reorderZone(pid, role, cid, prev); });
  $$("[data-stage-sel]", root).forEach((sel) => {
    sel.addEventListener("mousedown", (e) => e.stopPropagation());
    sel.onchange = async () => {
      const [cid, i] = sel.dataset.stageSel.split("|"), stg = sel.value;
      const c = state.companies.find((x) => x.id === cid), e = c?.engagements[+i];
      if (!e) return;
      e.stage = stg; if (stg !== "우선협상") e.rank = null; // 우선협상 순위는 우선협상일 때만 유지
      await saveEngagements(c); rerender();
    };
  });
}
// 사업 수정 (사업명·수원국·담당) / 삭제
function openProjectEdit(pid) {
  const p = state.projects.find((x) => x.id === pid);
  if (!p) return;
  const owners = [...new Set([me(), p.owner, ...state.projects.map((x) => x.owner)].filter(Boolean))];
  const countries = Object.entries(COUNTRY).filter(([k]) => k !== "KR").sort((a, b) => a[1].localeCompare(b[1]));
  modal(`<h2>사업 수정</h2>
    <form id="pjEditForm" class="form" autocomplete="off">
      <label>사업명<input name="name" value="${esc(p.name)}" required></label>
      <div class="row">
        <label>수원국<select name="country"><option value="">선택 안 함</option>${countries.map(([k, v]) => `<option value="${k}" ${p.country === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
        <label>담당<select name="owner"><option value="">담당 미지정</option>${owners.map((o) => `<option value="${esc(o)}" ${p.owner === o ? "selected" : ""}>${o === me() ? `나 (${esc(o.split("@")[0])})` : esc(o.split("@")[0])}</option>`).join("")}</select></label>
      </div>
      <div class="site-box">
        <div class="site-h"><b>사업지</b><span class="muted small">수원국 리스크 지도의 핀 자리입니다. 지도를 눌러 핀을 놓거나(끌어서 옮기기), 도시를 고르거나, 좌표를 붙여 넣으세요</span></div>
        <div class="row">
          <label>도시에서 찾기<input name="city" list="siteCities" placeholder="예: 다카, Dhaka"></label>
          <label>좌표 붙여넣기<input name="ll" placeholder="위도, 경도 (구글 지도에서 복사)" value="${Number.isFinite(p.lat) ? `${p.lat}, ${p.lng}` : ""}"></label>
          <label>지도에 보일 이름<input name="site_en" placeholder="예: Dhaka" value="${esc(p.site_en || "")}"></label>
        </div>
        <datalist id="siteCities">${Object.entries(GEO_CITY).map(([k, v]) => `<option value="${esc(k)}">${esc(v[2])}</option>`).join("")}</datalist>
        <div id="sitePick" class="site-pick"></div>
        <div class="site-f"><span class="muted small" id="siteState"></span><button type="button" class="btn sm ghost" id="siteClear">핀 지우기</button></div>
      </div>
      <div class="actions"><button type="button" class="btn ghost danger" id="pjDelete" style="margin-right:auto">사업 삭제</button><button class="btn primary">저장</button></div>
    </form>`);
  // 사업지 고르기 (작은 지도)
  const f0 = $("#pjEditForm"), site = { lat: Number.isFinite(p.lat) ? p.lat : null, lng: Number.isFinite(p.lng) ? p.lng : null };
  const showSite = () => { $("#siteState").textContent = site.lat == null ? "핀 없음: 사업명 속 도시 이름이나 수원국 가운데에 표시됩니다" : `핀 위치 ${site.lat.toFixed(3)}, ${site.lng.toFixed(3)}`; };
  const picker = mountSitePicker($("#sitePick"), { ...site, country: p.country }, (lat, lng) => { site.lat = +lat.toFixed(4); site.lng = +lng.toFixed(4); f0.ll.value = `${site.lat}, ${site.lng}`; showSite(); });
  showSite();
  f0.city.onchange = () => {
    const q = f0.city.value.trim().toLowerCase(); if (!q) return;
    const hit = Object.entries(GEO_CITY).find(([k, v]) => k === q || String(v[2]).toLowerCase() === q) || Object.entries(GEO_CITY).find(([k, v]) => k.includes(q) || String(v[2]).toLowerCase().includes(q));
    if (!hit) return toast("목록에 없는 도시입니다. 지도를 누르거나 좌표를 붙여 넣으세요");
    picker.set([hit[1][0], hit[1][1]]); if (!f0.site_en.value) f0.site_en.value = hit[1][2];
  };
  f0.ll.onchange = () => {
    const m = f0.ll.value.match(/(-?\d+(?:\.\d+)?)[^\d-]+(-?\d+(?:\.\d+)?)/);
    if (!m || Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) return toast("좌표를 읽지 못했습니다. 예: 23.81, 90.41");
    picker.set([+m[1], +m[2]]);
  };
  f0.country.onchange = () => { if (site.lat == null) picker.country(f0.country.value); };
  $("#siteClear").onclick = () => { site.lat = site.lng = null; f0.ll.value = ""; picker.clear(); showSite(); };
  $("#pjEditForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target));
    const name = String(fd.name || "").trim();
    if (!name) return;
    if (state.projects.some((x) => x.id !== pid && x.name === name)) return toast("같은 이름의 사업이 이미 있습니다");
    const patch = { name, country: fd.country || null, owner: fd.owner || null, lat: site.lat, lng: site.lng, site_en: String(fd.site_en || "").trim() || null };
    await updateDoc(doc(db, "projects", pid), patch); Object.assign(p, patch);
    closeModal(); toast("사업을 수정했습니다"); rerender();
  };
  $("#pjDelete").onclick = () => deleteProject(pid);
}
async function deleteProject(pid) {
  const p = state.projects.find((x) => x.id === pid);
  if (!p || !confirm(`'${p.name}' 사업을 삭제할까요?\n(참여 업체는 삭제되지 않고 업체 관리에 그대로 남습니다)`)) return;
  for (const c of state.companies) {
    if (!c.engagements.some((e) => e.project_id === pid)) continue;
    c.engagements = c.engagements.filter((e) => e.project_id !== pid);
    await saveEngagements(c);
  }
  await deleteDoc(doc(db, "projects", pid));
  state.projects = state.projects.filter((x) => x.id !== pid);
  closeModal(); toast("사업을 삭제했습니다"); rerender();
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
      <label>업체명 *<input name="name" required placeholder="예: 서마루엔지니어링"></label>
      <div class="row">
        <label>사업자등록번호<input name="biz_no" placeholder="000-00-00000"></label>
        <label>영문명<input name="name_en" placeholder="예: GANADA ENGINEERING CO., LTD."></label>
      </div>
      <div class="row">
        <label>업종<select name="category"><option value="">자동 분류 (DART·업체명)</option>${CATS.map((k) => `<option>${k}</option>`).join("")}</select></label>
        <label>별칭 (쉼표 구분)<input name="aliases" placeholder="예: 서마루ENG"></label>
      </div>
      <label style="flex-direction:row;align-items:center;gap:6px;font-weight:500"><input type="checkbox" name="foreign" style="width:auto"> 해외 업체 (조달청 조회 제외, 영문 뉴스 검색)</label>
      ${state.projects.length ? `<div class="row"><label>사업에 바로 연결 (선택)<select name="pid"><option value="">연결 안 함</option>${state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
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
    toast(`'${name}'을(를) 추가했습니다${fd.pid ? "" : " — 사업 관리에서 사업에 연결할 수 있습니다"}`, 4000);
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
    ["서마루엔지니어링(예시)", "000-00-00000", "SEOMARU ENGINEERING CO., LTD.", "엔지니어링·설계·감리", "서마루ENG", "케냐 스마트시티 구축사업(예시)", "컨설턴트"],
    ["도레온건설(예시)", "", "", "건설·시공", "", "", ""]];
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

케냐 스마트시티 구축사업 | 컨설턴트 | 서마루엔지니어링
 | 본구매 | 도레온건설(1순위)

휘담기술
청누리시스템"></textarea>
    <p class="muted small">사업명·역할을 함께 적으면 사업에 바로 연결됩니다. 이미 있는 업체는 빈 정보(사업자번호·영문명·업종·별칭)만 채웁니다. 업종을 비워두면 업체명·DART 업종코드로 자동 분류합니다. 사내 보안(DRM)으로 파일이 안 열리면 표를 복사해 붙여넣으세요.</p>
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
  // 업체 명단(일괄 등록 양식)을 잘못 올리는 경우 막기: EXIMIIS 엑셀에는 '상태'·'제재기간' 열이 있음
  const raw = rows[hi].map((x) => String(x ?? "").replace(/\s/g, ""));
  if (!head.includes("status") || !head.includes("period") || raw.some((x) => ["업종", "분류", "별칭", "역할", "영문명"].includes(x)))
    throw new Error("EXIMIIS 부정당업자 엑셀이 아닌 것 같습니다 ('상태'·'제재기간' 열이 없음). 감시할 업체 명단은 업체 관리의 [일괄 등록]으로 올리세요.");
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
// 상태·제재기간이 없는 행은 제재 기록이 아님 (업체 명단을 잘못 올린 경우 등) → 대조에서 제외
const edcfValid = (e) => !!(String(e.status || "").trim() || String(e.period || "").trim());
function edcfMatches(list) {
  list = list.filter(edcfValid);
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
      // 새 명단과 더는 맞지 않는 업체의 EDCF 기록은 바로 지움 (기간이 바뀐 기록은 다음 스캔 때 정리)
      const still = new Set(edcfMatches(list).map((x) => x.c.id));
      const gone = state.findings.filter((f) => String(f.dedup_key || "").startsWith("edcf-") && !still.has(f.company_id));
      for (let i = 0; i < gone.length; i += 400) {
        const b = writeBatch(db);
        gone.slice(i, i + 400).forEach((f) => b.delete(doc(db, "findings", f.id)));
        await b.commit();
      }
      if (gone.length) { const ids = new Set(gone.map((f) => f.id)); state.findings = state.findings.filter((f) => !ids.has(f.id)); }
      closeModal(); toast(`EDCF 명단 ${list.length}건을 반영했습니다${gone.length ? ` · 맞지 않는 예전 EDCF 기록 ${gone.length}건 삭제` : ""}. 다음 스캔부터 대조합니다`, 6000); rerender();
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
// 잘못 올라간 명단 비우기: 명단과 그 때문에 생긴 EDCF 기록 삭제
async function clearEdcf() {
  if (!confirm("EXIMIIS 제재 명단을 모두 지우고, 이 명단으로 생긴 'EDCF 제재' 기록도 지울까요?")) return;
  const old = await getDocs(collection(db, "edcf_sanctions"));
  // 화면에서 숨긴 것까지 모두: dedup_key 가 'edcf-'로 시작하는 기록
  const gone = docs(await getDocs(query(collection(db, "findings"), where("dedup_key", ">=", "edcf-"), where("dedup_key", "<", "edcf."))));
  const ops = [...old.docs.map((d) => d.ref), ...gone.map((f) => doc(db, "findings", f.id))];
  for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach((r) => b.delete(r)); await b.commit(); }
  const meta = { edcf_sanctions_at: nowStr(), edcf_sanctions_count: 0, edcf_sanctions_by: me() };
  await setDoc(doc(db, "meta", "settings"), meta, { merge: true });
  Object.assign(state.settings, meta); state.edcf = [];
  const ids = new Set(gone.map((f) => f.id)); state.findings = state.findings.filter((f) => !ids.has(f.id));
  toast(`명단을 비웠습니다 · EDCF 기록 ${gone.length}건 삭제. EXIMIIS 엑셀을 올려 주세요`, 6000);
  openEdcf(); rerender();
}
// 업체 탭 [EDCF 부정당업자 명단]: 현재 명단 상태 + 올리기
function openEdcf() { openOfficial(); }
function openEdcfOld() {
  modal(`<h2>EXIMIIS 제재 명단 <span class="count">${state.edcf.length}</span></h2>
    <p class="muted small">EXIMIIS → 경협 → 업무지원 → <b>부정당업자조회</b>에서 내려받은 <b>EDCF 제재 업체 명단</b>입니다 (감시할 업체 명단과는 별개). 올려 두면 스캔 때 우리 업체와 사업자번호(없으면 업체명)로 대조해 '제재 중'이면 위험으로 표시합니다. 새로 올리면 기존 명단을 교체합니다.</p>
    <div id="edcfInfo" class="edcf-info"></div>
    <div class="actions left"><button class="btn primary" id="edcfUp">엑셀 파일 올리기</button><button class="btn" id="edcfPaste">표 붙여넣기</button></div>`);
  renderEdcfInfo();
  $("#edcfUp").onclick = () => $("#edcfFile").click();
  $("#edcfPaste").onclick = openEdcfPaste;
}
function openEdcfPaste() {
  modal(`<h2>EDCF 부정당업자 명단 붙여넣기</h2>
    <p class="muted small">EXIMIIS 엑셀에서 <b>제목 줄(업체명, 상태, 제재기간 …)부터</b> 표 전체를 복사해 붙여넣으세요.</p>
    <textarea id="edcfText" placeholder="엑셀 표를 제목 줄부터 복사해 붙여넣으세요.
복사가 막히면 쉼표로 직접 입력해도 됩니다 (제목 줄 필수, 예시는 가상 데이터):

업체명, 상태, 제재기간, 사업자번호
도레온건설, 등록, 2026.01.01 ~ 2027.12.31, 000-00-00000"></textarea>
    <div class="actions"><button class="btn primary" id="edcfParse">확인</button></div>`);
  $("#edcfParse").onclick = () => {
    try {
      const list = rowsToEdcf($("#edcfText").value.split(/\r?\n/).map((l) => l.split(l.includes("\t") ? "\t" : l.includes("|") ? "|" : ",").map((x) => x.trim())));
      if (!list.length) throw new Error("업체 행이 없습니다");
      edcfPreview(list);
    } catch (e) { toast(e.message, 5000); }
  };
}
function renderEdcfInfo() {
  const st = state.settings || {}, list = state.edcf, g = edcfByCompany(edcfMatches(list)), act = g.filter((x) => x.active);
  const active = list.filter((e) => /등록/.test(e.status || "")).length, bad = list.filter((e) => !edcfValid(e)).length;
  if (!$("#edcfInfo")) return;
  if (bad) {
    $("#edcfInfo").innerHTML = `<div class="edcf-bad"><b>지금 명단 ${list.length}건 중 ${bad}건은 상태·제재기간이 없어 제재 기록이 아닙니다</b>${bad === list.length ? " — 감시 업체 명단이 잘못 올라간 것으로 보입니다" : ""}.
      이 행들은 대조에 쓰지 않으며, 다음 스캔 때 이 때문에 생긴 'EDCF 제재 이력'도 자동으로 지워집니다.<br>EXIMIIS 부정당업자조회 엑셀(예: 13건)을 다시 올리거나 비워 주세요.
      <div class="actions left" style="margin-top:8px"><button class="btn sm danger" id="edcfClear">잘못된 명단 비우기</button></div></div>`;
    $("#edcfClear").onclick = clearEdcf;
    return;
  }
  $("#edcfInfo").innerHTML = !list.length ? "아직 등록된 명단이 없습니다."
    : `${list.length}건 (등록 ${active} · 해지 ${list.length - active}) · ${esc(st.edcf_sanctions_at || "")} 반영${st.edcf_sanctions_by ? ` (${esc(st.edcf_sanctions_by.split("@")[0])})` : ""}
       ${g.length ? `<div style="margin-top:6px">우리 명단과 일치 <b>${g.length}곳</b>${act.length ? ` · <b style="color:var(--red)">현재 제재 중 ${act.map((x) => esc(x.c.name)).join(", ")}</b>` : ""}<br>${edcfHitText(g)}</div>` : `<div style="margin-top:6px">우리 명단과 일치하는 업체 없음</div>`}`;
}

const hoursSince = (t) => t ? (Date.now() - Date.parse(String(t).replace(" ", "T") + "+09:00")) / 3600e3 : null;
// ---------- 설정 ----------
function renderGuide() {
  const g = state.guide || {}, fbN = state.findings.filter((f) => f.source_type === "news" && ((f.status === "dismissed" && f.reviewed_by && f.reviewed_by !== "자동 정리") || (f.status === "reviewed" && f.review_note !== "과거 이력 일괄 정리"))).length;
  if (document.activeElement !== $("#guideManual")) $("#guideManual").value = g.manual || "";
  $("#guideAuto").innerHTML = g.auto ? esc(g.auto).replace(/\n/g, "<br>") : `<span class="muted">아직 없습니다. 확인 완료, 관련 없음을 5건 이상 누르면 다음 아침 스캔 때 만들어집니다.</span>`;
  $("#guideMeta").textContent = `지금까지 누른 판단 ${fbN}건${g.auto_at ? ` · ${String(g.auto_at).slice(0, 10)} 정리` : ""} · 주 1회 다시 정리`;
}
function renderSettings() {
  renderKeywords();
  renderAccess();
  renderGuide();

  $("#rcList").innerHTML = state.recipients.map((r) => `<div class="srow"><span>${esc(r.email)}</span><button class="xbtn" data-del-rc="${r.id}" title="삭제">✕</button></div>`).join("") || `<div class="muted small">아직 없습니다.</div>`;
  $$("[data-del-rc]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "recipients", b.dataset.delRc)); state.recipients = state.recipients.filter((r) => r.id !== b.dataset.delRc); renderSettings(); });
  if ($("#advCard").open) renderAdvanced();
}
// 로그인 계정: 관리자(고정) + 추가 계정(meta/access)
const isAdmin = () => ALLOWED_EMAILS.includes(me());
function renderAccess() {
  const extra = state.access || [];
  $("#accList").innerHTML = ALLOWED_EMAILS.map((e) => `<div class="srow"><span>${esc(e)} <span class="tag">관리자</span></span></div>`).join("")
    + extra.map((e) => `<div class="srow"><span>${esc(e)}</span>${isAdmin() ? `<button class="xbtn" data-del-acc="${esc(e)}" title="삭제">✕</button>` : ""}</div>`).join("");
  $("#accForm").classList.toggle("hidden", !isAdmin());
  $$("[data-del-acc]").forEach((b) => b.onclick = async () => {
    if (!confirm(`${b.dataset.delAcc} 계정의 접속 권한을 뺄까요?`)) return;
    await saveAccess(extra.filter((x) => x !== b.dataset.delAcc)); toast("뺐습니다");
  });
}
async function saveAccess(list) {
  await setDoc(doc(db, "meta", "access"), { emails: list, updated_by: me(), updated_at: nowStr() });
  state.access = list; renderAccess();
}
$("#accForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const email = ev.target.email.value.trim().toLowerCase();
  if (!email || ALLOWED_EMAILS.includes(email) || (state.access || []).includes(email)) return toast("이미 있는 계정입니다");
  await saveAccess([...(state.access || []), email]);
  ev.target.reset(); toast(`${email} 추가 — 그 계정으로 Google 로그인하면 들어올 수 있습니다`, 5000);
};
// 기본 검색어: monitor/scanner.py TOPIC_QUERIES 와 같은 목록 유지 (매일 Google·네이버 검색, 화면에서는 보기만)
const TOPIC_QUERIES = [
  "부정당", "부정당업자", "부정당제재", "입찰참가자격 제한", "입찰참가제한", "입찰 제한 처분",
  "입찰 담합", "담합 과징금", "공정위 과징금 건설", "영업정지 건설사", "영업정지 엔지니어링", "등록말소 건설",
  "벌점 건설사", "제재 건설사", "제재 엔지니어링", "하도급 과징금", "공공입찰 제한", "국토교통부 처분",
  "중대재해 건설", "중대재해처벌법 기소", "건설현장 사망사고", "산업재해 건설사", "부실시공 건설사",
  "입찰제한 집행정지", "부정당 집행정지",
];
// 리스크 키워드: 기본(고정) + 추가(직접 입력). 둘 다 매일 검색, AI 판정 참고. 등급은 AI가 기사 내용으로 정함
function renderKeywords() {
  $("#kwFixedN").textContent = TOPIC_QUERIES.length;
  $("#kwFixed").innerHTML = TOPIC_QUERIES.map((q) => `<span class="kchip kfix">${esc(q)}</span>`).join("");
  const user = [...state.keywords].sort((a, b) => a.word.localeCompare(b.word));
  $("#kwCount").textContent = TOPIC_QUERIES.length + user.length;
  $("#kwCount2").textContent = user.length;
  $("#kwList").innerHTML = user.map((k) => `<span class="kchip"><span class="w">${esc(k.word)}</span><button class="kx" data-del-kw="${k.id}" title="삭제">✕</button></span>`).join("") || `<span class="muted small">없음</span>`;
  $$("[data-del-kw]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "keywords", b.dataset.delKw)); state.keywords = state.keywords.filter((k) => k.id !== b.dataset.delKw); renderKeywords(); });
}
// 고급: API 연결 상태 (마지막 스캔 기준)
function renderConnections() {
  const s = state.status, c = s.connections || {}, known = !!s.connections, st = state.settings || {};
  const lists = s.sanction_lists ? Object.entries(s.sanction_lists) : [];
  const listOk = lists.length && lists.every(([, v]) => !/오류/.test(String(v)));
  const scanH = hoursSince(s.last_scan_at), tickH = hoursSince(s.last_tick_at); // tick 은 평일 08~19시만 돌아서 주말엔 길어짐
  const B = (v) => !known ? "unknown" : v ? "ok" : "off";
  const rows = [
    ["Firebase", "데이터 저장 · 로그인", "ok"],
    ["GitHub Actions", s.last_scan_at ? `마지막 스캔 ${s.last_scan_at.slice(5, 16)}${s.last_daily_at ? ` · 매일 실행 ${s.last_daily_at.slice(5, 16)}` : ""}` : "실행 기록 없음", scanH == null ? "unknown" : scanH < 26 ? "ok" : "warn"],
    ["Apps Script", s.last_tick_at ? `5분마다 실행 요청 확인 · 마지막 ${s.last_tick_at.slice(5, 16)}` : st.relay_url ? "웹 앱 주소 등록됨" : "5분 확인 기록 없음 — tick 트리거 확인",
      s.last_tick_at ? (tickH < 80 ? "ok" : "warn") : st.relay_url ? "ok" : "unknown"],
    ["Google 뉴스", "키 필요 없음", B(c.google_news ?? true)],
    ["네이버 뉴스 API", c.naver ? "NAVER API HUB" : "NAVER_APIHUB_KEY_ID · NAVER_APIHUB_KEY", B(c.naver)],
    ["Claude API", c.claude ? (s.claude_error ? `호출 실패 — ${s.claude_error}` : `AI 판정 · ${s.claude_model || ""}`) : "ANTHROPIC_API_KEY (없으면 키워드 규칙)", c.claude && s.claude_error ? "warn" : B(c.claude)],
    ["DART API", c.dart ? "사업자번호 · 영문명 · 업종 자동" : "DART_API_KEY", B(c.dart)],
    ["조달청 API", c.pps ? "부정당제재 · 업체 기본정보" : "DATA_GO_KR_KEY", B(c.pps)],
    ["MDB 제재 리스트", lists.length ? lists.map(([k, v]) => `${MDB_NAME[k] || k} ${v}`).join(" · ") : "OpenSanctions (키 필요 없음)", !lists.length ? "unknown" : listOk ? "ok" : "warn"],
    ["메일 발송 (SMTP)", c.smtp ? `받는 사람 ${state.recipients.length}명` : "SMTP_USER · SMTP_PASSWORD", B(c.smtp) === "ok" && !state.recipients.length ? "warn" : B(c.smtp)],
    ["외교부 여행경보", state.geo?.alerts ? `조달청과 같은 공공데이터포털 키 · ${Object.keys(state.geo.alerts).length}개국` : "조달청과 같은 키(DATA_GO_KR_KEY) · 공공데이터포털 활용신청 필요", state.geo?.alerts ? "ok" : known ? "off" : "unknown"],
    ["USGS 지진", "키 필요 없음 · 규모 4.5 이상", (state.geo?.events || []).length || state.geo?.updated_at ? "ok" : "unknown"],
  ];
  // [연결 확인]을 눌렀을 때 실제로 불러 본 결과가 있으면 그것을 우선
  const cc = s.conn_check, CK = { "Google 뉴스": "google_news", "네이버 뉴스 API": "naver", "Claude API": "claude", "DART API": "dart", "조달청 API": "pps", "MDB 제재 리스트": "mdb", "외교부 여행경보": "mofa", "USGS 지진": "usgs", "메일 발송 (SMTP)": "smtp" };
  if (cc?.results) rows.forEach((r) => { const x = cc.results[CK[r[0]]]; if (x) { r[1] = `${x.ok ? "" : "실패: "}${x.msg}`; r[2] = x.ok ? "ok" : "off"; } });
  $("#connNote").innerHTML = cc?.at ? `<b>${esc(cc.at.slice(5, 16))}</b> 연결 확인 결과 (실제로 한 번씩 불러 본 결과)` : `위 표시는 <b>키가 등록돼 있는지</b>만 본 것입니다 (마지막 스캔 기준). 키가 실제로 되는지는 위의 [연결 확인]을 누르세요.`;
  const BADGE = { ok: `<span class="badge none">연결됨</span>`, warn: `<span class="badge yellow">확인 필요</span>`, off: `<span class="badge orange">미연결</span>`, unknown: `<span class="badge gray">확인 전</span>` };
  $("#connList").innerHTML = rows.map(([k, d, stt]) => `<div class="conn"><div class="ct"><div class="k">${k}</div><div class="d" title="${esc(d)}">${esc(d)}</div></div>${BADGE[stt]}</div>`).join("");
}
// [연결 확인]: 요청을 남기면 5분 안에 GitHub Actions 가 각 API를 실제로 불러 보고 결과를 저장
$("#btnConnCheck").onclick = async () => {
  const b = $("#btnConnCheck");
  if (state.connReq) return toast("이미 연결 확인을 요청했습니다. 잠시만 기다려 주세요");
  try {
    const ref = await addDoc(collection(db, "requests"), { task: "check", companies: "", test_to: "", label: "연결 확인", status: "pending", requested_by: auth.currentUser?.email || "", requested_at: nowStr(), requested_ms: Date.now() });
    state.connReq = { id: ref.id, at: Date.now() };
    const relayed = await pingRelay();
    b.disabled = true; $("span", b).textContent = "확인 중…";
    $("#connNote").innerHTML = `<span class="spinner"></span> 연결 확인 요청됨 · ${relayed ? "1~2분" : "보통 5분"} 안에 결과가 나옵니다 (평일 08~19시)`;
    pollConnCheck();
  } catch (e) { toast("요청을 저장하지 못했습니다: " + e.message, 5000); }
};
async function pollConnCheck() {
  const r = state.connReq; if (!r) return;
  try {
    const d = (await getDoc(doc(db, "requests", r.id))).data() || {};
    if (d.status === "done" || d.status === "error") {
      const st = await getDoc(doc(db, "meta", "status")); if (st.exists()) state.status = st.data();
      state.connReq = null; const b = $("#btnConnCheck"); b.disabled = false; $("span", b).textContent = "연결 확인";
      renderConnections();
      toast(d.status === "done" ? `연결 확인 완료 · ${d.result?.ok ?? "-"}/${d.result?.total ?? "-"} 정상` : `연결 확인 실패: ${d.result?.error || ""}`, 5000);
      return;
    }
  } catch {}
  if (Date.now() - r.at > 20 * 60e3) { state.connReq = null; $("#btnConnCheck").disabled = false; $("#btnConnCheck span").textContent = "연결 확인"; $("#connNote").textContent = "응답이 없습니다. 평일 08~19시에 다시 눌러 주세요."; return; }
  setTimeout(pollConnCheck, 8000);
}
// 실행 기록: 사람이 읽는 한 줄 요약
function runSummary(r) {
  const d = r.detail || {}, errs = Array.isArray(d.errors) ? d.errors.length : d.errors || 0;
  const parts = r.kind === "scan" ? [d.quick && "빠른 스캔", d.companies != null && `업체 ${d.companies}`, d.fetched != null && `기사 ${Number(d.fetched).toLocaleString()}건`, d.new_findings != null && `새 이슈 ${d.new_findings}건`, d.seconds != null && `${Math.round(d.seconds)}초`]
    : r.kind === "report" ? [d.error ? "발송 실패" : d.items != null && `이슈 ${d.items}건`, d.to && `받는 사람 ${[].concat(d.to).length}명`, d.test && "테스트"]
    : r.kind === "dart" ? [d.count != null && `기업 ${Number(d.count).toLocaleString()}곳`]
    : r.kind === "dartfill" ? [d.count != null && `대상 ${d.count}`, `채움 ${d.filled || 0}`, `고르기 ${d.choose || 0}`, `DART에 없음 ${d.none || 0}`]
    : r.kind === "rejudge" ? [d.targets != null && `대상 ${d.targets}건`, d.updated != null && `갱신 ${d.updated}건`, d.failed ? `못 받음 ${d.failed}건` : ""] : [];
  return [...parts.filter(Boolean), errs ? `오류 ${errs}건` : ""].filter(Boolean).join(" · ");
}
// 오류 문장 → 출처·내용별로 묶기 ("업체 / 조달청 부정당제재: Read timed out" → 조달청 부정당제재 · 응답 지연 · 업체 목록)
function errGroups(errs) {
  const m = new Map();
  for (const raw of errs) {
    const t = String(raw), mm = t.match(/^(.*?) \/ (.+?)(?: '[^']*')?: ([\s\S]*)$/);
    const who = mm ? mm[1].trim() : "", src = mm ? mm[2].trim() : "기타", msg = (mm ? mm[3] : t).replace(/\s+/g, " ").trim().slice(0, 160);
    const k = src + "|" + msg.slice(0, 60), g = m.get(k) || { src, msg, who: [] };
    if (who && !g.who.includes(who)) g.who.push(who);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.who.length - a.who.length);
}
const errHint = (msg) => /timed? ?out|timeout|시간 초과/i.test(msg) ? "응답이 늦어 건너뜀 — 다음 스캔 때 다시 확인합니다"
  : /429|too many|limit|한도|quota/i.test(msg) ? "하루 호출 한도를 넘음 — 다음 날 자동으로 다시 확인합니다"
  : /401|403|unauthor|forbidden|key|인증/i.test(msg) ? "키(인증) 문제 — GitHub Secrets의 키를 확인하세요"
  : /credit|balance/i.test(msg) ? "API 잔액 부족 — Anthropic Console에서 충전"
  : /50[0-9]|bad gateway|unavailable/i.test(msg) ? "상대 서버 일시 오류 — 다음 스캔 때 다시 확인합니다"
  : /판정을 주지 않음|예전 등급/.test(msg) ? "등급이 바뀌지 않았을 뿐 이슈는 그대로 보입니다 — 따로 할 일은 없습니다" : "";
function renderAdvanced() {
  const KIND = { scan: "스캔", report: "메일 발송", dart: "DART 갱신", dartfill: "DART 채움", rejudge: "재판정(새 등급 기준)" };
  renderConnections();
  $("#runList").innerHTML = state.runs.slice(0, 8).map((r) => {
    const d = r.detail || {};
    let errs = Array.isArray(d.errors) ? d.errors : d.error ? [d.error] : [];
    // 예전 재판정 기록은 오류 내용이 없음 → 무슨 뜻인지 설명으로 대신
    if (!r.ok && !errs.length && r.kind === "rejudge") errs = [` / AI 재판정: AI가 기사 ${d.failed || 0}건에 판정을 주지 않음 — 그 기사는 예전 등급 그대로 두고 다음 아침에 다시 시도합니다 (3번까지)`];
    const head = `<span class="badge ${r.ok ? "none" : "orange"}">${r.ok ? "정상" : "오류"}</span><b>${esc(KIND[r.kind] || r.kind)}</b><span class="t">${esc(String(r.at || "").slice(5, 16))}</span><span class="s">${esc(runSummary(r))}</span>`;
    if (!errs.length) return `<div class="run">${head}</div>`;
    return `<details class="run run-err"><summary>${head}<span class="go">오류 보기</span></summary><div class="err-list">${errGroups(errs).map((g) => {
      const hint = errHint(g.msg);
      return `<div class="err"><div><b>${esc(g.src)}</b>${g.who.length ? ` <span class="muted">· ${g.who.length}곳</span>` : ""}</div>
        ${hint ? `<div class="hint">${esc(hint)}</div>` : ""}<div class="msg">${esc(g.msg)}</div>
        ${g.who.length ? `<div class="who">${esc(g.who.slice(0, 12).join(", "))}${g.who.length > 12 ? ` 외 ${g.who.length - 12}곳` : ""}</div>` : ""}</div>`;
    }).join("")}${(d.errors?.length || 0) >= 50 ? `<div class="muted small">오류가 많아 앞의 50건만 보관했습니다.</div>` : ""}</div></details>`;
  }).join("") || `<div class="muted small">아직 실행 기록이 없습니다.</div>`;
}
$("#guideSave").onclick = async () => {
  const manual = $("#guideManual").value.trim().slice(0, 2000);
  await setDoc(doc(db, "meta", "ai_guide"), { manual, manual_at: nowStr(), manual_by: me() }, { merge: true });
  state.guide = { ...(state.guide || {}), manual }; toast("판정 지침을 저장했습니다. 다음 스캔부터 적용됩니다");
};
$("#guideAutoClear").onclick = async () => {
  if (!confirm("AI가 정리한 지침을 지울까요? 다음 아침 스캔 때 지금까지 누른 판단으로 다시 만듭니다.")) return;
  await setDoc(doc(db, "meta", "ai_guide"), { auto: "", auto_at: "", auto_n: 0 }, { merge: true });
  state.guide = { ...(state.guide || {}), auto: "", auto_at: "" }; renderGuide();
};

// ---------- DART로 빈 정보 채우기 ----------
// 이름이 DART에 정확히 1곳이면 스캔 쪽에서 바로 채우고, 여러 곳이면 후보(dart_cands)를 남김 → 여기서 고름
const dartPending = () => state.companies.filter((c) => Array.isArray(c.dart_cands) && c.dart_cands.length);
function renderDartBar() {
  const n = dartPending().length, b = $("#btnDartPick");
  b.classList.toggle("hidden", !n); b.textContent = `DART 후보 고르기 ${n}`;
}
$("#btnDartFill").onclick = () => {
  const n = state.companies.filter((c) => (c.country || "KR") === "KR" && !(c.biz_no && c.name_en)).length;
  if (!n) return toast("사업자번호와 영문명이 빈 국내 업체가 없습니다");
  if (confirm(`사업자번호나 영문명이 빈 국내 업체 ${n}개를 DART에서 찾아 채울까요?\n\n이름이 DART에 1곳만 있으면 바로 채우고, 같은 이름이 여러 곳이면 후보를 보여 드립니다. 몇 분 걸립니다.`)) runWorkflow({ task: "dartfill" }, "DART 채움");
};
$("#btnDartPick").onclick = openDartPick;
function openDartPick() {
  const list = dartPending();
  if (!list.length) return toast("고를 후보가 없습니다");
  modal(`<h2>DART 후보 고르기 <span class="count">${list.length}</span></h2>
    <p class="muted small">DART에 같은 이름의 기업이 여러 곳 있는 업체입니다. 맞는 기업을 고르면 사업자번호, 영문명, 대표자가 채워집니다. 모르면 '나중에'로 두세요.</p>
    <form id="dartPickForm"><div class="dp-list">${list.map((c) => `<div class="dp-co"><div class="dp-name"><b>${esc(c.name)}</b>${c.engagements?.length ? ` <span class="muted small">${esc(c.engagements.map((e) => state.projects.find((p) => p.id === e.project_id)?.name).filter(Boolean).slice(0, 2).join(", "))}</span>` : ""}</div>
      ${c.dart_cands.map((o, i) => `<label class="dp-opt"><input type="radio" name="dp-${c.id}" value="${i}"><span><b>${esc(o.name)}</b>${o.listed ? ` <span class="tag">상장</span>` : ""} <span class="muted">${esc([o.ceo && "대표 " + o.ceo, o.biz_no && fmtBiz(o.biz_no), o.name_en].filter(Boolean).join(" · ") || "상세 정보 없음")}</span></span></label>`).join("")}
      <label class="dp-opt"><input type="radio" name="dp-${c.id}" value="none"><span>이 가운데 없음 <span class="muted">(직접 입력)</span></span></label>
      <label class="dp-opt"><input type="radio" name="dp-${c.id}" value="" checked><span class="muted">나중에</span></label></div>`).join("")}</div>
      <div class="actions"><button class="btn primary">고른 대로 채우기</button></div></form>`);
  $("#modal").classList.add("wide");
  $("#dartPickForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target), b = writeBatch(db); let n = 0;
    for (const c of list) {
      const v = fd.get("dp-" + c.id);
      if (v === "" || v == null) continue;
      const p = { dart_cands: null };
      if (v === "none") p.dart_note = "DART 후보 중 해당 없음 (직접 입력 필요)";
      else {
        const o = c.dart_cands[+v];
        p.corp_code = o.corp_code;
        if (o.biz_no && !c.biz_no) { p.biz_no = o.biz_no; p.bizno_source = "DART 선택"; }
        if (o.name_en && !c.name_en) p.name_en = o.name_en;
        if (o.ceo && !c.ceo) p.ceo = o.ceo;
      }
      b.update(doc(db, "companies", c.id), p); Object.assign(c, p); n++;
    }
    if (n) await b.commit();
    closeModal(); toast(n ? `${n}개 업체를 반영했습니다` : "고른 업체가 없습니다"); rerender();
  };
}

$("#advCard").addEventListener("toggle", (e) => { if (e.target.open) renderAdvanced(); });
$("#runTestMail").onclick = () => runWorkflow({ task: "report-test", test_to: me() }, "테스트 메일 발송");
$("#runMailAll").onclick = () => { if (confirm(`받는 사람 ${state.recipients.length}명에게 지금 기준 리포트를 보낼까요?`)) runWorkflow({ task: "report" }, "리포트 발송"); };
$("#btnPreview").onclick = async () => {
  modal(`<h2>메일 미리보기</h2><p class="muted small" id="reportMeta">불러오는 중…</p><iframe id="reportFrame" class="report-frame" sandbox="allow-popups allow-popups-to-escape-sandbox"></iframe>`);
  $("#modal").classList.add("wide");
  await loadReportPreview();
};

// 추가 키워드 기본값 (v5: ★·등급 칸 없앰 — 기본 키워드와 겹치거나 너무 일반적인 단어·영문 단어는 정리)
const DEFAULT_KEYWORDS = ["압수수색", "뇌물", "횡령", "배임", "기소", "회생절차", "법정관리", "시정명령"];
// v4 까지의 기본 키워드 (v5 정리 때 이 단어들만 지우고, 사용자가 직접 넣은 단어는 남김)
const OLD_DEFAULT_WORDS = new Set(["부정당", "입찰참가자격", "참가자격제한", "입찰참가제한", "입찰제한", "입찰 참가 제한", "영업정지", "회생절차", "법정관리", "부도", "담합", "과징금", "압수수색", "기소", "구속", "뇌물", "횡령", "배임", "허위", "공정위", "제재", "등록말소", "의혹", "고발", "벌점", "시정명령", "중대재해", "부실시공", "소송", "재해", "위반", "debar", "sanction", "bribery", "corruption", "fraud", "collusion", "bid rigging", "korupsi", "tersangka", "suap"]);
const KEYWORDS_VERSION = 5;
async function loadDefaultKeywords() {
  const batch = writeBatch(db), ver = state.settings?.keywords_version || 0;
  if (ver > 0 && ver < 5) { // 예전 기본 키워드 정리 (직접 넣은 단어는 남김)
    for (const k of state.keywords) if (OLD_DEFAULT_WORDS.has(k.word) && !DEFAULT_KEYWORDS.includes(k.word)) batch.delete(doc(db, "keywords", k.id));
    state.keywords = state.keywords.filter((k) => !OLD_DEFAULT_WORDS.has(k.word) || DEFAULT_KEYWORDS.includes(k.word));
  }
  const have = new Set(state.keywords.map((k) => k.word));
  for (const word of DEFAULT_KEYWORDS) {
    if (have.has(word)) continue;
    const ref = doc(collection(db, "keywords")), data = { word, lang: "ko", level: "yellow", use_in_query: 1 };
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
  if (TOPIC_QUERIES.includes(word)) return toast("기본 키워드에 이미 있습니다");
  const data = { word, level: "yellow", lang: /[가-힣]/.test(word) ? "ko" : "en", use_in_query: 1 };
  const ref = await addDoc(collection(db, "keywords"), data);
  state.keywords.push({ id: ref.id, ...data });
  ev.target.reset(); renderKeywords();
};
async function loadReportPreview() {
  const snap = await getDoc(doc(db, "meta", "report_preview"));
  const d = snap.exists() ? snap.data() : null;
  $("#reportFrame").srcdoc = d?.html || `<p style="font-family:sans-serif;color:#667085;padding:24px">스캔을 한 번 실행하면 메일 미리보기가 만들어집니다.</p>`;
  $("#reportMeta").textContent = d ? `${d.generated_at} 생성 · 신규 ${d.items}건` : "";
}

// ---------- 수원국 리스크 (assets/geo.js) ----------
initGeo({
  state, esc, info, isMine, ICON_USER, ICON_ORG,
  getScope: () => { scopeCompanies(); return scope; },
  setScope: (v) => { scope = v; try { localStorage.setItem("edcf_scope2", scope); } catch {} },
  companyTally: (pid) => { const t = { red: 0, orange: 0, none: 0, total: 0 }; state.companies.forEach((c) => { if (c.engagements.some((e) => e.project_id === pid)) { t[scanned() ? c.risk : "none"]++; t.total++; } }); return t; },
});
$("#geoScan").onclick = () => $("#btnScan").click(); // 같은 스캔 (업체·수원국 정보를 함께 새로 받음)
