// EDCF 업체 모니터링 — GitHub Pages + Firebase (심플 버전)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ALLOWED_EMAILS, GITHUB_REPO } from "./firebase-config.js";

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
const LV = { red: 3, orange: 2, yellow: 1, none: 0 };
const COUNTRY = { TZ: "탄자니아", PK: "파키스탄", KE: "케냐", MN: "몽골", LA: "라오스", ID: "인도네시아", KR: "한국", VN: "베트남", KH: "캄보디아", BD: "방글라데시", PH: "필리핀", UZ: "우즈베키스탄", ET: "에티오피아", GH: "가나", MM: "미얀마", LK: "스리랑카", NP: "네팔", RW: "르완다", UG: "우간다", TN: "튀니지", EG: "이집트", BO: "볼리비아", PY: "파라과이", CO: "콜롬비아", PE: "페루", EC: "에콰도르", GT: "과테말라", SN: "세네갈", MZ: "모잠비크", CM: "카메룬", NG: "나이지리아", TR: "튀르키예", UA: "우크라이나", GE: "조지아", AZ: "아제르바이잔", KZ: "카자흐스탄", KG: "키르기스스탄", TJ: "타지키스탄", TL: "동티모르" };
const COUNTRY_BY_NAME = { ...Object.fromEntries(Object.entries(COUNTRY).map(([k, v]) => [v, k])), 카라치: "PK", 이슬라마바드: "PK", 나이로비: "KE", 다르에스살람: "TZ", 울란바토르: "MN", 비엔티안: "LA", 자카르타: "ID", 하노이: "VN", 프놈펜: "KH", 다카: "BD", 마닐라: "PH", 타슈켄트: "UZ" };
const badge = (lv) => `<span class="badge ${lv || "none"}">${LEVEL[lv || "none"]}</span>`;
const state = { projects: [], companies: [], findings: [], keywords: [], recipients: [], status: {}, runs: [] };

function toast(msg, ms = 2800) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
}
function modal(html) { $("#modal").innerHTML = html + `<div class="actions"><button class="btn" id="modalClose">닫기</button></div>`; $("#modalBg").classList.add("open"); $("#modalClose").onclick = closeModal; }
function closeModal() { $("#modalBg").classList.remove("open"); }
$("#modalBg").addEventListener("click", (e) => { if (e.target.id === "modalBg") closeModal(); });
const projName = (pid) => state.projects.find((p) => p.id === pid)?.name || "(삭제된 사업)";
const engLine = (e) => `${esc(projName(e.project_id))} · ${esc(e.role)}${e.stage !== "계약" ? ` · ${esc(e.stage)}${e.rank ? " " + e.rank + "순위" : ""}` : ""}`;
const nowStr = () => new Date(Date.now() + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 19); // KST
const guessCountry = (t) => Object.entries(COUNTRY_BY_NAME).find(([n]) => t.includes(n))?.[1] || null;

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
    let v = "home"; try { v = localStorage.getItem("view2") || v; } catch {}
    showView(v);
  } catch (e) {
    console.error(e);
    showView("home");
    showGuide(`<b>데이터를 불러오지 못했습니다</b> (${esc(e.code || e.message)})<br>Firebase 콘솔 → Firestore Database → 규칙 탭에 <code>firestore.rules</code> 내용을 붙여넣고 [게시]했는지 확인하세요.`);
  }
});

// ---------- 데이터 ----------
const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
async function loadAll() {
  const [p, c, f, k, r, st, runs] = await Promise.all([
    getDocs(collection(db, "projects")),
    getDocs(collection(db, "companies")),
    getDocs(query(collection(db, "findings"), where("relevant", "==", true))),
    getDocs(collection(db, "keywords")),
    getDocs(collection(db, "recipients")),
    getDoc(doc(db, "meta", "status")),
    getDocs(query(collection(db, "runs"), orderBy("at_ms", "desc"), limit(10))),
  ]);
  state.projects = docs(p).sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || a.name.localeCompare(b.name));
  state.companies = docs(c);
  state.findings = docs(f);
  state.keywords = docs(k);
  state.recipients = docs(r);
  state.status = st.exists() ? st.data() : {};
  state.runs = docs(runs);
  if (!state.keywords.length) await loadDefaultKeywords();
  compute();
}
function compute() {
  for (const c of state.companies) {
    c.engagements = c.engagements || [];
    const fs = state.findings.filter((f) => f.company_id === c.id && f.status !== "dismissed");
    c.risk = fs.reduce((m, f) => (LV[f.level] || 0) > (LV[m] || 0) ? f.level : m, "none");
    c.open = fs.filter((f) => f.status === "new").length;
  }
}
const byLevelDate = (a, b) => (LV[b.level] - LV[a.level]) || String(b.published_at || "").localeCompare(String(a.published_at || ""));

