// EDCF 부정당업자 모니터링: GitHub Pages + Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, writeBatch, increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ALLOWED_EMAILS, GITHUB_REPO, SUPER_ADMIN, SUPER_ADMINS, TEAMS } from "./firebase-config.js?v=33";
import { initGeo, renderGeo, mountSitePicker, ensureGeoLibs, GEO_CITY, GEO_COUNTRY, siteAlert, siteOpt, projectPoint, projectGeoRisk } from "./geo.js?v=74";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const ACTIONS_URL = `https://github.com/${GITHUB_REPO}/actions/workflows/monitor.yml`;
const SECRETS_URL = `https://github.com/${GITHUB_REPO}/settings/secrets/actions`;

// ---------- 공통 ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// 화면 문구에 '—'는 쓰지 않음: 예전에 저장된 문구(서버 메모·기록 제목)도 보여 줄 때 ' · '로
const esc = (s) => String(s ?? "").replace(/\s—\s/g, " · ").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 등급은 3단계(경고·주의·정상). yellow 는 등급이 아니라 "참고 이력"으로만 남김 (업체 등급에는 넣지 않음)
const LEVEL = { red: "경고", orange: "주의", yellow: "참고", none: "정상" };
const LEVEL_DESC = { red: "지금 제재 중", orange: "제재로 이어질 수 있는 진행 중 사안", yellow: "참고 이력 (등급에 넣지 않음)", none: "경고·주의 이슈 없음" };
// 등급 뜻 (i 에 마우스를 올리면): 경고는 실제로 지금 제재를 받고 있는 경우만
const LEVEL_DEF = {
  red: "<b>지금 유효한 제재</b><br>입찰참가자격 제한(부정당업자 제재), MDB 제재, 등록말소, 기간 중인 영업정지. 공식 명단(EXIMIIS '등록', 조달청, MDB)에 있거나, 기사에 처분 기간이 적혀 있고 오늘이 그 안인 경우. 기간이 끝나면 주의로 내려감",
  orange: "<b>제재로 이어질 수 있는 진행 중 사안</b><br>최근 1년 내 수사, 압수수색, 기소, 유죄판결, 담합 적발, 공정위 과징금, 처분 예고와 청문, 집행정지로 멈춘 제재, 부도와 회생절차",
  none: "<b>경고·주의 이슈 없음</b><br>아래 참고 이력만 있는 업체도 정상",
  yellow: "기록만 남기는 이력: 1년 지난 제재와 처분(EXIMIIS '해지' 포함), 계열사가 받은 처분, 의혹과 고발, 소송과 분쟁, 중대재해와 부실시공, 재무 악화",
};
const levelTip = () => `<div class="tip-p">업체에 걸린 이슈 가운데 가장 높은 등급입니다.</div>
  <div class="tip-grid lv"><span>${badge("red")}</span><span>지금 유효한 제재 (입찰 제한 · MDB · 기간 중 영업정지)</span>
  <span>${badge("orange")}</span><span>제재로 이어질 수 있는 진행 중 사안 (수사 · 기소 · 과징금)</span>
  <span>${badge("none")}</span><span>경고·주의 이슈 없음</span></div>
  <div class="tip-sep">등급이 아닌 표시 (기사에 붙음)</div>
  <div class="tip-grid lv"><span>${badge("yellow")}</span><span>기록만 남기는 과거·간접 이력. 참고만 있는 업체는 정상</span></div>`;
// i 버튼: 마우스를 올리거나 누르면 설명 (cls 'r' = 오른쪽 맞춤)
const sumText = (f) => String(f?.summary || f?.title || "").replace(/^※[^.]*확인\.\s*/, "");
const info = (html, cls = "") => `<span class="itip ${cls}" tabindex="0" role="note" aria-label="설명">i<span class="tip">${html}</span></span>`;
const LV = { red: 3, orange: 2, yellow: 1, none: 0 };
const ROLE_CLS = { 컨설턴트: "consult", 본구매: "buy", "F/S": "fs" };
const ROLE_ORDER = ["F/S", "컨설턴트", "본구매"];
const COUNTRY = { TZ: "탄자니아", PK: "파키스탄", KE: "케냐", MN: "몽골", LA: "라오스", ID: "인도네시아", KR: "한국", VN: "베트남", KH: "캄보디아", BD: "방글라데시", PH: "필리핀", UZ: "우즈베키스탄", ET: "에티오피아", GH: "가나", MM: "미얀마", LK: "스리랑카", NP: "네팔", RW: "르완다", UG: "우간다", TN: "튀니지", EG: "이집트", BO: "볼리비아", PY: "파라과이", CO: "콜롬비아", PE: "페루", EC: "에콰도르", GT: "과테말라", SN: "세네갈", MZ: "모잠비크", CM: "카메룬", NG: "나이지리아", TR: "튀르키예", UA: "우크라이나", GE: "조지아", AZ: "아제르바이잔", KZ: "카자흐스탄", KG: "키르기스스탄", TJ: "타지키스탄", TL: "동티모르", HN: "온두라스", NI: "니카라과", SV: "엘살바도르", CR: "코스타리카", PA: "파나마", DO: "도미니카공화국", BR: "브라질" };
const COUNTRY_BY_NAME = { ...Object.fromEntries(Object.entries(COUNTRY).map(([k, v]) => [v, k])), 카라치: "PK", 이슬라마바드: "PK", 나이로비: "KE", 다르에스살람: "TZ", 울란바토르: "MN", 비엔티안: "LA", 자카르타: "ID", 하노이: "VN", 프놈펜: "KH", 다카: "BD", 마닐라: "PH", 타슈켄트: "UZ" };
const byRole = (es) => [...es].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
const badge = (lv) => `<span class="badge ${lv || "none"}">${LEVEL[lv || "none"]}</span>`;
// 역할 이름 통일: 일괄 등록 등에서 '본공사'·'시공'·'감리'처럼 다르게 적힌 것을 세 가지로 (그 밖의 말은 적은 그대로)
const normRole = (r) => { const t = String(r || "").replace(/\s/g, ""); return /^(f\/?s|타당성)/i.test(t) ? "F/S" : /컨설|감리|자문|설계|pmc?$/i.test(t) ? "컨설턴트" : /본구매|본공사|본사업|시공|공사|구매|공급|건설/.test(t) ? "본구매" : String(r || "").trim(); };
const roleTag = (r) => `<span class="role ${ROLE_CLS[r] || "fs"}">${esc(r)}</span>`;
const stageTag = (e) => e.stage && e.stage !== "계약" ? `<span class="stage">${esc(e.stage)}${e.rank ? " " + e.rank + "순위" : ""}</span>` : "";
const state = { projects: [], companies: [], findings: [], keywords: [], recipients: [], status: {}, runs: [], edcf: [], mdbKorea: null, users: [], me: { role: "member", team: null }, loadedAt: 0 };
const me = () => auth.currentUser?.email || "";
const live = (p) => p.status !== "done"; // 완료한 사업은 대시보드·내 담당에서 빠짐 (사업 관리에는 남음)
// ---------- 권한 (users/{메일}: role super·admin·member, team) ----------
// 슈퍼관리자: 전부 / 팀 관리자: 자기 팀 사업·업체 연결·팀원 / 팀원: 보기 + 자기 팀 업체 이슈의 관련 있음·관련 없음
const ROLE_L = { super: "슈퍼관리자", admin: "팀 관리자", member: "팀원" };
// 슈퍼관리자는 firebase-config.js SUPER_ADMINS 2명 고정, 나머지는 설정 > 계정·권한에서 정한 대로 (팀 관리자 · 팀원)
const isSuperMail = (e) => SUPER_ADMINS.includes(String(e || "").toLowerCase());
const isFixedSuper = () => !!state.me?.fixed;
const myTeam = () => state.me?.team || null;
const isSuper = () => state.me?.role === "super";
const isTeamAdmin = () => state.me?.role === "admin";
const canManage = () => isSuper() || isTeamAdmin();
const teamName = (t) => TEAMS[t] || "팀 미지정";
const mineLabel = () => (myTeam() ? `${TEAMS[myTeam()]} 사업` : "우리 팀 사업");
const projTeam = (pid) => state.projects.find((p) => p.id === pid)?.team || null;
const teamsOf = (c) => [...new Set((c.engagements || []).map((e) => projTeam(e.project_id)).filter(Boolean))].sort();
const canEditProject = (p) => isSuper() || (isTeamAdmin() && !!p && p.team === myTeam());
// 이슈 처리: 자기 팀 사업에 참여한 업체만 (사업에 연결 안 된 업체는 관리자 누구나)
const canReview = (cid) => {
  if (isSuper()) return true;
  const c = state.companies.find((x) => x.id === cid), ts = c ? teamsOf(c) : [];
  return (!!myTeam() && ts.includes(myTeam())) || (isTeamAdmin() && !ts.length);
};
const isMine = (p) => live(p) && !!p.team && p.team === myTeam(); // 우리 팀 사업 (팀 미지정 사업은 'EDCF 전체'에서만 보임)

function toast(msg, ms = 2800) {
  msg = String(msg).replace(/\s—\s/g, " · ");
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
}
// 창: 닫기는 오른쪽 위 X 하나 (아래 버튼 줄에는 주 버튼만)
const X_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
function modal(html) {
  const m = $("#modal"); m.className = "modal"; m.innerHTML = html;
  const close = document.createElement("button"); close.type = "button"; close.className = "x-close"; close.id = "modalClose"; close.title = "닫기"; close.setAttribute("aria-label", "닫기"); close.innerHTML = X_SVG;
  m.prepend(close);
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
  // 내 권한: 슈퍼관리자(고정) → users/{메일} → 예전 방식(관리자 목록·meta/access, 슈퍼관리자가 옮기기 전까지)
  const email = String(user.email || "").toLowerCase();
  let meRole = null;
  try {
    const u = await getDoc(doc(db, "users", email));
    if (u.exists()) meRole = { role: u.data().role === "admin" ? "admin" : "member", team: u.data().team || null };
  } catch {}
  if (isSuperMail(email)) meRole = { role: "super", team: meRole?.team || "ict", fixed: true };
  if (!meRole && ALLOWED_EMAILS.includes(email)) meRole = { role: "member", team: "ict", legacy: true };
  if (!meRole) {
    try { const a = await getDoc(doc(db, "meta", "access")); if (a.exists() && (a.data().emails || []).includes(email)) meRole = { role: "member", team: null, legacy: true }; } catch {}
  }
  const allowed = !!meRole;
  if (!allowed) return showLogin(`<b>${esc(user.email)}</b> 계정은 접근 권한이 없습니다.<br>관리자에게 허용 목록 추가를 요청하세요.`, true);
  $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
  if (window.__DEMO && !$(".demo-banner")) $("#appView").insertAdjacentHTML("afterbegin", `<div class="demo-banner">DEMO · 가상 데이터로 보는 화면입니다 (실제 업체·Firebase와 연결되지 않음) · <a href="./">실제 화면으로</a></div>`);
  $("#userEmail").textContent = user.email;
  $("#acctAv").textContent = (user.email || "?")[0].toUpperCase();
  state.me = meRole;
  // 슈퍼관리자·팀 관리자만 [관리자 모드] 버튼이 보임: 팀원은 업체·수원국 리스크 화면만
  state.admin = canManage();

  $("#btnAdmin").classList.toggle("hidden", !state.admin);
  $("#userRole").textContent = `${ROLE_L[meRole.role]}${meRole.team ? " · " + teamName(meRole.team) : ""}`;
  document.body.classList.toggle("viewer", !state.admin); // 팀원: 스캔·등록·수정 버튼을 숨김 (Firestore 규칙도 같게)
  document.body.classList.toggle("role-super", isSuper());
  document.body.classList.toggle("role-admin", isTeamAdmin());
  setAdmin(state.admin && adminSaved());

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
  const [p, c, f, k, r, st, runs, cfg, ed, mk, acc, geo, guide, hist, us] = await Promise.all([
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
    getDoc(doc(db, "meta", "geo")), // 수원국 리스크 (여행경보·지진·뉴스 이벤트): 문서 1개라 읽기 1회
    getDoc(doc(db, "meta", "ai_guide")), // AI 판정 지침 (직접 쓴 것 + 담당자 판단을 AI가 요약한 것)
    getDoc(doc(db, "meta", "history")), // 날짜별 등급 업체 수 (어제와 비교 · 30일 추이)
    getDocs(collection(db, "users")).catch(() => ({ docs: [] })), // 계정·권한 (팀·역할)
  ]);
  state.users = docs(us);
  trackWebReads([p, c, f, k, r, runs, ed, us].reduce((n, x) => n + Math.max(1, (x.docs || []).length), 0) + 7);
  state.history = hist.exists() ? (hist.data().days || {}) : {};
  queueMicrotask(async () => { try { await migrateRoles(); await syncCompanyTeams(); } catch (e) { console.warn("권한 정리 실패:", e); } });
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
  // 잘못된 명단(상태·제재기간 없음) 때문에 생긴 EDCF 기록은 바로 숨김: 실제 삭제는 다음 스캔 또는 [잘못된 명단 비우기]
  const okEdcf = new Set(edcfMatches(state.edcf).map((x) => x.c.id));
  state.findings = state.findings.filter((f) => !String(f.dedup_key || "").startsWith("edcf-") || okEdcf.has(f.company_id));
  const todayStr = nowStr().slice(0, 10);
  const yearAgo = new Date(Date.now() + 9 * 3600e3 - 365 * 864e5).toISOString().slice(0, 10);
  state.findings.forEach((f) => { const u = f.valid_until && String(f.valid_until).slice(0, 10); if (u && u < todayStr && (f.level === "red" || (f.level === "orange" && u < yearAgo))) f.level = u < yearAgo ? "yellow" : "orange"; }); // 기사에 적힌 처분 기간이 끝나면 경고 → 주의 (report.load_overview 와 같은 기준)
  state.findings.forEach((f) => { if (f.level === "red" && String(f.dedup_key || "").startsWith("edcf-") && edcfEnded({ period: String(f.title || "").split(" · ").pop() })) { f.level = "yellow"; f.title = String(f.title).replace("[EDCF 제재 등록]", "[EDCF 제재 기간 만료]"); f.summary = "EDCF 부정당업자 제재기간이 끝났습니다 (명단에는 아직 '등록'). 최신 EXIMIIS 명단으로 확인하세요."; } });
  state.mdbKorea = mk.exists() ? mk.data() : null;
  state.access = acc.exists() ? (acc.data().emails || []) : [];
  state.geo = geo.exists() ? geo.data() : null;
  state.loadedAt = Date.now();
  if (isSuper() && (state.settings?.keywords_version || 0) < KEYWORDS_VERSION) await loadDefaultKeywords(); // 키워드를 모두 지워도 되살리지 않음
  compute();
}
// 사용량 · 요금 카드용: 이 화면이 읽은 문서 수 (대시보드 1회 로드 ≈ 1,500 읽기). 쓰기 1회, 실패해도 무시
function trackWebReads(n) {
  if (window.__DEMO || !n) return;
  const d = nowStr(), m = d.slice(0, 7), day = d.slice(0, 10);
  setDoc(doc(db, "meta", "usage"), { web: { [m]: { loads: increment(1), reads: increment(n) } }, web_days: { [day]: { loads: increment(1), reads: increment(n) } } }, { merge: true }).catch(() => {});
}
function compute() {
  for (const c of state.companies) {
    c.engagements = c.engagements || [];
    c.engagements.forEach((e) => { const r = normRole(e.role); if (r && r !== e.role) e.role = r; }); // 화면에서는 통일해 보여 주고, 그 업체를 다음에 저장할 때 같이 고쳐짐
    c.focus = c.engagements.some((e) => { const p = state.projects.find((x) => x.id === e.project_id); return p && live(p); });
    c.cat = normCat(c.category); // 업종이 아직 없으면 화면에는 이름으로 추정해 보여줌 (스캔 때 DART 업종으로 저장)
    c.catGuess = !c.cat; if (!c.cat) c.cat = guessCat(c.name) || guessCat(c.name_en) || "기타";
    // 내 담당 = 내가 담당인 사업에 참여한 업체만
    c.mine = c.engagements.some((e) => { const p = state.projects.find((x) => x.id === e.project_id); return p && isMine(p); });
    const fs = state.findings.filter((f) => f.company_id === c.id && f.status !== "dismissed");
    c.risk = fs.reduce((m, f) => (f.level === "red" || f.level === "orange") && LV[f.level] > (LV[m] || 0) ? f.level : m, "none"); // 3단계: 참고(yellow)는 정상
    c.ref = fs.filter((f) => f.level === "yellow").length;
    c.open = groupFindings(fs.filter((f) => f.status === "new" && (f.level === "red" || f.level === "orange"))).length; // 확인할 일 = 경고·주의 (같은 이슈는 1건)
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
  // 업체 ↔ 수원국 카드 뒤집기는 뺌 (2026-11-20: 회사 PC에서 버벅임 · 필수가 아니라 바로 전환)
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
  else if (state.openPid) openProject(state.openPid);
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
  $("#fontReset").textContent = label; $("#fontReset").classList.toggle("def", !k);
  requestAnimationFrame(() => { if (typeof fixLabels === "function") fixLabels(); });
}
const stepFont = (d) => { fontStep = Math.min(FONT_STEPS.length - 1, Math.max(0, fontStep + d)); try { localStorage.setItem("edcf_font", FONT_STEPS[fontStep][0]); } catch {} applyFont(); toast(`글자 크기: ${FONT_STEPS[fontStep][1]}`, 1500); };
$("#fontDown").onclick = () => stepFont(-1); $("#fontUp").onclick = () => stepFont(1);

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
function applyThemeLabel() { $("#btnTheme").textContent = document.documentElement.dataset.theme === "light" ? "어둡게 바꾸기" : "밝게 바꾸기"; }
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
const PERIODS = [["all", "전체"], ["1d", "24시간"], ["7d", "최근 7일"], ["30d", "최근 30일"], ["old", "30일 이전"]]; // 수원국 리스크(geo.js)와 같은 구분
const pubMs = (f) => { const d = f.published_at ? Date.parse(String(f.published_at).slice(0, 10) + "T00:00:00+09:00") : NaN; return Number.isFinite(d) ? d : (f.first_seen_ms || Date.now()); };
// ---------- 같은 이슈 묶기 (monitor/grouping.py 와 같은 기준) ----------
// 같은 기사·같은 사건이 여러 건으로 보이지 않게 한 줄로 묶음. 묶인 기사는 펼쳐서 보고, 처리 버튼은 묶음 전체에 적용
//  ① 제목이 같거나(매체 꼬리·[단독] 같은 머리표 제외) 원문 주소가 같은 기사: 업체가 달라도 하나로 (업체 이름을 함께 표시)
//  ② 같은 업체 · 같은 분류(예: 입찰담합) · 보도일 3일 이내: 여러 매체가 같은 사건을 보도한 경우
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
  if (p === "1d") return Date.now() - (f.first_seen_ms || pubMs(f)) <= DAY; // 24시간: 우리 화면에 처음 잡힌 때 기준 (공식 기록 포함)
  if (official) return true; // 공식 제재·수기 기록은 기간과 무관하게 항상 표시
  return age <= { "7d": 7 * DAY, "30d": 30 * DAY }[p];
}
let period = null;
try { period = localStorage.getItem("edcf_period"); } catch {}
// 보기 범위: 진행중 사업 업체(내가 담당하는 사업에 연결된 업체) / EDCF 주요 업체(전체 명단)
let scope = null;
try { scope = localStorage.getItem("edcf_scope2"); } catch {}
function scopeCompanies() {
  const mine = state.companies.filter((c) => c.mine);
  if (!scope) scope = mine.length ? "mine" : "all";
  return scope === "mine" ? mine : state.companies;
}
const scopeProjects = () => scope === "mine" ? state.projects.filter(isMine) : state.projects.filter(live);

// ---------- 대시보드 (한 화면) ----------
const ROLE_ABBR = { 컨설턴트: "컨", 본구매: "본", "F/S": "FS" };
// ---------- 리스크 레이더: 색 띠 = 등급(가운데일수록 경고), 주요 리스크 업체는 이름 표시 ----------
function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
const polar = (deg, r) => { const rad = (deg * Math.PI) / 180; return [50 + (Math.sin(rad) * r) / 2, 50 - (Math.cos(rad) * r) / 2]; };
const BANDS = { red: [8, 25], orange: [38, 56], none: [68, 86], pending: [68, 86] };
const RADAR_MAX = 80; // 점이 너무 많으면 읽기 어려워서: 등급 높은 순으로
// 레이더 꾸밈 (2026-11-19 사용자 선택 '유리 돔'): 바깥에서 도는 궤도 고리 · 경고 원에서 퍼지는 파동 · 유리 반사광
const RADAR_FX = `<svg class="grid fx" viewBox="0 0 200 200" aria-hidden="true">
      <circle class="orbit o1" cx="100" cy="100" r="103.2"/><circle class="orbit o2" cx="100" cy="100" r="106.6"/>
      <circle class="pulse p1" cx="100" cy="100" r="31"/><circle class="pulse p2" cx="100" cy="100" r="31"/></svg><div class="radar-glass"></div>`;
