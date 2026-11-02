// EDCF 부정당업자 모니터링 — GitHub Pages + Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ALLOWED_EMAILS, GITHUB_REPO } from "./firebase-config.js?v=4";

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
const state = { projects: [], companies: [], findings: [], keywords: [], recipients: [], status: {}, runs: [] };

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
  v === "home" ? renderHome() : renderSettings();
}
const rerender = () => { compute(); showView($("#tabs button.active")?.dataset.view || "home"); if (state.openCid && $("#drawer").classList.contains("open")) openCompany(state.openCid); };
$("#btnRefresh").onclick = async () => { await loadAll(); rerender(); toast("최신 데이터로 새로고침했습니다"); };
function showGuide(html) { const g = $("#guide"); g.innerHTML = html; g.classList.toggle("hidden", !html); }

// ---------- 현황 ----------
function renderHome() {
  const cs = state.companies, s = state.status;
  $("#sumSub").textContent = scanned()
    ? `마지막 스캔 ${s.last_scan_at.slice(0, 16)} · ${s.analyzer === "claude" ? "AI 판정" : "키워드 판정"} · 매일 07:30 자동 스캔`
    : "아직 스캔하지 않았습니다 · 매일 07:30 자동 스캔";

  if (!cs.length) showGuide(`<b>시작하기</b><ol><li><b>설정</b> 탭에서 사업과 업체를 추가하세요.</li><li>여기로 돌아와 <b>지금 스캔</b>을 누르세요.</li></ol>`);
  else if (!scanned()) showGuide(`업체 ${cs.length}개가 등록됐습니다. 오른쪽 위 <b>지금 스캔</b>을 눌러 첫 스캔을 실행하세요.`);
  else showGuide("");

  // KPI 보드: 전체 → 위험/경고/주의 → 비고(확인할 이슈)
  const cnt = (lv) => cs.filter((c) => c.risk === lv).length;
  const open = state.findings.filter((f) => f.status === "new").sort(byLevelDate);
  const n = { red: cnt("red"), orange: cnt("orange"), yellow: cnt("yellow"), none: cnt("none") };
  const riskTotal = n.red + n.orange + n.yellow;
  const pct = (v) => cs.length ? (v / cs.length) * 100 : 0;
  $("#kboard").innerHTML = `
    <div class="kb kb-total">
      <div class="label">모니터링 업체</div>
      <div class="value">${cs.length}</div>
      <div class="hint">${state.projects.length}개 사업${scanned() ? ` · 정상 ${n.none}` : " · 스캔 전"}</div>
    </div>
    <div class="kb kb-risks">
      <div class="kb-risks-head"><span>리스크 업체 (등급별)</span><span>${scanned() ? `총 ${riskTotal}개` : "스캔 전"}</span></div>
      <div class="kb-cells">
        ${["red", "orange", "yellow"].map((lv) => `<div class="kb-cell ${lv} ${scanned() && n[lv] ? "on" : ""}">
          <div class="lv"><span class="dot ${lv}"></span>${LEVEL[lv]}</div>
          <div class="value">${scanned() ? n[lv] : "-"}</div>
          <div class="hint">${LEVEL_DESC[lv]}</div></div>`).join("")}
      </div>
      <div class="kb-bar" title="전체 업체 중 등급별 비율">${scanned() ? ["red", "orange", "yellow", "none"].map((lv) => `<i class="${lv}" style="width:${pct(n[lv])}%"></i>`).join("") : ""}</div>
    </div>
    <div class="kb kb-note">
      <span class="tag-note">비고</span>
      <div class="label">확인할 이슈</div>
      <div class="value">${open.length}<span class="hint" style="font-size:13px;font-weight:600"> 건</span></div>
      <div class="hint">'확인했음/관련 없음' 처리 전 기사·기록</div>
    </div>`;

  // 등급별 업체
  const groupHtml = (lv, list) => {
    if (lv === "none" || lv === "pending") {
      return `<div class="rgroup ${lv}"><div class="rgroup-head">${lv === "pending" ? "스캔 전" : "정상"} <span class="desc">${lv === "pending" ? "아직 스캔하지 않음" : LEVEL_DESC.none}</span><span class="n">${list.length}개</span></div>
        <div class="rgroup-body"><div class="chipwrap">${list.map((c) => `<span class="nchip" data-cid="${c.id}">${esc(c.name)}</span>`).join("") || `<span class="muted small">없음</span>`}</div></div></div>`;
    }
    return `<div class="rgroup ${lv}"><div class="rgroup-head">${LEVEL[lv]} <span class="desc">${LEVEL_DESC[lv]}</span><span class="n">${list.length}개</span></div>
      <div class="rgroup-body">${list.map((c) => `<div class="rrow" data-cid="${c.id}">
        <div><div class="rname">${esc(c.name)}</div><div class="rmeta">${c.engagements.map(engText).join("<br>") || "-"}</div></div>
        <div class="issues">이슈 ${c.total}${c.open ? ` · 미확인 ${c.open}` : ""}</div></div>`).join("") || `<div class="muted small" style="padding:8px 0">해당 업체 없음</div>`}</div></div>`;
  };
  const sorted = [...cs].sort((a, b) => a.name.localeCompare(b.name));
  $("#riskGroups").innerHTML = !cs.length ? `<div class="empty">등록된 업체가 없습니다.</div>`
    : !scanned() ? groupHtml("pending", sorted)
    : ["red", "orange", "yellow"].map((lv) => groupHtml(lv, sorted.filter((c) => c.risk === lv))).join("") + groupHtml("none", sorted.filter((c) => c.risk === "none"));
  $$("#riskGroups [data-cid]").forEach((x) => x.addEventListener("click", () => openCompany(x.dataset.cid)));

  // 이슈
  const done = state.findings.filter((f) => f.status === "reviewed").sort(byLevelDate);
  $("#issueCount").textContent = open.length;
  if (open.length) renderFeed(open, $("#feed"));
  else $("#feed").innerHTML = scanned() ? `<div class="ok-box">✓ 확인이 필요한 이슈가 없습니다</div>` : `<div class="empty">스캔 후 이곳에 이슈가 출처와 함께 표시됩니다.</div>`;
  $("#doneWrap").classList.toggle("hidden", !done.length);
  if (done.length) renderFeed(done, $("#feedDone"));

  // 사업별
  $("#projectMap").innerHTML = state.projects.map((p) => projectBox(p, false)).join("") || `<div class="empty">등록된 사업이 없습니다.</div>`;
  bindProjectBoxes($("#projectMap"));
}