// ---------- 화면 전환 ----------
$$("#tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
function showView(v) {
  if (!$(`#view-${v}`)) v = "home";
  $$("#tabs button").forEach((x) => x.classList.toggle("active", x.dataset.view === v));
  $$(".view").forEach((x) => x.classList.toggle("active", x.id === `view-${v}`));
  try { localStorage.setItem("view2", v); } catch {}
  v === "home" ? renderHome() : renderSettings();
}
const rerender = () => { compute(); showView($("#tabs button.active")?.dataset.view || "home"); if (state.openCid && $("#drawer").classList.contains("open")) openCompany(state.openCid); };
$("#btnRefresh").onclick = async () => { await loadAll(); rerender(); toast("최신 데이터로 새로고침했습니다"); };
function showGuide(html) { const g = $("#guide"); g.innerHTML = html; g.classList.toggle("hidden", !html); }

// ---------- 현황 ----------
function renderHome() {
  const cs = state.companies, s = state.status;
  $("#sumTitle").textContent = `업체 ${cs.length}개 · 사업 ${state.projects.length}개`;
  $("#sumSub").textContent = s.last_scan_at ? `마지막 스캔 ${s.last_scan_at.slice(0, 16)} · 매일 07:30 자동 스캔` : "아직 스캔하지 않았습니다";
  const cnt = (lv) => cs.filter((c) => c.risk === lv).length;
  $("#pills").innerHTML = s.last_scan_at
    ? ["red", "orange", "yellow"].map((lv) => `<span class="pill ${lv}">${LEVEL[lv]} ${cnt(lv)}</span>`).join("") + `<span class="pill none">정상 ${cnt("none")}</span>`
    : "";

  if (!cs.length) showGuide(`<b>시작하기</b><ol><li><b>설정</b> 탭에서 업체를 추가하세요.</li><li>여기로 돌아와 <b>지금 스캔</b>을 누르세요.</li></ol>`);
  else if (!s.last_scan_at) showGuide(`업체 ${cs.length}개가 등록됐습니다. <b>지금 스캔</b>을 눌러 첫 스캔을 실행하세요.`);
  else showGuide("");

  const open = state.findings.filter((f) => f.status === "new").sort(byLevelDate);
  const done = state.findings.filter((f) => f.status === "reviewed").sort(byLevelDate);
  $("#issueCount").textContent = open.length ? `(${open.length})` : "";
  if (open.length) renderFeed(open, $("#feed"));
  else $("#feed").innerHTML = s.last_scan_at ? `<div class="ok-box">✓ 확인이 필요한 이슈가 없습니다</div>` : `<div class="empty">스캔 후 여기에 이슈가 표시됩니다.</div>`;
  $("#doneWrap").classList.toggle("hidden", !done.length);
  if (done.length) renderFeed(done, $("#feedDone"));

  $("#projectMap").innerHTML = state.projects.map((p) => {
    const rows = [];
    for (const c of cs) for (const e of c.engagements) if (e.project_id === p.id) rows.push({ c, e });
    const worst = rows.reduce((m, r) => LV[r.c.risk] > LV[m] ? r.c.risk : m, "none");
    const roles = [...new Set(rows.map((r) => r.e.role))];
    return `<div class="pcard">
      <div class="pcard-title"><span class="dot ${worst}"></span>${esc(p.name)} <span class="flag">${esc(COUNTRY[p.country] || "")}</span></div>
      ${roles.map((role) => `<div class="role-group"><div class="role-label">${esc(role)}</div>${rows.filter((r) => r.e.role === role).map(({ c, e }) =>
        `<span class="cchip ${c.risk}" data-cid="${c.id}"><span class="dot ${c.risk}"></span>${esc(c.name)}${e.stage !== "계약" ? ` <span class="muted">(${esc(e.stage)}${e.rank ? " " + e.rank + "순위" : ""})</span>` : ""}</span>`).join("")}</div>`).join("") || `<div class="muted small">연결된 업체 없음</div>`}
    </div>`;
  }).join("") || `<div class="empty">등록된 사업이 없습니다.</div>`;
  $$("#projectMap .cchip").forEach((x) => x.addEventListener("click", () => openCompany(x.dataset.cid)));
}

function findingHtml(f, showCompany = true) {
  const official = f.source_type !== "news";
  return `<div class="item ${f.status === "reviewed" ? "reviewed" : ""}" data-fid="${esc(f.id)}">
    <div class="item-head">
      ${badge(f.level)}
      ${showCompany ? `<span class="item-company" data-cid="${f.company_id}">${esc(f.company_name)}</span>` : ""}
      ${official ? `<span class="tag official">${f.source_type === "manual" ? "수기 등록" : "공식 제재리스트"}</span>` : ""}
      ${f.category ? `<span class="tag">${esc(f.category)}</span>` : ""}
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
  el.innerHTML = list.map((f) => findingHtml(f, showCompany)).join("");
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

// ---------- 업체 상세 ----------
function openCompany(cid) {
  const c = state.companies.find((x) => x.id === cid);
  if (!c) return;
  state.openCid = cid;
  const fs = state.findings.filter((f) => f.company_id === cid && f.status !== "dismissed").sort(byLevelDate);
  const dismissed = state.findings.filter((f) => f.company_id === cid && f.status === "dismissed");
  $("#drawerTitle").innerHTML = `<div class="t">${esc(c.name)} ${badge(c.risk)}</div><div class="muted small">${c.engagements.map(engLine).join(" / ")}</div>`;
  $("#drawerBody").innerHTML = `
    <div class="actions left" style="margin-top:0">
      <button class="btn primary" id="dScan">이 업체만 다시 스캔</button>
      <a class="btn" target="_blank" rel="noopener" href="https://search.naver.com/search.naver?where=news&query=${encodeURIComponent('"' + c.name + '"')}">네이버 뉴스 ↗</a>
    </div>
    <h2 style="margin-top:18px">이슈 (${fs.length})</h2>
    <div id="dFeed" class="feed" style="max-height:none">${fs.length ? "" : `<div class="empty">발견된 이슈가 없습니다.</div>`}</div>
    ${dismissed.length ? `<details class="more"><summary>관련 없음 처리한 기사 ${dismissed.length}건</summary><div id="dDismissed" class="feed" style="max-height:none"></div></details>` : ""}
    <details class="more">
      <summary>검색 정확도 높이기 (영문명·별칭·보조 키워드)</summary>
      <p class="muted small">동명 업체 기사가 섞이면 <b>보조 키워드</b>(업종·대표자명)를, 해외 기사를 보려면 <b>영문명</b>을 넣으세요.</p>
      <form id="advForm" class="form">
        <div class="row"><label>영문명<input name="name_en" value="${esc(c.name_en || "")}"></label><label>별칭 (쉼표 구분)<input name="aliases" value="${esc(c.aliases || "")}"></label></div>
        <label>보조 키워드<input name="context_keywords" value="${esc(c.context_keywords || "")}" placeholder="예: 감리, 엔지니어링, 대표자명"></label>
        <div class="row"><label>검색 언어<input name="search_langs" value="${esc(c.search_langs || "ko")}" placeholder="ko,en,id"></label><label>메모<input name="note" value="${esc(c.note || "")}"></label></div>
        <div class="actions"><button class="btn primary">저장</button></div>
      </form>
    </details>
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
    </details>`;
  if (fs.length) renderFeed(fs, $("#dFeed"), false);
  if (dismissed.length) renderFeed(dismissed, $("#dDismissed"), false);
  $("#dScan").onclick = () => scanGuide(c.name);
  $("#advForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target));
    const patch = Object.fromEntries(Object.entries(fd).map(([k, v]) => [k, v.trim() || null]));
    if (patch.name_en && !(patch.search_langs || "").includes("en")) patch.search_langs = (patch.search_langs || "ko") + ",en";
    await updateDoc(doc(db, "companies", cid), patch); Object.assign(c, patch);
    toast("저장했습니다. 다음 스캔부터 적용됩니다");
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

// ---------- 스캔 안내 ----------
function scanGuide(companyName) {
  if (companyName) navigator.clipboard?.writeText(companyName).catch(() => {});
  modal(`<h2>${companyName ? `'${esc(companyName)}' 다시 스캔` : "지금 스캔"}</h2>
    <p class="muted small">스캔은 GitHub에서 실행됩니다(매일 07:30 자동). 지금 바로 하려면:</p>
    <ol>
      <li>아래 <b>[GitHub에서 실행하기]</b> 클릭</li>
      <li>오른쪽 회색 <b>Run workflow ▾</b> 클릭</li>
      ${companyName ? `<li><b>특정 업체만 스캔</b> 칸에 붙여넣기(Ctrl+V) — <code>${esc(companyName)}</code> 복사돼 있음</li>` : ""}
      <li>초록 <b>Run workflow</b> 클릭 → 5분쯤 뒤 초록 체크 ✓</li>
      <li>이 화면에서 <b>↻ 새로고침</b></li>
    </ol>
    <a class="btn primary" href="${ACTIONS_URL}" target="_blank" rel="noopener">GitHub에서 실행하기 ↗</a>`);
}
$("#btnScan").onclick = () => scanGuide(null);

// ---------- 설정 ----------
function renderSettings() {
  // 업체 추가 폼의 사업 선택
  const sel = $("#addForm [name=project]"), cur = sel.value;
  sel.innerHTML = state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("") + `<option value="__new">+ 새 사업 추가</option>`;
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  else if (!state.projects.length) sel.value = "__new";
  $("#addForm [name=newProject]").classList.toggle("hidden", sel.value !== "__new");

  // 등록 업체 (사업별)
  $("#companyCount").textContent = `(${state.companies.length})`;
  const groups = state.projects.map((p) => ({ p, rows: state.companies.flatMap((c) => c.engagements.map((e, i) => ({ c, e, i })).filter(({ e }) => e.project_id === p.id)) }));
  const orphans = state.companies.filter((c) => !c.engagements.length);
  $("#companyList").innerHTML = groups.map(({ p, rows }) => `<div class="cgroup">
      <div class="cgroup-title">${esc(p.name)} <span class="muted small">${esc(COUNTRY[p.country] || "")}</span>
        <button class="btn sm ghost" data-del-proj="${p.id}" title="사업 삭제">삭제</button></div>
      ${rows.map(({ c, e, i }) => `<div class="crow">${badge(c.risk)}<span class="nm" data-cid="${c.id}">${esc(c.name)}</span>
        <span class="muted">${esc(e.role)}${e.stage !== "계약" ? " · " + esc(e.stage) + (e.rank ? " " + e.rank + "순위" : "") : ""}</span>
        <button class="btn sm ghost rm" data-unlink="${c.id}|${i}" title="이 사업에서 빼기">✕</button></div>`).join("") || `<div class="muted small">업체 없음</div>`}
    </div>`).join("")
    + (orphans.length ? `<div class="cgroup"><div class="cgroup-title muted">사업 미연결</div>${orphans.map((c) => `<div class="crow"><span class="nm" data-cid="${c.id}">${esc(c.name)}</span><button class="btn sm ghost rm" data-del="${c.id}">삭제</button></div>`).join("")}</div>` : "")
    || `<div class="empty">등록된 업체가 없습니다.</div>`;
  $$("#companyList .nm").forEach((x) => x.onclick = () => openCompany(x.dataset.cid));
  $$("[data-unlink]").forEach((b) => b.onclick = async () => {
    const [cid, i] = b.dataset.unlink.split("|");
    const c = state.companies.find((x) => x.id === cid);
    if (!confirm(`'${c.name}'을(를) 이 사업에서 뺄까요?`)) return;
    c.engagements.splice(+i, 1);
    if (c.engagements.length) await updateDoc(doc(db, "companies", cid), { engagements: c.engagements });
    else await deleteCompany(cid);
    rerender();
  });
  $$("[data-del]").forEach((b) => b.onclick = async () => { if (confirm("업체를 삭제할까요?")) { await deleteCompany(b.dataset.del); rerender(); } });
  $$("[data-del-proj]").forEach((b) => b.onclick = async () => {
    const pid = b.dataset.delProj;
    if (!confirm(`'${projName(pid)}' 사업을 삭제할까요? (이 사업에만 있던 업체도 함께 삭제)`)) return;
    for (const c of [...state.companies]) {
      if (!c.engagements.some((e) => e.project_id === pid)) continue;
      c.engagements = c.engagements.filter((e) => e.project_id !== pid);
      if (c.engagements.length) await updateDoc(doc(db, "companies", c.id), { engagements: c.engagements });
      else await deleteCompany(c.id);
    }
    await deleteDoc(doc(db, "projects", pid));
    state.projects = state.projects.filter((p) => p.id !== pid);
    rerender();
  });

  // 수신자
  $("#rcList").innerHTML = state.recipients.map((r) => `<div class="srow"><span>${esc(r.email)}</span><button class="btn sm ghost" data-del-rc="${r.id}">삭제</button></div>`).join("") || `<div class="muted small">아직 없습니다.</div>`;
  $$("[data-del-rc]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "recipients", b.dataset.delRc)); state.recipients = state.recipients.filter((r) => r.id !== b.dataset.delRc); renderSettings(); });

  renderAdvanced();
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

$("#addForm [name=project]").addEventListener("change", (e) => $("#addForm [name=newProject]").classList.toggle("hidden", e.target.value !== "__new"));

// 업체/사업 등록 공통
function cleanCompanyName(raw) {
  let rank = null, name = raw;
  const m = name.match(/\(\s*(\d+)\s*순위\s*\)/);
  if (m) { rank = +m[1]; name = name.replace(m[0], ""); }
  name = name.replace(/주식회사|\(주\)|㈜/g, "").replace(/\s+/g, " ").trim();
  return { name, rank };
}
async function registerRows(rows) {
  const batch = writeBatch(db);
  const pByName = Object.fromEntries(state.projects.map((p) => [p.name, p]));
  const norm = (s) => s.replace(/\s+/g, "");
  const cByName = Object.fromEntries(state.companies.map((c) => [norm(c.name), c]));
  const touched = new Set();
  let newP = 0, newC = 0, links = 0;
  for (const r of rows) {
    let p = pByName[r.project];
    if (!p) {
      const ref = doc(collection(db, "projects"));
      p = { id: ref.id, name: r.project, country: guessCountry(r.project), created_at: nowStr() };
      batch.set(ref, { name: p.name, country: p.country, created_at: p.created_at });
      pByName[p.name] = p; state.projects.push(p); newP++;
    }
    const foreign = /^PT[.\s]/i.test(r.name) || /^[A-Za-z0-9 .,&()'-]+$/.test(r.name);
    let c = cByName[norm(r.name)];
    if (!c) {
      const ref = doc(collection(db, "companies"));
      const en = foreign ? r.name.replace(/^PT[.\s]+/i, "").trim() : null;
      c = { id: ref.id, name: r.name, name_en: en, aliases: en && en !== r.name ? en : null, context_keywords: null,
            country: foreign ? (p.country || "") : "KR", search_langs: foreign ? (p.country === "ID" ? "en,id" : "en") : "ko",
            corp_code: null, biz_no: null, ceo: null, note: null, engagements: [], created_at: nowStr() };
      cByName[norm(c.name)] = c; state.companies.push(c); newC++;
    }
    if (!c.engagements.some((e) => e.project_id === p.id && e.role === r.role)) {
      c.engagements.push({ project_id: p.id, role: r.role, stage: r.rank || r.priority ? "우선협상" : "계약", rank: r.rank || null }); links++;
    }
    touched.add(c);
  }
  for (const c of touched) {
    const { id, risk, open, ...data } = c;
    batch.set(doc(db, "companies", id), data, { merge: true });
  }
  await batch.commit();
  return { newP, newC, links };
}

$("#addForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const fd = Object.fromEntries(new FormData(ev.target));
  const project = fd.project === "__new" ? (fd.newProject || "").trim() : projName(fd.project);
  if (!project) return toast("사업명을 입력하세요");
  const { name, rank } = cleanCompanyName(fd.name);
  if (!name) return;
  try {
    const r = await registerRows([{ project, role: fd.role, name, rank, priority: !!fd.priority }]);
    toast(r.links ? `'${name}' 추가했습니다` : "이미 등록된 업체입니다");
    ev.target.name.value = ""; ev.target.priority.checked = false; ev.target.newProject.value = "";
    rerender();
    const np = state.projects.find((p) => p.name === project); if (np) $("#addForm [name=project]").value = np.id;
    $("#addForm [name=newProject]").classList.add("hidden");
    ev.target.name.focus();
  } catch (e) { toast("저장 실패: " + e.message, 5000); }
};

// 여러 줄 붙여넣기: "사업명 | 구분 | 업체명" (탭/쉼표/| 모두 허용)
function parseImport(text) {
  const rows = [], errors = [];
  let last = "";
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let cols = line.includes("|") ? line.split("|") : line.includes("\t") ? line.split("\t") : line.split(",");
    cols = cols.map((s) => s.trim());
    if (cols.length < 3) { errors.push(`${i + 1}번째 줄: "사업명 | 구분 | 업체명" 형식이 아닙니다`); return; }
    let [project, role, raw] = cols;
    if (/사업명/.test(project) && /업체/.test(raw)) return;
    if (project) last = project; else project = last;
    if (!project || !raw) { errors.push(`${i + 1}번째 줄: 사업명 또는 업체명이 비어 있습니다`); return; }
    const { name, rank } = cleanCompanyName(raw);
    rows.push({ project, role: role || "컨설턴트", name, rank });
  });
  return { rows, errors };
}
let parsed = null;
$("#btnImportPreview").onclick = () => {
  parsed = parseImport($("#importText").value);
  const { rows, errors } = parsed;
  const have = new Set(state.companies.map((c) => c.name.replace(/\s+/g, "")));
  $("#importPreview").innerHTML = (errors.length ? `<div class="notice">${errors.map(esc).join("<br>")}</div>` : "") +
    (rows.length ? `<table class="tbl"><thead><tr><th>사업</th><th>구분</th><th>업체</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr>
      <td class="small">${esc(r.project)}</td><td class="small">${esc(r.role)}${r.rank ? ` · 우선협상 ${r.rank}순위` : ""}</td>
      <td><b>${esc(r.name)}</b></td><td class="small muted">${have.has(r.name.replace(/\s+/g, "")) ? "기존 업체" : "신규"}</td></tr>`).join("")}</tbody></table>` : "");
  $("#btnImportRun").disabled = !rows.length;
  $("#btnImportRun").textContent = rows.length ? `${rows.length}건 등록하기` : "등록하기";
};
$("#btnImportRun").onclick = async () => {
  if (!parsed?.rows.length) return;
  $("#btnImportRun").disabled = true;
  try {
    const r = await registerRows(parsed.rows);
    toast(`등록 완료: 사업 ${r.newP}개 · 업체 ${r.newC}개 추가`, 4000);
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

// ---------- 고급 ----------
const DEFAULT_KEYWORDS = [
  ["부정당업자", "red", "ko", 1], ["입찰참가자격 제한", "red", "ko", 0], ["입찰 참가 제한", "red", "ko", 0], ["영업정지", "red", "ko", 0],
  ["회생절차", "red", "ko", 0], ["법정관리", "red", "ko", 0], ["부도", "red", "ko", 0],
  ["담합", "orange", "ko", 1], ["과징금", "orange", "ko", 1], ["압수수색", "orange", "ko", 1], ["기소", "orange", "ko", 0], ["구속", "orange", "ko", 0],
  ["뇌물", "orange", "ko", 1], ["횡령", "orange", "ko", 1], ["배임", "orange", "ko", 0], ["허위", "orange", "ko", 0], ["공정위", "orange", "ko", 0], ["제재", "orange", "ko", 1],
  ["의혹", "yellow", "ko", 0], ["고발", "yellow", "ko", 0], ["중대재해", "yellow", "ko", 0], ["부실시공", "yellow", "ko", 0], ["소송", "yellow", "ko", 0],
  ["debar", "red", "en", 0], ["sanction", "orange", "en", 0], ["bribery", "orange", "en", 0], ["corruption", "orange", "en", 0], ["fraud", "orange", "en", 0],
  ["collusion", "orange", "en", 0], ["bid rigging", "orange", "en", 0], ["korupsi", "orange", "id", 0], ["tersangka", "orange", "id", 0], ["suap", "orange", "id", 0],
];
async function loadDefaultKeywords() {
  const batch = writeBatch(db);
  for (const [word, level, lang, q] of DEFAULT_KEYWORDS) {
    const ref = doc(collection(db, "keywords"));
    const data = { word, level, lang, use_in_query: q };
    batch.set(ref, data); state.keywords.push({ id: ref.id, ...data });
  }
  await batch.commit();
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
  const s = state.status, c = s.connections || {}, known = !!s.connections;
  const lists = s.sanction_lists ? Object.entries(s.sanction_lists).map(([k, v]) => `${k} ${v}`).join(", ") : "";
  const rows = [
    ["Firebase (데이터 저장)", true, "연결됨 — 이 화면이 보이면 정상"],
    ["Google 뉴스", c.google_news ?? true, "키 불필요"],
    ["네이버 뉴스", c.naver, "Secret: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET"],
    ["메일 발송", c.smtp, "Secret: SMTP_USER / SMTP_PASSWORD"],
    ["MDB 제재리스트", !!lists && !/오류/.test(lists), lists || "스캔 때 자동으로 내려받음"],
    ["AI 판정 (Claude)", c.claude, c.claude ? `모델 ${s.claude_model}` : "Secret: ANTHROPIC_API_KEY (없으면 키워드 규칙 판정)"],
    ["DART 기업정보", c.dart, "Secret: DART_API_KEY (선택)"],
  ];
  $("#connList").innerHTML = (known ? "" : `<div class="notice">아직 스캔이 실행되지 않아 GitHub 쪽 연결 상태를 알 수 없습니다.</div>`) +
    rows.map(([k, ok, d], i) => `<div class="conn"><div><div class="k">${k}</div><div class="d">${esc(d)}</div></div>${i === 0 || known ? (ok ? `<span class="badge none">연결됨</span>` : `<span class="badge yellow">미설정</span>`) : `<span class="badge yellow">확인 전</span>`}</div>`).join("");
  const KIND = { scan: "스캔", report: "메일 발송", dart: "DART" };
  $("#runList").innerHTML = state.runs.map((r) => `<div class="run"><b>${esc(KIND[r.kind] || r.kind)}</b> · ${esc(r.at)} ${r.ok ? `<span class="badge none">정상</span>` : `<span class="badge orange">일부 오류</span>`}<pre>${esc(JSON.stringify(r.detail, null, 1)).slice(0, 1200)}</pre></div>`).join("") || `<div class="muted small">아직 실행 기록이 없습니다.</div>`;
  $("#kwList").innerHTML = [...state.keywords].sort((a, b) => (LV[b.level] - LV[a.level]) || a.word.localeCompare(b.word))
    .map((k) => `<span class="kchip">${badge(k.level)} ${esc(k.word)}<button data-del-kw="${k.id}" title="삭제">✕</button></span>`).join("");
  $$("[data-del-kw]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "keywords", b.dataset.delKw)); state.keywords = state.keywords.filter((k) => k.id !== b.dataset.delKw); renderAdvanced(); });
  loadReportPreview();
}
async function loadReportPreview() {
  const snap = await getDoc(doc(db, "meta", "report_preview"));
  const d = snap.exists() ? snap.data() : null;
  $("#reportFrame").srcdoc = d?.html || `<p style="font-family:sans-serif;color:#667085;padding:24px">스캔을 한 번 실행하면 메일 미리보기가 만들어집니다.</p>`;
  $("#reportMeta").textContent = d ? `${d.generated_at} 생성 · 신규 ${d.items}건` : "";
}