function renderRadar(cs) {
  const el = $("#radar"), sc = scanned();
  const n = { red: 0, orange: 0, yellow: 0, none: 0 };
  cs.forEach((c) => n[sc ? c.risk : "none"]++);
  const risky = sc ? cs.filter((c) => c.risk !== "none").sort((a, b) => (LV[b.risk] - LV[a.risk]) || b.open - a.open || a.name.localeCompare(b.name)) : [];
  const labeled = risky.filter((c) => c.risk === "red").slice(0, 10); // 이름은 경고 업체만 10곳까지(미확인 많은 순), 주의는 점으로만 · 마우스를 올리면 이름
  const dot = (c, ang, lv, label) => {
    const [r0, r1] = BANDS[lv];
    const r = label ? (r0 + r1) / 2 : r0 + ((hash(c.id + "r") % 1000) / 1000) * (r1 - r0);
    const [x, y] = polar(ang, r), pids = c.engagements.map((e) => e.project_id).join(" ");
    const tip = `${c.name} · ${sc ? LEVEL[c.risk] : "스캔 전"}${c.open ? ` · 미확인 ${c.open}건` : ""}`;
    return `<button class="rdot ${lv}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--d:calc(${Math.round(ang)} * var(--sweep, 6s) / 360)" data-cid="${c.id}" data-pids="${pids}" data-tip="${esc(tip)}" aria-label="${esc(tip)}"></button>`
      + (label ? (() => { const [lx, ly] = polar(ang, 64); return `<span class="rlabel ${lv} ${lx >= 50 ? "r" : "l"}" style="left:${lx.toFixed(2)}%;top:${ly.toFixed(2)}%" data-cid="${c.id}" data-lv="${lv}" data-pids="${pids}">${esc(c.name)}</span>`; })() : "");
  };
  // 이름표가 겹치지 않게 좌우를 번갈아 배치 (위쪽은 등급 글자 자리라 비움)
  const SLOTS = [106, 254, 78, 282, 134, 226, 50, 310, 160, 200]; // 오른쪽·왼쪽 번갈아, 위쪽(등급 글자 자리)은 비움
  const dots = [
    ...labeled.map((c, i) => dot(c, SLOTS[i], c.risk, true)),
    ...risky.filter((c) => !labeled.includes(c)).slice(0, RADAR_MAX).map((c) => dot(c, 62 + (hash(c.id) % 236), c.risk, false)),
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
    ${RADAR_FX}<div class="sweep"></div><div class="radar-core"></div>
    <svg class="grid labels" viewBox="0 0 200 200" aria-hidden="true">${t("none", 20, "정상")}${t("orange", 50, "주의")}${t("red", 81, "경고")}</svg>
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
    lb.style.marginTop = "0px"; lb.style.marginLeft = "0px";
    let r = lb.getBoundingClientRect();
    // 칸 밖으로 나가면 반대쪽(가운데 위)으로 뒤집지 않고 칸 안쪽까지만 당김
    const dx = r.right > box.right - 6 ? box.right - 6 - r.right : r.left < box.left + 6 ? box.left + 6 - r.left : 0;
    if (dx) { lb.style.marginLeft = dx + "px"; r = lb.getBoundingClientRect(); }
    const h = r.height + 3;
    const dy = [0, h, -h, 2 * h, -2 * h, 3 * h].find((d) => {
      const m = { left: r.left, right: r.right, top: r.top + d, bottom: r.bottom + d };
      return m.top >= box.top && m.bottom <= box.bottom && !placed.some((p) => hit(m, p));
    }) ?? 0;
    lb.style.marginTop = dy + "px";
    placed.push({ left: r.left, right: r.right, top: r.top + dy, bottom: r.bottom + dy });
  });
  // 이름표가 점에서 떨어져 있으면 가는 선으로 이음
  const R = el.getBoundingClientRect();
  let svg = el.querySelector("svg.leads");
  if (!svg) { svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "leads"); svg.setAttribute("aria-hidden", "true"); el.appendChild(svg); }
  svg.setAttribute("viewBox", `0 0 ${R.width} ${R.height}`);
  svg.innerHTML = $$(".rlabel", el).map((lb) => {
    const d = el.querySelector(`.rdot[data-cid="${lb.dataset.cid}"]`); if (!d) return "";
    const a = d.getBoundingClientRect(), b = lb.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - R.left, y1 = a.top + a.height / 2 - R.top, x2 = (b.left + b.right) / 2 < a.left + a.width / 2 ? b.right - R.left : b.left - R.left, y2 = b.top + b.height / 2 - R.top;
    return Math.hypot(x2 - x1, y2 - y1) < 14 ? "" : `<line class="${lb.dataset.lv || ""}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }).join("");
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
const LEVEL_SHORT = { red: "지금 제재 중 (입찰제한·MDB·영업정지)", orange: "수사·기소·과징금·처분 예고·부도", none: "경고·주의 이슈 없음" };
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
  $("#scopeSeg").innerHTML = !state.companies.length ? "" : [["mine", mineLabel(), mineN, myP, ICON_USER], ["all", "EDCF 전체", state.companies.length, state.projects.length, ICON_ORG]]
    .map(([k, l, cnt, pn, ic]) => `<button data-s="${k}" class="sc-btn ${k} ${k === scope ? "active" : ""}" title="${l}: 사업 ${pn}개 · 업체 ${cnt}"><span class="sc-ic">${ic}</span>${l}<span class="sc-n">업체 ${cnt}</span></button>`).join("");
  $$("#scopeSeg button").forEach((b) => b.onclick = () => { scope = b.dataset.s; try { localStorage.setItem("edcf_scope2", scope); } catch {} renderHome(); });
  $("#scopeInfo").innerHTML = ""; // 범위 설명 i 는 뺌 (버튼에 이름과 업체 수가 이미 보임)

  if (!state.companies.length) showGuide(`<b>시작하기</b>: <b>업체 관리</b>에서 [일괄 등록]으로 업체를 넣고 <b>지금 스캔</b>을 누르세요.`);
  else if (!sc) showGuide(`업체 ${cs.length}이 등록됐습니다. <b>지금 스캔</b>을 눌러 첫 스캔을 실행하세요.`);
  else showGuide("");

  // ① 업체 등급: 경고·주의·정상 3단계를 한 판에 (숫자 · 해당 업체 · 등급 뜻)
  const open = state.findings.filter((f) => f.status === "new" && ids.has(f.company_id));
  // 확인할 일은 경고·주의만: 참고(yellow)는 '참고 이력'으로 따로 모음 (처리하지 않아도 됨)
  const isAct = (f) => f.level === "red" || f.level === "orange";
  const openG = groupFindings(open.filter(isAct)); // 같은 기사·같은 사건은 한 건으로
  const refG = groupFindings(open.filter((f) => !isAct(f)));
  const byLv = { red: [], orange: [], none: [] };
  cs.forEach((c) => byLv[c.risk].push(c));
  const riskyN = byLv.red.length + byLv.orange.length;
  const who = (l) => { const x = [...l].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)); return x.slice(0, 1).map((c) => c.name).join("") + (x.length > 1 ? ` 외 ${x.length - 1}` : ""); };
  // 어제와 비교 · 30일 추이: 이슈가 처음 잡힌 날로 날짜별 경고·주의 업체 수를 되짚어 계산 (지금 보는 범위 기준, 따로 쌓인 기록이 없어도 바로 그려짐)
  const firstBy = new Map(); // 업체 → { any: 경고·주의 이슈가 처음 잡힌 때, red: 경고 이슈가 처음 잡힌 때 }
  state.findings.forEach((f) => {
    if (!ids.has(f.company_id) || f.status === "dismissed" || (f.level !== "red" && f.level !== "orange")) return;
    const t = f.first_seen_ms || pubMs(f), x = firstBy.get(f.company_id) || { any: Infinity, red: Infinity };
    x.any = Math.min(x.any, t); if (f.level === "red") x.red = Math.min(x.red, t); firstBy.set(f.company_id, x);
  });
  const dayEnd = (k) => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime() - k * DAY; }; // k일 전의 끝
  const at = (t) => { let v = 0, r = 0; firstBy.forEach((x) => { if (x.any <= t) v++; if (x.red <= t) r++; }); return { v, r }; };
  const series = sc ? Array.from({ length: 30 }, (_, i) => (i === 29 ? { v: riskyN, r: byLv.red.length } : at(dayEnd(29 - i)))) : [];
  const yd = sc ? at(dayEnd(1)) : null, prevN = yd ? { red: yd.r, orange: yd.v - yd.r, none: cs.length - yd.v } : null;
  const delta = (lv) => { if (!prevN) return ""; const d = byLv[lv].length - prevN[lv]; return d ? `<span class="rk-d ${lv !== "none" ? (d > 0 ? "up" : "down") : ""}" title="어제 ${prevN[lv]}">${d > 0 ? "+" : "−"}${Math.abs(d)}</span>` : ""; };
  // 최근 7일: 그날 새로 잡힌 경고·주의 이슈 수 (처음 잡힌 때 기준, 같은 사건은 1건, '관련 없음'은 뺌)
  // 경고·주의를 위아래 두 줄로 (겹치지 않게), 부드러운 곡선 + 은은한 채움, 숫자는 매일 작게 · 오늘만 크게
  const newByDay = (k) => {
    const end = dayEnd(k), start = end - DAY + 1;
    const list = state.findings.filter((f) => ids.has(f.company_id) && f.status !== "dismissed" && (f.level === "red" || f.level === "orange")
      && (f.first_seen_ms || pubMs(f)) >= start && (f.first_seen_ms || pubMs(f)) <= end).map((f) => ({ ...f, status: "new" })); // 처리 상태와 관계없이 그날 잡힌 것
    return groupFindings(list).reduce((a, g) => (g.items.some((f) => f.level === "red") ? a.r++ : a.o++, a), { r: 0, o: 0 });
  };
  const spark = () => {
    if (!sc) return "";
    const wk = Array.from({ length: 7 }, (_, i) => newByDay(6 - i)), max = Math.max(...wk.map((x) => Math.max(x.r, x.o)), 1), WD = "일월화수목금토";
    const W = 300, LH = 50, H = LH * 2 + 18, L0 = 42, R0 = 14, X = (i) => L0 + (i / 6) * (W - L0 - R0);
    const dayN = (i) => { const d = new Date(Date.now() - (6 - i) * DAY); return i === 6 ? "오늘" : WD[d.getDay()]; };
    const lane = (k, name, top) => {
      const base = top + LH - 6, Y = (v) => base - (v / max) * (LH - 28), P = wk.map((x, i) => [X(i), Y(x[k])]);
      const d = P.map(([x, y], i) => { if (!i) return `M${x.toFixed(1)},${y.toFixed(1)}`; const [px0, py0] = P[i - 1], mx = ((px0 + x) / 2).toFixed(1); return `C${mx},${py0.toFixed(1)} ${mx},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`; }).join("");
      const area = `${d}L${X(6).toFixed(1)},${base}L${X(0).toFixed(1)},${base}Z`;
      const dots = P.map(([x, y], i) => `<g class="pt ${i === 6 ? "now" : ""}"><title>${dayN(i)} 새 ${name} ${wk[i][k]}건</title>${i === 6 ? `<circle class="halo ${k}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/>` : ""}<circle class="dot ${k}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 6 ? 3.8 : 2.2}"/><text class="val ${i === 6 ? "now" : ""} ${wk[i][k] ? "" : "zero"}" x="${x.toFixed(1)}" y="${(y - 7).toFixed(1)}">${wk[i][k]}</text></g>`).join("");
      return `<line class="base" x1="${L0 - 6}" x2="${W - R0 + 6}" y1="${base}" y2="${base}"/>
        <text class="ln" x="0" y="${(base - 4).toFixed(1)}"><tspan class="sw ${k}">●</tspan> ${name}</text>
        <path class="area ${k}" d="${area}" fill="url(#wkg-${k})"/><path class="line ${k}" d="${d}"/>${dots}`;
    };
    const days = wk.map((_, i) => `<text class="day ${i === 6 ? "now" : ""}" x="${X(i).toFixed(1)}" y="${H - 3}">${dayN(i)}</text>`).join("");
    return `<div class="rk-trend"><div class="rk-trend-h"><span>최근 7일</span><span class="wk-sub">새로 잡힌 경고·주의 (건)</span></div>
      <svg class="wk2" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 7일 새로 잡힌 경고 ${wk.map((x) => x.r).join(", ")}건, 주의 ${wk.map((x) => x.o).join(", ")}건">
        <defs><linearGradient id="wkg-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--red)" stop-opacity=".38"/><stop offset="1" stop-color="var(--red)" stop-opacity="0"/></linearGradient>
        <linearGradient id="wkg-o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--orange)" stop-opacity=".38"/><stop offset="1" stop-color="var(--orange)" stop-opacity="0"/></linearGradient></defs>
        <rect class="today" x="${(X(6) - 15).toFixed(1)}" y="2" width="30" height="${H - 4}" rx="8"/>
        ${lane("r", "경고", 0)}${lane("o", "주의", LH)}${days}</svg></div>`;
  };
  $("#kboard").innerHTML = `<div class="card-head"><h2>업체 등급 ${info(levelTip())}</h2>${sc ? "" : `<span class="muted small">스캔 전</span>`}</div>`
    + ["red", "orange", "none"].map((lv) => {
      const l = byLv[lv];
      return `<button class="rk ${lv} ${sc && l.length ? "on" : ""}" data-lv="${lv}" ${sc && l.length ? `title="누르면 ${LEVEL[lv]} 업체 ${l.length}개를 봅니다"` : "disabled"}>
        <div class="rk-num">${sc ? `<span data-count="${l.length}">0</span>` : "-"}</div>
        <div class="rk-lv">${LEVEL[lv]}${delta(lv)}</div>
        <div class="rk-names ${sc && l.length && lv !== "none" ? "" : "zero"}">${!sc ? "스캔 전" : lv === "none" ? (l.length ? `이슈 없음${l.filter((c) => c.ref).length ? ` · 참고 ${l.filter((c) => c.ref).length}` : ""}` : "해당 업체 없음") : l.length ? esc(who(l)) : "해당 업체 없음"}</div></button>`;
    }).join("") + spark();
  // ② 공식 제재 명단 대조: 출처별(EXIMIIS·조달청·MDB) 현황만: 아래 이슈 목록과 겹치지 않게
  const off = state.findings.filter((f) => ids.has(f.company_id) && f.source_type !== "news" && f.status !== "dismissed");
  const oc = { edcf: [new Set(), new Set()], pps: [new Set(), new Set()], mdb: [new Set(), new Set()] }; // [지금 제재 중, 그 밖]
  off.forEach((f) => oc[officialSrc(f)][f.level === "red" ? 0 : 1].add(f.company_id));
  const evN = state.edcf.filter(edcfValid).length;
  const ocRow = (name, k, other, extra) => `<div class="oc-row"><span class="oc-k">${name}</span><span class="oc-v">${oc[k][0].size ? `<b class="red-t">제재 중 ${oc[k][0].size}</b>` : `<span class="muted">제재 중 0</span>`}${oc[k][1].size ? ` <span class="muted">· ${other} ${oc[k][1].size}</span>` : ""}</span>${extra || ""}</div>`;
  $("#noteCard").innerHTML = `<div class="oc-head"><h2>공식 제재 명단 ${info(`<div class="tip-p">지금 제재 중인 우리 업체 수입니다.</div><div class="tip-grid"><b>EDCF</b><span>EXIMIIS 부정당업자</span><b>조달청</b><span>나라장터 부정당제재</span><b>MDB</b><span>세계은행 등 5개 기관</span></div>`)}</h2>${evN ? "" : `<span class="oc-x"><span class="warn-t">EXIMIIS 명단 없음</span></span>`}</div>
    <div class="oc-mini">${[["EDCF", "edcf"], ["조달청", "pps"], ["MDB", "mdb"]].map(([n, k]) => `<span class="oc-c ${oc[k][0].size ? "hot" : ""}"><i>${n}</i><b>${oc[k][0].size}</b></span>`).join("")}</div>`;
  const nums = [$("#kboard"), $("#noteCard")];
  if (!state.kpiAnimated) { state.kpiAnimated = true; nums.forEach(countUp); } // 숫자 올라가는 효과는 처음 한 번만
  else nums.forEach((el) => $$("[data-count]", el).forEach((e) => (e.textContent = e.dataset.count)));
  $$("#kboard .rk:not(:disabled)").forEach((b) => b.onclick = () => openRiskList(b.dataset.lv));
  $("#noteCard").onclick = (e) => { if (!e.target.closest(".itip")) openOfficial(cs); };
  $("#noteCard").onkeydown = (e) => { if (e.key === "Enter") openOfficial(cs); };

  // ③ 레이더 + 귀퉁이 정보 (범위 · 범례 · 마지막 스캔)
  renderRadar(cs);
  $("#radarHud").innerHTML = `<span class="hud tl"><b>RISK RADAR</b><i>${scope === "mine" ? mineLabel() : "EDCF 전체"}</i></span>
    <span class="hud bl"><span><i class="lg red"></i>경고</span><span><i class="lg orange"></i>주의</span><span><i class="lg none"></i>정상</span></span>`;
  $("#radarInfo").innerHTML = info(`<div class="tip-p">가운데에 가까울수록 등급이 높습니다.</div><div class="tip-grid"><b>점</b><span>경고·주의 업체 (누르면 상세)</span><b>정상</b><span>바깥 원에 숫자로만</span></div>`, "r");

  // ④ 확인이 필요한 이슈 (경고 → 공식 제재 → 최신)
  const counts = Object.fromEntries(PERIODS.map(([k]) => [k, openG.filter((g) => groupIn(g, k)).length]));
  if (!period || !counts.hasOwnProperty(period)) period = counts["7d"] ? "7d" : "all";
  $("#periodSeg").innerHTML = PERIODS.map(([k, label]) => `<button data-p="${k}" class="${k === period ? "active" : ""}">${label} <span class="n">${counts[k]}</span></button>`).join("");
  $$("#periodSeg button").forEach((b) => b.onclick = () => { period = b.dataset.p; try { localStorage.setItem("edcf_period", period); } catch {} renderHome(); });
  const shown = openG.filter((g) => groupIn(g, period));
  $("#issueCount").textContent = openG.length;
  $("#actHelp").innerHTML = ""; // 처리 버튼 설명 i 는 뺌 ([판단 가이드]와 버튼 위 설명으로 충분)
  if (shown.length) renderGroups(shown, $("#feed"));
  else $("#feed").innerHTML = !sc ? `<div class="empty">스캔 후 이곳에 이슈가 출처와 함께 표시됩니다.</div>`
    : openG.length ? `<div class="ok-box">이 조건에는 확인할 이슈가 없습니다 <span class="muted small">(전체 ${openG.length}건)</span></div>`
    : `<div class="ok-box">확인이 필요한 이슈가 없습니다</div>`;
  if (period === "old" && shown.length) { // 30일 지난 기사: 이미 아는 과거 이력이면 한 번에 정리
    $("#feed").insertAdjacentHTML("afterbegin", `<div class="bulk-bar"><span>30일 지난 기사 <b>${shown.length}건</b> · 이미 아는 과거 이력이면 한 번에 정리할 수 있습니다</span><button class="btn sm" id="bulkOld">모두 관련 있음</button></div>`);
    $("#bulkOld").onclick = () => bulkReview(shown);
  }
  // 참고 이력: 처리하지 않아도 되는 목록: 펼칠 때만 그림
  const refW = $("#refWrap");
  refW.classList.toggle("hidden", !refG.length);
  $("#refN").textContent = refG.length;
  refW.ontoggle = () => { if (!refW.open) return; renderGroups(refG.slice(0, 100), $("#feedRef")); if (refG.length > 100) $("#feedRef").insertAdjacentHTML("beforeend", `<div class="muted small">앞의 100건만 보여줍니다 (전체 ${refG.length}건 · 업체 상세에서 모두 볼 수 있음)</div>`); };
  if (refW.open) refW.ontoggle();
  const done = state.findings.filter((f) => f.status === "reviewed" && ids.has(f.company_id)).sort(byLevelDate);
  $("#doneWrap").classList.toggle("hidden", !done.length);
  if (done.length) renderFeed(done, $("#feedDone"));

  // ⑤ 담당 사업 (경고 업체가 많은 사업부터)
  $("#projTitle").textContent = scope === "mine" ? mineLabel() : "전체 사업";
  $("#projN").textContent = ps.length;
  const tally = (p) => { const t = { red: 0, orange: 0, yellow: 0, none: 0 }; state.companies.forEach((c) => { if (c.engagements.some((e) => e.project_id === p.id)) t[c.risk]++; }); return t; };
  const tl = Object.fromEntries(ps.map((p) => [p.id, tally(p)]));
  const psSorted = [...ps].sort((a, b) => !sc ? a.name.localeCompare(b.name)
    : (tl[b.id].red - tl[a.id].red) || (tl[b.id].orange - tl[a.id].orange) || a.name.localeCompare(b.name));
  $("#projectMap").innerHTML = psSorted.map((p) => projectRow(p)).join("")
    || `<div class="empty small">${scope === "mine" ? "내가 담당하는 사업이 없습니다." : "등록된 사업이 없습니다."}</div>`;
  // 사업이 적어 칸이 많이 남으면 칸을 내용 높이까지만 (많으면 이슈 목록 끝까지 채우고 안에서 스크롤)
  { const pl = $("#projectMap"), card = pl.closest(".d-projects"); card.classList.remove("fit"); requestAnimationFrame(() => { const last = pl.lastElementChild; card.classList.toggle("fit", !!last && pl.clientHeight > 0 && last.getBoundingClientRect().bottom - pl.getBoundingClientRect().top < pl.clientHeight - 60); }); }
  $$("#projectMap .pj").forEach((r) => { r.addEventListener("mouseenter", () => focusProject(r.dataset.pid)); r.addEventListener("mouseleave", () => focusProject(null)); });
  $$("#projectMap [data-cid]").forEach((x) => x.addEventListener("click", (e) => { e.stopPropagation(); openCompany(x.dataset.cid); }));
  $$("#projectMap .pj").forEach((r) => { r.tabIndex = 0; r.title = "누르면 이 사업의 업체와 이슈를 봅니다"; r.onclick = () => openProject(r.dataset.pid); r.onkeydown = (e) => { if (e.key === "Enter") openProject(r.dataset.pid); }; });

  renderJob(); checkSmooth();
}
// 사업 한 줄: 업체 등급 분포(막대) + 등급별 업체 수. '하나라도 경고이면 사업 전체가 경고'처럼 보이지 않게
function projectRow(p) {
  const rows = [];
  for (const c of state.companies) c.engagements.forEach((e) => { if (e.project_id === p.id) rows.push({ c, e }); });
  rows.sort((a, b) => ROLE_ORDER.indexOf(a.e.role) - ROLE_ORDER.indexOf(b.e.role) || byOrder(a, b));
  const sc = scanned(), t = { red: 0, orange: 0, yellow: 0, none: 0 };
  new Set(rows.map((r) => r.c)).forEach((c) => t[c.risk]++);
  const total = t.red + t.orange + t.none;
  const bar = !total ? "" : !sc ? `<i class="pending" style="flex:1"></i>`
    : ["red", "orange", "none"].filter((lv) => t[lv]).map((lv) => `<i class="${lv}" style="flex:${t[lv]}" title="${LEVEL[lv]} ${t[lv]}개"></i>`).join("");
  const sum = !total ? `<span class="tot">연결된 업체 없음</span>`
    : !sc ? `<span class="tot">업체 ${total} · 스캔 전</span>`
    : (["red", "orange"].filter((lv) => t[lv]).map((lv) => `<span class="${lv}">${LEVEL[lv]} ${t[lv]}</span>`).join("") || `<span class="ok">이상 없음</span>`) + `<span class="tot">/ ${total}개</span>`;
  return `<div class="pj" data-pid="${p.id}">
    <div class="pj-top"><span class="pj-name" title="${esc(p.name)}">${esc(p.name)}</span>${p.country ? `<span class="pj-ctry">${esc(COUNTRY[p.country] || p.country)}</span>` : ""}</div>
    ${total ? `<div class="pj-dist"><div class="pj-bar">${bar}</div><div class="pj-sum">${sum}</div></div>` : `<div class="pj-dist"><div class="pj-sum">${sum}</div></div>`}
    <div class="pj-roles">${pjRoles(rows, sc, true)}</div>
  </div>`;
}
// 사업 카드 안 업체: 역할(F/S → 컨설턴트 → 본구매)별로 한 줄씩: 역할이 섞여 보이지 않게
function pjRoles(rows, sc, compact = false) {
  const roles = [...ROLE_ORDER, ...new Set(rows.map((r) => r.e.role).filter((r) => !ROLE_ORDER.includes(r)))];
  return roles.map((role) => {
    const l = rows.filter((r) => r.e.role === role);
    if (!l.length) return "";
    const hot = l.filter(({ c }) => sc && c.risk !== "none"), calm = l.length - hot.length;
    // 경고·주의가 없는 역할도 줄은 보여 줌(정상 N): 사업에 어떤 역할(단계)의 업체가 들어와 있는지 알 수 있게
    if (sc && compact) return `<div class="pj-role${hot.length ? "" : " mini"}">${roleTag(role || "기타")}<div class="pcos">${hot.map(({ c, e }) => `<span class="cchip ${c.risk}" data-cid="${c.id}" title="${esc(c.name)} · ${LEVEL[c.risk]}"><span class="dot ${c.risk}"></span>${esc(c.name)}${e.rank ? `<small>${e.rank}순위</small>` : e.stage && e.stage !== "계약" ? `<small>${esc(e.stage)}</small>` : ""}</span>`).join("")}${calm ? `<span class="cchip calm" title="${esc(l.filter(({ c }) => c.risk === "none").map(({ c }) => c.name).join(", "))}">정상 ${calm}</span>` : ""}</div></div>`;
    return `<div class="pj-role">${roleTag(role || "기타")}<div class="pcos">${l.map(({ c, e }) => `<span class="cchip ${sc ? c.risk : ""}" data-cid="${c.id}" title="${esc(c.name)}${sc ? " · " + LEVEL[c.risk] : ""}${e.stage && e.stage !== "계약" ? " · " + esc(e.stage) : ""}"><span class="dot ${sc ? c.risk : ""}"></span>${esc(c.name)}${e.rank ? `<small>${e.rank}순위</small>` : e.stage && e.stage !== "계약" ? `<small>${esc(e.stage)}</small>` : ""}</span>`).join("")}</div></div>`;
  }).join("");
}
function showDataCheck(cs, cv, gapN) {
  const row = (ok, k, d) => `<div class="chk-row ${ok}"><span class="ic">${{ ok: "✓", warn: "!", bad: "✕", na: "–" }[ok]}</span><div><b>${k}</b><div class="d">${d}</div></div></div>`;
  const st = (k, t) => !t ? "na" : k === t ? "ok" : k === 0 ? "bad" : "warn";
  const mk = state.mdbKorea;
  modal(`<h2>데이터 점검</h2>
    <p class="muted small">마지막 스캔에서 업체별로 무엇을 확인했는지입니다. '정상'은 아래 범위에서 발견되지 않았다는 뜻입니다.</p>
    ${row(st(cv.news, cv.scanned), "뉴스 검색", `${cv.news}/${cv.scanned}개: Google·네이버 뉴스에서 업체명과 제재 키워드 검색`)}
    ${row(st(cv.mdb, cv.scanned), "MDB 제재 리스트 대조", `${cv.mdb}/${cv.scanned}개: World Bank·ADB·AfDB·IDB·EBRD${cv.mdb < cv.scanned ? " (영문명이 없는 업체는 대조가 불완전)" : ""}`)}
    ${cv.ppsConnected ? row(st(cv.pps, cv.ppsTotal), "조달청 부정당제재 조회", `${cv.pps}/${cv.ppsTotal}개: 사업자번호로 현재 유효한 제재 조회${cv.pps < cv.ppsTotal ? " (사업자번호가 없는 업체는 조회 못 함)" : ""}`) : row("na", "조달청 부정당제재 조회", "미연결")}
    ${row(state.edcf.length ? "ok" : "warn", "EDCF 부정당업자 명단 (EXIMIIS)", state.edcf.length ? `${state.edcf.length}건과 대조` : "아직 등록되지 않음 → 업체 관리 [EXIMIIS 제재 명단]에서 올리기")}
    ${row(mk?.count ? "warn" : "ok", "MDB 한국 국적 제재 기업", mk ? `${mk.count || 0}개 (우리 명단과 별개로 참고) <a href="#" id="dcMdb">목록 보기</a>` : "첫 스캔 후 표시")}
    ${gapN ? `<div class="actions left"><button class="btn sm" id="dcGaps">보완할 업체 ${gapN} 보기</button></div>` : ""}`);
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
    // 지금 볼 것(제재 중·확인 필요)만 펼쳐 두고, 과거 기록은 접음. 세 표의 칸 폭은 같게, 내용에서는 업체 이름 반복을 뺌
    const core = (x) => String(x || "").replace(/주식회사|\(주\)|㈜|\s/g, "");
    const detail = (f) => { const seg = String(f.title || "").replace(/^\[[^\]]*\]\s*/, "").split(/\s[—·]\s/); if (seg.length > 1 && core(seg[0]).includes(core(f.company_name))) seg.shift(); return seg.join(" · "); };
    const tbl = (rows) => `<div class="tbl-wrap"><table class="tbl oc-tbl"><colgroup><col class="c1"><col class="c2"><col></colgroup><thead><tr><th>업체</th><th>상태</th><th>내용</th></tr></thead><tbody>${rows.map((f) => `<tr><td><a href="#" data-oc="${f.company_id}">${esc(f.company_name)}</a></td><td class="nowrap"><span class="badge ${f.level}">${STATE[k][f.level] || LEVEL[f.level]}</span></td><td class="small">${esc(detail(f))}</td></tr>`).join("")}</tbody></table></div>`;
    const act = l.filter((f) => f.level === "red" || f.level === "orange"), past = l.filter((f) => f.level !== "red" && f.level !== "orange");
    return `<div class="oc-src"><div class="oc-src-h"><b>${name}</b><span class="d">${desc}</span><span class="n ${now ? "red-t" : "muted"}">제재 중 ${now}</span></div>
      ${act.length ? tbl(act) : `<div class="oc-none">${l.length ? "지금 제재 중이거나 확인이 필요한 업체가 없습니다" : "이 명단에 있는 업체가 없습니다"}</div>`}
      ${past.length ? `<details class="oc-past"><summary>과거 기록 ${past.length}건 (업체 ${new Set(past.map((f) => f.company_id)).size})</summary>${tbl(past)}</details>` : ""}</div>`;
  };
  modal(`<h2>공식 제재 명단</h2>
    <p class="muted small">${scope === "mine" ? mineLabel() : "EDCF 전체"} 업체 ${cs.length} 가운데 공식 제재 명단에 있는 업체입니다.</p>
    ${src("edcf", "EDCF", "EXIMIIS 부정당업자 명단" + (st.edcf_sanctions_at && ev.length ? ` · ${esc(st.edcf_sanctions_at.slice(0, 10))} 올린 명단 ${ev.length}건` : ev.length ? "" : " · 아직 올리지 않음"))}
    ${src("pps", "조달청", "나라장터 부정당제재 · 사업자번호로 매일 조회")}
    ${src("mdb", "MDB", "세계은행 등 5개 기관 제재 리스트 · 영문명으로 매일 대조")}
    <details class="oc-more" ${ev.length ? "" : "open"}><summary>EXIMIIS 명단 올리기${ev.length ? ` · 올린 명단 ${ev.length}건` : ""}</summary>
      <div class="oc-btns"><button class="btn sm" id="edcfUp">엑셀 올리기</button><button class="btn sm" id="edcfPaste">표 붙여넣기</button><span class="muted small">EXIMIIS → 경협 → 업무지원 → 부정당업자조회에서 내려받은 엑셀을 그대로 올립니다(따로 양식 없음). 새로 올리면 기존 명단을 바꿉니다.</span></div>
      ${bad ? `<div class="edcf-bad"><b>제재 기록이 아닌 행 ${bad}건</b>(상태·제재기간 없음)이 들어 있습니다. 대조에는 쓰지 않습니다. <button class="btn sm danger" id="edcfClear">잘못된 명단 비우기</button></div>` : ""}
      ${ev.length ? (() => {
        const un = ev.filter((e) => !matchBy.get(e));
        return ""
          + (un.length ? `<div class="tbl-wrap"><table class="tbl oc-raw"><thead><tr><th>업체명</th><th>상태</th><th>제재기간</th><th>관련 사업</th></tr></thead><tbody>${un.map((e) => `<tr><td>${esc(e.name)}</td><td>${edcfActive(e) ? `<span class="badge red">등록</span>` : `<span class="muted">${esc(e.status || "-")}${/등록/.test(e.status || "") ? " (기간 만료)" : ""}</span>`}</td><td>${esc(e.period || "")}</td><td>${esc(e.project_name || "")}${e.country ? ` <span class="muted">(${esc(e.country)})</span>` : ""}</td></tr>`).join("")}</tbody></table></div>` : "");
      })() : ""}
    </details>
    <details class="oc-more"><summary>검사 범위 보기 (마지막 스캔 기준)</summary>
      ${row(stt(cv.news, cv.scanned), "뉴스 검색", `${cv.news}/${cv.scanned} · Google, 네이버 뉴스에서 업체명과 제재 키워드 검색`)}
      ${row(stt(cv.mdb, cv.scanned), "MDB 제재 리스트", `${cv.mdb}/${cv.scanned} · 영문명으로 대조${cv.mdb < cv.scanned ? " (영문명이 없는 업체는 불완전)" : ""}`)}
      ${cv.ppsConnected ? row(stt(cv.pps, cv.ppsTotal), "조달청 부정당제재", `${cv.pps}/${cv.ppsTotal} · 사업자번호로 현재 유효한 제재 조회${cv.pps < cv.ppsTotal ? " (사업자번호가 없는 업체는 조회 못 함)" : ""}`) : row("na", "조달청 부정당제재", "미연결")}
      ${row(mk?.count ? "warn" : "ok", "MDB 한국 국적 제재 기업", mk ? `${mk.count || 0}개 (우리 명단과 별개로 참고) <a href="#" id="dcMdb">목록 보기</a>` : "첫 스캔 후 표시")}
    </details>`);
  $("#modal").classList.add("wide");
  $$("#modal [data-oc]").forEach((a) => a.onclick = (e) => { e.preventDefault(); closeModal(); openCompany(a.dataset.oc, "official"); });
  $("#edcfUp").onclick = () => $("#edcfFile").click();
  $("#edcfPaste").onclick = openEdcfPaste;
  $("#edcfClear")?.addEventListener("click", clearEdcf);
  $("#dcMdb")?.addEventListener("click", (e) => { e.preventDefault(); showMdbKorea(() => openOfficial()); });
  $("#dcGaps")?.addEventListener("click", showGaps);
}
function showMdbKorea(back) {
  const mk = state.mdbKorea || {};
  modal(`<h2>MDB 한국 국적 제재 기업 <span class="count">${mk.count || 0}</span></h2>
    <p class="muted small">MDB 제재 리스트에서 국적이 한국인 기업 · ${esc(mk.at || "")} 기준</p>
    ${mk.items?.length ? `<div class="mk-list">${mk.items.map((e) => `<a class="mk-row" href="${esc(e.url)}" target="_blank" rel="noopener" title="${esc(e.sanctions || "")}"><span>${esc(e.name)}</span><span class="ds">${esc(MDB_NAME[e.dataset] || e.dataset)} ↗</span></a>`).join("")}</div>` : `<div class="empty">현재 한국 국적 제재 기업이 없습니다.</div>`}`);
  if (back) $("#modalClose").onclick = back;
}
const MDB_NAME = { worldbank_debarred: "World Bank", adb_sanctions: "ADB", afdb_sanctions: "AfDB", iadb_sanctions: "IDB", ebrd_ineligible: "EBRD" };

const ownerTag = (p) => `<span class="owner team-${p.team || "none"}">${esc(teamName(p.team))}${p.owner ? ` · 담당 ${esc(p.owner.split("@")[0])}` : ""}</span>`;

function findingHtml(g, showCompany = true) {
  const f = g.rep, more = g.items.slice(1);
  const official = isOfficial(f);
  const isNew = f.status === "new" && Date.now() - (g.newest || 0) < DAY;
  const why = [f.rationale && `판단 근거: ${f.rationale}`, f.title && `원문 제목: ${f.title}`, /조달청/.test(f.source_name || "") && f.level === "red" && "계약 전 확인: 법원 집행정지가 나면 나라장터 '부정당제재 이력'에 '제재정지' 줄이 생깁니다"].filter(Boolean).join("\n");
  const srcs = [...new Set(more.map((x) => String(x.source_name || "").replace(/\s*\((Google News|Naver|네이버)\)$/i, "")).filter(Boolean))];
  return `<div class="item lv-${f.level} ${f.status === "reviewed" ? "reviewed" : ""}" data-fid="${esc(f.id)}" data-fids="${esc(g.ids.join(","))}">
    <div class="item-head">
      ${badge(f.level)}
      ${showCompany ? g.companies.map((c) => `<span class="item-company" data-cid="${c.id}">${esc(c.name)}</span>`).join('<span class="co-sep">·</span>') : ""}
      ${official ? `<span class="tag official">${f.source_type === "manual" ? "수기 등록" : "공식 제재 명단"}</span>` : ""}
      ${f.category && f.category !== "기타" ? `<span class="tag">${esc(f.category)}</span>` : ""}
      ${isNew ? `<span class="new-pill">NEW</span>` : ""}
      <span class="item-actions ${canReview(f.company_id) ? "" : "hidden"}">
        ${!f.status || f.status === "new" ? `<button class="btn sm act-ok" data-act="reviewed" title="이 업체 이야기가 맞음. 목록에서 내려가고 등급은 그대로 남습니다. 비슷한 유형의 새 기사는 앞으로도 알려줍니다${more.length ? ` (같은 내용 ${g.items.length}건 함께)` : ""}">✓ 관련 있음</button>
        <button class="btn sm act-no" data-act="dismissed" title="이 업체 이야기가 아님(동명이인·다른 회사·단순 언급). 등급에서 빠지고, AI가 비슷한 유형을 앞으로 걸러냅니다${more.length ? ` (같은 내용 ${g.items.length}건 함께)` : ""}">✕ 관련 없음</button>`
        : `<span class="act-done ${f.status}" title="${esc([f.reviewed_by && "처리: " + (/^자동/.test(f.reviewed_by) ? f.reviewed_by : String(f.reviewed_by).split("@")[0]), f.reviewed_at && String(f.reviewed_at).slice(0, 16)].filter(Boolean).join(" · "))}">${f.status === "reviewed" ? "✓ 관련 있음" : `✕ 관련 없음${reasonShort(f) ? ` · ${esc(reasonShort(f))}` : ""}`}${/^자동/.test(f.reviewed_by || "") ? " (자동)" : ""}</span>
        <button class="btn sm ghost" data-act="new" title="처리 전 상태로 돌립니다. 판단을 바꾸려면 되돌린 뒤 다시 고르세요">되돌리기</button>`}
      </span>
    </div>
    <div class="item-summary"${why ? ` title="${esc(why)}"` : ""}>${esc(sumText(f))}</div>
    <div class="item-meta">
      <span class="src">${esc(String(f.source_name || "-").replace(/\s*·\s*(제재 키워드|업체명 검색|심층)\)/, ")"))} · ${esc(f.published_at || "날짜 미상")}${f.url ? ` · <a href="${esc(f.url)}" target="_blank" rel="noopener">원문 ↗</a>` : ""}</span>
      <span class="item-age">${g.newest ? relTime(g.newest) : ""}</span>
    </div>
    ${more.length ? `<details class="dup"><summary>같은 내용 ${more.length}건 더${srcs.length ? ` <span class="dup-src">${esc(srcs.slice(0, 3).join(" · "))}${srcs.length > 3 ? " 외" : ""}</span>` : ""}</summary>
      <div class="bd-list">${more.map((x) => `<div class="dup-row">${badge(x.level)}${showCompany && x.company_id !== f.company_id ? `<b>${esc(x.company_name)}</b>` : ""}
        ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.summary || "")}">${esc(x.title || x.summary || "-")}</a>` : `<span title="${esc(x.summary || "")}">${esc(x.title || x.summary || "-")}</span>`}
        <span class="muted">${esc(x.source_name || "")}${x.published_at ? " · " + esc(x.published_at) : ""}</span></div>`).join("")}</div></details>` : ""}
  </div>`;
}
// 과거 이력 일괄 정리 ('확인했음'으로: 등급은 그대로, AI 판정 예시에는 쓰지 않음)
async function bulkReview(groups) {
  const ids = groups.flatMap((g) => g.items.map((x) => x.id));
  if (!ids.length || !confirm(`30일 지난 기사 ${groups.length}건(기록 ${ids.length}개)을 '관련 있음'으로 처리할까요?\n등급은 그대로 남고, '관련 있음한 이슈'에서 되돌릴 수 있습니다.`)) return;
  const patch = { status: "reviewed", reviewed_by: auth.currentUser.email, reviewed_at: nowStr(), review_note: "과거 이력 일괄 정리" };
  for (let i = 0; i < ids.length; i += 400) { const b = writeBatch(db); ids.slice(i, i + 400).forEach((id) => b.update(doc(db, "findings", id), patch)); await b.commit(); }
  ids.forEach((id) => Object.assign(state.findings.find((f) => f.id === id) || {}, patch));
  toast(`30일 지난 기사 ${groups.length}건을 관련 있음으로 처리했습니다`);
  rerender();
}
// 이슈 목록: 같은 내용은 한 줄로 묶어서 표시
function renderFeed(list, el, showCompany = true) { renderGroups(groupFindings(list), el, showCompany); }
function renderGroups(groups, el, showCompany = true) {
  el.innerHTML = groups.map((g) => findingHtml(g, showCompany)).join("");
  $$(".item-company", el).forEach((x) => x.addEventListener("click", () => openCompany(x.dataset.cid)));
  $$("[data-act]", el).forEach((b) => b.addEventListener("click", async () => {
    const ids = b.closest(".item").dataset.fids.split(",").filter(Boolean), st = b.dataset.act;
    let reason = null;
    if (st === "dismissed") { reason = await pickDismissReason(ids.length); if (!reason) return; }
    const patch = { status: st, reviewed_by: auth.currentUser.email, reviewed_at: nowStr(), review_reason: reason?.key || null, review_note: reason?.note || null };
    // 되돌리기: 이 처리를 물려받아 자동으로 같이 처리된 '같은 사건' 기사도 함께 되돌림
    const kids = st === "new" ? state.findings.filter((f) => f.auto_same && ids.includes(f.same_as) && !ids.includes(f.id)) : [];
    const kidPatch = { status: "new", reviewed_by: null, reviewed_at: null, review_note: null, review_reason: null, auto_same: null };
    b.disabled = true;
    const batch = writeBatch(db);
    ids.forEach((id) => batch.update(doc(db, "findings", id), patch));
    kids.forEach((f) => batch.update(doc(db, "findings", f.id), kidPatch));
    await batch.commit();
    ids.forEach((id) => Object.assign(state.findings.find((f) => f.id === id) || {}, patch));
    kids.forEach((f) => Object.assign(f, kidPatch));
    const both = ids.length > 1 ? ` (같은 내용 ${ids.length}건 함께)` : "";
    toast((st === "dismissed" ? `관련 없음 (${reason.label}): 등급에서 빠지고, AI가 비슷한 유형을 앞으로 걸러냅니다` : st === "reviewed" ? "관련 있음: 목록에서 내려가고 등급은 그대로 남습니다" : `되돌렸습니다${kids.length ? `. 같은 사건으로 자동 처리됐던 기사 ${kids.length}건도 함께 되돌렸습니다` : ""}. AI 예시에서도 다음 스캔부터 빠집니다`) + both, 4500);
    rerender();
  }));
}

// ✕ 관련 없음 이유 (판단 가이드와 같은 분류). 고른 이유는 AI 판정 예시에도 함께 전달 (review_note)
const reasonShort = (f) => { const r = DISMISS_REASONS.find(([k]) => k === f.review_reason); return r ? r[1].split(" (")[0] : ""; };
const DISMISS_REASONS = [
  ["name", "동명이인·다른 회사", "이름만 같거나 비슷한 다른 회사 이야기"],
  ["affiliate", "다른 법인 (모회사·자회사·계열사)", "같은 그룹이지만 처분·수사 대상은 다른 법인"],
  ["mention", "단순 언급", "기사에 이름만 나오고 이 업체가 처분·수사 대상이 아님 (수주·협력·인사 소식 등)"],
  ["past", "이미 끝난 과거 일", "오래전 처분·사건을 다시 언급한 기사로, 지금 영향이 없음"],
  ["other", "기타", "위에 없는 이유 (아래에 짧게 적기)"],
];
function pickDismissReason(n) {
  return new Promise((resolve) => {
    let done = false; const finish = (v) => { if (done) return; done = true; resolve(v); };
    modal(`<h2>관련 없음: 이유를 골라 주세요</h2>
      <p class="muted small">고른 이유는 팀이 같은 기준으로 판단하도록 기록되고, AI가 비슷한 기사를 걸러낼 때도 씁니다.${n > 1 ? ` 같은 내용 ${n}건에 함께 적용됩니다.` : ""} <a href="#" id="drGuide">판단 가이드 보기</a></p>
      <form id="drForm" class="form dr-form">${DISMISS_REASONS.map(([k, l, d], i) => `<label class="dp-opt"><input type="radio" name="r" value="${k}" ${i ? "" : "checked"}><span><b>${l}</b> <span class="muted">${d}</span></span></label>`).join("")}
        <input name="memo" placeholder="메모 (선택, 기타면 꼭 적기)" maxlength="80">
        <div class="actions"><button class="btn primary">관련 없음으로 처리</button></div></form>`);
    $("#drGuide").onclick = (e) => { e.preventDefault(); finish(null); closeModal(); openGuide(); };
    $("#drForm").onsubmit = (ev) => {
      ev.preventDefault();
      const k = ev.target.r.value, memo = ev.target.memo.value.trim(), r = DISMISS_REASONS.find((x) => x[0] === k);
      if (k === "other" && !memo) return toast("기타는 메모에 이유를 적어 주세요");
      finish({ key: k, label: r[1], note: memo ? `${r[1]}: ${memo}` : r[1] }); closeModal();
    };
    const mo = new MutationObserver(() => { if (!$("#drForm")) { mo.disconnect(); finish(null); } });
    mo.observe(document.body, { childList: true, subtree: true });
  });
}

// ---------- 판단 가이드 (4개 팀 공통 기준) ----------
const GUIDE_HTML = `
<div class="gd">
  <p class="gd-lead">누가 처리해도 같은 결과가 나오도록 정한 공통 기준입니다. 애매하면 <b>관련 있음</b>으로 두고, <b>관련 없음</b>은 확실할 때만 씁니다.</p>

  <section class="gd-s"><h3><span class="gd-n">1</span>업체 등급</h3>
  <div class="gd-lv">
    <div class="gd-l red"><span class="badge red">경고</span><b>지금 유효한 제재</b><p>입찰참가자격 제한 · MDB 제재 · EXIMIIS 등록 · 등록말소 · 기간 중인 영업정지</p></div>
    <div class="gd-l orange"><span class="badge orange">주의</span><b>제재로 이어질 수 있는 진행 중 사안</b><p>수사 · 기소 · 과징금 · 처분 예고 · 부도 · 회생 · 집행정지 · 기간이 끝난 영업정지</p></div>
    <div class="gd-l none"><span class="badge none">정상</span><b>그 밖</b><p>회색 '참고'는 등급에 들지 않는 이력</p></div>
  </div></section>

  <section class="gd-s"><h3><span class="gd-n">2</span>이슈 처리 버튼</h3>
  <div class="gd-btns">
    <div class="gd-b ok"><b>✓ 관련 있음</b><p><em>이 업체 이야기가 맞음.</em> 등급은 그대로 두고 목록에서 내림</p></div>
    <div class="gd-b no"><b>✕ 관련 없음</b><p><em>이 업체 이야기가 아님.</em> 등급에서 빠짐. 이유를 고름</p></div>
    <div class="gd-b"><b>되돌리기</b><p>잘못 눌렀을 때. 처리 전 상태로 돌아감</p></div>
  </div>
  <p class="gd-note">같은 사건의 후속 기사는 처리한 대로 자동으로 따라가고, 등급이 오르면 다시 알립니다.</p></section>

  <section class="gd-s"><h3><span class="gd-n">3</span>관련 없음 이유</h3>
  <div class="gd-rs">${DISMISS_REASONS.map(([, l, d]) => `<div><b>${l}</b><p>${d}</p></div>`).join("")}</div></section>

  <section class="gd-s"><h3><span class="gd-n">4</span>자주 헷갈리는 경우</h3>
  <div class="gd-qa">
    <div><b>계열사 · 모회사 · 현지 법인</b><p>처분 대상이 다른 법인이면 <span class="no">관련 없음</span>, 같은 법인이면 <span class="ok">관련 있음</span></p></div>
    <div><b>공동수급 (컨소시엄)</b><p>처분 대상에 이 업체가 있으면 <span class="ok">관련 있음</span>, 다른 구성원만이면 <span class="no">관련 없음</span></p></div>
    <div><b>끝난 과거 처분</b><p>기간이 끝났고 새 내용이 없으면 <span class="no">관련 없음</span>, 기간 중이면 <span class="ok">관련 있음</span></p></div>
    <div><b>영업정지 (기사로만 확인될 때)</b><p>기사에 기간이 적혀 있고 오늘이 그 안이면 <span class="badge red">경고</span>, 기간이 끝나면 자동으로 <span class="badge orange">주의</span>. 기간을 알 수 없으면 주의</p></div>
    <div><b>집행정지</b><p><span class="ok">관련 있음</span> (주의 유지). 판결이 나오면 다시 확인</p></div>
    <div><b>대표자 개인 사건</b><p>회사가 대상이 아니면 <span class="no">관련 없음</span>, 회사도 대상이면 <span class="ok">관련 있음</span></p></div>
    <div><b>공식 명단 (조달청 · MDB · EXIMIIS)</b><p>원 출처를 먼저 확인. 같은 회사면 <span class="ok">관련 있음</span>, 이름만 비슷하면 <span class="no">관련 없음</span></p></div>
  </div></section>