function projectBox(p, editable) {
  const rows = [];
  for (const c of state.companies) c.engagements.forEach((e, i) => { if (e.project_id === p.id) rows.push({ c, e, i }); });
  const worst = scanned() ? worstOf(rows.map((r) => r.c)) : "pending";
  const roles = [...new Set(rows.map((r) => r.e.role))].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  const issueN = rows.reduce((s, r) => s + (scanned() ? r.c.total : 0), 0);
  return `<div class="pbox">
    <div class="pbox-head ${worst}"><div class="pname">${esc(p.name)}</div>${p.country ? `<span class="ctry">${esc(COUNTRY[p.country] || p.country)}</span>` : ""}</div>
    <div class="pbox-body">
      ${roles.map((role) => `<div class="rsec">${roleTag(role)}
        ${rows.filter((r) => r.e.role === role).map(({ c, e, i }) => `<div class="corow ${scanned() ? c.risk : ""}" data-cid="${c.id}">
          <span class="dot ${scanned() ? c.risk : ""}" style="${scanned() ? "" : "background:var(--border-strong)"}"></span>
          <span class="cn">${esc(c.name)}</span>${stageTag(e)}
          <span class="right">${scanned() && c.total ? badge(c.risk) : ""}${editable ? `<button class="xbtn" data-unlink="${c.id}|${i}" title="이 사업에서 빼기">✕</button>` : ""}</span>
        </div>`).join("")}</div>`).join("") || `<div class="muted small" style="padding:10px 0">연결된 업체 없음</div>`}
    </div>
    <div class="pbox-foot"><span>업체 ${rows.length}개${scanned() ? ` · 이슈 ${issueN}건` : ""}</span>${editable ? `<button class="btn sm ghost danger" data-del-proj="${p.id}">사업 삭제</button>` : ""}</div>
  </div>`;
}
function bindProjectBoxes(root) {
  $$(".corow", root).forEach((x) => x.addEventListener("click", (ev) => { if (!ev.target.closest(".xbtn")) openCompany(x.dataset.cid); }));
}