</div>`;
const GUIDE_PRINT_CSS = `body{font-family:'Pretendard','Malgun Gothic',sans-serif;color:#0B1220;margin:12mm;font-size:12px;line-height:1.55;word-break:keep-all}h1{font-size:19px;margin:0 0 4px}
.gd-lead{background:#EEF0FE;border-left:4px solid #5B5BF0;border-radius:8px;padding:8px 12px}.gd-s{margin-top:14px;break-inside:avoid}.gd-s h3{font-size:14px;margin:0 0 7px;padding-bottom:5px;border-bottom:2px solid #0B1220;display:flex;gap:7px;align-items:center}
.gd-n{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#5B5BF0;color:#fff;font-size:11px}.gd-lv,.gd-btns{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.gd-rs{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.gd-qa{display:grid;grid-template-columns:1fr 1fr;gap:6px}.gd-qa .wide{grid-column:1/-1}.gd-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.gd-l,.gd-b,.gd-rs div,.gd-qa div{border:1px solid #DCE1EC;border-radius:8px;padding:7px 10px}.gd-l.red{border-top:3px solid #D92D20}.gd-l.orange{border-top:3px solid #F57C00}.gd-l.none{border-top:3px solid #94A3B8}
.gd-b.ok{border-top:3px solid #0D9488}.gd-b.no{border-top:3px solid #D92D20}p{margin:3px 0 0}b{display:block}.gd-qa p b,.gd-s>p b{display:inline}em{font-style:normal;font-weight:700}
span.ok{color:#0D9488;font-weight:700}span.no{color:#D92D20;font-weight:700}.badge{display:inline-block;padding:1px 8px;border-radius:9px;font-weight:700;font-size:11px;margin-bottom:3px}.badge.red{background:#D92D20;color:#fff}.badge.orange{background:#F57C00;color:#2B1400}.badge.none{background:#E2E8F0;color:#475569}
.gd-note{margin-top:6px;color:#64748B}@page{size:A4;margin:0}`;
function openGuide() {
  try { localStorage.setItem("edcf_guide_seen", "1"); } catch {}
  $("#guideNew")?.remove();
  modal(`<h2>이슈 판단 가이드</h2>${GUIDE_HTML}
    <div class="actions"><button class="btn" id="gdPrint">인쇄 · PDF로 저장</button></div>`);
  $("#modal").classList.add("wide");
  $("#gdPrint").onclick = () => {
    const w = window.open("", "_blank");
    if (!w) return toast("팝업이 막혔습니다. 브라우저에서 팝업을 허용해 주세요");
    w.document.write(`<!doctype html><meta charset="utf-8"><title>EDCF RADAR 이슈 판단 가이드</title><style>${GUIDE_PRINT_CSS}</style><h1>EDCF RADAR 이슈 판단 가이드</h1>${GUIDE_HTML}`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
}

// ---------- 보고서 (PDF로 저장): 대시보드에서 고른 범위 기준, 메일과 같은 디자인 ----------
const REPORT_PERIODS = [["all", "전체 기간"], ["30", "최근 30일"], ["7", "최근 7일"]];
// 보고서: 왼쪽에서 고르면 오른쪽 미리보기(A4)가 바로 바뀜 → [PDF로 저장]
function openReport() {
  modal(`<div class="rp-wrap">
    <form id="rpForm" class="form rp-opts" autocomplete="off">
      <h2>보고서</h2>
      <label>범위<select name="scope"><option value="mine" ${scope === "mine" ? "selected" : ""}>${esc(mineLabel())}</option><option value="all" ${scope === "all" ? "selected" : ""}>EDCF 전체</option></select></label>
      <label>이슈 기간<select name="period">${REPORT_PERIODS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" name="detail"> 자세한 목록 포함</label>
      <label class="check"><input type="checkbox" name="done"> 처리한 이슈 포함</label>
      <div class="actions"><button class="btn primary" title="인쇄 창의 대상에서 'PDF로 저장'을 고르세요">PDF로 저장</button></div>
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
  const C = { red: ["#D92D20", "#FDE8E6", "경고"], orange: ["#E2660A", "#FEEFE0", "주의"], yellow: ["#64748B", "#EEF1F5", "참고"], none: ["#0D9488", "#E2F4F2", "정상"] };
  const BF = { red: ["#D92D20", "#FFFFFF"], orange: ["#F57C00", "#2B1400"], yellow: ["#E2E8F0", "#475569"], none: ["#E2F4F2", "#0D9488"] }; // 대시보드와 같은 꽉 찬 배지 (참고는 회색)
  const bd = (lv) => { const [bg, fg] = BF[lv || "none"] || BF.none, l = (C[lv || "none"] || C.none)[2]; return `<span class="bd" style="color:${fg};background:${bg}">${l}</span>`; };
  const ROLE_C = { "F/S": "#0E7490", 컨설턴트: "#1D4ED8", 본구매: "#A21CAF" };
  const role = (r) => `<span class="role" style="color:${ROLE_C[r] || "#3D4A63"}">${esc(r)}</span>`;
  const sc = scanned();
  const cs = sc0 === "mine" ? state.companies.filter((c) => c.mine) : state.companies;
  const ps = sc0 === "mine" ? state.projects.filter(isMine) : state.projects.filter(live);
  const ids = new Set(cs.map((c) => c.id));
  const days = period === "all" ? null : +period;
  const fs = state.findings.filter((f) => ids.has(f.company_id) && (f.status === "new" || (done && f.status === "reviewed")) && (!days || Date.now() - pubMs(f) <= days * DAY));
  const groups = groupFindings(fs), MAX = 300;
  const t = { red: 0, orange: 0, none: 0 };
  cs.forEach((c) => { if (sc && t[c.risk] != null) t[c.risk]++; });
  const risky = cs.filter((c) => sc && c.risk !== "none").sort((a, b) => LV[b.risk] - LV[a.risk] || b.open - a.open || a.name.localeCompare(b.name));
  const now = nowStr(), scopeL = sc0 === "mine" ? mineLabel() : "EDCF 전체", periodL = REPORT_PERIODS.find(([k]) => k === period)[1];
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
      <div class="is-h">${bd(f.level)} <b>${esc(g.companies.map((c) => c.name).join(" · "))}</b>${f.source_type !== "news" ? ` <span class="tg red">공식 제재 명단</span>` : ""}${f.category && f.category !== "기타" ? ` <span class="tg">${esc(f.category)}</span>` : ""}${f.status === "reviewed" ? ` <span class="tg">관련 있음</span>` : ""}</div>
      <div class="is-s">${esc(sumText(f))}</div>
      <div class="mu">${esc(f.source_name || "-")} · ${esc(f.published_at || "날짜 미상")}${f.url ? ` · <a href="${esc(f.url)}">원문</a>` : ""}</div>
      <div class="mu">「${esc(f.title || "")}」</div>
      ${more.length ? `<div class="dup">같은 내용 ${more.length}건 더: ${more.slice(0, 5).map((x) => esc(String(x.source_name || "").replace(/\s*\((Google News|Naver|네이버)\)$/i, "")) + (x.published_at ? " " + esc(x.published_at) : "")).join(" · ")}${more.length > 5 ? " 외" : ""}</div>` : ""}
    </div>`;
  };
  const srcName = (f) => String(f.source_name || "").replace(/\s*\([^()]*(Google|Naver|네이버)[^()]*\)\s*$/i, "").trim() || (f.source_type !== "news" ? "공식 명단" : "뉴스");
  // 한 줄 요약: 첫 문장만, 길면 낱말 끝에서 자르고 '…' (글자 수로 뚝 자르지 않음)
  const brief = (x, n = 90) => { const t = String(x || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0]; if (t.length <= n) return t; const cut = t.lastIndexOf(" ", n); return t.slice(0, cut > n * 0.6 ? cut : n).replace(/[\s,·:]+$/, "") + "…"; };
  // 한 장 요약은 업체별로 묶음: 같은 업체 이슈가 줄줄이 반복되지 않게 (업체 한 줄 + 이슈는 짧게 3건까지)
  const byCo = (gs) => { const m = new Map(); gs.forEach((g) => { const k = g.companies.map((c) => c.id).join("|"); if (!m.has(k)) m.set(k, []); m.get(k).push(g); }); return [...m.values()]; };
  const engShort = (g) => esc(g.companies.flatMap((c0) => byRole(state.companies.find((x) => x.id === c0.id)?.engagements || []).slice(0, 2).map((e) => `${projName(e.project_id)} (${e.role})`)).slice(0, 2).join(", ") || "사업 미연결");
  const geoOf = (p) => { try { return projectGeoRisk(p); } catch { return null; } };
  const geoCell = (p) => { const g = geoOf(p); if (!g) return `<span class="mu">-</span>`; return `<span style="color:${C[g.lv][0]};font-weight:700">${C[g.lv][2]}</span>${g.alert ? ` <span class="mu">${esc(g.alert)}</span>` : ""}${g.why[0] ? `<div class="mu">${esc(g.why[0])}</div>` : ""}`; };
  // 한 장 요약 (기본): 경고·주의 이슈 한 줄씩 + 사업별 리스크 수
  const hotG = groups.filter((g) => g.rep.level === "red" || g.rep.level === "orange"), yelN = groups.length - hotG.length;
  const pStat = (p) => { const s = new Set(); state.companies.forEach((c) => { if (c.engagements.some((e) => e.project_id === p.id)) s.add(c); }); const k = { red: 0, orange: 0 }; s.forEach((c) => { if (sc && k[c.risk] != null) k[c.risk]++; }); return { n: s.size, k }; };
  const hotCo = byCo(hotG);
  const LVN = { red: 2, orange: 1 };
  const projHot = ps.map((p) => { const set = new Set(); state.companies.forEach((c) => { if (c.engagements.some((e) => e.project_id === p.id)) set.add(c); }); const hot = sc ? [...set].filter((c) => c.risk !== "none").sort((x, y) => LV[y.risk] - LV[x.risk]) : []; const g = geoOf(p); return { p, hot, g, n: set.size, w: Math.max(LVN[hot[0]?.risk] || 0, LVN[g?.lv] || 0) }; });
  const projShow = projHot.filter((x) => x.w).sort((x, y) => y.w - x.w || y.hot.length - x.hot.length);
  const simpleBody = `<h2>경고·주의 업체 <span class="mu">업체 ${hotCo.length} · 이슈 ${hotG.length}건${period !== "all" ? " · " + esc(periodL) : ""}</span></h2>
${hotG.length ? `<table class="iss"><tr><th style="width:10%">등급</th><th style="width:30%">업체 · 관련 사업</th><th>내용</th></tr>${hotCo.slice(0, 30).map((gs) => { const g0 = gs[0]; return `<tr class="lv-${g0.rep.level}"><td>${bd(g0.rep.level)}</td><td><b>${esc(g0.companies.map((c) => c.name).join(" · "))}</b><div class="mu">${engShort(g0)}</div></td><td>${esc(brief(sumText(g0.rep), 110))}${gs.length > 1 ? ` <span class="mu">외 ${gs.length - 1}건</span>` : ""}</td></tr>`; }).join("")}</table>${hotCo.length > 30 ? `<div class="mu note">외 업체 ${hotCo.length - 30}</div>` : ""}` : `<div class="empty">경고·주의 이슈가 없습니다</div>`}
${ps.length ? `<h2>경고·주의 사업 <span class="mu">사업 ${projShow.length}</span></h2>${projShow.length ? `<table><tr><th style="width:38%">사업</th><th>경고·주의 업체</th><th style="width:26%">수원국 리스크</th></tr>${projShow.map(({ p, hot, g, n }) => `<tr><td><b>${esc(p.name)}</b>${p.country && COUNTRY[p.country] && !p.name.includes(COUNTRY[p.country]) ? `<div class="mu">${esc(COUNTRY[p.country])}</div>` : ""}</td><td>${hot.map((c) => { const e = c.engagements.find((x) => x.project_id === p.id) || {}; return `<div class="co">${bd(c.risk)} ${esc(c.name)} <span class="mu">${esc([e.role, e.stage && e.stage !== "계약" ? e.stage : ""].filter(Boolean).join(" · "))}</span></div>`; }).join("") || `<span class="mu">없음</span>`}</td><td>${g && LVN[g.lv] ? `<b style="color:${C[g.lv][0]}">${C[g.lv][2]}</b>${[g.alert, ...g.why.slice(0, 2)].filter(Boolean).map((w) => `<div class="mu">${esc(w)}</div>`).join("")}` : `<span class="mu">정상</span>`}</td></tr>`).join("")}</table>` : `<div class="empty">경고·주의 사업이 없습니다</div>`}` : ""}
`;
  const detailBody = `<h2>${done ? "이슈" : "확인할 이슈"} <span class="mu">${groups.length}건 · 등급 높은 순${groups.length > MAX ? ` · 앞의 ${MAX}건` : ""}</span></h2>
${groups.length ? groups.slice(0, MAX).map(issue).join("") : `<div class="empty">해당 기간에 ${done ? "" : "확인할 "}이슈가 없습니다</div>`}
<h2>리스크 업체 <span class="mu">업체 ${risky.length} · 정상 ${cs.length - risky.length} 생략</span></h2>
${risky.length ? `<table><tr><th style="width:11%">등급</th><th style="width:24%">업체</th><th>참여 사업 · 역할</th><th class="c" style="width:10%">미확인</th></tr>
${risky.map((c) => `<tr><td>${bd(c.risk)}</td><td><b>${esc(c.name)}</b>${c.name_en ? `<div class="mu">${esc(c.name_en)}</div>` : ""}</td><td>${engL(c)}</td><td class="c">${c.open}</td></tr>`).join("")}</table>` : `<div class="empty">${sc ? "리스크 업체가 없습니다" : "아직 스캔하지 않았습니다"}</div>`}
${ps.length ? `<h2>사업별 현황 <span class="mu">사업 ${ps.length}</span></h2><table><tr><th style="width:32%">사업</th><th>참여 업체 (역할 · 등급)</th><th class="c" style="width:18%">리스크</th></tr>${projRows}</table>` : ""}
`;
  let secNo = 0;
  const title = `EDCF_리스크보고서_${sc0 === "mine" ? (myTeam() ? TEAMS[myTeam()] : "우리팀") : "전체"}_${now.slice(0, 10)}`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
@page { size: A4; margin: 13mm 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #0B1220; font: 13.5px/1.55 "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; word-break: keep-all; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
a { color: #4F46E5; text-decoration: none; } td a { white-space: nowrap; }
.hero { background: #0B101C; background-image: linear-gradient(125deg, #0B101C 0%, #171E3F 55%, #0C2C3D 100%); color: #fff; border-radius: 16px; padding: 20px 22px 22px; break-inside: avoid; }
.hero .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
.hero .brand { display: flex; align-items: center; gap: 7px; font-size: 11.5px; font-weight: 800; letter-spacing: .1em; color: #A5B4FC; }
.hero .mk { width: 15px; height: 15px; border-radius: 5px; background: linear-gradient(135deg, #7C83FF, #22D3EE); }
.hero h1 { margin: 6px 0 0; font-size: 28px; line-height: 1.15; font-weight: 800; letter-spacing: -.03em; color: #fff; }
.hero h1 span { color: #8FA2FF; }
.hero .meta { text-align: right; font-size: 12px; color: #A9B6CC; line-height: 1.5; } .hero .meta b { display: block; font-size: 16px; color: #fff; }
.kpi { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; }
.kpi > div { display: flex; align-items: center; justify-content: space-between; background: color-mix(in srgb, var(--c) 16%, transparent); border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); border-radius: 12px; padding: 12px 18px; color: var(--c); }
.kpi span { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 800; } .kpi span::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: var(--c); } .kpi b { font-size: 44px; line-height: 1; font-weight: 800; letter-spacing: -.03em; }
h2 { display: flex; align-items: center; gap: 8px; font-size: 16.5px; font-weight: 800; letter-spacing: -.01em; margin: 22px 0 0; padding: 9px 14px; border-radius: 10px; background: #E9ECFB; color: #1E1B4B; break-after: avoid; }
h2 .no { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%; background: #4F46E5; color: #fff; font-size: 11.5px; font-weight: 700; display: grid; place-items: center; }
h2 .mu { margin-left: auto; font-weight: 500; color: #4B5578; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th { text-align: left; font-size: 11.5px; color: #8792A8; font-weight: 700; padding: 8px 10px 7px; border-bottom: 1px solid #DDE2EB; }
td { padding: 10px 10px; border-bottom: 1px solid #E6EAF1; vertical-align: top; } td.c, th.c { text-align: center; white-space: nowrap; }
tr { break-inside: avoid; }
tr.lv-red td { background: #FFF4F3; } tr.lv-orange td { background: #FFF8EE; }
.mu { color: #6B7690; font-size: 12px; font-weight: 400; }
td b { font-size: 14px; } td .co + .co { margin-top: 4px; }
.bd { display: inline-block; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 700; line-height: 20px; white-space: nowrap; }
.role { font-weight: 700; font-size: 12px; }
.tg { display: inline-block; padding: 0 6px; border-radius: 4px; font-size: 11.5px; line-height: 18px; background: #EEF1F6; color: #3D4A63; } .tg.red { background: #FDE8E6; color: #D92D20; }
.is { border: 1px solid #DDE2EB; border-left: 4px solid; border-radius: 10px; padding: 10px 13px; margin-top: 8px; break-inside: avoid; }
.is-h b { font-size: 14px; } .is-s { margin: 4px 0 3px; }
.dup { margin-top: 5px; padding-top: 5px; border-top: 1px dashed #E3E7EF; font-size: 12px; color: #6B7690; }
.empty { margin-top: 10px; border: 1px dashed #DDE2EB; border-radius: 10px; padding: 16px; text-align: center; color: #0D9488; }
.note { margin-top: 8px; }
</style></head><body>
<div class="hero"><div class="top"><div><div class="brand"><span class="mk"></span>EDCF RADAR</div><h1><span>EDCF 업체 리스크</span> 보고서</h1></div>
  <div class="meta"><b>${esc((state.status.last_scan_at || now).slice(0, 16))} 기준</b>${esc(scopeL)} · 업체 ${cs.length}</div></div>
<div class="kpi">${["red", "orange", "none"].map((lv) => `<div style="--c:${{ red: "#FF5A5F", orange: "#FF9F1C", none: "#2DD4BF" }[lv]}"><span>${C[lv][2]}</span><b>${t[lv]}</b></div>`).join("")}</div></div>
${(detail ? detailBody : simpleBody)}
</body></html>`.replace(/<h2>/g, () => `<h2><span class="no">${++secNo}</span>`);
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
  modal(`<h2>보완할 업체 ${list.length}</h2>
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
// 리스크 업체 목록: 대시보드의 경고·주의·정상을 누르면 오른쪽 창에 그 등급 업체들 (업체를 누르면 상세, ← 로 목록)
// scroll: "top" 처음 열 때 / "back" 상세에서 돌아올 때(보던 위치) / "keep" 다시 그릴 때
// 사업 상세 (오른쪽 창): 참여 업체(역할별) · 확인할 이슈 · 수원국 여행경보
function openProject(pid) {
  const p = state.projects.find((x) => x.id === pid); if (!p) return;
  const sc = scanned(), rows = [];
  for (const c of state.companies) c.engagements.forEach((e) => { if (e.project_id === pid) rows.push({ c, e }); });
  rows.sort((a, b) => ROLE_ORDER.indexOf(a.e.role) - ROLE_ORDER.indexOf(b.e.role) || byOrder(a, b));
  const ids = new Set(rows.map((r) => r.c.id)), cs = [...new Set(rows.map((r) => r.c))];
  const top = cs.some((c) => c.risk === "red") ? "red" : cs.some((c) => c.risk === "orange") ? "orange" : "none";
  const open = state.findings.filter((f) => ids.has(f.company_id) && f.status === "new");
  const hot = groupFindings(open.filter((f) => f.level === "red" || f.level === "orange")), refN = groupFindings(open.filter((f) => f.level === "yellow")).length;
  const al = state.geo?.alerts?.[p.country], AL = ["", "1단계 여행유의", "2단계 여행자제", "3단계 출국권고", "4단계 여행금지"];
  state.openCid = null; state.drawerBack = null; state.riskList = null; state.openPid = pid;
  $("#drawerTitle").innerHTML = `<div class="d-name"><span class="nm">${esc(p.name)}</span>${sc && cs.length ? badge(top) : ""}</div>
    <div class="d-engs"><span class="d-eng">${esc(COUNTRY[p.country] || "수원국 미지정")}</span>${al?.level ? (() => { const sa = siteAlert(al, { ll: projectPoint(p)?.ll, country: p.country, ...siteOpt(p, projectPoint(p)) }); return sa.lv ? `<span class="d-eng" title="${esc(sa.refs.length ? "일부 지역은 더 높음: " + sa.refs.join(" / ") : "")}">여행경보 ${AL[sa.lv]}${sa.refs.length ? " (사업지 기준)" : ""}</span>` : ""; })() : ""}${p.owner ? `<span class="d-eng">담당 ${esc(p.owner.split("@")[0])}</span>` : ""}</div>`;
  const body = $("#drawerBody");
  body.innerHTML = `
    <section class="d-sec"><div class="d-sec-head"><h3>참여 업체</h3><span class="count">${cs.length}</span></div>
      ${rows.length ? [...new Set(rows.map((r) => r.e.role))].map((role) => {
        const RK = { red: 0, orange: 1 }, l = rows.filter((r) => r.e.role === role).map((r, i) => ({ ...r, i })).sort((x, y) => (sc ? (RK[x.c.risk] ?? 2) - (RK[y.c.risk] ?? 2) : 0) || x.i - y.i);
        return `<div class="pd-grp"><div class="pd-grp-h">${roleTag(role || "기타")}<span class="count">${l.length}</span></div><div class="rl">${l.map(({ c, e }) => `<div class="pd-row" data-pc="${c.id}" role="button" tabindex="0"><b>${esc(c.name)}</b>${e.stage && e.stage !== "계약" ? `<span class="muted small">${esc(e.stage)}${e.rank ? " " + e.rank + "순위" : ""}</span>` : ""}<span class="pd-r">${c.open ? `<span class="muted small">미확인 ${c.open}</span>` : ""}${sc ? badge(c.risk) : ""}</span></div>`).join("")}</div></div>`;
      }).join("") : `<div class="empty small">연결된 업체가 없습니다</div>`}
    </section>
    <section class="d-sec"><div class="d-sec-head"><h3>확인이 필요한 이슈</h3><span class="count">${hot.length}</span>${refN ? `<span class="d-sec-meta">참고 이력 ${refN}</span>` : ""}</div>
      <div id="pFeed" class="feed">${hot.length ? "" : `<div class="empty small">${sc ? "경고·주의 이슈가 없습니다" : "아직 스캔하지 않았습니다"}</div>`}</div>
    </section>`;
  if (hot.length) renderGroups(hot, $("#pFeed"));
  $$("[data-pc]", body).forEach((x) => { const go = () => openCompany(x.dataset.pc, "p:" + pid); x.onclick = go; x.onkeydown = (e) => { if (e.key === "Enter") go(); }; });
  body.scrollTop = 0;
  $("#drawer").classList.add("open"); $("#drawerBg").classList.add("open");
}
function openRiskList(lv, scroll = "top") {
  const list = scopeCompanies().filter((c) => c.risk === lv).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  state.openCid = null; state.drawerBack = null; state.riskList = lv; state.openPid = null;
  $("#drawerTitle").innerHTML = `<div class="d-name"><span class="nm">${LEVEL[lv]} 업체</span><span class="cnt">${list.length}개</span><span class="tag">${scope === "mine" ? mineLabel() : "EDCF 전체"}</span></div>
    <div class="d-sub">${{ red: "지금 유효한 제재가 있는 업체", orange: "제재로 이어질 수 있는 사안이 진행 중인 업체", none: "경고·주의 이슈가 없는 업체" }[lv] || ""}</div>`;
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
    <div class="rl-top"><b class="rl-name">${esc(c.name)}</b><span class="rl-cat">${esc(c.cat || "")}</span>${c.open ? `<span class="rl-open">미확인 ${c.open}</span>` : `<span class="rl-done">관련 있음</span>`}<span class="rl-arr">›</span></div>
    ${engs.length ? `<div class="rl-engs">${engs.slice(0, 3).map((e) => `<span class="d-eng">${roleTag(e.role)}<span>${esc(projName(e.project_id))}</span>${stageTag(e)}</span>`).join("")}${engs.length > 3 ? `<span class="muted small">외 ${engs.length - 3}</span>` : ""}</div>` : ""}
    ${top ? `<div class="rl-why">${esc(sumText(top))}</div>
    <div class="rl-src">${esc(top.source_name || "-")} · ${esc(top.published_at || "날짜 미상")}${groups.length > 1 ? ` · 이슈 ${groups.length}건` : ""}</div>` : ""}
  </div>`;
}
function openCompany(cid, back = null) {
  const c = state.companies.find((x) => x.id === cid);
  if (!c) return;
  const switching = state.openCid !== cid; // 다른 업체로 바꿀 때만 맨 위로 (다시 그릴 때는 보던 위치 유지)
  state.openCid = cid; state.drawerBack = back; state.openPid = null; if (!back || String(back).startsWith("p:")) state.riskList = null;
  const fs = state.findings.filter((f) => f.company_id === cid && f.status !== "dismissed");
  const dismissed = state.findings.filter((f) => f.company_id === cid && f.status === "dismissed");
  const groups = groupFindings(fs), sc = scanned();
  const hint = (t) => t ? `<em>${esc(t)}</em>` : "";
  $("#drawerTitle").innerHTML = `${back ? `<button type="button" class="d-back" id="dBack">← ${String(back).startsWith("p:") ? "사업으로" : back === "official" ? "공식 제재 명단" : LEVEL[back] + " 업체 목록"}</button>` : ""}<div class="d-name"><span class="nm">${esc(c.name)}</span>${sc ? badge(c.risk) : ""}</div>
    <div class="d-sub">${c.engagements.length ? `참여 사업 ${c.engagements.length} · ${ROLE_ORDER.filter((r) => c.engagements.some((e) => e.role === r)).map((r) => `${esc(r)} ${c.engagements.filter((e) => e.role === r).length}`).join(" · ")}` : "사업 미연결"}${c.cat ? ` · ${esc(c.cat)}` : ""}</div>`;
  // 순서: 이슈 → 업체 정보 → 참여 사업 → 검사 결과 (찾아온 사람이 먼저 보는 순서대로, 같은 내용은 한 번만)
  const engRow = (e, i) => `<div class="d-row"><span>${roleTag(e.role)} ${esc(projName(e.project_id))} ${stageTag(e)}</span><button class="xbtn" data-dunlink="${i}" title="이 사업에서 빼기">✕</button></div>`;
  const engRows = c.engagements.map((e, i) => [e, i]).sort((x, y) => ROLE_ORDER.indexOf(x[0].role) - ROLE_ORDER.indexOf(y[0].role) || projName(x[0].project_id).localeCompare(projName(y[0].project_id), "ko")).map(([e, i]) => engRow(e, i));
  $("#drawerBody").innerHTML = `
    <div class="d-actions">
      <button class="btn sm primary" id="dScan">다시 스캔</button>
      <a class="btn sm" target="_blank" rel="noopener" href="https://search.naver.com/search.naver?where=news&query=${encodeURIComponent('"' + c.name + '"')}">네이버 뉴스 ↗</a>
    </div>

    <section class="d-sec">
      <div class="d-sec-head"><h3>이슈</h3><span class="count">${groups.length}</span></div>
      <div id="dFeed" class="feed">${groups.length ? "" : `<div class="empty small">${c.last_check ? "발견된 이슈가 없습니다" : "아직 스캔하지 않았습니다"}</div>`}</div>
      ${dismissed.length ? `<details class="d-more"><summary>관련 없음 처리한 기사 ${dismissed.length}건</summary><div id="dDismissed" class="feed"></div></details>` : ""}
    </section>

    <section class="d-sec">
      <div class="d-sec-head"><h3>업체 정보</h3>${canManage() ? `<button type="button" class="btn sm" id="dEdit">정보 수정</button>` : ""}</div>
      <dl class="d-info">${[["공식 명칭", c.name_official], ["사업자등록번호", c.country !== "KR" ? "해외 업체" : fmtBiz(c.biz_no), c.bizno_source], ["대표자", c.ceo], ["영문명", c.name_en], ["업종", c.cat, c.catGuess ? "추정" : c.category_source], ["별칭", c.aliases], ["보조 키워드", c.context_keywords], ["메모", c.note]]
        .filter(([k, v]) => v || ["사업자등록번호", "대표자", "영문명"].includes(k)).map(([k, v, h]) => `<div><dt>${k}</dt><dd>${v ? esc(v) : `<span class="miss">없음</span>`}${v ? hint(h) : ""}</dd></div>`).join("")}</dl>
    </section>

    <section class="d-sec">
      <div class="d-sec-head"><h3>참여 사업</h3><span class="count">${c.engagements.length}</span></div>
      ${engRows.length ? `<div class="d-list">${engRows.slice(0, 5).join("")}${engRows.length > 5 ? `<details class="d-more"><summary>나머지 ${engRows.length - 5}개 사업 보기</summary><div class="d-list">${engRows.slice(5).join("")}</div></details>` : ""}</div>` : ""}
      ${state.projects.length ? `<form id="linkForm" class="d-link"><select name="pid" required><option value="">사업 선택</option>${projOptions()}</select><select name="role" required>${roleOptions()}</select><button class="btn sm">연결</button></form>` : `<div class="muted small">사업 관리에서 사업을 먼저 만드세요</div>`}
    </section>

    <section class="d-sec">
      <div class="d-sec-head"><h3>검사 결과</h3>${c.last_check?.at ? `<span class="d-sec-meta">${esc(String(c.last_check.at).slice(5, 16))}</span>` : ""}</div>
      ${checkGrid(c)}
    </section>

    <div class="d-danger"><button class="btn sm ghost danger" id="dDelete">업체 삭제</button></div>`;
  if (fs.length) renderGroups(groups, $("#dFeed"), false);
  if (dismissed.length) renderFeed(dismissed, $("#dDismissed"), false);
  $$("#drawerBody [data-open]").forEach((x) => x.onclick = () => openCompany(x.dataset.open));
  $("#dScan").onclick = () => runWorkflow({ task: "scan", companies: c.name }, `'${c.name}' 재스캔`);
  $("#linkForm")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    await placeCompany(cid, null, fd.get("pid"), fd.get("role"));
  });
  $$("[data-dunlink]").forEach((b) => b.onclick = async () => {
    c.engagements.splice(+b.dataset.dunlink, 1); await saveEngagements(c); toast("사업 연결을 뺐습니다"); rerender();
  });
  $("#dDelete").onclick = () => deleteCompanies([cid]);
  $("#dBack")?.addEventListener("click", () => { if (back === "official") { closeDrawer(); return openOfficial(); } String(back).startsWith("p:") ? openProject(String(back).slice(2)) : openRiskList(back, "back"); });
  if (switching) $("#drawerBody").scrollTop = 0;
  $("#dEdit")?.addEventListener("click", () => openCompanyForm(cid));
  $("#drawer").classList.add("open"); $("#drawerBg").classList.add("open");
}
function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawerBg").classList.remove("open"); state.openCid = null; state.riskList = null; state.drawerBack = null; state.openPid = null; }
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
  return `HTTP ${r.status}${msg ? `: ${msg}` : ""}`;
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
// 화면 진행 표시 없이 요청만 남김 (결과는 다음 화면 갱신 때 반영)
async function queueQuiet(data) {
  try {
    const ref = await addDoc(collection(db, "requests"), { companies: "", test_to: "", ...data, status: "pending", requested_by: auth.currentUser?.email || "", requested_at: nowStr(), requested_ms: Date.now() });
    pingRelay();
    return ref.id;
  } catch (e) { console.warn("request failed:", e); return null; }
}
// DART에서 이름으로 찾기: 요청을 남기고 끝날 때까지 기다림 (최대 10분, 창을 닫으면 그만 기다림)
// DART 바로 찾기 함수(functions/index.js dartFind)를 화면에서 직접 부름. 함수가 없거나 회사망에서 막히면 null → 요청을 남기는 예전 길로
const DART_FN = `https://asia-northeast3-${firebaseConfig.projectId}.cloudfunctions.net/dartFind`;
// 함수에 직접 닿지 않으면(회사망 차단·권한 등) 5분 동안은 바로 포기하고 요청 문서 길로 (매번 기다리지 않게)
let dartDeadAt = 0;
async function dartCall(data, ms = 25000) {
  if (window.__dartMock) return window.__dartMock(data); // 화면 점검용 가짜 응답 (평소에는 없음)
  if (new URLSearchParams(location.search).has("demo") || !auth.currentUser) return null;
  if (Date.now() - dartDeadAt < 5 * 60e3) return null;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(DART_FN, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }, body: JSON.stringify({ data }) });
    if (!r.ok) { dartDeadAt = Date.now(); return null; }
    return (await r.json()).result || null;
  } catch { dartDeadAt = Date.now(); return null; } finally { clearTimeout(timer); }
}
// DART 기업 이름 목록을 브라우저가 직접 들고 찾음 (함수가 Firestore dart_master 에 압축해 둔 것: 문서 몇 개만 읽음)
// → 이름 후보는 함수를 기다리지 않고 바로. 목록이 없거나 못 읽으면 예전처럼 함수에 물어봄
let dartIdx = null, dartIdxP = null;
const D_SUF = ["주식회사", "(주)", "㈜", "유한회사", "(유)", "합자회사", "사단법인", "재단법인", "co., ltd.", "co.,ltd.", "co. ltd.", "co ltd", "company limited", "limited", "ltd.", "ltd", "corporation", "corp.", "corp", "inc.", "inc", "llc", "plc", "gmbh", "s.a.", "(persero)", "persero", "tbk"];
const dNorm = (name) => { let t = String(name || "").toLowerCase().replace(/^pt[.\s]+/, ""); for (const x of D_SUF) t = t.split(x).join(" "); return t.replace(/[^0-9a-z가-힣]/g, ""); };
const D_KO = { a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치", i: "아이", j: "제이", k: "케이", l: "엘", m: "엠", n: "엔", o: "오", p: "피", q: "큐", r: "알", s: "에스", t: "티", u: "유", v: "브이", w: "더블유", x: "엑스", y: "와이", z: "제트" };
const dKo = (k) => k.replace(/[a-z]/g, (ch) => D_KO[ch]);
function loadDartIdx() {
  if (window.__dartRows) { dartIdx = window.__dartRows.map((r) => { const k = dNorm(r[1]); return [k, r, dKo(k)]; }); return Promise.resolve(); } // 화면 점검용
  return dartIdxP || (dartIdxP = (async () => {
    try { // 저장소에 올려 둔 공개 기업목록 (로그인·규칙·함수와 무관하게 읽힘)
      const r = await fetch("./data/corp_master.json");
      if (r.ok) { const list = (await r.json()).filter((x) => x && x[0] && x[1]).map((x) => { const row = [x[0], x[1], x[2] || "", x[3] || ""], k = dNorm(row[1]); return [k, row, dKo(k)]; }); if (list.length) { dartIdx = list; return; } }
    } catch {}
    if (new URLSearchParams(location.search).has("demo")) return;
    try {
      const docs = (await getDocs(collection(db, "dart_master"))).docs.map((d) => d.data()).sort((a, b) => a.i - b.i);
      if (!docs.length || docs.length !== docs[0].n) return;
      const parts = docs.map((d) => d.data.toUint8Array());
      const text = await new Response(new Blob(parts).stream().pipeThrough(new DecompressionStream("gzip"))).text();
      const list = [];
      for (const line of text.split("\n")) { const r = line.split("\t"); if (r.length < 4 || !r[0]) continue; const k = dNorm(r[1]); list.push([k, r, dKo(k)]); }
      if (list.length) dartIdx = list;
    } catch { dartIdxP = null; }
  })());
}
// 정확히 같은 이름 → 그 글자로 시작하는 곳 → 상장사 → 짧은 이름 (functions searchMaster 와 같게)
function dartSearchLocal(name, limit = 100) {
  const target = dNorm(name), t2 = dKo(target);
  if (!dartIdx || target.length < 2) return [];
  const exact = dartIdx.filter(([k, , k2]) => k === target || k2 === t2);
  const part = dartIdx.filter((x) => !exact.includes(x) && (x[0].includes(target) || x[2].includes(t2)));
  const st = (x) => x[0].startsWith(target) || x[2].startsWith(t2);
  const spac = (x) => /기업인수목적|스팩/.test(x[1][1]); // 스팩은 맨 뒤로
  part.sort((x, y) => (spac(x) - spac(y)) || (st(y) - st(x)) || (!!y[1][3].trim() - !!x[1][3].trim()) || (x[0].length - y[0].length) || x[1][1].localeCompare(y[1][1], "ko"));
  return [...exact.map((x) => [x[1], true]), ...part.map((x) => [x[1], false])].slice(0, limit)
    .map(([r, ex]) => ({ corp_code: r[0], name: r[1], name_en: r[2] || "", listed: !!r[3].trim(), exact: ex }));
}
async function dartLookup(name, biz = "", code = "") {
  const direct = code ? null : await dartCall({ name, biz });
  if (direct && Array.isArray(direct.cands)) return direct;
  if (!document.getElementById("dlRes")) return null;
  const id = await queueQuiet({ task: "dartlookup", name, biz, ...(code ? { code } : {}), label: "DART 찾기" });
  if (!id) throw new Error("요청을 남기지 못했습니다");
  if (ghToken() && !(await pingRelay())) { try { await gh("/actions/workflows/monitor.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: "main", inputs: { task: "queue", companies: "", test_to: "" } }) }); } catch {} }
  const t0 = Date.now();
  while (Date.now() - t0 < 10 * 60e3) {
    await new Promise((res) => setTimeout(res, Date.now() - t0 < 30e3 ? 1000 : 4000)); // 즉시 실행 함수가 있으면 몇 초 안에 답이 옴
    if (!document.getElementById("dlRes")) return null;
    const d = await getDoc(doc(db, "requests", id));
    const r = d.exists() ? d.data() : null;
    if (r?.status === "done") return r.result || {};
    if (r?.status === "error") throw new Error(r.result?.error || "오류");
  }
  throw new Error("시간이 오래 걸려 기다리기를 멈췄습니다");
}
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
    : `${j.label}을(를) 요청했습니다. 보통 1~2분 안에 시작되고 (늦어도 5분), 끝나면 자동으로 반영됩니다`, 5000);
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
      toast(`${j.label}을(를) 중지했습니다${j.progress?.done ? ` (${j.progress.done}개까지 반영)` : ""}`, 5000);
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
      : j.conclusion === "cancelled" ? `<span class="jline">중지됨: 그때까지 검사한 결과는 반영</span>`
      : `<span class="jline bad">✕ ${j.status === "timeout" ? "응답 없음" : "실패"}${j.error ? `: ${esc(j.error.slice(0, 80))}` : ""} · <a href="${ACTIONS_URL}" target="_blank" rel="noopener">기록 ↗</a></span>`;
    return;
  }
  const wait = Date.now() - j.started, p = j.progress, running = j.status === "in_progress";
  const what = running
    ? (j.stopping ? "중지 요청됨" : p && p.total ? `스캔 중 ${p.done}/${p.total}` : "스캔 준비 중")
    : wait > 15 * 60e3 ? `대기 ${fmt(wait)}: 지연 중 (<a href="${ACTIONS_URL}" target="_blank" rel="noopener">GitHub에서 실행 ↗</a>)`
    : `시작 대기 · 보통 1~2분, 늦어도 5분 (${fmt(wait)})`;
  const pct = running && p && p.total ? Math.round((p.done / p.total) * 100) : null;
  el.innerHTML = `<span class="jline"><span class="spinner"></span>${what}</span>${pct != null ? `<span class="jbar"><i style="width:${pct}%"></i></span>` : ""}`;
}
setInterval(() => { if (state.job && !state.job.done) renderJob(); }, 1000);
// [지금 스캔] = 진행 중 사업에 연결된 업체의 가벼운 스캔 (제재 키워드 기사 대조 + 공식 명단, 업체명 검색은 아침 자동 스캔에서)
$("#btnScan").onclick = () => runWorkflow({ task: "quick" }, "지금 스캔");
$("#btnGuide").onclick = openGuide;
// 처음 한 번 열어 볼 때까지 NEW 표시
try { if (localStorage.getItem("edcf_guide_seen")) $("#guideNew").remove(); } catch {}
$("#btnScan").title = "사업에 연결된 업체를 스캔합니다";
$("#btnFullScan").onclick = () => { const all = state.companies.length, off = state.companies.filter((c) => !c.focus).length; if (confirm(`등록된 업체 ${all}곳을 모두 스캔합니다 (사업에 연결되지 않은 ${off}곳 포함).\n평소 스캔은 사업에 연결된 ${all - off}곳만 합니다. 진행할까요?`)) runWorkflow({ task: "scan" }, "전체 업체 스캔"); };
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
  ["pre", "계약 전 점검", "입찰중·우선협상 단계 업체: 부정당업자 확인이 가장 필요한 시점"],
  ["risk", "리스크 업체", "경고·주의 업체"],
  ["open", "미확인 이슈", "'관련 있음·관련 없음' 처리 전 이슈가 있는 업체"],
  ["info", "정보 보완 필요", "사업자번호 또는 영문명이 없어 조회가 불완전한 업체"],
];
const needInfo = (c) => (c.country === "KR" && !c.biz_no) || !c.name_en;
// 사업자번호는 업체마다 하나 (같은 번호 두 업체 금지). 해외 업체는 사업자번호 없이 영문명·국가로 구분
const bizDigits = (b) => String(b || "").replace(/\D/g, "");
const bizOwner = (biz, exceptId) => biz ? state.companies.find((c) => c.id !== exceptId && bizDigits(c.biz_no) === biz) : null;
const bizDupes = () => { const m = new Map(); state.companies.forEach((c) => { const b = bizDigits(c.biz_no); if (b) m.set(b, [...(m.get(b) || []), c]); }); return [...m.values()].filter((l) => l.length > 1); };
const inView = (c, v) => v === "all" ? true
  : v === "pre" ? c.engagements.some((e) => e.stage === "입찰중" || e.stage === "우선협상")
  : v === "risk" ? scanned() && c.risk !== "none"
  : v === "open" ? c.open > 0
  : v === "info" ? needInfo(c) : true;
const coState = { view: "all", sort: "risk", dir: 1, sel: new Set() };
const FILTER_IC = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>`;
const CO_MORE = ["#fRisk", "#fRole", "#fStage", "#fNat"]; // 덜 쓰는 필터: [상세 필터]를 눌러야 보임
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
  keep("#fProj", `<option value="">사업 전체</option><option value="__none">사업 미연결</option>` + projOptions(live)
    + (state.projects.some((p) => !live(p)) ? `<optgroup label="완료된 사업">${state.projects.filter((p) => !live(p)).sort((x, y) => x.name.localeCompare(y.name, "ko")).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</optgroup>` : ""));
  keep("#fCat", `<option value="">업종 전체</option>` + CATS.map((k) => `<option value="${k}">${k}</option>`).join(""));
  $("#coViews").innerHTML = CO_VIEWS.map(([k, l, d]) => `<button data-v="${k}" class="cv-btn ${k} ${k === coState.view ? "active" : ""}" title="${d}">${l}<span class="n">${state.companies.filter((c) => inView(c, k)).length}</span></button>`).join("");
  $$("#coViews button").forEach((b) => b.onclick = () => { coState.view = b.dataset.v; renderCompanies(); });

  const list = state.companies.filter(poolMatches).sort((a, b) => CO_SORT[coState.sort](a, b) * coState.dir);
  for (const id of [...coState.sel]) if (!state.companies.some((c) => c.id === id)) coState.sel.delete(id);
  $("#fReset").classList.toggle("hidden", !CO_FILTERS.some((id) => $(id).value));
  // 상세 필터(역할·단계·국내해외): 평소에는 접어 두고, 고른 것이 있으면 펼친 채로 개수 표시
  { const n = CO_MORE.filter((id) => $(id).value).length, btn = $("#fMoreBtn"), open = n > 0 || btn.getAttribute("aria-expanded") === "true";
    $("#fMore").classList.toggle("hidden", !open); btn.classList.toggle("on", open); btn.innerHTML = `${FILTER_IC}<span>상세 필터</span>${n ? `<b class="fn">${n}</b>` : ""}<i class="chev">${open ? "▴" : "▾"}</i>`; }
  $("#poolShown").textContent = list.length === state.companies.length ? "" : `${state.companies.length}개 중 ${list.length}개`;
  $$("#coTable th[data-sort]").forEach((th) => { th.classList.toggle("on", th.dataset.sort === coState.sort); th.classList.toggle("desc", th.dataset.sort === coState.sort && coState.dir < 0); });
  const engChip = (e) => `<span class="ej" title="${esc(projName(e.project_id))} · ${esc(e.role)} · ${esc(e.stage || "계약")}">${roleTag(e.role)}<span class="ej-p">${esc(projName(e.project_id))}</span>${stageTag(e)}</span>`;
  $("#pool").innerHTML = !list.length ? `<tr><td colspan="9" class="empty">${state.companies.length ? "조건에 맞는 업체가 없습니다." : "업체가 없습니다. [일괄 등록] 또는 [+ 업체 추가]를 이용하세요."}</td></tr>`
    : list.map((c) => `<tr data-cid="${c.id}" class="${coState.sel.has(c.id) ? "sel" : ""}">
      <td class="t-chk"><input type="checkbox" data-sel="${c.id}" ${coState.sel.has(c.id) ? "checked" : ""} aria-label="${esc(c.name)} 선택"></td>
      <td class="t-name"><button class="co-name" data-open="${c.id}">${esc(c.name_official || c.name)}</button>${c.name_en ? `<div class="sub">${esc(c.name_en)}</div>` : ""}</td>
      <td class="t-cat">${esc(c.cat || "-")}${c.catGuess || c.category_source === "이름 추정" ? `<span class="src guess" title="업체명으로 추정: 스캔 때 DART 업종이 있으면 바뀜">추정</span>` : ""}</td>
      <td class="t-proj">${c.engagements.length ? byRole(c.engagements).map(engChip).join("") : `<span class="muted">-</span>`}</td>
      <td class="t-risk">${sc ? (c.risk !== "none" ? badge(c.risk) : `<span class="ok-t">정상</span>`) : `<span class="muted">-</span>`}</td>
      <td class="t-open">${c.open ? `<b>${c.open}</b>` : `<span class="muted">0</span>`}</td>
      <td class="t-id">${c.country !== "KR" ? `<span class="muted">해외</span>` : c.biz_no ? esc(fmtBiz(c.biz_no)) : `<span class="miss">없음</span>`}</td>
      <td class="t-id t-ceo">${c.ceo ? esc(c.ceo) : `<span class="muted">-</span>`}</td>
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
  $$("#pool [data-open]").forEach((x) => x.onclick = () => openCompanyForm(x.dataset.open)); // 업체 관리에서는 업체 정보 팝업 (이슈·검사 결과는 팝업 안 버튼으로)
  $$("#pool [data-del]").forEach((x) => x.onclick = () => deleteCompanies([x.dataset.del]));
}
// 여러 업체 삭제 (수집된 이슈도 함께)
async function deleteCompanies(ids) {
  const names = ids.map((id) => state.companies.find((c) => c.id === id)?.name).filter(Boolean);
  if (!names.length) return;
  const msg = names.length === 1 ? `'${names[0]}' 업체와 수집된 이슈를 삭제할까요?`
    : `선택한 ${names.length}개(${names.slice(0, 3).join(", ")}${names.length > 3 ? " 등" : ""})과 수집된 이슈를 삭제할까요?`;
  if (!confirm(msg + "\n삭제하면 되돌릴 수 없습니다.")) return;
  if (names.length > 5) toast(`${names.length}개 삭제 중…`, 8000);
  for (let i = 0; i < ids.length; i += 8) await Promise.all(ids.slice(i, i + 8).map((id) => deleteCompany(id)));
  ids.forEach((id) => coState.sel.delete(id));
  if (state.openCid && ids.includes(state.openCid)) closeDrawer();
  toast(`${names.length}개을 삭제했습니다`); rerender();
}
$("#poolSearch").addEventListener("input", () => renderCompanies());
document.addEventListener("click", (e) => { const m = $("#coToolMenu"); if (m?.open && (!m.contains(e.target) || e.target.closest(".tool-pop button"))) m.open = false; });
$("#pjSearch").addEventListener("input", (e) => { pjState.q = e.target.value; renderProjects(); });
CO_FILTERS.slice(1).forEach((s) => $(s).addEventListener("change", () => renderCompanies()));
$("#fMoreBtn").onclick = () => { const b = $("#fMoreBtn"); b.setAttribute("aria-expanded", b.getAttribute("aria-expanded") === "true" ? "false" : "true"); if (b.getAttribute("aria-expanded") === "false") CO_MORE.forEach((id) => ($(id).value = "")); renderCompanies(); };
$("#fReset").onclick = () => { CO_FILTERS.forEach((id) => ($(id).value = "")); renderCompanies(); };
$("#coDelSel").onclick = () => deleteCompanies([...coState.sel]);
$("#coSelClear").onclick = () => { coState.sel.clear(); renderCompanies(); };
$$("#coTable th[data-sort]").forEach((th) => th.addEventListener("click", () => {
  if (coState.sort === th.dataset.sort) coState.dir *= -1; else { coState.sort = th.dataset.sort; coState.dir = 1; }
  renderCompanies();
}));

// ---------- 사업 탭: 왼쪽 업체 이름을 끌어서 사업의 역할 칸에 놓기 ----------
const pjState = { scope: "all", view: null, q: "", open: null };
try { pjState.view = localStorage.getItem("edcf_pj_view"); } catch {}
const PJ_ICON = { list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>`, card: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>` };
// 목록 한 줄: 사업명 · 수원국 · 팀 · 역할별 업체 수 · 등급. 누르면 그 줄 아래에 역할 칸(업체 연결)이 펼쳐짐
function pjListRow(p, sc) {
  const cs = new Set(), n = {};
  for (const c of state.companies) c.engagements.forEach((e) => { if (e.project_id === p.id) { cs.add(c); n[e.role] = (n[e.role] || 0) + 1; } });
  const t = { red: 0, orange: 0 }; cs.forEach((c) => { if (t[c.risk] != null) t[c.risk]++; });
  const open = pjState.open === p.id;
  return `<div class="pl-item ${open ? "open" : ""} ${live(p) ? "" : "done"}">
    <div class="pl-row" data-pl="${p.id}" role="button" tabindex="0">
      <span class="pl-name" title="${esc(p.name)}">${esc(p.name)}${live(p) ? "" : `<span class="tag">완료</span>`}</span>
      <span class="pl-ctry">${esc(COUNTRY[p.country] || "")}</span>
      <span class="pl-team">${esc(teamName(p.team))}</span>
      <span class="pl-roles">${ROLES.map((r) => `<span class="${n[r] ? "" : "zero"}">${roleTag(r)}<b>${n[r] || 0}</b></span>`).join("")}</span>
      <span class="pl-risk pj-sum">${!cs.size ? "" : sc ? (["red", "orange"].filter((lv) => t[lv]).map((lv) => `<span class="${lv}">${LEVEL[lv]} ${t[lv]}</span>`).join("") || `<span class="ok">이상 없음</span>`) : ""}</span>
      <span class="pl-caret"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>
    </div>
    ${open ? projectCard(p, sc) : ""}
  </div>`;
}
function renderProjects() {
  const sc = scanned();
  $("#pjTotal").textContent = state.projects.length;
  const q = ($("#sideSearch").value || "").trim().toLowerCase();
  const side = state.companies.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.aliases || "").toLowerCase().includes(q) || (c.name_en || "").toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  $("#sideN").textContent = q ? `${side.length} / ${state.companies.length}` : `${state.companies.length}`;
  $("#sideList").innerHTML = side.map((c) => `<div class="side-co" draggable="true" data-cid="${c.id}" data-side-open="${c.id}" role="button" tabindex="0" title="누르면 업체 정보 · 끌면 사업의 역할 칸에 연결"><span class="dot ${sc ? c.risk : ""}"></span><span class="nm">${esc(c.name)}</span></div>`).join("")
    || `<div class="empty small">${state.companies.length ? "검색 결과가 없습니다" : "업체 관리에서 업체를 먼저 등록하세요"}</div>`;
  $$("#sideList [data-side-open]").forEach((el) => { const go = () => openCompany(el.dataset.sideOpen); el.onclick = go; el.onkeydown = (e) => { if (e.key === "Enter") go(); }; });
  const mineN = state.projects.filter(isMine).length;
  // 슈퍼관리자는 모든 팀을 따로 볼 수 있음 · 그 밖은 전체와 우리 팀
  const scopeTabs = isSuper() ? [["all", "전체", state.projects.length], ...Object.entries(TEAMS).map(([k, l]) => ["t:" + k, l, state.projects.filter((p) => p.team === k).length])]
    : [["all", "전체", state.projects.length], ["mine", myTeam() ? TEAMS[myTeam()] : "우리 팀", mineN]];
  if (!scopeTabs.some(([k]) => k === pjState.scope)) pjState.scope = "all";
  $("#pjScope").innerHTML = scopeTabs.map(([k, l, n]) => `<button data-s="${k}" class="${pjState.scope === k ? "active" : ""}">${l} <span class="n">${n}</span></button>`).join("");
  $$("#pjScope button").forEach((b) => b.onclick = () => { pjState.scope = b.dataset.s; renderProjects(); });
  const pq = pjState.q.trim().toLowerCase();
  const ps = state.projects.filter((p) => pjState.scope === "all" || (pjState.scope.startsWith("t:") ? p.team === pjState.scope.slice(2) : isMine(p)))
    .filter((p) => !pq || p.name.toLowerCase().includes(pq) || (COUNTRY[p.country] || "").toLowerCase().includes(pq))
    .sort((a, b) => live(b) - live(a) || (COUNTRY[a.country] || "").localeCompare(COUNTRY[b.country] || "", "ko") || a.name.localeCompare(b.name, "ko")); // 완료한 사업은 뒤로, 수원국·이름순
  const view = pjState.view || (state.projects.length > 24 ? "list" : "card"); // 사업이 많으면 목록이 기본
  $("#pjView").innerHTML = [["list", "목록"], ["card", "카드"]].map(([k, l]) => `<button data-pv="${k}" class="${view === k ? "active" : ""}">${PJ_ICON[k]}${l}</button>`).join("");
  $$("#pjView button").forEach((b) => b.onclick = () => { pjState.view = b.dataset.pv; try { localStorage.setItem("edcf_pj_view", pjState.view); } catch {} renderProjects(); });
  const board = $("#projBoard"); board.className = view === "list" ? "pj-list" : "pj-grid";
  board.innerHTML = (view === "list" ? ps.map((p) => pjListRow(p, sc)) : ps.map((p) => projectCard(p, sc))).join("")
    || `<div class="empty">${pq ? "찾는 사업이 없습니다" : state.projects.length ? "우리 팀 사업이 없습니다." : "사업이 없습니다. 오른쪽 위에서 새 사업을 추가하세요."}</div>`;
  $$("#projBoard [data-pl]").forEach((el) => { const go = () => { pjState.open = pjState.open === el.dataset.pl ? null : el.dataset.pl; renderProjects(); }; el.onclick = go; el.onkeydown = (e) => { if (e.key === "Enter") go(); }; });
  bindDnd();
}
// 단계 선택 상자 (진행 순서: 입찰중 → 우선협상 → 계약)
const STAGE_OPTS = [["입찰중", "입찰중"], ["우선협상", "우선협상"], ["계약", "계약체결"]]; // 저장 값은 그대로 "계약", 화면에만 "계약 체결"(이미 계약된 상태임이 분명하게)
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
  touched.forEach((c) => { c.teams = teamsOf(c); b.update(doc(db, "companies", c.id), { engagements: c.engagements, teams: c.teams }); });
  await b.commit(); rerender();
}
function projectCard(p, sc) {
  const rows = [];
  for (const c of state.companies) c.engagements.forEach((e, i) => { if (e.project_id === p.id) rows.push({ c, e, i }); });
  const t = { red: 0, orange: 0, yellow: 0, none: 0 };
  new Set(rows.map((r) => r.c)).forEach((c) => t[c.risk]++);
  const total = t.red + t.orange + t.yellow + t.none;
  const dist = !total ? "" : `<div class="pj-dist"><div class="pj-bar">${sc ? ["red", "orange", "none"].filter((lv) => t[lv]).map((lv) => `<i class="${lv}" style="flex:${t[lv]}"></i>`).join("") : `<i class="pending" style="flex:1"></i>`}</div>
    <div class="pj-sum">${sc ? (["red", "orange"].filter((lv) => t[lv]).map((lv) => `<span class="${lv}">${LEVEL[lv]} ${t[lv]}</span>`).join("") || `<span class="ok">이상 없음</span>`) : ""}<span class="tot">/ ${total}개</span></div></div>`;
  return `<div class="pbox ${live(p) ? "" : "done"} ${canEditProject(p) ? "" : "ro"}">
    <div class="pbox-head"><button class="pname" ${canEditProject(p) ? `data-edit-proj="${p.id}"` : `data-open-proj="${p.id}"`} title="눌러서 사업명·수원국·담당 수정">${esc(p.name)}</button>${live(p) ? "" : `<span class="tag">완료</span>`}${p.country ? `<span class="ctry">${esc(COUNTRY[p.country] || p.country)}</span>` : ""}</div>
    ${dist}
    <div class="pbox-body">${ROLES.map((role) => {
      const rr = rows.filter((r) => r.e.role === role).sort(byOrder);
      return `<div class="dropzone ${rr.length ? "" : "is-empty"}" data-pid="${p.id}" data-role="${esc(role)}">
        <div class="dz-head" ${rr.length > 1 ? `title="맨 위가 대표사"` : ""}>${roleTag(role)}${rr.length ? `<span class="count">${rr.length}</span>` : ""}</div>
        ${rr.map(({ c, e, i }, k) => `<div class="corow" draggable="true" data-cid="${c.id}" data-from="${p.id}|${i}">
          <span class="dot ${sc ? c.risk : ""}"></span>${k === 0 ? `<span class="lead" title="대표사">대표</span>` : ""}<button class="cn" data-open="${c.id}">${esc(c.name)}</button>
          <span class="right">
            ${k > 0 ? `<button class="upbtn leadbtn" data-up="${p.id}|${esc(role)}|${c.id}|${rr[0].c.id}" title="대표사로 지정">대표</button>` : ""}
            <select class="stage-sel ${e.stage && e.stage !== "계약" ? "on" : ""}" data-stage-sel="${c.id}|${i}" title="단계${e.stage === "우선협상" && e.rank ? ` · ${e.rank}순위` : ""}" aria-label="단계">${STAGE_OPTS.map(([v, l]) => `<option value="${v}" ${v === stageVal(e) ? "selected" : ""}>${l}</option>`).join("")}</select>
            <button class="xbtn" data-unlink="${c.id}|${i}" title="이 사업에서 빼기">✕</button>
          </span></div>`).join("")}
        <div class="drop-hint">끌어다 놓기</div>
      </div>`;
    }).join("")}</div>
    <div class="pbox-foot">${ownerTag(p)}${canEditProject(p) ? "" : `<span class="muted small">보기 전용 (다른 팀 사업)</span>`}<span class="pf-act ${canEditProject(p) ? "" : "hidden"}"><button class="btn sm ghost" data-edit-proj="${p.id}">수정</button><button class="btn sm ghost danger" data-del-proj="${p.id}">삭제</button></span></div>
  </div>`;
}
$("#sideSearch").addEventListener("input", () => renderProjects());


async function saveEngagements(c) { c.teams = teamsOf(c); await updateDoc(doc(db, "companies", c.id), { engagements: c.engagements, teams: c.teams }); }

async function placeCompany(cid, from, pid, role) {
  const c = state.companies.find((x) => x.id === cid);
  if (!c) return;
  const tgt = state.projects.find((x) => x.id === pid), src = from ? state.projects.find((x) => x.id === from.split("|")[0]) : null;
  if (!canEditProject(tgt) || (src && !canEditProject(src))) return toast("다른 팀 사업에는 업체를 넣거나 뺄 수 없습니다");
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
  $$("[data-open-proj]", root).forEach((b) => b.onclick = () => openProject(b.dataset.openProj));
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
  const isNew = !pid, p = isNew ? { name: "", country: "", owner: me(), team: myTeam() } : state.projects.find((x) => x.id === pid);
  if (!p) return;
  if (!isNew && !canEditProject(p)) return toast("다른 팀 사업은 그 팀 관리자만 고칠 수 있습니다");
  // 담당자 후보: 그 사업 팀에 속한 계정 (슈퍼관리자 포함) + 지금 담당자
  const teamUsers = (t) => [...new Set([...SUPER_ADMINS.map((id) => ({ id, team: state.users.find((x) => x.id === id)?.team || "ict" })), ...state.users.filter((x) => !isSuperMail(x.id))]
    .filter((x) => (x.team || "") === (t || "")).map((x) => x.id).concat(p.owner && (p.team || "") === (t || "") ? [p.owner] : []))].sort((a, b) => (b === me()) - (a === me()) || a.localeCompare(b));
  const ownerOpts = (t, sel) => `<option value="">담당자 미지정</option>${teamUsers(t).map((o) => `<option value="${esc(o)}" ${sel === o ? "selected" : ""}>${o === me() ? `나 (${esc(o.split("@")[0])})` : esc(o.split("@")[0])}</option>`).join("")}`;
  const countries = Object.entries(COUNTRY).filter(([k]) => k !== "KR").sort((a, b) => a[1].localeCompare(b[1]));
  modal(`<h2>${isNew ? "사업 등록" : "사업 수정"}</h2>
    <form id="pjEditForm" class="form pjf" autocomplete="off">
      <div class="pjf-l">
        <div class="row r12">
          <label>수원국<select name="country"><option value="">선택</option>${countries.map(([k, v]) => `<option value="${k}" ${p.country === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
          <label>사업명<input name="name" value="${esc(p.name)}" required></label>
        </div>
        <div class="row">
          <label>담당 팀<select name="team" ${isSuper() ? "" : "disabled"}>${Object.entries(TEAMS).map(([k, v]) => `<option value="${k}" ${(p.team || myTeam()) === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
          <label>담당자<select name="owner">${ownerOpts(p.team || myTeam(), p.owner)}</select></label>
        </div>
        <div class="pjf-site">사업지</div>
        <label class="city-box">도시<input name="city" placeholder="도시 이름으로 찾기" autocomplete="off"><div class="city-sug hidden" id="citySug"></div></label>
        <div class="row">
          <label>좌표<input name="ll" placeholder="위도, 경도" value="${Number.isFinite(p.lat) ? `${p.lat}, ${p.lng}` : ""}"></label>
          <label>지도에 보일 이름<input name="site_en" placeholder="Dhaka" value="${esc(p.site_en || "")}"></label>
        </div>
        <div id="zoneBox" class="zone-box"></div>
        ${isNew ? "" : `<label class="check pjf-done"><input type="checkbox" name="done" ${live(p) ? "" : "checked"}> 사업 완료</label>`}
      </div>
      <div class="pjf-r">
        <div id="sitePick" class="site-pick"></div>
        <div class="site-f"><span class="muted small" id="siteState"></span><button type="button" class="btn sm ghost" id="siteClear">핀 지우기</button></div>
      </div>
      <div class="actions">${isNew ? "" : `<button type="button" class="btn ghost danger" id="pjDelete" style="margin-right:auto">사업 삭제</button>`}<button class="btn primary">${isNew ? "등록" : "저장"}</button></div>
    </form>`);
  $("#modal").classList.add("wide");
  // 사업지 고르기 (작은 지도)
  const f0 = $("#pjEditForm"), site = { lat: Number.isFinite(p.lat) ? p.lat : null, lng: Number.isFinite(p.lng) ? p.lng : null };
  f0.team.addEventListener("change", () => { f0.owner.innerHTML = ownerOpts(f0.team.value, f0.owner.value); }); // 팀을 바꾸면 그 팀 사람으로
  // 여행경보가 나라 안에서 지역마다 다르면: 사업지가 어느 지역인지 (자동 판단 + 직접 고르기)
  let zoneSel = Number.isFinite(p.alert_lv) ? String(p.alert_lv) : "";
  const showZone = () => {
    const box = $("#zoneBox"), cc = f0.country.value, al = state.geo?.alerts?.[cc];
    const zs = (al?.zones || []).slice().sort((a, b) => b.lv - a.lv);
    if (!al || new Set(zs.map((z) => z.lv)).size < 2) { box.innerHTML = ""; zoneSel = ""; return; }
    const pl = { ...p, name: f0.name.value, site_en: f0.site_en.value, lat: site.lat, lng: site.lng, alert_lv: null };
    const pt = projectPoint(pl), auto = siteAlert(al, { ll: pt?.ll, country: cc, ...siteOpt(pl, pt) });
    const AL = ["", "1단계 여행유의", "2단계 여행자제", "3단계 출국권고", "4단계 여행금지"];
    const lvs = [...new Set(zs.map((z) => z.lv))];
    box.innerHTML = `<label title="이 나라는 지역마다 단계가 다릅니다">사업지 여행경보
      <select name="alert_lv"><option value="">자동: ${auto.lv ? esc(AL[auto.lv]) : "없음"}${auto.how === "base" ? " (사업지 위치 미상, 나머지 지역 기준)" : auto.zone ? " (사업지가 이 지역 안)" : " (사업지 위치로 판단)"}</option>
      ${lvs.map((lv) => `<option value="${lv}" ${zoneSel === String(lv) ? "selected" : ""}>${esc(AL[lv])}: ${esc(zs.filter((z) => z.lv === lv).map((z) => z.text).join(" / ").slice(0, 70))}</option>`).join("")}</select></label>`;
    box.querySelector("select").onchange = (e) => { zoneSel = e.target.value; };
  };
  const showSite = () => { const g = site.lat == null && projectPoint({ name: f0.name.value, country: f0.country.value }); $("#siteState").textContent = site.lat == null ? (g && g.how !== "국가 중심" ? `핀 없음 · 사업명의 ${g.how} 기준` : "핀 없음") : `핀 ${site.lat.toFixed(3)}, ${site.lng.toFixed(3)}`; showZone(); };
  let pk = null; // 지도 라이브러리를 받은 뒤에 사업지 지도를 붙임
  const picker = { set: (v) => pk?.set(v), country: (c, move) => pk?.country(c, move), clear: () => pk?.clear() };
  ensureGeoLibs().then((ok) => { const el = $("#sitePick"); if (ok && el && el.isConnected) pk = mountSitePicker(el, { ...site, country: f0.country.value || p.country }, (lat, lng) => { site.lat = +lat.toFixed(4); site.lng = +lng.toFixed(4); f0.ll.value = `${site.lat}, ${site.lng}`; showSite(); }); });
  showSite();
  const normC = (x) => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "");
  // 아는 도시(GEO_CITY, 한글 이름) 먼저 → 넓은 목록(수원국 인구 1만5천 이상 도시, 고른 수원국 먼저)
  const cityHits = (q) => {
    if (!q) return [];
    const st = (k, v) => normC(k).startsWith(q) || normC(v[2]).startsWith(q);
    const own = Object.entries(GEO_CITY).filter(([k, v]) => normC(k).includes(q) || normC(v[2]).includes(q) || (v[3] && normC(v[3]).includes(q))).sort((x, y) => st(y[0], y[1]) - st(x[0], x[1])).slice(0, 8);
    if (own.length >= 8 || !cityDb || q.length < 2) return own;
    const seen = new Set(own.map(([, v]) => normC(v[2]))), cc0 = f0.country.value, more = [];
    for (const cc of cc0 ? [cc0] : Object.keys(cityDb).filter((k) => k !== "_src")) {
      for (const r of cityDb[cc] || []) {
        const en = normC(r[0]);
        if (seen.has(en) || !(en.includes(q) || (r[3] && normC(r[3]).includes(q)))) continue;
        seen.add(en); more.push([r[0], [r[1], r[2], r[0], r[3], cc], en.startsWith(q) || r[3].split(",").some((x) => normC(x).startsWith(q))]);
        if (more.length >= 40) break;
      }
      if (more.length >= 40) break;
    }
    more.sort((x, y) => ((y[1][4] === cc0) - (x[1][4] === cc0)) || (y[2] - x[2]));
    return [...own, ...more.slice(0, 8 - own.length)];
  };
  const pickCity = ([k, v]) => { picker.set([v[0], v[1]]); f0.city.value = k; if (!f0.site_en.value) f0.site_en.value = v[2]; $("#citySug").classList.add("hidden"); };
  // 목록에 없는 도시: 적은 이름을 '지도에 보일 이름'으로 쓰고, 위치는 지도에서 직접 찍음
  const freeCity = () => { const t = f0.city.value.trim(); if (!t) return; f0.site_en.value = t; $("#citySug").classList.add("hidden"); toast(site.lat == null ? `'${t}'(으)로 적어 두었습니다. 아래 지도에서 위치를 눌러 핀을 놓아 주세요` : `지도에 보일 이름을 '${t}'(으)로 바꿨습니다`, 5000); };
  // 목록(수원국 인구 1천 이상 도시)에 없는 곳: 온라인 지도(OpenStreetMap 검색)에서 이름으로 찾음. 버튼을 눌렀을 때만 한 번 물어봄. 회사망에서 막히면 안내
  const webCity = async () => {
    const q = f0.city.value.trim(), el = $("#citySug"), cc = f0.country.value;
    if (!q) return;
    el.innerHTML = `<div class="muted small">온라인 지도에서 찾는 중입니다</div>`; el.classList.remove("hidden");
    try {
      const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=ko,en&q=${encodeURIComponent(q)}${cc ? `&countrycodes=${cc.toLowerCase()}` : ""}`;
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
      const list = await (await fetch(u, { signal: ctl.signal })).json(); clearTimeout(timer);
      if (!el.isConnected) return;
      if (!Array.isArray(list) || !list.length) { el.innerHTML = `<div class="muted small">온라인 지도에서도 '${esc(q)}'을(를) 찾지 못했습니다${cc ? ` (${esc(COUNTRY[cc] || cc)} 안에서 찾음)` : ""}. 영문 표기로 다시 적거나 지도에서 직접 눌러 주세요</div><button type="button" data-cfree="1"><b>'${esc(q)}' 그대로 쓰기</b><span>위치는 지도에서 직접 누르기</span></button>`; }
      else el.innerHTML = list.map((x, i) => `<button type="button" data-cw="${i}"><b>${esc(x.name || String(x.display_name).split(",")[0])}</b><span>${esc(String(x.display_name || "").split(",").slice(1, 4).join(",").trim())}</span></button>`).join("");
      $$("[data-cw]", el).forEach((b) => b.onmousedown = (e) => { e.preventDefault(); const x = list[+b.dataset.cw]; picker.set([+x.lat, +x.lon]); f0.site_en.value = x.name || String(x.display_name).split(",")[0]; el.classList.add("hidden"); });
      $$("[data-cfree]", el).forEach((b) => b.onmousedown = (e) => { e.preventDefault(); freeCity(); });
    } catch { if (el.isConnected) { el.innerHTML = `<div class="muted small">온라인 지도에 연결하지 못했습니다 (회사망에서 막혔을 수 있습니다). 구글 지도에서 좌표를 복사해 '좌표 붙여넣기'에 넣거나 지도에서 직접 눌러 주세요</div>`; } }
  };
  const showSug = () => {
    const hits = cityHits(normC(f0.city.value)), el = $("#citySug");
    el.innerHTML = hits.map(([k, v], i) => `<button type="button" data-ci="${i}"><b>${esc(k)}</b><span>${esc(v[4] ? [v[3] && v[3].split(",").pop(), COUNTRY[v[4]] || v[4]].filter(Boolean).join(" · ") : v[2])}</span></button>`).join("")
      + (f0.city.value.trim().length >= 2 ? `<button type="button" class="alt" data-cweb="1"><b>온라인 지도에서 '${esc(f0.city.value.trim())}' 찾기</b><span>${hits.length ? "위에 없으면" : "목록에 없는 작은 도시·마을"} (OpenStreetMap)</span></button><button type="button" class="alt" data-cfree="1"><b>'${esc(f0.city.value.trim())}' 그대로 쓰기</b><span>위치는 지도에서 직접 누르기</span></button>` : "");
    el.classList.toggle("hidden", !el.innerHTML);
    $$("[data-ci]", el).forEach((b) => b.onmousedown = (e) => { e.preventDefault(); pickCity(hits[+b.dataset.ci]); });
    $$("[data-cfree]", el).forEach((b) => b.onmousedown = (e) => { e.preventDefault(); freeCity(); });
    $$("[data-cweb]", el).forEach((b) => b.onmousedown = (e) => { e.preventDefault(); webCity(); });
  };
  f0.city.oninput = showSug; f0.city.onfocus = () => { showSug(); loadCityDb().then(() => { if (document.activeElement === f0.city) showSug(); }); }; f0.city.addEventListener("compositionupdate", () => setTimeout(showSug, 0));
  f0.city.onblur = () => setTimeout(() => $("#citySug")?.classList.add("hidden"), 150);
  f0.city.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); const h = cityHits(normC(f0.city.value)); if (h.length) pickCity(h[0]); else freeCity(); } }; // Enter 로 창이 저장되지 않게
  f0.ll.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); f0.ll.onchange(); } };
  f0.ll.onchange = () => {
    const m = f0.ll.value.match(/(-?\d+(?:\.\d+)?)[^\d-]+(-?\d+(?:\.\d+)?)/);
    if (!m || Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) return toast("좌표를 읽지 못했습니다. 예: 23.81, 90.41");
    picker.set([+m[1], +m[2]]);
  };
  f0.country.onchange = () => { picker.country(f0.country.value, site.lat == null); zoneSel = ""; showZone(); };
  $("#siteClear").onclick = () => { site.lat = site.lng = null; f0.ll.value = ""; picker.clear(); showSite(); };
  $("#pjEditForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target));
    const name = String(fd.name || "").trim();
    if (!name) return;
    if (state.projects.some((x) => x.id !== pid && x.name === name)) return toast("같은 이름의 사업이 이미 있습니다");
    const off = site.lat != null && fd.country ? await siteMismatch(fd.country, [site.lat, site.lng]) : null;
    if (off && !confirm(`사업지 핀이 ${COUNTRY[fd.country] || fd.country} 밖에 있는 것 같습니다${off.near ? ` (${off.near} 쪽)` : ""}.\n\n그대로 저장할까요?`)) return;
    const team = isSuper() ? (fd.team || null) : myTeam();
    const patch = { name, team, country: fd.country || null, owner: fd.owner || null, lat: site.lat, lng: site.lng, site_en: String(fd.site_en || "").trim() || null, status: fd.done ? "done" : null, alert_lv: zoneSel ? +zoneSel : null };
    if (isNew) { const data = { ...patch, created_at: nowStr() }, ref = await addDoc(collection(db, "projects"), data); state.projects.push({ id: ref.id, ...data }); }
    else { const moved = p.team !== team; await updateDoc(doc(db, "projects", pid), patch); Object.assign(p, patch); if (moved) await syncCompanyTeams(); }
    closeModal(); toast(isNew ? `'${name}' 사업을 등록했습니다` : "사업을 수정했습니다"); rerender();
  };
  f0.name.addEventListener("input", showSite);
  if (isNew) f0.name.onchange = () => { if (!f0.country.value) { const g = guessCountry(f0.name.value); if (g) { f0.country.value = g; picker.country(g); } } }; // 사업명 속 나라 이름으로 수원국 자동 선택
  $("#pjDelete")?.addEventListener("click", () => deleteProject(pid));
}
// 사업지 핀이 고른 수원국과 맞는지: 그 나라 도시(인구 1천 이상) 가운데 가장 가까운 곳이 150km 넘게 떨어져 있으면 알려 줌
// 도시 목록에 없는 나라는 나라 가운데에서 1,500km. 맞으면 null, 아니면 { near: 가장 가까운 다른 나라 이름 }
async function siteMismatch(cc, ll) {
  const dist = (a, b) => { const r = Math.PI / 180, x = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  await loadCityDb();
  const nearest = (rows) => rows.reduce((m, r) => Math.min(m, dist(ll, [r[1], r[2]])), Infinity);
  const mine = cityDb?.[cc];
  if (mine?.length ? nearest(mine) <= 150 : !GEO_COUNTRY[cc] || dist(ll, [GEO_COUNTRY[cc][2], GEO_COUNTRY[cc][3]]) <= 1500) return null;
  let best = null, bd = 300;
  for (const k of Object.keys(cityDb || {})) { if (k === "_src" || k === cc) continue; const d = nearest(cityDb[k]); if (d < bd) { bd = d; best = k; } }
  return { near: best ? COUNTRY[best] || best : "" };
}
async function deleteProject(pid) {
  const p = state.projects.find((x) => x.id === pid);
  if (p && !canEditProject(p)) return toast("다른 팀 사업은 그 팀 관리자만 지울 수 있습니다");
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

// 업체명 다듬기: '(1순위)'와 법인 표기(주식회사·(주)·㈜)는 화면·검색용 이름에서 빼고, 적은 그대로는 공식 명칭(official)으로 따로 남김
const CORP_MARK = /주식회사|유한회사|유한책임회사|합자회사|\(주\)|\(유\)|\(합\)|㈜/g; // 화면·검색·중복 확인용 이름에서 빼는 법인 표기
const CORP_GLYPH = /[\u3200-\u321E\u3260-\u327F]/; // ㈜ ㈲ 처럼 괄호 글자가 한 글자로 된 특수문자
const CORP_GLYPH_MSG = "㈜ 같은 특수문자 대신 (주) 또는 주식회사로 적어 주세요";
const plainCorp = (t) => String(t || "").replace(/㈜/g, "(주)").replace(/㈲/g, "(유)");
function cleanCompanyName(raw) {
  let rank = null, name = plainCorp(raw);
  const m = name.match(/\(\s*(\d+)\s*순위\s*\)/);
  if (m) { rank = +m[1]; name = name.replace(m[0], ""); }
  const full = name.replace(/\s+/g, " ").trim();
  // 한글 사이에 낀 공백은 붙임 ('삼 부 토건' → '삼부토건'). 영문·숫자 옆 공백('LG CNS')은 그대로
  name = name.replace(CORP_MARK, "").replace(/\s+/g, " ").trim().replace(/([가-힣])\s+(?=[가-힣])/g, "$1");
  return { name, rank, official: full.replace(CORP_MARK, "").trim() !== full ? full : null };
}
// 업체명 기본 검사: 문제가 있으면 이유(문장), 없으면 "" (업체 추가·수정·일괄 등록 공통)
const BAD_WORDS = ["시발", "씨발", "병신", "새끼", "지랄", "존나", "좆", "fuck", "shit"];
function nameProblem(name) {
  const core = String(name || "").replace(/\s/g, "");
  if (!core) return "업체명을 넣어 주세요";
  if (/[ㄱ-ㅎㅏ-ㅣ]/.test(core)) return "자음·모음만 있는 글자가 들어 있습니다. 업체명을 다시 확인해 주세요";
  if (/[가-힣]/.test(core) && /[,，;；\/|]/.test(name)) return "한 칸에는 업체 한 곳만 넣어 주세요 (쉼표·빗금으로 여러 업체를 함께 적을 수 없습니다)";
  if (!/\p{L}/u.test(core)) return "업체명에 글자가 없습니다";
  if (coreLen(name) < 2) return "업체명은 2자 이상이어야 합니다";
  if (name.length > 60) return "업체명이 너무 깁니다 (60자까지)";
  if (/[^\p{L}\p{N}\s.,&()'’·+\-\/]/u.test(name)) return "업체명에 쓸 수 없는 기호가 들어 있습니다";
  if (/(.)\1{3,}/.test(core)) return "같은 글자가 네 번 넘게 이어집니다. 업체명을 다시 확인해 주세요";
  if (BAD_WORDS.some((w) => core.toLowerCase().includes(w))) return "업체명으로 쓸 수 없는 말이 들어 있습니다";
  return "";
}
// 막지는 않지만 한 번 확인할 이름: 한글 이름 뒤에 숫자가 길게 붙음 · DART에서 고른 이름과 다름
function nameOdd(name, picked) {
  if (/[가-힣]\s*\d{3,}$/.test(name)) return "이름 끝에 숫자가 붙어 있습니다. 잘못 들어간 글자가 아닌지 확인해 주세요.";
  if (picked && picked.name && normName(cleanCompanyName(picked.name).name) !== normName(name)) return `DART에서 가져온 이름('${picked.name}')과 다릅니다.`;
  return "";
}
// 한 칸에 여러 업체를 쉼표·빗금으로 적은 경우 나눔 (영문 'CO., LTD.'의 쉼표는 그대로)
const splitNames = (raw) => { const t = String(raw || ""); return /[가-힣]/.test(t) && /[,，;；\/]/.test(t) ? t.split(/[,，;；\/]/).map((x) => x.trim()).filter(Boolean) : [t.trim()].filter(Boolean); };
// 사업자등록번호 검증번호 확인 (국세청 방식: 앞 9자리로 마지막 자리를 계산)
function bizValid(b) {
  const d = String(b || "").replace(/\D/g, "");
  if (d.length !== 10) return false;
  let s = 0; [1, 3, 7, 1, 3, 7, 1, 3, 5].forEach((w, i) => { s += +d[i] * w; });
  s += Math.floor((+d[8] * 5) / 10);
  return (10 - (s % 10)) % 10 === +d[9];
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
const companyData = (c) => { const { id, risk, open, total, focus, mine, cat, catGuess, ...data } = c; return { ...data, teams: teamsOf(c) }; }; // 계산값은 저장하지 않음 (참여 팀은 권한 확인용으로 저장)

// 업체 추가·업체 정보 수정 (같은 팝업): 업체명·사업자등록번호·대표자·영문명 + DART에서 가져오기. cid 가 없으면 추가
const LANG_OPTS = [["ko", "한국어"], ["ko,en", "한국어 + 영어"], ["en", "영어"], ["en,id", "영어 + 인도네시아어"]];
function openCompanyForm(cid = null) {
  const c0 = cid ? state.companies.find((x) => x.id === cid) : null, isNew = !c0;
  if (cid && !c0) return;
  const v = (k) => esc(c0?.[k] || ""), isForeign = c0 ? (c0.country || "KR") !== "KR" : false;
  const catNow = c0 ? (c0.catGuess ? "" : c0.cat || "") : "";
  const engs = c0?.engagements || [];
  const linked = !!c0?.corp_code; // DART에서 이미 가져온 업체: 표시만 하고, 다시 가져오기는 작은 새로고침 버튼으로
  const DART_BTN = `<button type="button" class="btn sm dart-btn" id="dlBtn">${linked ? "DART 다시 조회" : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>DART 검색`}</button>`;
  modal(`<h2>${isNew ? "업체 추가" : "업체 정보"}${linked ? `<span class="dart-tag" title="DART 고유번호 ${esc(c0.corp_code)}">DART 확인</span>` : ""}</h2>
    <form id="coForm" class="form" autocomplete="off" novalidate>
      <label class="city-box">업체명 *<span class="dl-row"><input name="name" maxlength="60" placeholder="예: 서마루엔지니어링" value="${esc(c0?.name_official || c0?.name || "")}">${DART_BTN}</span><div class="city-sug co-sug hidden" id="coSug"></div></label>
      <div id="nameNote" class="muted small hidden"></div>
      <div id="dlRes" class="dl-res hidden"></div>
      <div class="row">
        <div class="fld"><div class="fld-h"><span>사업자등록번호${isNew ? " *" : ""}</span><label class="mini-check" title="사업자등록번호 없음 · 조달청 조회 제외 · 영문 뉴스 검색"><input type="checkbox" name="foreign" ${isForeign ? "checked" : ""}>해외 업체</label></div><input name="biz_no" inputmode="numeric" maxlength="12" placeholder="000-00-00000" value="${esc(fmtBiz(c0?.biz_no))}"></div>
        <label>대표자<input name="ceo" maxlength="40" value="${v("ceo")}"></label>
      </div>
      <div class="row">
        <label>영문명<input name="name_en" maxlength="100" value="${v("name_en")}"></label>
        <label>업종<select name="category">${["", ...CATS].map((k) => `<option value="${k}" ${k === catNow ? "selected" : ""}>${k || `자동 분류${c0?.catGuess ? ` (추정: ${c0.cat})` : ""}`}</option>`).join("")}</select></label>
      </div>
      <div class="row">
        <label>별칭<input name="aliases" maxlength="200" placeholder="쉼표로 구분" value="${v("aliases")}"></label>
        ${isNew ? `<label>메모<input name="note" maxlength="200"></label>` : `<label title="같은 이름의 다른 회사와 구분할 때 쓰는 말 (업종, 대표자 이름 등)">보조 키워드<input name="context_keywords" maxlength="100" placeholder="동명 업체 구분용" value="${v("context_keywords")}"></label>`}
      </div>
      ${isNew ? "" : `<div class="row"><label>뉴스 검색 언어<select name="search_langs">${LANG_OPTS.concat(LANG_OPTS.some(([k]) => k === (c0.search_langs || "ko")) ? [] : [[c0.search_langs, c0.search_langs]]).map(([k, l]) => `<option value="${esc(k)}" ${k === (c0.search_langs || "ko") ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label><label>메모<input name="note" maxlength="200" value="${v("note")}"></label></div>`}
      ${isNew && state.projects.length ? `<div class="row r21"><label>사업 연결<select name="pid"><option value="">연결 안 함</option>${projOptions()}</select></label>
        <label>역할<select name="role">${roleOptions()}</select></label></div>` : ""}
      ${engs.length ? `<div class="co-engs"><div class="co-engs-h">참여 사업<span class="set-n">${engs.length}</span></div><div class="co-engs-l">${byRole(engs).map((e) => `<div class="co-eng">${roleTag(e.role)}<span title="${esc(projName(e.project_id))}">${esc(projName(e.project_id))}</span>${stageTag(e)}</div>`).join("")}</div></div>` : ""}
      <div class="actions">${isNew ? "" : `<button type="button" class="btn ghost danger" id="coDel" style="margin-right:auto">업체 삭제</button><button type="button" class="btn" id="coIssues">이슈 · 검사 결과 보기</button>`}<button class="btn primary">${isNew ? "추가" : "저장"}</button></div>
    </form>`);
  const f1 = $("#coForm"); let picked = null, dlBusy = false;
  // 법인 표기는 화면·검색용 이름에서 빠진다는 것을 바로 알려줌 (적은 그대로는 공식 명칭으로 남김)
  const showNameNote = () => {
    const { name, official } = cleanCompanyName(f1.name.value), el = $("#nameNote");
    const bad = CORP_GLYPH.test(f1.name.value) ? CORP_GLYPH_MSG : f1.name.value.trim() ? nameProblem(name) : "";
    el.innerHTML = bad ? `<span class="miss">${esc(bad)}</span>` : official ? `뉴스 검색에는 <b>${esc(name)}</b>(으)로 찾습니다` : "";
    el.classList.toggle("hidden", !el.innerHTML);
  };
  showNameNote();
  // 적는 동안 DART 기업 이름을 바로 보여 줌 (이름 목록만 받아서 빠름) → 고르면 그 한 곳만 상세 조회해 채움. 함수에 닿지 않으면(회사망 차단 등) 버튼 방식만
  let dartOk = false, sugTimer = null, sugSeq = 0, sugItems = [];
  dartCall({ warm: true }, 20000).then((r) => { dartOk = !!r; }); // 창을 열 때 함수를 미리 깨워 둠 (목록 저장본도 이때 새로 고쳐짐)
  loadDartIdx(); // 이름 목록은 브라우저가 직접 받아 둠 → 적는 동안 바로 후보
  const hideSug = () => $("#coSug")?.classList.add("hidden");
  const itemRow = (o) => `<b>${esc(o.name)}</b><span>${o.listed ? "상장 · " : ""}${esc(o.name_en || "")}</span>`;
  const pickDart = async (it) => {
    hideSug(); sugSeq++;
    const box = $("#dlRes"); box.classList.remove("hidden");
    let msg = $("#dlMsg"); if (!msg) { box.innerHTML = `<div id="dlMsg"></div>`; msg = $("#dlMsg"); }
    msg.innerHTML = `<span class="dl-wait"><i class="spin"></i>'${esc(it.name)}' 정보를 가져오는 중입니다</span>`;
    const t0 = performance.now();
    let o = await dartCall({ code: it.corp_code, exact: it.exact, name: it.name, name_en: it.name_en || "", listed: !!it.listed }, 8000);
    // 함수에 직접 못 닿으면 요청 문서로 (Firestore 를 거쳐 같은 함수가 처리)
    if (!(o && o.corp_code)) { try { const r = await dartLookup(it.name, "", it.corp_code); o = (r?.cands || []).find((c) => c.corp_code === it.corp_code) || null; if (o && !o.name_en) o.name_en = it.name_en || ""; } catch { o = null; } }
    if (!msg.isConnected) return;
    if (o && o.corp_code) { fillFrom(o); msg.innerHTML = `DART에서 채웠습니다: <b>${esc(o.name)}</b> <span class="muted">${candLine(o)}</span> <span class="muted small">(${((performance.now() - t0) / 1000).toFixed(1)}초)</span>`; }
    else msg.innerHTML = `'${esc(it.name)}' 정보를 가져오지 못했습니다. 잠시 뒤 다시 고르거나 직접 적어 주세요.`;
  };
  const showCoSug = async () => {
    const el = $("#coSug"), q = cleanCompanyName(f1.name.value).name;
    if (!el || !(dartOk || dartIdx) || coreLen(q) < 2 || (picked && picked.name === f1.name.value)) return hideSug();
    const seq = ++sugSeq, r = dartIdx ? { items: dartSearchLocal(q) } : await dartCall({ q, limit: 100 }, 8000);
    if (seq !== sugSeq || !el.isConnected || document.activeElement !== f1.name) return;
    sugItems = r?.items || [];
    el.innerHTML = sugItems.map((o, i) => `<button type="button" data-di="${i}">${itemRow(o)}</button>`).join("") || `<div class="muted small">DART에 '${esc(q)}'이(가) 들어간 기업이 없습니다. 직접 적어 주세요</div>`;
    el.classList.remove("hidden");
    $$("[data-di]", el).forEach((b) => b.onmousedown = (e) => { e.preventDefault(); pickDart(sugItems[+b.dataset.di]); });
  };
  const typed = () => { showNameNote(); clearTimeout(sugTimer); sugTimer = setTimeout(showCoSug, 200); };
  f1.name.oninput = typed; f1.name.addEventListener("compositionupdate", typed);
  f1.name.onblur = () => setTimeout(hideSug, 150);
  f1.name.onkeydown = (e) => { if (e.key === "Escape") { e.stopPropagation(); hideSug(); } };
  f1.biz_no.oninput = () => { const d = f1.biz_no.value.replace(/\D/g, "").slice(0, 10); f1.biz_no.value = d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d; };
  // DART에서 가져오기: 키가 서버(GitHub)에만 있어서 '요청'으로 남기고 결과를 기다림
  const fillFrom = (o) => {
    picked = o;
    if (o.name) f1.name.value = plainCorp(o.name);
    if (o.biz_no) f1.biz_no.value = fmtBiz(o.biz_no);
    if (o.ceo) f1.ceo.value = o.ceo;
    if (o.name_en) f1.name_en.value = o.name_en;
    if (o.category && CATS.includes(o.category)) f1.category.value = o.category;
    showNameNote();
  };
  const candLine = (o) => esc([o.ceo && "대표 " + o.ceo, o.biz_no && fmtBiz(o.biz_no), o.name_en].filter(Boolean).join(" · ") || "상세 정보 없음");
  $("#dlBtn").onclick = async () => {
    const { name } = cleanCompanyName(f1.name.value || ""), box = $("#dlRes"), biz = f1.biz_no.value.replace(/\D/g, "");
    if (!name) return toast("DART는 업체명으로 찾습니다. 업체명을 먼저 넣어 주세요 (사업자번호를 함께 적으면 그 번호와 맞는 곳을 골라 줍니다)", 6000);
    if (nameProblem(name)) return toast(nameProblem(name), 5000);
    if (dlBusy) return;
    dlBusy = true; $("#dlBtn").disabled = true; box.classList.remove("hidden");
    box.innerHTML = `<span class="dl-wait"><i class="spin"></i>DART에서 '${esc(name)}'을(를) 찾는 중입니다</span>`;
    const slow = setTimeout(() => { const w = box.querySelector(".dl-wait"); if (w) w.insertAdjacentHTML("beforeend", ` <span class="muted">조금 더 걸리고 있습니다 (늦으면 1~2분). 다른 칸을 먼저 적어도 됩니다</span>`); }, 12e3);
    try {
      hideSug(); sugSeq++;
      // 이미 DART 와 연결된 업체: 그 기업(고유번호)을 바로 다시 조회 → 달라진 칸만 채우고 알려 줌. 같으면 '변경 없음'
      if (linked && normName(name) === normName(c0.name)) {
        const t0 = performance.now(), o = await dartCall({ code: c0.corp_code, name: c0.name, name_en: c0.name_en || "", exact: true }, 15000);
        if (o && o.corp_code) {
          const took = ` <span class="muted small">(${((performance.now() - t0) / 1000).toFixed(1)}초)</span>`;
          const diff = [["사업자등록번호", o.biz_no, biz], ["대표자", o.ceo, f1.ceo.value.trim()], ["영문명", o.name_en, f1.name_en.value.trim()]].filter(([, x, y]) => x && String(x).trim() !== y).map(([k]) => k);
          if (!diff.length) { box.innerHTML = `DART 정보와 같습니다 · 변경 없음${took}`; return; }
          fillFrom({ ...o, name: "" });
          box.innerHTML = `DART에서 바뀐 정보를 채웠습니다: <b>${diff.join(" · ")}</b>${took}<div class="muted small">[저장]을 눌러야 반영됩니다</div>`;
          return;
        }
      }
      // 이름 목록(50곳)을 받고, 고른 한 곳만 상세 조회. 사업자번호를 직접 적었으면 번호 대조가 필요해 아래 방식으로
      const noBiz = biz.length !== 10 || (picked && String(picked.biz_no || "").replace(/\D/g, "") === biz);
      if (noBiz && !dartIdx) await Promise.race([loadDartIdx(), new Promise((r) => setTimeout(r, 8000))]);
      const quick = !noBiz ? null : dartIdx ? { items: dartSearchLocal(name) } : await dartCall({ q: name, limit: 100 }, 10000);
      if (quick?.items) {
        const items = quick.items, exact = items.filter((o) => o.exact);
        if (!items.length) { box.innerHTML = `DART에 '${esc(name)}'이(가) 들어간 기업이 없습니다 (비상장·소규모·건축사사무소 등). 사업자등록번호와 대표자를 직접 넣어 주세요.`; return; }
        box.innerHTML = `<div id="dlMsg" class="muted small">${items.length === 1 ? "" : `'${esc(name)}' 검색 결과 ${items.length}${items.length >= 100 ? "+" : ""}`}</div>
          <div class="dl-list">${items.map((o, i) => `<label class="dp-cand dl2"><input type="radio" name="dl-pick" value="${i}"><span class="c-ceo">${esc(o.name)}</span><span class="c-en">${esc(o.name_en || "")}</span>${o.listed ? `<span class="tag">상장</span>` : "<span></span>"}</label>`).join("")}</div>`;
        $$("input[name=dl-pick]", box).forEach((x) => x.onchange = () => pickDart(items[+x.value]));
        if (items.length === 1) { box.querySelector("input[name=dl-pick]").checked = true; await pickDart(items[0]); }
        return;
      }
      const r = await dartLookup(name, biz.length === 10 ? biz : "");
      if (!r) return;
      const cands = r.cands || [], same = biz.length === 10 ? cands.find((o) => o.biz_no === biz) : null;
      // 바로 채우는 경우: 사업자번호가 같은 곳, 또는 이름이 정확히 같은 곳이 1곳뿐일 때. 비슷한 이름은 목록에서 고르게 함
      const exact = cands.filter((o) => o.exact !== false), auto = same || (exact.length === 1 ? exact[0] : null);
      const took = r.ms ? ` <span class="muted small">(${(r.ms / 1000).toFixed(1)}초)</span>` : "";
      if (!cands.length) box.innerHTML = `DART에 '${esc(name)}'이(가) 들어간 기업이 없습니다 (비상장·소규모·건축사사무소 등). 사업자등록번호와 대표자를 직접 넣어 주세요.`;
      else {
        if (auto) fillFrom(auto);
        const head = auto ? `DART에서 찾아 채웠습니다: <b>${esc(auto.name)}</b>${same ? ` <span class="muted">(사업자번호가 같은 곳)</span>` : ""}${took}${cands.length > 1 ? `<div class="muted small">다른 곳이면 아래에서 고르세요</div>` : ` <span class="muted">${candLine(auto)}</span>`}`
          : `<div class="muted small">${exact.length ? `DART에 같은 이름이 ${exact.length}곳 있습니다` : `이름이 정확히 같은 곳은 없고, 비슷한 이름이 ${cands.length}곳 있습니다`}. 대표자·사업자번호를 보고 맞는 곳을 고르세요${took}</div>`;
        box.innerHTML = head + (cands.length > 1 || !auto ? `<div class="dl-list">${cands.map((o, i) => `<label class="dp-cand dl4"><input type="radio" name="dl-pick" value="${i}" ${o === auto ? "checked" : ""}><span class="c-ceo">${esc(o.name)}</span><span class="c-biz">${esc(o.ceo || "-")}</span><span class="c-biz">${esc(o.biz_no ? fmtBiz(o.biz_no) : "-")}</span><span class="c-en">${esc(o.name_en || "")}</span></label>`).join("")}</div>` : "");
        $$("input[name=dl-pick]", box).forEach((x) => x.onchange = () => fillFrom(cands[+x.value]));
      }
    } catch (e) { if (box.isConnected) box.innerHTML = `DART에서 찾지 못했습니다: ${esc(e.message || e)}. 직접 적어서 ${isNew ? "추가" : "저장"}해도 됩니다.`; }
    finally { clearTimeout(slow); dlBusy = false; const b = $("#dlBtn"); if (b) b.disabled = false; }
  };
  $("#coIssues")?.addEventListener("click", () => { closeModal(); openCompany(cid); });
  $("#coDel")?.addEventListener("click", async () => { closeModal(); await deleteCompanies([cid]); });
  f1.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries([...new FormData(f1)].map(([k, x]) => [k, String(x).replace(/\s+/g, " ").trim()]));
    const { name, official } = cleanCompanyName(fd.name || "");
    const bad = CORP_GLYPH.test(fd.name || "") ? CORP_GLYPH_MSG : nameProblem(name);
    if (bad) { f1.name.focus(); return toast(bad, 5000); }
    if (state.companies.some((c) => c.id !== cid && normName(c.name) === normName(name))) return toast(`'${name}'은(는) 이미 있는 업체입니다`);
    // 숫자는 실제 회사 이름에도 쓰여서(E1 · 3M 등) 막지 않음. 대신 오타처럼 보이는 이름과, 기존 업체의 이름 바꾸기는 저장 전에 확인
    const odd = nameOdd(name, picked), renamed = !isNew && name !== c0.name;
    if ((isNew || renamed) && odd && !confirm(`업체명 '${name}': ${odd}\n\n그대로 저장할까요?`)) { f1.name.focus(); return; }
    if (renamed && !confirm(`업체명을 바꿉니다.\n\n  ${c0.name}  →  ${name}\n\n뉴스 검색과 중복 확인이 새 이름 기준으로 바뀝니다. 회사 이름이 실제로 바뀐 것이면 옛 이름을 '별칭'에 넣어 두세요.\n계속할까요?`)) { f1.name.focus(); return; }
    const biz = (fd.biz_no || "").replace(/\D/g, ""), bizOld = String(c0?.biz_no || "").replace(/\D/g, "");
    if (isNew && !fd.foreign && !biz) { f1.biz_no.focus(); return toast("사업자등록번호를 넣어 주세요. 해외 업체면 '해외 업체'에 체크하세요", 6000); }
    if (biz && biz.length !== 10) { f1.biz_no.focus(); return toast("사업자등록번호는 숫자 10자리입니다"); }
    if (biz && biz !== bizOld && !bizValid(biz)) { f1.biz_no.focus(); return toast("사업자등록번호가 맞지 않습니다 (검증번호 불일치). 숫자를 다시 확인해 주세요", 6000); }
    const dup = biz !== bizOld ? bizOwner(biz, cid) : null; // 번호를 바꾸거나 새로 넣을 때만 중복 확인 (예전부터 겹쳐 있던 업체도 다른 칸은 고칠 수 있게)
    if (dup) return toast(`사업자등록번호 ${fmtBiz(biz)}는 이미 '${dup.name}'(으)로 등록돼 있습니다. 회사 이름이 바뀐 경우면 그 업체에 별칭으로 넣어 주세요`, 6000);
    if (fd.name_en && /[가-힣ㄱ-ㅎ]/.test(fd.name_en)) { f1.name_en.focus(); return toast("영문명에는 한글을 넣을 수 없습니다"); }
    if (fd.ceo && /[ㄱ-ㅎㅏ-ㅣ0-9]/.test(fd.ceo)) { f1.ceo.focus(); return toast("대표자 이름을 다시 확인해 주세요"); }
    if (isNew && fd.pid && !fd.role) { f1.role.focus(); return toast("사업에 연결하려면 역할(F/S · 컨설턴트 · 본구매)을 골라 주세요", 5000); }
    const fromDart = picked && !fd.foreign;
    if (isNew) {
      const ref = doc(collection(db, "companies"));
      const c = newCompany(ref.id, name, null);
      if (fd.foreign) { c.country = ""; c.search_langs = "en"; }
      c.name_official = official || (fromDart && picked.name !== name ? picked.name : null);
      if (fd.name_en) { c.name_en = fd.name_en; if (!c.search_langs.includes("en")) c.search_langs += ",en"; }
      if (biz) { c.biz_no = biz; c.bizno_source = fromDart && picked.biz_no === biz ? "DART 선택" : "직접 입력"; }
      c.ceo = fd.ceo || null;
      applyCat(c, fd.category, "직접 입력");
      if (fd.aliases) c.aliases = fd.aliases;
      if (fd.note) c.note = fd.note;
      if (fd.pid) c.engagements.push({ project_id: fd.pid, role: fd.role || "컨설턴트", stage: "계약", rank: null });
      if (fromDart) {
        c.corp_code = picked.corp_code || null;
        if (picked.induty_code) c.induty_code = picked.induty_code;
        if (picked.category && fd.category === picked.category) c.category_source = "DART 업종";
      }
      await setDoc(ref, companyData(c));
      state.companies.push(c);
      closeModal();
      // DART에서 고르지 않았고 영문명이 비었으면 그 업체만 DART에서 한 번 찾아 둠 (1곳이면 채우고, 여러 곳이면 'DART 동명 기업 고르기')
      const autoDart = !fd.foreign && !picked && !(c.biz_no && c.name_en);
      if (autoDart) queueQuiet({ task: "dartfill", ids: [ref.id], label: "DART 채움 (새 업체)" });
      toast(`'${name}'을(를) 추가했습니다${autoDart ? ". DART에서 빈 정보를 찾아 채웁니다" : ""}${fd.pid ? "" : ". 사업 관리에서 사업에 연결할 수 있습니다"}`, 4500);
      return rerender();
    }
    const c = c0, patch = { name, name_official: official || (name === c.name ? c.name_official || null : null), biz_no: biz || null, ceo: fd.ceo || null, name_en: fd.name_en || null,
      aliases: fd.aliases || null, context_keywords: fd.context_keywords || null, search_langs: fd.search_langs || "ko", note: fd.note || null };
    if (biz !== bizOld) patch.bizno_source = biz ? (fromDart && picked.biz_no === biz ? "DART 선택" : "직접 입력") : null;
    if (patch.name_en && !patch.search_langs.includes("en")) patch.search_langs += ",en";
    if (!!fd.foreign !== isForeign) { patch.country = fd.foreign ? "" : "KR"; if (fd.foreign && !patch.search_langs.includes("en")) patch.search_langs = "en"; }
    if (fromDart && picked.corp_code) { patch.corp_code = picked.corp_code; patch.dart_cands = null; patch.dart_note = null; if (picked.induty_code) patch.induty_code = picked.induty_code; }
    if ((fd.category || "") !== catNow) {
      // 직접 고르면 그대로 유지, '자동'으로 되돌리면 우선 이름으로 추정하고 다음 스캔 때 DART 업종으로 다시 분류
      if (fd.category) { patch.category = fd.category; patch.category_source = fromDart && picked.category === fd.category ? "DART 업종" : "직접 입력"; }
      else { patch.category = guessCat(name) || guessCat(patch.name_en) || "기타"; patch.category_source = "이름 추정"; }
      patch.cat_checked_at = null;
    }
    if (name !== c.name) { patch.renamed_from = c.name; patch.renamed_at = nowStr(); }
    await updateDoc(doc(db, "companies", cid), patch); Object.assign(c, patch);
    closeModal(); toast("저장했습니다. 다음 스캔부터 적용됩니다"); rerender();
  };
  setTimeout(() => { if (isNew) f1.name.focus(); }, 50);
}
$("#btnAddCompany").onclick = () => openCompanyForm(null);
// 넓은 도시 목록 (GeoNames, tools/build_cities.py 로 만듦): 사업 등록 창에서 도시를 처음 찾을 때 한 번만 받음
let cityDb = null, cityDbP = null;
const loadCityDb = () => cityDbP || (cityDbP = fetch("assets/cities.json?v=2").then((r) => r.ok ? r.json() : null).then((d) => { cityDb = d; }).catch(() => { cityDbP = null; }));
// 사업 고르기 칸: 수원국별로 묶고(가나다순) 그 안에서 사업명 가나다순. 내가 고칠 수 있는 진행 중 사업만
function projOptions(pred = (p) => canEditProject(p) && live(p)) {
  const by = {};
  state.projects.filter(pred).forEach((p) => { const k = COUNTRY[p.country] || "수원국 미지정"; (by[k] = by[k] || []).push(p); });
  return Object.keys(by).sort((x, y) => (x === "수원국 미지정") - (y === "수원국 미지정") || x.localeCompare(y, "ko"))
    .map((k) => `<optgroup label="${esc(k)} (${by[k].length})">${by[k].sort((x, y) => x.name.localeCompare(y.name, "ko")).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</optgroup>`).join("");
}
const roleOptions = () => `<option value="">역할 선택</option>${ROLES.map((r) => `<option>${r}</option>`).join("")}`;
// 새 사업
$("#btnAddProject").onclick = () => openProjectEdit(null);

// 여러 줄 붙여넣기 등록
async function registerRows(rows) {
  const ops = [], batch = { set: (ref, data, o) => ops.push([ref, data, o]) };
  const pByName = Object.fromEntries(state.projects.map((p) => [p.name, p]));
  const cByName = Object.fromEntries(state.companies.map((c) => [normName(c.name), c]));
  const touched = new Set(), slot = {}; // slot: 사업·역할 칸마다 다음 순서 (먼저 적은 업체가 위 = 대표사)
  const nextOrder = (pid, role) => { const k = pid + "|" + role; if (!(k in slot)) slot[k] = state.companies.reduce((n, c) => n + c.engagements.filter((e) => e.project_id === pid && e.role === role).length, 0); return slot[k]++; };
  let newP = 0, newC = 0, links = 0;
  for (const r of rows) {
    let p = pByName[r.project];
    if (!p) {
      const ref = doc(collection(db, "projects"));
      p = { id: ref.id, name: r.project, country: guessCountry(r.project), owner: me(), team: myTeam(), created_at: nowStr() };
      batch.set(ref, { name: p.name, country: p.country, owner: p.owner, team: p.team, created_at: p.created_at });
      pByName[p.name] = p; state.projects.push(p); newP++;
    }
    let c = cByName[normName(r.name)];
    if (!c) {
      c = newCompany(doc(collection(db, "companies")).id, r.name, p.country); applyCat(c, null); if (r.official) c.name_official = r.official;
      cByName[normName(c.name)] = c; state.companies.push(c); newC++;
    }
    if (!c.engagements.some((e) => e.project_id === p.id && e.role === r.role)) {
      c.engagements.push({ project_id: p.id, role: r.role, stage: STAGES.includes(r.stage) ? r.stage : r.rank ? "우선협상" : "계약", rank: r.rank || null, order: r.lead ? -1 : nextOrder(p.id, r.role) }); links++;
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
//  ① 표(엑셀 양식): 제목 줄에 '업체명'이 있으면 열 이름으로 읽음: 업체명·사업자번호·영문명·분류·별칭·사업명·역할
//  ② 사업명 | 구분 | 업체명  (탭·쉼표 구분, 사업명 비우면 윗줄 사업)
//  ③ 분류 묶음 명단  # --- 분류 ---  /  "대표이름": ["별칭1", "별칭2"],
//  ④ 업체명만 한 줄에 하나
const BULK_COLS = { 업체명: "name", 회사명: "name", 사업자번호: "biz_no", 사업자등록번호: "biz_no", 영문명: "name_en", 영문업체명: "name_en", 분류: "category", 업종: "category", 별칭: "aliases", 대표자: "ceo", 대표자명: "ceo", 대표사: "lead", 사업명: "project", 사업: "project", 역할: "role", 구분: "role", 단계: "stage" };
function rowsToBulk(rows) {
  const links = [], base = [], errors = [];
  const hi = rows.findIndex((r) => r.some((x) => /^(업체명|회사명)$/.test(String(x ?? "").replace(/\s/g, ""))));
  const head = rows[hi].map((x) => BULK_COLS[String(x ?? "").replace(/\s/g, "")] || null);
  let last = "";
  rows.slice(hi + 1).forEach((r, i) => {
    const o = {}; head.forEach((k, j) => { if (k && r[j] != null && String(r[j]).trim()) o[k] = String(r[j]).trim(); });
    if (!o.name) return;
    if (/\(예시\)/.test(o.name)) return; // 양식의 예시 줄
    const names = splitNames(o.name), many = names.length > 1, ln = hi + i + 2;
    if (many) errors.push(`${ln}번째 줄: 한 칸에 업체 ${names.length}곳이 있어 따로 나눠 등록합니다 (${names.join(" · ")}). 사업자번호·영문명·대표자는 업체마다 따로 넣어 주세요`);
    const biz = (o.biz_no || "").replace(/\D/g, ""), bizOk = !many && bizValid(biz);
    if (o.biz_no && !many && !bizOk) errors.push(`${ln}번째 줄 '${names[0]}': 사업자번호가 맞지 않아(10자리·검증번호) 비워둡니다`);
    if (o.project) last = o.project;
    const project = o.project || (o.role ? last : "");
    names.forEach((raw, k) => {
      const { name, rank, official } = cleanCompanyName(raw), bad = nameProblem(name);
      if (bad) return errors.push(`${ln}번째 줄 '${raw}': ${bad} → 건너뜁니다`);
      base.push({ name, official, aliases: many ? [] : (o.aliases || "").split(/[,，]/).map((x) => x.trim()).filter(Boolean), category: o.category || null, biz_no: bizOk ? biz : null, name_en: many ? null : o.name_en || null, ceo: many ? null : o.ceo || null });
      if (project) links.push({ project, role: normRole(o.role) || "컨설턴트", name, rank, stage: o.stage, lead: !many && /^(o|y|yes|예|대표|대표사|✓|v|1)$/i.test(o.lead || "") });
    });
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
      name = name.replace(CORP_MARK, "").trim();
      base.push({ name, aliases: [...new Set(al.filter((a) => a && a !== name))], category: cat });
      return;
    }
    if (/["']\s*:\s*\[/.test(t)) { errors.push(`${i + 1}번째 줄을 읽지 못했습니다`); return; }
    const cm = line.split(",").map((x) => x.trim());
    const sep = line.includes("|") ? "|" : line.includes("\t") ? "\t" : cm.length >= 3 && ROLES.includes(cm[1]) ? "," : null; // 쉼표 구분은 둘째 칸이 역할일 때만 (업체 여러 곳을 쉼표로 적은 줄과 구분)
    if (sep) {
      const cells = line.split(sep).map((x) => x.trim());
      let [project, role, raw] = sep === "," ? [cells[0], cells[1], cells.slice(2).join(", ")] : cells;
      if (/사업명/.test(project || "") && /업체/.test(raw || "")) return;
      if (project) last = project; else project = last;
      if (!project || !raw) { errors.push(`${i + 1}번째 줄: 사업명 또는 업체명이 비어 있습니다`); return; }
      for (const one of splitNames(raw)) {
        const { name, rank, official } = cleanCompanyName(one), bad = nameProblem(name);
        if (bad) { errors.push(`${i + 1}번째 줄 '${one}': ${bad} → 건너뜁니다`); continue; }
        links.push({ project, role: normRole(role) || "컨설턴트", name, rank, official });
      }
      return;
    }
    for (const one of splitNames(t)) {
      const { name, official } = cleanCompanyName(one), bad = nameProblem(name);
      if (bad) { errors.push(`${i + 1}번째 줄 '${one}': ${bad} → 건너뜁니다`); continue; }
      base.push({ name, official, aliases: [], category: cat });
    }
  });
  return { links, base, errors };
}
const coreLen = (n) => (/^[\x00-\x7F]+$/.test(n) ? n.toLowerCase().replace(/[^a-z0-9]/g, "") : n.replace(/주식회사|\(주\)|㈜|\s/g, "")).length;
async function registerBase(rows) {
  const have = new Map(state.companies.map((c) => [normName(c.name), c]));
  const touched = new Map();
  let added = 0, updated = 0;
  for (const r of rows) {
    let c = have.get(normName(r.name)) || (r.biz_no ? bizOwner(r.biz_no) : null); // 이름이 달라도 사업자번호가 같으면 같은 업체
    if (!c) { c = newCompany(doc(collection(db, "companies")).id, r.name, null); c.source = "일괄 등록"; state.companies.push(c); have.set(normName(c.name), c); added++; }
    else updated++;
    const al = new Set((c.aliases || "").split(",").map((x) => x.trim()).filter(Boolean));
    r.aliases.forEach((a) => al.add(a));
    if (r.official && !c.name_official) c.name_official = r.official;
    if (r.ceo && !c.ceo) c.ceo = r.ceo;
    c.aliases = [...al].join(", ") || null;
    if (r.biz_no && !c.biz_no && !bizOwner(r.biz_no, c.id)) { c.biz_no = r.biz_no; c.bizno_source = "일괄 등록"; }
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
// 엑셀 양식 (CSV, 엑셀에서 바로 열림): 예시는 가상 데이터
function downloadTemplate() {
  const rows = [["업체명", "사업자번호", "대표자", "영문명", "업종", "별칭", "사업명", "역할", "대표사"],
    ["서마루엔지니어링(예시)", "000-00-00000", "홍길동", "SEOMARU ENGINEERING CO., LTD.", "엔지니어링·설계·감리", "서마루ENG", "케냐 스마트시티 구축사업(예시)", "컨설턴트", "O"],
    ["도레온건설(예시)", "", "", "", "건설·시공", "", "케냐 스마트시티 구축사업(예시)", "컨설턴트", ""]];
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
  const noBiz = base.filter((r) => !r.biz_no && !have.has(normName(r.name)) && /[가-힣]/.test(r.name)).length;
  $("#bulkOut").innerHTML = (errors.length ? `<div class="notice">${errors.slice(0, 12).map(esc).join("<br>")}</div>` : "")
    + (base.length ? `<h3>업체 ${base.length} <span class="muted small">(신규 ${newN} · 기존 업데이트 ${base.length - newN} · 사업자번호 ${base.filter((r) => r.biz_no).length} · 영문명 ${base.filter((r) => r.name_en).length})</span></h3>
      <div class="chips">${Object.entries(cats).map(([k, v]) => `<span class="tag">${esc(k)} ${v}</span>`).join("")}</div>
      ${noBiz ? `<div class="notice" style="margin-top:8px">사업자번호가 없는 새 업체 ${noBiz}: 등록은 되지만 조달청·EXIMIIS 대조와 같은 업체 중복 확인이 안 됩니다. 사업자번호를 채워 올리는 것을 권장합니다.</div>` : ""}
      ${shortN.length ? `<div class="notice" style="margin-top:8px">2자 이하 이름 ${shortN.length}개 (${shortN.slice(0, 12).map((r) => esc(r.name)).join(", ")}${shortN.length > 12 ? " …" : ""}): 동명 기사가 섞이지 않도록 업종 관련 단어가 함께 나온 기사만 인정합니다.</div>` : ""}` : "")
    + (links.length ? `<h3>사업 연결 ${links.length}건</h3><table class="tbl"><thead><tr><th>사업</th><th>역할</th><th>업체</th><th></th></tr></thead><tbody>${links.slice(0, 60).map((r) => `<tr>
      <td class="small">${esc(r.project)}</td><td>${roleTag(r.role)} ${r.rank ? `<span class="stage">우선협상 ${r.rank}순위</span>` : ""}</td>
      <td><b>${esc(r.name)}</b></td><td class="small muted">${state.projects.some((x) => x.name === r.project) ? "기존 사업" : "새 사업"}</td></tr>`).join("")}</tbody></table>` : "")
    + (!links.length && !base.length && !errors.length ? `<div class="muted small">읽을 내용이 없습니다.</div>` : "");
  const n = links.length + base.length;
  $("#bulkRun").disabled = !n;
  $("#bulkRun").textContent = n ? `등록하기 (업체 ${base.length || new Set(links.map((l) => l.name)).size})` : "등록하기";
}
$("#btnBulk").onclick = () => {
  parsed = null;
  modal(`<h2>업체 일괄 등록</h2>
    <p class="muted small">양식에 한 줄에 업체 한 곳씩 채워서 올리면 됩니다. 사업명·역할을 함께 적으면 사업에 바로 연결됩니다.</p>
    <div class="add-row"><button class="btn" id="bulkTpl">① 양식 내려받기</button><label class="btn primary">② 채운 파일 올리기<input type="file" id="bulkFile" accept=".xlsx,.xls,.csv" hidden></label></div>
    <details class="bulk-more"><summary>파일이 안 열리면 표를 복사해 붙여넣기</summary>
      <textarea id="bulkText" placeholder="엑셀 표를 제목 줄까지 그대로 복사해 붙여넣으세요"></textarea>
      <div class="actions left"><button type="button" class="btn sm" id="bulkPrev">붙여넣은 내용 확인</button></div>
    </details>
    <div id="bulkOut" class="import-preview"></div>
    <div class="actions"><button class="btn primary" id="bulkRun" disabled>등록하기</button></div>
    <details class="bulk-more"><summary>도움말</summary>
      <ul class="bulk-help">
        <li>같은 사업·역할에 업체가 여럿이면 먼저 적은 업체가 대표사입니다 ('대표사' 칸에 O를 적으면 그 업체)</li>
        <li>이미 있는 업체는 빈 정보만 채웁니다. 업종을 비워 두면 자동으로 분류합니다</li>
        <li>사내 보안(DRM)으로 파일이 안 열리면 표를 복사해 붙여넣으세요</li>
      </ul>
    </details>`);
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
      toast("파일을 읽지 못했습니다: " + (e.message || e) + ": 표를 복사해 붙여넣어 보세요", 7000);
    }
  });
  $("#bulkRun").onclick = async () => {
    if (!parsed || !(parsed.links.length + parsed.base.length)) return;
    $("#bulkRun").disabled = true;
    try {
      const b = parsed.base.length ? await registerBase(parsed.base) : { added: 0, updated: 0 };
      const r = parsed.links.length ? await registerRows(parsed.links) : { newP: 0, newC: 0 };
      closeModal();
      toast(`등록 완료: 업체 ${r.newC + b.added} 추가${b.updated ? ` · ${b.updated}개 정보 보완` : ""}${r.newP ? ` · 사업 ${r.newP}개 추가` : ""}`, 5000);
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
// 제재기간('2026.05.11~2026.11.10')의 끝 날짜가 지났는지
const edcfEnded = (e) => { const d = [...String(e.period || "").matchAll(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/g)]; if (d.length < 2) return false; const [, y, m, dd] = d[d.length - 1]; return new Date(+y, +m - 1, +dd + 1) <= new Date(); };
const edcfActive = (e) => /등록/.test(e.status || "") && !edcfEnded(e); // 명단에 '등록'이어도 기간이 끝났으면 과거 이력
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
  for (const { e, c } of hits) { const x = m.get(c.id) || { c, n: 0, active: false }; x.n++; x.active = x.active || edcfActive(e); m.set(c.id, x); }
  return [...m.values()].sort((a, b) => b.active - a.active || b.n - a.n || a.c.name.localeCompare(b.c.name));
}
const edcfHitText = (g) => g.map((x) => `${esc(x.c.name)} <span class="muted">(${x.active ? "제재 중" : "해지"}${x.n > 1 ? ` · ${x.n}건` : ""})</span>`).join(", ");
function edcfPreview(list) {
  const active = list.filter(edcfActive).length;
  const hits = edcfMatches(list), g = edcfByCompany(hits), act = g.filter((x) => x.active);
  modal(`<h2>EDCF 부정당업자 명단 확인</h2>
    <p><b>${list.length}건</b> · 등록 ${active} · 해지 ${list.length - active} · 사업자번호 있음 ${list.filter((e) => e.biz_no).length}</p>
    ${g.length ? `<div class="notice">우리 명단과 일치하는 업체 <b>${g.length}개</b> (기록 ${hits.length}건)${act.length ? `: 현재 제재 중 <b style="color:var(--red)">${act.map((x) => esc(x.c.name)).join(", ")}</b>` : ""}<br>${edcfHitText(g)}</div>` : `<p class="muted small">현재 우리 명단과 일치하는 업체는 없습니다.</p>`}
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
    <p class="muted small">EXIMIIS → 경협 → 업무지원 → <b>부정당업자조회</b>에서 내려받은 <b>EDCF 제재 업체 명단</b>입니다 (감시할 업체 명단과는 별개). 올려 두면 스캔 때 우리 업체와 사업자번호(없으면 업체명)로 대조해 '제재 중'이면 경고로 표시합니다. 새로 올리면 기존 명단을 교체합니다.</p>
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
  $("#modalClose").onclick = () => openOfficial();
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
  const active = list.filter(edcfActive).length, bad = list.filter((e) => !edcfValid(e)).length;
  if (!$("#edcfInfo")) return;
  if (bad) {
    $("#edcfInfo").innerHTML = `<div class="edcf-bad"><b>지금 명단 ${list.length}건 중 ${bad}건은 상태·제재기간이 없어 제재 기록이 아닙니다</b>${bad === list.length ? ": 감시 업체 명단이 잘못 올라간 것으로 보입니다" : ""}.
      이 행들은 대조에 쓰지 않으며, 다음 스캔 때 이 때문에 생긴 'EDCF 제재 이력'도 자동으로 지워집니다.<br>EXIMIIS 부정당업자조회 엑셀(예: 13건)을 다시 올리거나 비워 주세요.
      <div class="actions left" style="margin-top:8px"><button class="btn sm danger" id="edcfClear">잘못된 명단 비우기</button></div></div>`;
    $("#edcfClear").onclick = clearEdcf;
    return;
  }
  $("#edcfInfo").innerHTML = !list.length ? "아직 등록된 명단이 없습니다."
    : `${list.length}건 (등록 ${active} · 해지 ${list.length - active}) · ${esc(st.edcf_sanctions_at || "")} 반영${st.edcf_sanctions_by ? ` (${esc(st.edcf_sanctions_by.split("@")[0])})` : ""}
       ${g.length ? `<div style="margin-top:6px">우리 명단과 일치 <b>${g.length}개</b>${act.length ? ` · <b style="color:var(--red)">현재 제재 중 ${act.map((x) => esc(x.c.name)).join(", ")}</b>` : ""}<br>${edcfHitText(g)}</div>` : `<div style="margin-top:6px">우리 명단과 일치하는 업체 없음</div>`}`;
}

const hoursSince = (t) => t ? (Date.now() - Date.parse(String(t).replace(" ", "T") + "+09:00")) / 3600e3 : null;
// ---------- 설정 ----------
function renderSettings() {
  renderKeywords();
  renderAccess();

  if ($("#rcCount")) $("#rcCount").textContent = state.recipients.length;
  $("#rcList").innerHTML = state.recipients.map((r) => `<div class="srow"><span>${esc(r.email)}</span><button class="xbtn" data-del-rc="${r.id}" title="삭제">✕</button></div>`).join("") || `<div class="muted small">아직 없습니다.</div>`;
  $$("[data-del-rc]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "recipients", b.dataset.delRc)); state.recipients = state.recipients.filter((r) => r.id !== b.dataset.delRc); renderSettings(); });
  if ($("#advCard").open) renderAdvanced();
}
// ---------- 계정·권한 (users/{메일}) ----------
// 슈퍼관리자: 누구나 추가·팀·역할 변경 / 팀 관리자: 자기 팀 팀원만 추가·삭제
const canEditUser = (u) => !isSuperMail(u.id) && (isSuper() || (isTeamAdmin() && u.team === myTeam() && u.role !== "admin"));
const TEAM_C = { ict: "#8B7CFF", water: "#38BDF8", transport: "#F472B6", health: "#2DD4BF", "": "#94A3B8" };
const accF = { q: "", team: null, role: "" }; // 계정 목록 거르기 (화면에서만)
function renderAccess() {
  const users = [...SUPER_ADMINS.map((id) => ({ id, role: "super", team: state.users.find((u) => u.id === id)?.team || "ict" })), ...state.users.filter((u) => !isSuperMail(u.id))];
  const order = [...Object.keys(TEAMS), ""];
  const RO = ["super", "admin", "member"];
  const teamOpts = (sel) => order.map((t) => `<option value="${t}" ${(sel || "") === t ? "selected" : ""}>${t ? TEAMS[t] : "팀 미지정"}</option>`).join("");
  if (accF.team === null) accF.team = isSuper() ? "all" : (myTeam() || "all");
  const cnt = (t) => users.filter((u) => t === "all" || (u.team || "") === t).length;
  const chips = ["all", ...order.filter((t) => t || cnt("") > 0)];
  $("#accTools").innerHTML = `<div class="acc-chips">${chips.map((t) => `<button type="button" class="acc-chip ${accF.team === t ? "on" : ""}" data-acc-f="${t}" style="--tc:${t === "all" ? "var(--accent-2)" : TEAM_C[t]}">${t === "all" ? "전체" : esc((TEAMS[t] || "팀 미지정").replace(/팀$/, ""))} <b>${cnt(t)}</b></button>`).join("")}</div>
    <div class="acc-find"><input id="accQ" type="search" placeholder="메일 검색" value="${esc(accF.q)}"><select id="accRoleF"><option value="">모든 권한</option>${RO.map((r) => `<option value="${r}" ${accF.role === r ? "selected" : ""}>${ROLE_L[r]}</option>`).join("")}</select></div>`;
  const q = accF.q.trim().toLowerCase();
  const pass = (u) => (!q || u.id.includes(q)) && (!accF.role || u.role === accF.role);
  const teams = order.filter((t) => (accF.team === "all" || accF.team === t) && (t || cnt("") > 0));
  const roleCtl = (u) => isSuper() && !isSuperMail(u.id) ? `<select data-acc-team="${esc(u.id)}">${teamOpts(u.team)}</select><select data-acc-role="${esc(u.id)}"><option value="member" ${u.role !== "admin" ? "selected" : ""}>팀원</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>팀 관리자</option></select>`
    : isSuper() ? `<select data-acc-team="${esc(u.id)}" title="슈퍼관리자도 소속 팀은 바꿀 수 있음 (권한은 그대로)">${teamOpts(u.team)}</select><span class="tag super">슈퍼관리자</span>`
    : `<span class="tag ${u.role}">${ROLE_L[u.role] || "팀원"}</span>`;
  const html = teams.map((t) => {
    const all = users.filter((u) => (u.team || "") === t);
    const us = all.filter(pass).sort((a, b) => RO.indexOf(a.role) - RO.indexOf(b.role) || a.id.localeCompare(b.id));
    if ((q || accF.role) && !us.length) return "";
    const n = (r) => all.filter((u) => u.role === r).length;
    const sum = RO.filter((r) => n(r)).map((r) => `${ROLE_L[r]} ${n(r)}`).join(" · ");
    const noAdmin = t && all.some((u) => u.role === "member") && !n("admin");
    return `<section class="acc-team" style="--tc:${TEAM_C[t]}"><div class="acc-team-h"><i class="acc-dot"></i><b>${t ? TEAMS[t] : "팀 미지정"}</b><span class="acc-n">${all.length}</span><span class="acc-sum">${sum}</span>${noAdmin ? `<span class="acc-warn">팀 관리자 없음</span>` : ""}</div>
      ${us.length ? us.map((u) => `<div class="srow acc-row${u.id === me() ? " me" : ""}"><span class="acc-mail" title="${esc(u.id)}">${esc(u.id)}${u.id === me() ? ` <em>나</em>` : ""}</span><span class="acc-ctl">${roleCtl(u)}</span><span class="acc-x">${canEditUser(u) ? `<button class="xbtn" data-del-acc="${esc(u.id)}" title="삭제">✕</button>` : ""}</span></div>`).join("") : `<div class="acc-empty">아직 계정이 없습니다</div>`}</section>`;
  }).join("");
  $("#accList").innerHTML = html || `<div class="acc-empty">맞는 계정이 없습니다</div>`;
  $$("[data-acc-f]").forEach((b) => b.onclick = () => { accF.team = b.dataset.accF; renderAccess(); });
  $("#accQ").oninput = (e) => { accF.q = e.target.value; const pos = e.target.selectionStart; renderAccess(); const n = $("#accQ"); n.focus(); n.setSelectionRange(pos, pos); };
  $("#accRoleF").onchange = (e) => { accF.role = e.target.value; renderAccess(); };
  const f = $("#accForm");
  f.classList.toggle("hidden", !canManage());
  f.team.innerHTML = isSuper() ? teamOpts(myTeam()) : `<option value="${myTeam() || ""}">${teamName(myTeam())}</option>`;
  f.role.innerHTML = `<option value="member">팀원</option>${isSuper() ? `<option value="admin">팀 관리자</option>` : ""}`;
  $$("[data-acc-team]").forEach((s) => s.onchange = async () => {
    const id = s.dataset.accTeam;
    await saveUser(id, isSuperMail(id) ? { team: s.value || null, role: "super" } : { team: s.value || null });
    if (id === me()) { state.me = { ...state.me, team: s.value || null }; toast("내 소속 팀을 바꿨습니다. 새로고침하면 '우리 팀 사업'에 반영됩니다", 5000); }
  });
  $$("[data-acc-role]").forEach((s) => s.onchange = () => {
    const t = state.users.find((u) => u.id === s.dataset.accRole)?.team;
    if (s.value === "admin" && state.users.some((u) => u.role === "admin" && u.team === t && u.id !== s.dataset.accRole) && !confirm(`${teamName(t)}에 이미 팀 관리자가 있습니다. 한 명 더 지정할까요?`)) { s.value = "member"; return; }
    saveUser(s.dataset.accRole, { role: s.value });
  });
  $$("[data-del-acc]").forEach((b) => b.onclick = async () => {
    if (!confirm(`${b.dataset.delAcc} 계정의 접속 권한을 뺄까요?`)) return;
    await deleteDoc(doc(db, "users", b.dataset.delAcc));
    state.users = state.users.filter((u) => u.id !== b.dataset.delAcc); renderAccess(); toast("뺐습니다");
  });
}
async function saveUser(email, patch) {
  const u = state.users.find((x) => x.id === email);
  const data = { ...(u ? { role: u.role, team: u.team || null } : { role: "member", team: null, added_by: me(), added_at: nowStr() }), ...patch, updated_by: me(), updated_at: nowStr() };
  await setDoc(doc(db, "users", email), data, { merge: true });
  if (u) Object.assign(u, data); else state.users.push({ id: email, ...data });
  renderAccess(); toast("저장했습니다");
}
$("#accForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const f = ev.target, email = f.email.value.trim().toLowerCase();
  if (!email || isSuperMail(email) || state.users.some((u) => u.id === email)) return toast("이미 있는 계정입니다");
  const team = isSuper() ? (f.team.value || null) : myTeam(), role = isSuper() ? f.role.value : "member";
  await saveUser(email, { team, role, added_by: me(), added_at: nowStr() });
  f.email.value = ""; toast(`${email} 추가 (${teamName(team)} ${ROLE_L[role]}): 그 계정으로 Google 로그인하면 들어올 수 있습니다`, 5000);
};
// 처음 한 번 (슈퍼관리자): 예전 방식 계정을 계정·권한으로 옮기고, 팀이 없는 사업은 정보통신팀으로
async function migrateRoles() {
  if (!isFixedSuper() || window.__DEMO) return;
  const b = writeBatch(db); let n = 0;
  const msgs = [];
  if (!state.users.length) {
    const add = (email, data) => { if (isSuperMail(email) || state.users.some((u) => u.id === email)) return; const d = { ...data, added_by: me(), added_at: nowStr(), note: "예전 방식에서 옮김" }; b.set(doc(db, "users", email), d); state.users.push({ id: email, ...d }); n++; };
    add(SUPER_ADMIN, { role: "super", team: "ict" });
    ALLOWED_EMAILS.forEach((e) => add(e, { role: "member", team: "ict" }));
    (state.access || []).forEach((e) => add(String(e).toLowerCase(), { role: "member", team: null }));
    if (n) msgs.push(`예전 계정 ${n}개를 '계정·권한'으로 옮겼습니다`);
  }
  const noTeam = state.projects.filter((p) => !p.team);
  if (noTeam.length && !state.users.some((u) => u.migrated_projects)) {
    noTeam.forEach((p) => { b.update(doc(db, "projects", p.id), { team: "ict" }); p.team = "ict"; n++; });
    b.set(doc(db, "users", SUPER_ADMIN), { migrated_projects: nowStr() }, { merge: true });
    msgs.push(`팀이 없는 사업 ${noTeam.length}개를 정보통신팀으로 지정했습니다 (다른 팀 사업은 사업 수정에서 바꾸세요)`);
  }
  if (n) { await b.commit(); toast(msgs.join(". "), 8000); }
}
// 업체의 참여 팀(companies.teams): 규칙이 팀원의 이슈 처리 권한을 확인할 때 씀. 사업 연결이 바뀌면 같이 저장
async function syncCompanyTeams() {
  if (!canManage() || window.__DEMO) return;
  const diff = state.companies.filter((c) => JSON.stringify(teamsOf(c)) !== JSON.stringify([...(c.teams || [])].sort()));
  for (let i = 0; i < diff.length; i += 400) {
    const b = writeBatch(db);
    diff.slice(i, i + 400).forEach((c) => { c.teams = teamsOf(c); b.update(doc(db, "companies", c.id), { teams: c.teams }); });
    await b.commit();
  }
}
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
  const s = state.status, c = s.connections || {}, known = !!s.connections;
  const lists = s.sanction_lists ? Object.entries(s.sanction_lists) : [];
  const listOk = lists.length && lists.every(([, v]) => !/오류/.test(String(v)));
  const scanH = hoursSince(s.last_scan_at), tickH = hoursSince(s.last_tick_at); // tick 은 평일 08~19시만 돌아서 주말엔 길어짐
  const B = (v) => !known ? "unknown" : v ? "ok" : "off";
  const at = (x) => x ? String(x).slice(5, 16) : "";
  const scanAt = at(s.last_scan_at), geoAt = at(state.geo?.updated_at);
  // 줄 형식 통일: [이름, 하는 일, 지금 상태(한 줄), 상태 배지, 확인 기준 시각]
  const G = [
    ["실행 · 데이터", [
      ["Firebase", "데이터 저장 · 로그인", "화면이 지금 읽고 있음", "ok", "지금"],
      ["Firebase 함수", "[지금 스캔] 즉시 실행 (kickQueue)", "요청이 생기면 바로 검사 시작", "ok", ""],
      ["GitHub Actions", "검사 프로그램 실행", s.last_daily_at ? `매일 아침 검사 ${at(s.last_daily_at)}` : "아침 검사 기록 없음", scanH == null ? "unknown" : scanH < 26 ? "ok" : "warn", scanAt],
      ["Apps Script", "예비 실행 (5분마다 요청 확인)", s.last_tick_at ? "평일 08~19시 동작" : "동작 기록 없음", s.last_tick_at ? (tickH < 80 ? "ok" : "warn") : "unknown", at(s.last_tick_at)],
    ]],
    ["업체 검사", [
      ["Google 뉴스", "기사 검색", "키 필요 없음", B(c.google_news ?? true), scanAt],
      ["네이버 뉴스", "기사 검색", c.naver ? "키 등록됨" : "키 없음 (NAVER_APIHUB_KEY)", B(c.naver), scanAt],
      ["조달청", "부정당제재 · 업체 기본정보", c.pps ? "키 등록됨" : "키 없음 (DATA_GO_KR_KEY)", B(c.pps), scanAt],
      ["DART", "사업자번호 · 영문명 · 업종", c.dart ? "키 등록됨" : "키 없음 (DART_API_KEY)", B(c.dart), scanAt],
      ["MDB 제재 명단", "World Bank · ADB · AfDB · IDB · EBRD", lists.length ? (listOk ? `명단 ${lists.length}종 받음` : "일부 명단 오류") : "키 필요 없음", !lists.length ? "unknown" : listOk ? "ok" : "warn", scanAt],
      ["Claude AI", "기사 판정 · Haiku + 경고·주의는 Sonnet 재검토", c.claude ? (s.claude_error ? `호출 실패: ${s.claude_error}` : "키 등록됨") : "키 없음 (키워드 규칙으로 대신)", c.claude && s.claude_error ? "warn" : B(c.claude), scanAt],
    ]],
    ["수원국", [
      ["외교부 여행경보", "나라·지역별 경보 단계", state.geo?.alerts ? `${Object.keys(state.geo.alerts).length}개국 받음` : "공공데이터포털 활용신청 필요", state.geo?.alerts ? "ok" : known ? "off" : "unknown", geoAt],
      ["USGS 지진", "규모 5.5 이상", "키 필요 없음", state.geo?.updated_at ? "ok" : "unknown", geoAt],
      ["GDACS 재난경보", "태풍 · 홍수 · 화산 · 산불", "키 필요 없음", state.geo?.updated_at ? "ok" : "unknown", geoAt],
      ["WHO 감염병", "Disease Outbreak News", "키 필요 없음", state.geo?.updated_at ? "ok" : "unknown", geoAt],
    ]],
    ["알림", [
      ["메일 발송", "아침 요약 메일 (Gmail SMTP)", c.smtp ? `받는 사람 ${state.recipients.length}명` : "키 없음 (SMTP_USER)", B(c.smtp) === "ok" && !state.recipients.length ? "warn" : B(c.smtp), scanAt],
    ]],
  ];
  // [연결 확인]으로 실제로 불러 본 결과가 있으면 그것을 우선
  const cc = s.conn_check, CK = { "Google 뉴스": "google_news", "네이버 뉴스": "naver", "Claude AI": "claude", DART: "dart", 조달청: "pps", "MDB 제재 명단": "mdb", "외교부 여행경보": "mofa", "USGS 지진": "usgs", "GDACS 재난경보": "gdacs", "WHO 감염병": "who", "메일 발송": "smtp" };
  if (cc?.results) G.forEach(([, rows]) => rows.forEach((r) => { const x = cc.results[CK[r[0]]]; if (x) { r[2] = `${x.ok ? "정상 응답" : "실패"} · ${x.msg}`; r[3] = x.ok ? "ok" : "off"; r[4] = at(cc.at); } }));
  if (!state.connReq) $("#connNote").textContent = cc?.at ? `${at(cc.at)} 확인` : "";
  const BADGE = { ok: `<span class="badge none">정상</span>`, warn: `<span class="badge yellow">확인 필요</span>`, off: `<span class="badge orange">미연결</span>`, unknown: `<span class="badge gray">확인 전</span>` };
  $("#connList").innerHTML = G.map(([g, rows]) => {
    const bad = rows.filter((r) => r[3] === "off" || r[3] === "warn").length;
    // 표처럼 한 줄씩: 이름 · 지금 상태(한 줄) · 배지. 하는 일과 확인 시각은 마우스를 올리면
    return `<div class="conn-grp"><div class="conn-gh"><b>${g}</b>${bad ? `<span><em>확인 필요 ${bad}</em></span>` : ""}</div><div class="conn-rows">${rows.map(([k, role, d, stt, t]) => `<div class="conn1 ${stt}" title="${esc(`${role}${t ? ` · ${t} 확인` : ""}`)}"><span class="k">${k}</span><span class="d">${esc(d)}</span>${BADGE[stt]}</div>`).join("")}</div></div>`;
  }).join("");
}
// ---------- 사용량 · 요금 (meta/usage: 검사 프로그램과 화면이 쌓는 사용량 · 금액은 공개 단가로 계산한 추정) ----------
const KRW = 1400; // 원/달러 (추정용)
const AI_PRICE = { "claude-haiku-5-5": [0.10, 0.50], "claude-sonnet-5-5": [2, 10] }; // 100만 토큰당 달러 (입력, 출력) · monitor/usage.py PRICE 와 같게
const FS_FREE = 50000, FS_PRICE = 0.06; // Firestore 하루 무료 읽기, 초과 10만 건당 달러
const WARN_KRW = 30000; // 이번 달 AI 추정 금액이 이 이상이면 '확인 필요'
async function renderUsage(reload) {
  if (reload || !state.usage) {
    try { const u = await getDoc(doc(db, "meta", "usage")); state.usage = u.exists() ? u.data() : {}; } catch { state.usage = {}; }
  }
  const u = state.usage || {}, now = nowStr(), m = now.slice(0, 7), d = now.slice(0, 10);
  const won = (usd) => `약 ${Math.round(usd * KRW).toLocaleString()}원`;
  const num = (n) => Number(n || 0).toLocaleString();
  const bar = (v, max) => `<span class="ubar"><i style="width:${Math.min(100, Math.round((v / max) * 100))}%"></i></span>`;
  // Claude
  const cm = u.claude?.[m] || {};
  let aiUsd = 0; const aiParts = [];
  for (const [model, x] of Object.entries(cm)) {
    const pr = AI_PRICE[model.replace(/_/g, ".")] || AI_PRICE[model];
    const usd = pr ? ((x.in || 0) * pr[0] + (x.out || 0) * pr[1]) / 1e6 : 0; aiUsd += usd;
    aiParts.push(`${/sonnet/.test(model) ? "Sonnet" : /haiku/.test(model) ? "Haiku" : model} ${num(x.calls)}회 · 토큰 ${num((x.in || 0) + (x.out || 0))}`);
  }
  // 기록을 시작하기 전(2026-11-19 이전) 사용분 등 기록에 없는 금액: 슈퍼관리자가 콘솔의 실제 금액을 적으면 그 차이를 보정값으로 저장
  const aiEst = aiUsd, adj = +(u.claude_adj?.[m]?.usd || 0);
  aiUsd = Math.max(0, aiEst + adj);
  state.usageAi = { m, est: aiEst };
  // Firestore: 오늘 · 이번 달 (화면 + 검사 프로그램)
  const rd = (day) => (u.web_days?.[day]?.reads || 0) + (u.batch_days?.[day]?.reads || 0);
  const today = rd(d);
  const monthDays = [...new Set([...Object.keys(u.web_days || {}), ...Object.keys(u.batch_days || {})])].filter((x) => x.startsWith(m));
  const fsMonth = monthDays.reduce((n, x) => n + rd(x), 0);
  const fsUsd = monthDays.reduce((n, x) => n + Math.max(0, rd(x) - FS_FREE) / 1e5 * FS_PRICE, 0);
  const loads = u.web?.[m]?.loads || 0;
  // GitHub Actions
  const ac = u.actions?.[m] || {};
  const rows = [
    ["Claude AI", "기사 판정 (Haiku · 경고·주의만 Sonnet 재검토) · 막대는 월 3만 원 기준", aiParts.join(" · ") || "이번 달 기록 없음", aiUsd ? `${won(aiUsd)} ($${aiUsd.toFixed(2)})` : "0원", aiUsd * KRW >= WARN_KRW ? "warn" : "ok", bar(aiUsd * KRW, WARN_KRW), "https://console.anthropic.com/settings/usage"],
    ["Firebase DB", "읽기 · 하루 5만 건까지 무료 · 막대는 오늘 읽기", `오늘 ${num(today)}건 · 이번 달 ${num(fsMonth)}건 · 화면 열기 ${num(loads)}회`, fsUsd ? won(fsUsd) : "0원", today > FS_FREE * 0.8 ? "warn" : "ok", bar(today, FS_FREE), "https://console.firebase.google.com/project/edcf-monitor/usage"],
    ["Firebase 함수", "[지금 스캔] 즉시 실행 · 월 200만 회 무료", "요청이 있을 때만 실행", "0원", "ok", ""],
    ["GitHub Actions", "검사 실행 · 공개 저장소 무료 (비공개면 월 2,000분 무료)", `${num(ac.runs)}회 · 약 ${num(ac.minutes)}분`, "0원", "ok", bar(ac.minutes || 0, 2000)],
    ["Apps Script · Gmail", "예비 실행 · 메일 발송", "Google 계정 무료 한도 안", "0원", "ok", ""],
  ];
  const BADGE = { ok: `<span class="badge none">정상</span>`, warn: `<span class="badge yellow">확인 필요</span>` };
  const total = aiUsd + fsUsd;
  // 돈이 나가는 것(Claude)과 무료 한도를 봐야 하는 것(Firebase 읽기)만. 0원인 항목은 주의가 필요할 때만
  const shown = rows.filter(([k, , , amt, stt]) => k === "Claude AI" || k === "Firebase DB" || amt !== "0원" || stt !== "ok");
  $("#usageList").innerHTML = `<div class="u-total"><span>합계</span><b>${total ? won(total) : "0원"}</b></div>`
    + shown.map(([k, role, dd, amt, stt, b, link]) => `<div class="conn" title="${esc(role)}"><div class="ct"><div class="k">${k}${link ? `<a class="u-link" href="${link}" target="_blank" rel="noopener" title="실제 청구 화면">실제 사용량 ↗</a>` : ""}</div><div class="d">${esc(dd)}${b}</div></div><div class="cs"><b class="amt">${amt}</b>${stt === "ok" ? "" : BADGE[stt]}</div></div>`).join("");
}
$("#btnUsage").onclick = () => renderUsage(true);
// 실제 금액 맞추기: Anthropic 콘솔의 '이번 달 지출'을 적으면, 기록으로 계산한 금액과의 차이를 저장해 이후 표시에 더함
$("#btnUsageFix").onclick = async () => {
  if (!isSuper()) return toast("슈퍼관리자만 할 수 있습니다");
  const a = state.usageAi; if (!a) return;
  const v = prompt("Anthropic 콘솔의 이번 달 지출(달러)을 적어 주세요. 예: 1.54", "");
  if (v == null) return;
  const usd = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  if (!isFinite(usd) || usd < 0 || usd > 100000) return toast("금액을 숫자로 적어 주세요");
  try {
    await setDoc(doc(db, "meta", "usage"), { claude_adj: { [a.m]: { usd: +(usd - a.est).toFixed(4), actual: usd, at: nowStr(), by: me() } } }, { merge: true });
    toast("실제 금액에 맞췄습니다"); renderUsage(true);
  } catch (e) { toast("저장하지 못했습니다: " + (e.code || e.message)); }
};
// [연결 확인]: 요청을 남기면 1~2분 안에 (Firebase 함수, 예비 5분) GitHub Actions 가 각 API를 실제로 불러 보고 결과를 저장
$("#btnConnCheck").onclick = async () => {
  const b = $("#btnConnCheck");
  if (state.connReq) return toast("이미 연결 확인을 요청했습니다. 잠시만 기다려 주세요");
  try {
    const ref = await addDoc(collection(db, "requests"), { task: "check", companies: "", test_to: "", label: "연결 확인", status: "pending", requested_by: auth.currentUser?.email || "", requested_at: nowStr(), requested_ms: Date.now() });
    state.connReq = { id: ref.id, at: Date.now() };
    const relayed = await pingRelay();
    b.disabled = true; $("span", b).textContent = "확인 중…";
    $("#connNote").innerHTML = `<span class="spinner"></span> 연결 확인 요청됨 · 보통 1~2분 안에 결과가 나옵니다`;
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
  const parts = r.kind === "scan" ? [d.scope === "all" && "전체 업체", d.companies != null && `업체 ${d.companies}`, d.fetched != null && `기사 ${Number(d.fetched).toLocaleString()}건`, d.new_findings != null && `새 이슈 ${d.new_findings}건`, d.seconds != null && `${Math.round(d.seconds)}초`]
    : r.kind === "report" ? [d.error ? "발송 실패" : d.items != null && `이슈 ${d.items}건`, d.to && `받는 사람 ${[].concat(d.to).length}명`, d.test && "테스트"]
    : r.kind === "dart" ? [d.count != null && `기업 ${Number(d.count).toLocaleString()}개`]
    : r.kind === "dartfill" ? [d.count != null && `대상 ${d.count}`, `채움 ${d.filled || 0}`, `고르기 ${d.choose || 0}`, `DART에 없음 ${d.none || 0}`, d.seconds != null && `${Math.round(d.seconds)}초`]
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
const errHint = (msg) => /timed? ?out|timeout|시간 초과/i.test(msg) ? "응답이 늦어 건너뜀: 다음 스캔 때 다시 확인합니다"
  : /429|too many/i.test(msg) ? "요청이 한꺼번에 몰려 잠시 막힘: 다음 스캔 때 다시 확인합니다"
  : /limit|한도|quota/i.test(msg) ? "하루 호출 한도를 넘음: 다음 날 자동으로 다시 확인합니다"
  : /401|403|unauthor|forbidden|key|인증/i.test(msg) ? "키(인증) 문제: GitHub Secrets의 키를 확인하세요"
  : /credit|balance/i.test(msg) ? "API 잔액 부족: Anthropic Console에서 충전"
  : /50[0-9]|bad gateway|unavailable/i.test(msg) ? "상대 서버 일시 오류: 다음 스캔 때 다시 확인합니다"
  : /판정을 주지 않음|예전 등급/.test(msg) ? "등급이 바뀌지 않았을 뿐 이슈는 그대로 보입니다: 따로 할 일은 없습니다" : "";
function renderAdvanced() {
  const KIND = { scan: "스캔", report: "메일 발송", dart: "DART 기업목록 갱신", dartfill: "DART 일괄 조회", dartlookup: "DART 찾기 (업체 추가)", rejudge: "재판정(새 등급 기준)" };
  renderConnections();
  renderUsage();
  // 실행 기록은 모두 보관됨: 첫 화면은 10건만 읽고, 고급을 열면 최근 40건을 한 번 더 읽어 스크롤로 보여 줌
  if (!state.runsMore && !window.__DEMO) {
    state.runsMore = true;
    getDocs(query(collection(db, "runs"), orderBy("at_ms", "desc"), limit(40))).then((q) => { state.runs = docs(q); renderAdvanced(); }).catch(() => {});
  }
  $("#runCount").textContent = state.runs.length ? `최근 ${state.runs.length}건` : "";
  $("#runList").innerHTML = state.runs.map((r) => {
    const d = r.detail || {};
    let errs = Array.isArray(d.errors) ? d.errors : d.error ? [d.error] : [];
    // 예전 재판정 기록은 오류 내용이 없음 → 무슨 뜻인지 설명으로 대신
    if (!r.ok && !errs.length && r.kind === "rejudge") errs = [` / AI 재판정: AI가 기사 ${d.failed || 0}건에 판정을 주지 않음: 그 기사는 예전 등급 그대로 두고 다음 아침에 다시 시도합니다 (3번까지)`];
    const head = `<span class="badge ${r.ok ? "none" : "orange"}">${r.ok ? "정상" : "오류"}</span><b>${esc(KIND[r.kind] || r.kind)}</b><span class="t">${esc(String(r.at || "").slice(5, 16))}</span><span class="s">${esc(runSummary(r))}</span>`;
    if (!errs.length) return `<div class="run">${head}</div>`;
    return `<details class="run run-err"><summary>${head}<span class="go">오류 보기</span></summary><div class="err-list">${errGroups(errs).map((g) => {
      const hint = errHint(g.msg);
      return `<div class="err"><div><b>${esc(g.src)}</b>${g.who.length ? ` <span class="muted">· ${g.who.length}개</span>` : ""}</div>
        ${hint ? `<div class="hint">${esc(hint)}</div>` : ""}<div class="msg">${esc(g.msg)}</div>
        ${g.who.length ? `<div class="who">${esc(g.who.slice(0, 12).join(", "))}${g.who.length > 12 ? ` 외 ${g.who.length - 12}개` : ""}</div>` : ""}</div>`;
    }).join("")}${(d.errors?.length || 0) >= 50 ? `<div class="muted small">오류가 많아 앞의 50건만 보관했습니다.</div>` : ""}</div></details>`;
  }).join("") || `<div class="muted small">아직 실행 기록이 없습니다.</div>`;
}
// ---------- DART 일괄 조회 (빈 정보 채우기) · 동명 기업 고르기 ----------
// 이름이 DART에 정확히 1곳이면 스캔 쪽에서 바로 채우고, 여러 곳이면 후보(dart_cands)를 남김 → 여기서 고름
const dartPending = () => state.companies.filter((c) => Array.isArray(c.dart_cands) && c.dart_cands.length);
function renderDartBar() {
  const n = dartPending().length, b = $("#btnDartPick");
  b.classList.toggle("hidden", !n); b.textContent = `DART 동명 기업 고르기 ${n}`;
  const nc = nameChanged().length, nb = $("#btnNameChg"); nb.classList.toggle("hidden", !nc); nb.textContent = `업체명 변경 ${nc}`;
  const dd = bizDupes().length, db0 = $("#btnBizDup"); db0.classList.toggle("hidden", !dd); db0.textContent = `사업자번호 중복 ${dd}`;
}
// 업체명 변경: 매일 아침 전체 스캔이 DART 기업목록(고유번호 기준)과 비교해 남긴 것
const nameChanged = () => state.companies.filter((c) => c.name_change?.name && c.name_change.name !== c.name);
$("#btnNameChg").onclick = () => {
  const list = nameChanged();
  if (!list.length) return toast("이름이 바뀐 업체가 없습니다");
  modal(`<h2>업체명 변경 <span class="count">${list.length}</span></h2>
    <p class="muted small">DART(고유번호 기준)에 등록된 지금 이름이 우리 명단과 다른 업체입니다. [새 이름으로]를 누르면 이름을 바꾸고 옛 이름은 별칭으로 남겨 옛 기사도 계속 찾습니다.</p>
    <div class="nc-list">${list.map((c) => `<div class="srow nc-row" data-nc="${c.id}"><span><b>${esc(c.name)}</b> → <b>${esc(c.name_change.name)}</b> <span class="muted small">${esc(c.name_change.at?.slice(0, 10) || "")}</span></span>
      <span><button class="btn sm primary" data-nc-ok="${c.id}">새 이름으로</button><button class="btn sm ghost" data-nc-no="${c.id}">무시</button></span></div>`).join("")}</div>`);
  const hideRow = (b) => { const r = b.closest(".nc-row"); if (r) r.style.display = "none"; };
  $$("[data-nc-ok]").forEach((b) => b.onclick = async () => {
    const c = state.companies.find((x) => x.id === b.dataset.ncOk), nn = c.name_change.name;
    if (state.companies.some((x) => x.id !== c.id && normName(x.name) === normName(nn))) return toast(`'${nn}'은(는) 이미 명단에 있는 이름입니다. 두 업체를 하나로 정리해 주세요`, 5000);
    const aliases = [...new Set([...(c.aliases || "").split(",").map((x) => x.trim()).filter(Boolean), c.name])].join(", ");
    const patch = { name: nn, aliases, name_change: null, renamed_from: c.name, renamed_at: nowStr() };
    await updateDoc(doc(db, "companies", c.id), patch); Object.assign(c, patch);
    hideRow(b); toast(`'${nn}'으로 바꾸고 옛 이름을 별칭에 넣었습니다`); renderDartBar();
  });
  $$("[data-nc-no]").forEach((b) => b.onclick = async () => {
    const c = state.companies.find((x) => x.id === b.dataset.ncNo);
    const patch = { name_change: null, name_change_ignored: c.name_change.name };
    await updateDoc(doc(db, "companies", c.id), patch); Object.assign(c, patch);
    hideRow(b); renderDartBar();
  });
};
$("#btnBizDup").onclick = () => {
  const groups = bizDupes();
  if (!groups.length) return toast("중복된 사업자번호가 없습니다");
  modal(`<h2>사업자번호 중복 <span class="count">${groups.length}</span></h2>
    <div class="bd-list">${groups.map((g) => `<div class="bd-row"><span class="bd-no">${esc(fmtBiz(g[0].biz_no))}</span><span class="bd-names">${g.map((c) => `<button type="button" class="bd-co" data-dup-open="${c.id}">${esc(c.name)}${c.engagements?.length ? `<i>사업 ${c.engagements.length}</i>` : ""}</button>`).join("")}</span></div>`).join("")}</div>`);
  $$("[data-dup-open]").forEach((a) => a.onclick = (e) => { e.preventDefault(); closeModal(); openCompany(a.dataset.dupOpen); });
};
$("#btnDartFill").onclick = () => dartFillAll();
function dartFillAll() {
  const n = state.companies.filter((c) => (c.country || "KR") === "KR" && !(c.biz_no && c.name_en)).length;
  if (!n) return toast("사업자번호와 영문명이 빈 국내 업체가 없습니다");
  if (confirm(`DART 일괄 조회: 사업자번호나 영문명이 빈 국내 업체 ${n}개를 DART에서 한꺼번에 찾아 채울까요?\n\n이름이 DART에 1곳만 있으면 바로 채우고, 같은 이름이 여러 곳이면 [DART 동명 기업 고르기]에 모아 둡니다. 최근 30일 안에 'DART에 없음'으로 확인한 업체는 건너뜁니다.`)) { closeModal(); runWorkflow({ task: "dartfill" }, "DART 일괄 조회"); }
}
$("#btnDartPick").onclick = openDartPick;
function openDartPick() {
  const list = dartPending();
  if (!list.length) return toast("고를 후보가 없습니다");
  modal(`<h2>DART 동명 기업 고르기 <span class="count">${list.length}</span></h2>
    <form id="dartPickForm"><div class="dp-list">${list.map((c) => `<div class="dp-co">
      <div class="dp-h"><b>${esc(c.name)}</b>${c.engagements?.length ? `<span class="dp-pj">${esc(c.engagements.map((e) => state.projects.find((p) => p.id === e.project_id)?.name).filter(Boolean).slice(0, 2).join(", "))}</span>` : ""}
        <span class="dp-skip"><label><input type="radio" name="dp-${c.id}" value="" checked><span>나중에</span></label><label><input type="radio" name="dp-${c.id}" value="none"><span>해당 없음</span></label></span></div>
      <div class="dp-cands">${c.dart_cands.map((o, i) => `<label class="dp-cand"><input type="radio" name="dp-${c.id}" value="${i}"><span class="c-ceo">${esc(o.ceo || "-")}</span><span class="c-biz">${esc(o.biz_no ? fmtBiz(o.biz_no) : "-")}</span><span class="c-en" title="${esc(o.name_en || "")}">${esc(o.name_en || "")}</span>${o.listed ? `<span class="tag">상장</span>` : ""}</label>`).join("")}</div></div>`).join("")}</div>
      <div class="actions dp-foot"><button class="btn primary">고른 대로 채우기</button></div></form>`);
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
        if (o.biz_no && !c.biz_no && !bizOwner(o.biz_no, c.id)) { p.biz_no = o.biz_no; p.bizno_source = "DART 선택"; }
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
$("#btnPreview").onclick = async () => {
  const n = state.recipients.length, mine = me();
  modal(`<div class="rp-wrap">
    <div class="form rp-opts">
      <h2>아침 메일</h2>
      <p class="muted small">매일 아침 받는 사람 ${n}명에게 자동으로 갑니다.<br>오른쪽은 내일 아침에 갈 내용입니다.</p>
      <div class="ml-box"><b>나에게만 테스트</b><span class="d">내 주소로 1통만 보냅니다.<br>받는 사람들에게는 가지 않습니다.</span><span class="d ml-addr">${esc(mine)}</span><button type="button" class="btn" id="runTestMail">내 주소로 테스트 메일 받기</button></div>
      <div class="ml-box"><b>받는 사람 모두에게</b><span class="d">아침을 기다리지 않고 지금 보냅니다.<br>보낸 이슈는 내일 메일에서 빠집니다.</span><button type="button" class="btn primary" id="runMailAll" ${n ? "" : "disabled"}>${n}명에게 지금 보내기</button></div>
      <div class="actions"></div>
    </div>
    <div class="rp-prev"><div class="rp-prev-h"><span>미리보기</span><span class="muted small" id="reportMeta">불러오는 중…</span></div><div class="rp-scroll"><iframe id="reportFrame" class="ml-frame" title="메일 미리보기" sandbox="allow-popups allow-popups-to-escape-sandbox"></iframe></div></div>
  </div>`);
  $("#modal").classList.add("report");
  $("#runTestMail").onclick = () => { if (confirm(`${mine} 로 테스트 메일 1통을 보낼까요?\n받는 사람들에게는 가지 않습니다.`)) { closeModal(); runWorkflow({ task: "report-test", test_to: mine }, "테스트 메일 발송"); } };
  $("#runMailAll").onclick = () => { if (confirm(`받는 사람 ${n}명에게 지금 메일을 보낼까요?\n보낸 이슈는 내일 아침 메일에서 빠집니다.`)) { closeModal(); runWorkflow({ task: "report" }, "메일 발송"); } };
  await loadReportPreview();
};

// 추가 키워드 기본값 (v5: ★·등급 칸 없앰: 기본 키워드와 겹치거나 너무 일반적인 단어·영문 단어는 정리)
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
  state, esc, info, isMine, mineLabel, ICON_USER, ICON_ORG,
  getScope: () => { scopeCompanies(); return scope; },
  setScope: (v) => { scope = v; try { localStorage.setItem("edcf_scope2", scope); } catch {} },
  companyTally: (pid) => { const t = { red: 0, orange: 0, none: 0, total: 0 }; state.companies.forEach((c) => { if (c.engagements.some((e) => e.project_id === pid)) { t[scanned() ? c.risk : "none"]++; t.total++; } }); return t; },
});
$("#geoScan").onclick = () => $("#btnScan").click(); // 같은 스캔 (업체·수원국 정보를 함께 새로 받음)

// 계정 메뉴: 바깥을 누르면 닫힘
document.addEventListener("click", (e) => { const a = $("#acct"); if (a?.open && !a.contains(e.target)) a.open = false; });

// 계정 메뉴의 [설정]: 관리자 모드로 들어가 설정 화면을 바로 엶


// 상단 업체 검색: 누구나 업체명·별칭·영문명·사업자번호로 찾아 상태(등급·이슈)를 바로 봄
{
  const box = $("#coFind"), sug = $("#coFindSug"), norm = (x) => String(x || "").toLowerCase().replace(/\s+/g, "");
  const find = () => {
    const q = norm(box.value), qd = q.replace(/\D/g, "");
    if (!q) return [];
    return state.companies.filter((c) => norm(c.name).includes(q) || norm(c.name_official).includes(q) || norm(c.aliases).includes(q) || norm(c.name_en).includes(q) || (qd.length >= 4 && String(c.biz_no || "").includes(qd)))
      .sort((a, b) => (norm(b.name).startsWith(q) - norm(a.name).startsWith(q)) || (LV[b.risk] - LV[a.risk]) || a.name.localeCompare(b.name)).slice(0, 8);
  };
  const pick = (c) => { box.value = ""; sug.classList.add("hidden"); box.blur(); openCompany(c.id); };
  const show = () => {
    const hits = find(), sc = scanned();
    sug.innerHTML = hits.map((c, i) => `<button type="button" data-fi="${i}"><b>${esc(c.name_official || c.name)}</b><span class="cf-r">${c.open ? `<i>미확인 ${c.open}</i>` : ""}${sc ? badge(c.risk) : ""}</span></button>`).join("") || (box.value.trim() ? `<div class="muted small">명단에 없는 업체입니다</div>` : "");
    sug.classList.toggle("hidden", !sug.innerHTML);
    $$("[data-fi]", sug).forEach((b) => b.onmousedown = (e) => { e.preventDefault(); pick(hits[+b.dataset.fi]); });
  };
  box.oninput = show; box.onfocus = show; box.addEventListener("compositionupdate", () => setTimeout(show, 0));
  box.onblur = () => setTimeout(() => sug.classList.add("hidden"), 150);
  box.onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) { const h = find(); if (h.length) pick(h[0]); } else if (e.key === "Escape") { box.value = ""; sug.classList.add("hidden"); } };
}