function findingHtml(f, showCompany = true) {
  const official = f.source_type !== "news";
  return `<div class="item lv-${f.level} ${f.status === "reviewed" ? "reviewed" : ""}" data-fid="${esc(f.id)}">
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
  $("#drawerTitle").innerHTML = `<div class="t">${esc(c.name)} ${scanned() ? badge(c.risk) : ""}</div>`;
  $("#drawerBody").innerHTML = `
    <div class="card">
      <div class="kv">
        <div class="k">참여 사업</div><div>${c.engagements.map((e) => `<div>${roleTag(e.role)} ${esc(projName(e.project_id))} ${stageTag(e)}</div>`).join("") || "-"}</div>
        <div class="k">영문명 / 별칭</div><div>${esc(c.name_en || "-")}${c.aliases ? ` / ${esc(c.aliases)}` : ""}</div>
        <div class="k">대표자</div><div>${esc(c.ceo || "-")}</div>
      </div>
      <div class="actions left">
        <button class="btn primary" id="dScan">이 업체만 다시 스캔</button>
        <a class="btn" target="_blank" rel="noopener" href="https://search.naver.com/search.naver?where=news&query=${encodeURIComponent('"' + c.name + '"')}">네이버 뉴스 ↗</a>
      </div>
    </div>
    <h2>이슈 <span class="count">${fs.length}</span></h2>
    <div id="dFeed" class="feed" style="max-height:none">${fs.length ? "" : `<div class="empty">${scanned() ? "발견된 이슈가 없습니다." : "아직 스캔하지 않았습니다."}</div>`}</div>
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

// ---------- 설정 (드래그 앤 드롭) ----------
const STAGES = ["계약", "우선협상", "입찰중"];
const ROLES = ["컨설턴트", "본구매", "F/S"];
let picked = null; // 클릭(터치)으로 고른 업체 { cid, from }

function renderSettings() {
  // 업체 목록 (끌어오는 곳)
  const q = ($("#poolSearch").value || "").trim();
  const list = [...state.companies].filter((c) => !q || c.name.includes(q)).sort((a, b) => (a.engagements.length ? 1 : 0) - (b.engagements.length ? 1 : 0) || a.name.localeCompare(b.name));
  $("#poolCount").textContent = state.companies.length;
  $("#pool").innerHTML = list.map((c) => `<div class="pchip ${c.engagements.length ? "" : "unassigned"} ${picked?.cid === c.id && !picked.from ? "picked" : ""}" draggable="true" data-cid="${c.id}">
      <span class="grip">⋮⋮</span><span class="nm">${esc(c.name)}</span>
      <span class="n">${c.engagements.length ? `사업 ${new Set(c.engagements.map((e) => e.project_id)).size}` : "미배정"}</span>
      ${c.engagements.length ? "" : `<button class="xbtn" data-del="${c.id}" title="업체 삭제">✕</button>`}
    </div>`).join("") || `<div class="muted small">${q ? "검색 결과가 없습니다." : "업체가 없습니다. 위에서 추가하세요."}</div>`;

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
      <div class="pbox-foot"><span>업체 ${rows.length}개</span><button class="btn sm ghost danger" data-del-proj="${p.id}">사업 삭제</button></div>
    </div>`;
  }).join("") || `<div class="empty">사업이 없습니다. 오른쪽 위에서 사업을 추가하세요.</div>`;

  bindDnd();

  // 수신자
  $("#rcList").innerHTML = state.recipients.map((r) => `<div class="srow"><span>✉ ${esc(r.email)}</span><button class="xbtn" data-del-rc="${r.id}" title="삭제">✕</button></div>`).join("") || `<div class="muted small">아직 없습니다.</div>`;
  $$("[data-del-rc]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "recipients", b.dataset.delRc)); state.recipients = state.recipients.filter((r) => r.id !== b.dataset.delRc); renderSettings(); });

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
  const root = $("#view-settings");
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
    // 클릭(터치)으로 놓기
    z.addEventListener("click", async (ev) => {
      if (!picked || ev.target.closest("button")) return;
      const p = picked; picked = null; document.body.classList.remove("dnd-active");
      await placeCompany(p.cid, null, z.dataset.pid, z.dataset.role);
    });
  });
  // 업체 목록: 클릭하면 선택(휴대폰용), 다시 누르면 해제
  $$("#pool .pchip").forEach((el) => el.addEventListener("click", (ev) => {
    if (ev.target.closest("button")) return;
    picked = picked?.cid === el.dataset.cid ? null : { cid: el.dataset.cid };
    document.body.classList.toggle("dnd-active", !!picked);
    $$("#pool .pchip").forEach((x) => x.classList.toggle("picked", picked?.cid === x.dataset.cid));
    if (picked) toast("놓을 사업 카드의 역할 칸을 누르세요");
  }));
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
    toast(c.engagements.length ? `'${c.name}'을(를) 이 사업에서 뺐습니다` : `'${c.name}'은(는) 미배정 업체로 남겨뒀습니다 (왼쪽 목록)`);
    rerender();
  });
  // 미배정 업체 삭제
  $$("#pool [data-del]").forEach((b) => b.onclick = async () => {
    const c = state.companies.find((x) => x.id === b.dataset.del);
    if (!confirm(`'${c.name}' 업체와 수집 이력을 삭제할까요?`)) return;
    await deleteCompany(c.id); rerender();
  });
  // 사업 삭제 → 소속 업체는 미배정으로
  $$("[data-del-proj]", root).forEach((b) => b.onclick = async () => {
    const pid = b.dataset.delProj;
    if (!confirm(`'${projName(pid)}' 사업을 삭제할까요?\n(소속 업체는 삭제되지 않고 '미배정'으로 남습니다)`)) return;
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
$("#poolSearch").addEventListener("input", () => renderSettings());
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && picked) { picked = null; document.body.classList.remove("dnd-active"); renderSettings(); } });

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
const companyData = (c) => { const { id, risk, open, total, ...data } = c; return data; };

// 새 업체 (미배정)
$("#poolForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const { name } = cleanCompanyName(ev.target.elements.name.value);
  if (!name) return;
  if (state.companies.some((c) => normName(c.name) === normName(name))) return toast("이미 있는 업체입니다");
  const ref = doc(collection(db, "companies"));
  const c = newCompany(ref.id, name, null);
  await setDoc(ref, companyData(c));
  state.companies.push(c);
  ev.target.reset(); $("#poolSearch").value = "";
  toast(`'${name}'을(를) 추가했습니다. 사업 카드로 끌어다 놓으세요`);
  rerender();
};
// 새 사업
$("#projForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const name = ev.target.elements.name.value.trim();
  if (!name) return;
  if (state.projects.some((p) => p.name === name)) return toast("이미 있는 사업입니다");
  const data = { name, country: guessCountry(name), created_at: nowStr() };
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
      p = { id: ref.id, name: r.project, country: guessCountry(r.project), created_at: nowStr() };
      batch.set(ref, { name: p.name, country: p.country, created_at: p.created_at });
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
      <td class="small">${esc(r.project)}</td><td>${roleTag(r.role)} ${r.rank ? `<span class="stage">우선협상 ${r.rank}순위</span>` : ""}</td>
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

// ---------- 연결 상태 / 고급 ----------
function renderConnections() {
  const s = state.status, c = s.connections || {}, known = !!s.connections;
  const lists = s.sanction_lists ? Object.entries(s.sanction_lists).map(([k, v]) => `${k} ${v}`).join(", ") : "";
  const rows = [
    ["Firebase (데이터 저장)", true, "이 화면이 보이면 정상", true],
    ["Google 뉴스", c.google_news ?? true, "키 불필요"],
    ["네이버 뉴스", c.naver, "Secret: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET"],
    ["메일 발송", c.smtp, "Secret: SMTP_USER / SMTP_PASSWORD"],
    ["MDB 제재리스트", !!lists && !/오류/.test(lists), lists || "스캔 때 자동으로 내려받음"],
    ["AI 판정 (Claude)", c.claude, c.claude ? `모델 ${s.claude_model}` : "Secret: ANTHROPIC_API_KEY (없으면 키워드 판정)"],
    ["DART 기업정보", c.dart, "Secret: DART_API_KEY (선택)"],
  ];
  $("#connList").innerHTML = (known ? "" : `<div class="notice">아직 스캔이 실행되지 않아 GitHub 쪽 연결 상태를 알 수 없습니다. 첫 스캔 후 표시됩니다.</div>`) +
    rows.map(([k, ok, d, always]) => `<div class="conn"><div><div class="k">${k}</div><div class="d">${esc(d)}</div></div>${always || known ? (ok ? `<span class="badge none">연결됨</span>` : `<span class="badge yellow">미설정</span>`) : `<span class="badge" style="background:var(--gray-bg);color:var(--gray)">확인 전</span>`}</div>`).join("");
}
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
