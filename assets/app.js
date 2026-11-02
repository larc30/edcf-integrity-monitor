// EDCF 부정당업자 모니터링 — GitHub Pages + Firebase 버전
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
const STAGE_W = { 우선협상: 3, 입찰중: 2, 계약: 1 };
const COUNTRY = { TZ: "탄자니아", PK: "파키스탄", KE: "케냐", MN: "몽골", LA: "라오스", ID: "인도네시아", KR: "한국", VN: "베트남", KH: "캄보디아", BD: "방글라데시", PH: "필리핀", UZ: "우즈베키스탄", ET: "에티오피아", GH: "가나", MM: "미얀마", LK: "스리랑카", NP: "네팔", RW: "르완다", UG: "우간다", TN: "튀니지", EG: "이집트", BO: "볼리비아", PY: "파라과이", CO: "콜롬비아", PE: "페루", EC: "에콰도르", GT: "과테말라", NI: "니카라과", HN: "온두라스", SN: "세네갈", CI: "코트디부아르", MZ: "모잠비크", AO: "앙골라", CM: "카메룬", NG: "나이지리아", TR: "튀르키예", UA: "우크라이나", GE: "조지아", AZ: "아제르바이잔", KZ: "카자흐스탄", KG: "키르기스스탄", TJ: "타지키스탄", MV: "몰디브", FJ: "피지", PG: "파푸아뉴기니", SB: "솔로몬제도", TL: "동티모르" };
const COUNTRY_BY_NAME = Object.fromEntries(Object.entries(COUNTRY).map(([k, v]) => [v, k]));
Object.assign(COUNTRY_BY_NAME, { 카라치: "PK", 이슬라마바드: "PK", 라호르: "PK", 나이로비: "KE", 다르에스살람: "TZ", 울란바토르: "MN", 비엔티안: "LA", 자카르타: "ID", 하노이: "VN", 호치민: "VN", 프놈펜: "KH", 다카: "BD", 마닐라: "PH", 타슈켄트: "UZ", 아디스아바바: "ET" });
const badge = (lv) => `<span class="badge ${lv || "none"}">${LEVEL[lv || "none"]}</span>`;
const state = { projects: [], companies: [], findings: [], keywords: [], recipients: [], status: {}, runs: [], corpMaster: null };

function toast(msg, ms = 2800) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms);
}
function modal(html) { $("#modal").innerHTML = html + `<div class="actions"><button class="btn" id="modalClose">닫기</button></div>`; $("#modalBg").classList.add("open"); $("#modalClose").onclick = closeModal; }
function closeModal() { $("#modalBg").classList.remove("open"); }
$("#modalBg").addEventListener("click", (e) => { if (e.target.id === "modalBg") closeModal(); });
const projName = (pid) => state.projects.find((p) => p.id === pid)?.name || "(삭제된 사업)";
const engLine = (e) => `${esc(projName(e.project_id))} · ${esc(e.role)} · ${esc(e.stage)}${e.rank ? ` ${e.rank}순위` : ""}`;
const nowStr = () => new Date(Date.now() + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 19); // KST
const cleanObj = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? (v.trim() || null) : v]));

// ---------- 로그인 ----------
$("#btnLogin").onclick = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { $("#loginMsg").textContent = "로그인 실패: " + e.message; }
};
const doLogout = () => signOut(auth);
$("#btnLogout").onclick = doLogout; $("#btnLogout2").onclick = doLogout;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    $("#appView").classList.add("hidden"); $("#loginView").classList.remove("hidden");
    $("#btnLogin").classList.remove("hidden"); $("#btnLogout2").classList.add("hidden");
    $("#loginMsg").textContent = "허용된 Google 계정으로 로그인하세요.";
    return;
  }
  if (!ALLOWED_EMAILS.includes(user.email)) {
    $("#appView").classList.add("hidden"); $("#loginView").classList.remove("hidden");
    $("#loginMsg").innerHTML = `<b>${esc(user.email)}</b> 계정은 접근 권한이 없습니다.<br>관리자에게 허용 목록 추가를 요청하세요.`;
    $("#btnLogin").classList.add("hidden"); $("#btnLogout2").classList.remove("hidden");
    return;
  }
  $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
  $("#userEmail").textContent = user.email;
  $("#lnkActions").href = ACTIONS_URL; $("#lnkSecrets").href = SECRETS_URL;
  try {
    await loadAll();
    let v = "dashboard"; try { v = localStorage.getItem("view") || v; } catch {}
    showView(v);
  } catch (e) {
    console.error(e);
    toast("데이터를 불러오지 못했습니다: " + e.message, 6000);
    $("#emptyNotice").classList.remove("hidden");
    $("#emptyNotice").innerHTML = `데이터를 불러오지 못했습니다 (${esc(e.code || e.message)}). Firestore 보안 규칙(firestore.rules)을 Firebase 콘솔에 게시했는지 확인하세요.`;
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
    getDocs(query(collection(db, "runs"), orderBy("at_ms", "desc"), limit(15))),
  ]);
  state.projects = docs(p).sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "") || a.name.localeCompare(b.name));
  state.companies = docs(c);
  state.findings = docs(f);
  state.keywords = docs(k);
  state.recipients = docs(r);
  state.status = st.exists() ? st.data() : {};
  state.runs = docs(runs);
  computeOverview();
  renderScanState();
}
function computeOverview() {
  for (const c of state.companies) {
    c.engagements = c.engagements || [];
    const fs = state.findings.filter((f) => f.company_id === c.id && f.status !== "dismissed");
    c.counts = { red: 0, orange: 0, yellow: 0 };
    fs.forEach((f) => { if (c.counts[f.level] !== undefined) c.counts[f.level]++; });
    c.unreviewed = fs.filter((f) => f.status === "new").length;
    const top = fs.reduce((m, f) => (LV[f.level] || 0) > (LV[m] || 0) ? f.level : m, "none");
    c.risk = top;
    c.stageW = Math.max(0, ...c.engagements.map((e) => STAGE_W[e.stage] || 0));
  }
  state.companies.sort((a, b) => (LV[b.risk] - LV[a.risk]) || (b.unreviewed - a.unreviewed) || (b.stageW - a.stageW) || a.name.localeCompare(b.name));
}
const activeFindings = (cid) => state.findings
  .filter((f) => (!cid || f.company_id === cid) && f.status !== "dismissed")
  .sort((a, b) => (LV[b.level] - LV[a.level]) || String(b.published_at || b.first_seen || "").localeCompare(String(a.published_at || a.first_seen || "")));

function renderScanState() {
  const s = state.status;
  $("#scanState").innerHTML = `마지막 스캔 ${esc(s.last_scan_at || "-")}<br>${s.analyzer === "claude" ? "AI 판정" : "키워드 규칙 판정"} · 매일 07:30 자동`;
}
$("#btnRefresh").onclick = async () => { await loadAll(); refreshCurrent(); toast("최신 데이터로 새로고침했습니다"); };

// ---------- 탭 ----------
$$("#tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
function showView(v) {
  if (!$(`#view-${v}`)) v = "dashboard";
  $$("#tabs button").forEach((x) => x.classList.toggle("active", x.dataset.view === v));
  $$(".view").forEach((x) => x.classList.toggle("active", x.id === `view-${v}`));
  try { localStorage.setItem("view", v); } catch {}
  if (v === "dashboard") renderDashboard();
  if (v === "admin") renderAdmin();
  if (v === "report") loadReport();
}
$$("#subtabs button").forEach((b) => b.addEventListener("click", () => {
  $$("#subtabs button").forEach((x) => x.classList.toggle("active", x === b));
  $$(".sub").forEach((x) => x.classList.toggle("active", x.id === `sub-${b.dataset.sub}`));
}));
function refreshCurrent() {
  computeOverview();
  const v = $("#tabs button.active")?.dataset.view || "dashboard";
  showView(v);
  if (state.openCid && $("#drawer").classList.contains("open")) openCompany(state.openCid);
}

// ---------- 대시보드 ----------
function renderDashboard() {
  const cs = state.companies;
  const dayAgo = Date.now() - 86400e3;
  const k = {
    companies: cs.length, projects: state.projects.length,
    red: cs.filter((c) => c.risk === "red").length, orange: cs.filter((c) => c.risk === "orange").length, yellow: cs.filter((c) => c.risk === "yellow").length,
    unreviewed: cs.reduce((s, c) => s + c.unreviewed, 0),
    new24: state.findings.filter((f) => f.status !== "dismissed" && (f.first_seen_ms || 0) > dayAgo).length,
  };
  const en = $("#emptyNotice");
  if (!cs.length) { en.classList.remove("hidden"); en.innerHTML = `아직 등록된 업체가 없습니다. <b>관리자 → 엑셀 일괄 등록</b>에서 업체 목록을 붙여넣어 시작하세요.`; }
  else if (!state.status.last_scan_at) { en.classList.remove("hidden"); en.innerHTML = `업체가 등록됐습니다. 상단 <b>지금 스캔</b>을 눌러 첫 스캔을 실행하세요.`; }
  else en.classList.add("hidden");

  $("#kpis").innerHTML = [
    ["모니터링 업체", k.companies, `${k.projects}개 사업`, ""],
    ["위험 업체", k.red, "제재·직접 장애", "red"],
    ["경고 업체", k.orange, "수사·담합·처분", "orange"],
    ["주의 업체", k.yellow, "과거 이력·의혹", "yellow"],
    ["미검토 신호", k.unreviewed, `최근 24시간 신규 ${k.new24}`, ""],
    ["마지막 스캔", state.status.last_scan_at ? state.status.last_scan_at.slice(5, 16) : "-", "", ""],
  ].map(([l, v, h, c]) => `<div class="kpi"><div class="label">${c ? `<span class="dot ${c}"></span>` : ""}${l}</div><div class="value num">${esc(v)}</div><div class="hint">${esc(h)}</div></div>`).join("");

  const fp = $("#fProject"), cur = fp.value;
  fp.innerHTML = `<option value="">전체 사업</option>` + state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  fp.value = cur;
  renderCompanyTable();
  renderFeed(activeFindings().slice(0, 40), $("#feed"));
  renderProjectMap();
}
["#fProject", "#fRole", "#fRisk"].forEach((s) => $(s).addEventListener("change", renderCompanyTable));

function renderCompanyTable() {
  const fp = $("#fProject").value, fr = $("#fRole").value, fk = $("#fRisk").value;
  const list = state.companies.filter((c) =>
    (!fp || c.engagements.some((e) => e.project_id === fp)) &&
    (!fr || c.engagements.some((e) => e.role === fr)) &&
    (!fk || c.risk === fk));
  $("#companyTable tbody").innerHTML = list.map((c) => `
    <tr class="clickable" data-cid="${c.id}">
      <td>${badge(c.risk)}</td>
      <td><div class="name">${esc(c.name)}</div>${c.note ? `<div class="muted small">${esc(c.note)}</div>` : ""}</td>
      <td>${c.engagements.map((e) => `<div class="eng-line">${engLine(e)}</div>`).join("") || "-"}</td>
      <td class="c num">${c.counts.red} / ${c.counts.orange} / ${c.counts.yellow}</td>
      <td class="c num">${c.unreviewed || ""}</td>
    </tr>`).join("") || `<tr><td colspan="5" class="empty">조건에 맞는 업체가 없습니다.</td></tr>`;
  $$("#companyTable tbody tr[data-cid]").forEach((tr) => tr.addEventListener("click", () => openCompany(tr.dataset.cid)));
}

function findingHtml(f, { showCompany = true } = {}) {
  const official = f.source_type !== "news";
  const by = { claude: "AI 판정", rule: "키워드 규칙", "list-match": "리스트 매칭", manual: "수기" }[f.analyzer] || "";
  return `<div class="item ${f.status === "reviewed" ? "reviewed" : ""}" data-fid="${esc(f.id)}">
    <div class="item-head">
      ${badge(f.level)}
      ${official ? `<span class="tag official">${f.source_type === "manual" ? "수기 등록" : "공식 리스트"}</span>` : ""}
      ${showCompany ? `<span class="item-company" data-cid="${f.company_id}">${esc(f.company_name)}</span>` : ""}
      ${f.category ? `<span class="tag">${esc(f.category)}</span>` : ""}
      ${f.status === "reviewed" ? `<span class="tag">검토완료</span>` : ""}
      ${f.status === "dismissed" ? `<span class="tag">오탐 처리</span>` : ""}
      ${f.reported_at ? `<span class="tag">메일 보고됨</span>` : ""}
    </div>
    <div class="item-summary">${esc(f.summary || f.title)}</div>
    ${f.rationale ? `<div class="item-why">판단 근거: ${esc(f.rationale)} <span class="muted">· ${by}</span></div>` : ""}
    <div class="source">
      출처: <b>${esc(f.source_name || "-")}</b> · ${esc(f.published_at || "날짜 미상")}<br>
      <span class="src-title">「${esc(f.title)}」</span>
      ${f.url ? ` <a href="${esc(f.url)}" target="_blank" rel="noopener">원문 보기 ↗</a>` : ""}
      ${f.matched_keywords ? `<div class="muted">매칭: ${esc(f.matched_keywords)}</div>` : ""}
      ${f.reviewer_note ? `<div class="muted">검토 메모: ${esc(f.reviewer_note)} (${esc(f.reviewed_by || "")})</div>` : ""}
    </div>
    <div class="item-actions">
      ${f.status !== "reviewed" ? `<button class="btn sm" data-act="reviewed">검토완료</button>` : ""}
      ${f.status !== "dismissed" ? `<button class="btn sm" data-act="dismissed">오탐/무관</button>` : ""}
      ${f.status && f.status !== "new" ? `<button class="btn sm ghost" data-act="new">되돌리기</button>` : ""}
    </div>
  </div>`;
}
function renderFeed(list, el, opts) {
  el.innerHTML = list.length ? list.map((f) => findingHtml(f, opts)).join("") : `<div class="empty">아직 수집된 리스크 신호가 없습니다.</div>`;
  $$(".item-company", el).forEach((x) => x.addEventListener("click", () => openCompany(x.dataset.cid)));
  $$("[data-act]", el).forEach((b) => b.addEventListener("click", async () => {
    const fid = b.closest(".item").dataset.fid;
    const st = b.dataset.act;
    const patch = { status: st, reviewed_by: auth.currentUser.email, reviewed_at: nowStr() };
    if (st === "dismissed") {
      const memo = prompt("오탐/무관 사유 (선택)", "동명 업체 / 무관 기사");
      if (memo === null) return;
      patch.reviewer_note = memo;
    }
    await updateDoc(doc(db, "findings", fid), patch);
    Object.assign(state.findings.find((f) => f.id === fid) || {}, patch);
    toast(st === "dismissed" ? "오탐으로 처리했습니다 (집계 제외)" : "상태를 변경했습니다");
    refreshCurrent();
  }));
}

function renderProjectMap() {
  const byP = state.projects.map((p) => {
    const rows = [];
    for (const c of state.companies) for (const e of c.engagements) if (e.project_id === p.id) rows.push({ c, e });
    return { p, rows };
  });
  $("#projectMap").innerHTML = byP.map(({ p, rows }) => {
    const roles = [...new Set(rows.map((r) => r.e.role))];
    const worst = rows.reduce((m, r) => LV[r.c.risk] > LV[m] ? r.c.risk : m, "none");
    return `<div class="pcard">
      <div class="pcard-title"><span class="dot ${worst}"></span>${esc(p.name)} <span class="flag">${esc(COUNTRY[p.country] || p.country || "")}</span></div>
      ${roles.map((role) => `<div class="role-group"><div class="role-label">${esc(role)}</div>${rows.filter((r) => r.e.role === role).map(({ c, e }) =>
        `<span class="cchip ${c.risk}" data-cid="${c.id}" title="${LEVEL[c.risk]}"><span class="dot ${c.risk}"></span>${esc(c.name)}${e.stage !== "계약" ? ` <span class="muted">(${esc(e.stage)}${e.rank ? " " + e.rank + "순위" : ""})</span>` : ""}</span>`).join("")}</div>`).join("") || `<div class="muted small">연결된 업체 없음</div>`}
    </div>`;
  }).join("") || `<div class="empty">등록된 사업이 없습니다.</div>`;
  $$("#projectMap .cchip").forEach((x) => x.addEventListener("click", () => openCompany(x.dataset.cid)));
}

// ---------- 업체 상세 ----------
function openCompany(cid) {
  const c = state.companies.find((x) => x.id === cid);
  if (!c) return;
  state.openCid = cid;
  const fs = activeFindings(cid);
  const dismissed = state.findings.filter((f) => f.company_id === cid && f.status === "dismissed");
  $("#drawerTitle").innerHTML = `<div class="t">${esc(c.name)} ${badge(c.risk)}</div><div class="muted small">${esc(c.name_en || "")}</div>`;
  $("#drawerBody").innerHTML = `
    <div class="card">
      <div class="kv">
        <div class="k">참여 사업</div><div>${c.engagements.map((e) => `<div>${engLine(e)}</div>`).join("") || "-"}</div>
        <div class="k">별칭</div><div>${esc(c.aliases || "-")}</div>
        <div class="k">보조 키워드</div><div>${esc(c.context_keywords || "-")}</div>
        <div class="k">대표자 / 사업자번호</div><div>${esc(c.ceo || "-")} / ${esc(c.biz_no || "-")}</div>
        <div class="k">국가 · 검색언어</div><div>${esc(c.country || "-")} · ${esc(c.search_langs || "-")}</div>
        <div class="k">메모</div><div>${esc(c.note || "-")}</div>
      </div>
      <div class="actions left">
        <button class="btn primary" id="dScan">이 업체만 재스캔</button>
        <button class="btn" id="dEdit">정보 수정</button>
        <a class="btn" target="_blank" rel="noopener" href="https://search.naver.com/search.naver?where=news&query=${encodeURIComponent('"' + c.name + '"')}">네이버 뉴스 ↗</a>
      </div>
    </div>
    <div class="card">
      <h2>공식 제재 확인 기록 추가</h2>
      <p class="muted small">나라장터·MDB 사이트에서 직접 확인한 제재 내역을 출처와 함께 남깁니다.</p>
      <form id="manualForm" class="form">
        <div class="row">
          <select name="source_name"><option>조달청 나라장터 부정당제재</option><option>World Bank 제재기업 리스트</option><option>ADB 제재 리스트</option><option>공정거래위원회 의결</option><option>기타</option></select>
          <select name="level"><option value="red">위험</option><option value="orange">경고</option><option value="yellow">주의</option></select>
        </div>
        <input name="title" placeholder="내용 (예: 입찰참가자격 제한 6개월, 2025.03~2025.09, 처분기관 OO)" required>
        <div class="row"><input name="url" placeholder="출처 URL"><input name="published_at" placeholder="처분일 YYYY-MM-DD"></div>
        <div class="actions"><button class="btn primary">기록 추가</button></div>
      </form>
    </div>
    <h2>리스크 신호 (${fs.length})</h2>
    <div id="dFeed" class="feed" style="max-height:none"></div>
    ${dismissed.length ? `<details style="margin-top:12px"><summary class="muted">오탐 처리된 항목 ${dismissed.length}건</summary><div id="dDismissed" class="feed" style="max-height:none;margin-top:8px"></div></details>` : ""}`;
  renderFeed(fs, $("#dFeed"), { showCompany: false });
  if (dismissed.length) renderFeed(dismissed, $("#dDismissed"), { showCompany: false });
  $("#dScan").onclick = () => scanGuide(c.name);
  $("#dEdit").onclick = () => { closeDrawer(); showView("admin"); openSub("companies"); fillCompanyForm(c); };
  $("#manualForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target));
    const key = "manual-" + Date.now();
    const data = {
      company_id: cid, company_name: c.name, source_type: "manual", source_name: fd.source_name, title: fd.title,
      url: fd.url || "", published_at: fd.published_at || "", level: fd.level,
      category: fd.source_name.includes("공정") ? "과징금·행정처분" : fd.source_name.includes("Bank") || fd.source_name.includes("ADB") ? "MDB 제재" : "부정당업자 제재",
      summary: fd.title, rationale: `담당자 수기 등록 (${auth.currentUser.email})`, analyzer: "manual", relevant: true,
      dedup_key: key, status: "new", first_seen: nowStr(), first_seen_ms: Date.now(), reported_at: null,
    };
    await setDoc(doc(db, "findings", `${cid}_${key}`), data);
    state.findings.push({ id: `${cid}_${key}`, ...data });
    toast("기록을 추가했습니다"); refreshCurrent();
  };
  $("#drawer").classList.add("open"); $("#drawerBg").classList.add("open");
}
function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawerBg").classList.remove("open"); state.openCid = null; }
$("#drawerClose").onclick = closeDrawer; $("#drawerBg").onclick = closeDrawer;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDrawer(); closeModal(); } });

// ---------- 스캔 / 발송 안내 (GitHub Actions) ----------
function actionsGuide(title, task, extra = "") {
  modal(`<h2>${title}</h2>
    <p class="muted small">스캔과 메일 발송은 GitHub Actions에서 실행됩니다. 매일 07:30에는 자동으로 실행되고, 지금 바로 하려면 아래 순서대로 하세요.</p>
    <ol>
      <li>아래 <b>[GitHub Actions 열기]</b> 클릭</li>
      <li>오른쪽 <b>Run workflow ▾</b> 버튼 클릭</li>
      <li><b>실행할 작업</b>에서 <code>${task}</code> 선택${extra}</li>
      <li>초록색 <b>Run workflow</b> 클릭 → 3~10분 뒤 완료(초록 체크)</li>
      <li>이 화면 상단 <b>↻</b> 버튼으로 새로고침</li>
    </ol>
    <a class="btn primary" href="${ACTIONS_URL}" target="_blank" rel="noopener">GitHub Actions 열기 ↗</a>`);
}
function scanGuide(companyName) {
  if (companyName) navigator.clipboard?.writeText(companyName).catch(() => {});
  actionsGuide(companyName ? `'${esc(companyName)}'만 재스캔` : "지금 스캔", "scan",
    companyName ? `<br>· <b>특정 업체만 스캔</b> 칸에 <code>${esc(companyName)}</code> 붙여넣기 (클립보드에 복사됨)` : "<br>· 업체 칸은 비워두면 전체 스캔");
}
$("#btnScan").onclick = () => scanGuide(null);

// ---------- 관리자 ----------
function openSub(name) { $(`#subtabs [data-sub=${name}]`).click(); }
function renderAdmin() {
  const projects = state.projects, companies = [...state.companies].sort((a, b) => a.name.localeCompare(b.name));
  $("#companyForm [name=e_project]").innerHTML = `<option value="">사업 선택</option>` + projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  $("#projectList").innerHTML = projects.map((p) => {
    const linked = [];
    for (const c of state.companies) c.engagements.forEach((e, i) => { if (e.project_id === p.id) linked.push({ c, e, i }); });
    return `<div class="prow"><div><b>${esc(p.name)}</b> <span class="muted small">${esc(COUNTRY[p.country] || p.country || "")} · 업체 ${linked.length}</span>
      <div class="small muted">${linked.map(({ c, e, i }) => `${esc(c.name)}(${esc(e.role)}${e.stage !== "계약" ? "·" + esc(e.stage) : ""}) <a href="#" data-unlink="${c.id}|${i}" title="연결 해제">✕</a>`).join(", ")}</div></div>
      <button class="btn sm danger" data-del-proj="${p.id}">삭제</button></div>`;
  }).join("") || `<div class="empty">사업이 없습니다.</div>`;
  $$("[data-del-proj]").forEach((b) => b.onclick = async () => {
    if (!confirm("사업을 삭제할까요? (업체 연결도 해제됩니다)")) return;
    const pid = b.dataset.delProj;
    const batch = writeBatch(db);
    for (const c of state.companies) if (c.engagements.some((e) => e.project_id === pid)) {
      c.engagements = c.engagements.filter((e) => e.project_id !== pid);
      batch.update(doc(db, "companies", c.id), { engagements: c.engagements });
    }
    batch.delete(doc(db, "projects", pid));
    await batch.commit();
    state.projects = state.projects.filter((p) => p.id !== pid);
    refreshCurrent();
  });
  $$("[data-unlink]").forEach((a) => a.onclick = async (e) => {
    e.preventDefault();
    const [cid, i] = a.dataset.unlink.split("|");
    const c = state.companies.find((x) => x.id === cid);
    c.engagements.splice(+i, 1);
    await updateDoc(doc(db, "companies", cid), { engagements: c.engagements });
    refreshCurrent();
  });

  $("#companyCount").textContent = companies.length;
  $("#adminCompanyTable tbody").innerHTML = companies.map((c) => `<tr>
    <td><b>${esc(c.name)}</b>${c.corp_code ? ` <span class="tag">DART</span>` : ""}${c.note ? `<div class="muted small">${esc(c.note)}</div>` : ""}</td>
    <td class="small">${esc(c.name_en || "")}${c.aliases ? `<div class="muted">${esc(c.aliases)}</div>` : ""}</td>
    <td class="small">${esc(c.context_keywords || "")}</td>
    <td class="small">${esc(c.country || "")} · ${esc(c.search_langs || "")}</td>
    <td class="small">${c.engagements.map(engLine).join("<br>")}</td>
    <td style="white-space:nowrap"><button class="btn sm" data-edit="${c.id}">수정</button> <button class="btn sm danger" data-del="${c.id}">삭제</button></td></tr>`).join("")
    || `<tr><td colspan="6" class="empty">등록된 업체가 없습니다. '엑셀 일괄 등록'을 이용하세요.</td></tr>`;
  $$("[data-edit]").forEach((b) => b.onclick = () => fillCompanyForm(state.companies.find((c) => c.id === b.dataset.edit)));
  $$("[data-del]").forEach((b) => b.onclick = async () => {
    if (!confirm("업체와 수집 이력을 모두 삭제할까요?")) return;
    const cid = b.dataset.del;
    const fsnap = await getDocs(query(collection(db, "findings"), where("company_id", "==", cid)));
    let batch = writeBatch(db), n = 0;
    for (const d of fsnap.docs) { batch.delete(d.ref); if (++n % 400 === 0) { await batch.commit(); batch = writeBatch(db); } }
    batch.delete(doc(db, "companies", cid));
    await batch.commit();
    state.companies = state.companies.filter((c) => c.id !== cid);
    state.findings = state.findings.filter((f) => f.company_id !== cid);
    toast("삭제했습니다"); refreshCurrent();
  });

  $("#kwList").innerHTML = [...state.keywords].sort((a, b) => (LV[b.level] - LV[a.level]) || a.word.localeCompare(b.word))
    .map((k) => `<span class="kchip">${badge(k.level)} ${esc(k.word)} <span class="muted small">${esc(k.lang)}${k.use_in_query ? " · 검색조합" : ""}</span><button data-del-kw="${k.id}" title="삭제">✕</button></span>`).join("")
    || `<div class="muted">키워드가 없습니다. <b>기본 키워드 불러오기</b>를 눌러주세요.</div>`;
  $$("[data-del-kw]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "keywords", b.dataset.delKw)); state.keywords = state.keywords.filter((k) => k.id !== b.dataset.delKw); renderAdmin(); });
  $("#rcTable tbody").innerHTML = state.recipients.map((r) => `<tr><td>${esc(r.email)}</td><td>${esc(r.name || "")}</td><td style="text-align:right"><button class="btn sm danger" data-del-rc="${r.id}">삭제</button></td></tr>`).join("") || `<tr><td class="empty">수신자가 없습니다.</td></tr>`;
  $$("[data-del-rc]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "recipients", b.dataset.delRc)); state.recipients = state.recipients.filter((r) => r.id !== b.dataset.delRc); renderAdmin(); });
  renderSystem();
}

function fillCompanyForm(c) {
  const f = $("#companyForm"); f.reset();
  for (const k of ["id", "name", "name_en", "corp_code", "ceo", "biz_no", "aliases", "context_keywords", "country", "search_langs", "note"]) f[k].value = c[k] ?? "";
  f.scrollIntoView({ behavior: "smooth" }); f.name.focus();
}
$("#btnFormReset").onclick = () => { $("#companyForm").reset(); $("#companyForm [name=id]").value = ""; };

$("#companyForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const fd = Object.fromEntries(new FormData(ev.target));
  const body = cleanObj(Object.fromEntries(["name", "name_en", "corp_code", "ceo", "biz_no", "aliases", "context_keywords", "country", "search_langs", "note"].map((k) => [k, fd[k] || ""])));
  if (!body.name) return;
  const dup = state.companies.find((c) => c.name === body.name && c.id !== fd.id);
  if (dup) return toast("이미 같은 이름의 업체가 있습니다. 목록에서 '수정'을 이용하세요.", 4000);
  try {
    let c = state.companies.find((x) => x.id === fd.id);
    if (c) { await updateDoc(doc(db, "companies", c.id), body); Object.assign(c, body); }
    else {
      const ref = await addDoc(collection(db, "companies"), { ...body, engagements: [], created_at: nowStr() });
      c = { id: ref.id, ...body, engagements: [] }; state.companies.push(c);
    }
    if (fd.e_project) {
      const e = { project_id: fd.e_project, role: fd.e_role, stage: fd.e_stage, rank: fd.e_rank ? +fd.e_rank : null };
      if (!c.engagements.some((x) => x.project_id === e.project_id && x.role === e.role)) {
        c.engagements.push(e);
        await updateDoc(doc(db, "companies", c.id), { engagements: c.engagements });
      }
    }
    toast("저장했습니다");
    ev.target.reset(); ev.target.id.value = "";
    refreshCurrent();
  } catch (e) { toast("저장 실패: " + e.message, 5000); }
};

// 자동완성 (등록 업체 + DART 기업목록 data/corp_master.json)
async function corpMaster() {
  if (state.corpMaster) return state.corpMaster;
  try { const r = await fetch("data/corp_master.json", { cache: "force-cache" }); state.corpMaster = r.ok ? await r.json() : []; }
  catch { state.corpMaster = []; }
  return state.corpMaster;
}
let acTimer = null;
$("#companyForm [name=name]").addEventListener("input", (e) => {
  clearTimeout(acTimer);
  const q = e.target.value.trim();
  if (q.length < 2) return $("#acList").classList.remove("open");
  acTimer = setTimeout(async () => {
    const ql = q.toLowerCase();
    const reg = state.companies.filter((c) => c.name.includes(q)).slice(0, 5);
    const master = await corpMaster();
    const dartHits = [];
    for (const r of master) {
      if (r[1].includes(q) || (r[2] && r[2].toLowerCase().includes(ql))) { dartHits.push(r); if (dartHits.length >= 40) break; }
    }
    dartHits.sort((a, b) => (b[1] === q) - (a[1] === q) || (!!b[3]) - (!!a[3]) || a[1].length - b[1].length);
    const list = $("#acList");
    let h = "";
    if (reg.length) h += `<div class="ac-sec">이미 등록된 업체</div>` + reg.map((c) => `<div class="ac-item" data-reg="${c.id}"><span>${esc(c.name)}</span><span class="muted small">수정</span></div>`).join("");
    if (dartHits.length) h += `<div class="ac-sec">DART 기업 목록</div>` + dartHits.slice(0, 12).map((r) => `<div class="ac-item" data-corp="${r[0]}" data-name="${esc(r[1])}" data-en="${esc(r[2] || "")}"><span>${esc(r[1])} <span class="muted small">${esc(r[2] || "")}</span></span><span class="muted small">${r[3] ? "상장 " + r[3] : r[0]}</span></div>`).join("");
    if (!h) h = `<div class="ac-sec">검색 결과 없음 — 직접 입력해 저장하세요${master.length ? "" : " (DART 기업목록이 아직 없습니다: Actions에서 dart 작업 실행)"}</div>`;
    list.innerHTML = h; list.classList.add("open");
    $$("[data-reg]", list).forEach((x) => x.onclick = () => { list.classList.remove("open"); fillCompanyForm(state.companies.find((c) => c.id === x.dataset.reg)); });
    $$("[data-corp]", list).forEach((x) => x.onclick = () => {
      list.classList.remove("open");
      const f = $("#companyForm");
      f.name.value = x.dataset.name; f.name_en.value = x.dataset.en; f.corp_code.value = x.dataset.corp;
      if (x.dataset.en && !f.search_langs.value.includes("en")) f.search_langs.value = "ko,en";
      toast("대표자·사업자번호는 다음 스캔 때 DART에서 자동으로 채워집니다");
    });
  }, 200);
});
document.addEventListener("click", (e) => { if (!e.target.closest(".ac-wrap")) $("#acList").classList.remove("open"); });

$("#projectForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const fd = Object.fromEntries(new FormData(ev.target));
  const name = fd.name.trim();
  if (state.projects.some((p) => p.name === name)) return toast("이미 등록된 사업명입니다");
  const data = { name, country: (fd.country || "").trim().toUpperCase() || guessCountry(name), created_at: nowStr() };
  const ref = await addDoc(collection(db, "projects"), data);
  state.projects.push({ id: ref.id, ...data });
  ev.target.reset(); refreshCurrent();
};

// ---------- 엑셀 일괄 등록 ----------
function guessCountry(text) {
  for (const [name, code] of Object.entries(COUNTRY_BY_NAME)) if (text.includes(name)) return code;
  return null;
}
function cleanCompanyName(raw) {
  let rank = null, name = raw;
  const m = name.match(/\(\s*(\d+)\s*순위\s*\)/);
  if (m) { rank = +m[1]; name = name.replace(m[0], ""); }
  name = name.replace(/주식회사|\(주\)|㈜/g, "").replace(/\s+/g, " ").trim();
  return { name, rank };
}
function parseImport(text) {
  const rows = [], errors = [];
  let lastProject = "";
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cols = line.split("\t").map((s) => s.trim());
    if (cols.length < 3) { errors.push(`${i + 1}행: 열이 3개가 아닙니다 → "${line.slice(0, 40)}"`); return; }
    let [project, role, rawName] = cols;
    if (/사업명/.test(project) && /업체/.test(rawName)) return; // 머리글
    if (project) lastProject = project; else project = lastProject;
    if (!project || !rawName) { errors.push(`${i + 1}행: 사업명 또는 업체명이 비어 있습니다`); return; }
    const { name, rank } = cleanCompanyName(rawName);
    const country = guessCountry(project);
    const foreign = /^PT[.\s]/i.test(name) || /^[A-Za-z0-9 .,&()-]+$/.test(name);
    rows.push({
      project, country, role: role || "컨설턴트", name, rank,
      stage: rank ? "우선협상" : "계약",
      companyCountry: foreign ? (country || "") : "KR",
      langs: foreign ? (country === "ID" ? "en,id" : "en") : "ko",
      name_en: foreign ? name.replace(/^PT[.\s]+/i, "") : null,
    });
  });
  return { rows, errors };
}
let importParsed = null;
$("#btnImportPreview").onclick = () => {
  importParsed = parseImport($("#importText").value);
  const { rows, errors } = importParsed;
  const existsC = new Set(state.companies.map((c) => c.name)), existsP = new Set(state.projects.map((p) => p.name));
  $("#importPreview").innerHTML = (errors.length ? `<div class="notice">${errors.map(esc).join("<br>")}</div>` : "") +
    `<table class="tbl"><thead><tr><th>사업</th><th>국가</th><th>구분</th><th>업체</th><th>단계</th><th>상태</th></tr></thead><tbody>${rows.map((r) => `<tr>
      <td class="small">${esc(r.project)}${existsP.has(r.project) ? "" : ` <span class="tag">신규</span>`}</td><td class="small">${esc(r.country || "?")}</td>
      <td class="small">${esc(r.role)}</td><td><b>${esc(r.name)}</b>${r.name_en ? ` <span class="muted small">해외 · ${esc(r.langs)}</span>` : ""}</td>
      <td class="small">${esc(r.stage)}${r.rank ? " " + r.rank + "순위" : ""}</td>
      <td class="small">${existsC.has(r.name) ? "기존 업체에 연결" : `<span class="tag">신규 업체</span>`}</td></tr>`).join("")}</tbody></table>`;
  $("#btnImportRun").disabled = !rows.length;
  $("#btnImportRun").textContent = `등록하기 (${rows.length}건)`;
};
$("#btnImportRun").onclick = async () => {
  if (!importParsed?.rows.length) return;
  $("#btnImportRun").disabled = true;
  try {
    const batch = writeBatch(db);
    const pByName = Object.fromEntries(state.projects.map((p) => [p.name, p]));
    const cByName = Object.fromEntries(state.companies.map((c) => [c.name, c]));
    const touched = new Set();
    let newP = 0, newC = 0, links = 0;
    for (const r of importParsed.rows) {
      let p = pByName[r.project];
      if (!p) {
        const ref = doc(collection(db, "projects"));
        p = { id: ref.id, name: r.project, country: r.country, created_at: nowStr() };
        batch.set(ref, { name: p.name, country: p.country, created_at: p.created_at });
        pByName[p.name] = p; state.projects.push(p); newP++;
      }
      let c = cByName[r.name];
      if (!c) {
        const ref = doc(collection(db, "companies"));
        c = { id: ref.id, name: r.name, name_en: r.name_en, aliases: r.name_en && r.name_en !== r.name ? r.name_en : null, context_keywords: null,
              country: r.companyCountry || "KR", search_langs: r.langs, corp_code: null, biz_no: null, ceo: null, note: null, engagements: [], created_at: nowStr() };
        cByName[c.name] = c; state.companies.push(c); newC++;
      }
      if (!c.engagements.some((e) => e.project_id === p.id && e.role === r.role)) {
        c.engagements.push({ project_id: p.id, role: r.role, stage: r.stage, rank: r.rank }); links++;
      }
      touched.add(c);
    }
    for (const c of touched) {
      const { id, counts, unreviewed, risk, stageW, ...data } = c;
      batch.set(doc(db, "companies", id), data, { merge: true });
    }
    await batch.commit();
    toast(`등록 완료: 사업 ${newP}개 · 업체 ${newC}개 신규, 연결 ${links}건`, 4000);
    $("#importText").value = ""; $("#importPreview").innerHTML = ""; importParsed = null;
    $("#btnImportRun").textContent = "등록하기";
    if (!state.keywords.length) await loadDefaultKeywords(true);
    refreshCurrent();
  } catch (e) { toast("등록 실패: " + e.message, 6000); $("#btnImportRun").disabled = false; }
};

// ---------- 키워드 / 수신자 ----------
const DEFAULT_KEYWORDS = [
  ["부정당업자", "red", "ko", 1], ["입찰참가자격 제한", "red", "ko", 0], ["입찰 참가 제한", "red", "ko", 0], ["영업정지", "red", "ko", 0],
  ["회생절차", "red", "ko", 0], ["법정관리", "red", "ko", 0], ["부도", "red", "ko", 0],
  ["담합", "orange", "ko", 1], ["과징금", "orange", "ko", 1], ["압수수색", "orange", "ko", 1], ["기소", "orange", "ko", 0], ["구속", "orange", "ko", 0],
  ["뇌물", "orange", "ko", 1], ["횡령", "orange", "ko", 1], ["배임", "orange", "ko", 0], ["허위", "orange", "ko", 0], ["공정위", "orange", "ko", 0], ["제재", "orange", "ko", 1],
  ["의혹", "yellow", "ko", 0], ["고발", "yellow", "ko", 0], ["중대재해", "yellow", "ko", 0], ["부실시공", "yellow", "ko", 0], ["소송", "yellow", "ko", 0],
  ["debar", "red", "en", 0], ["sanction", "orange", "en", 0], ["bribery", "orange", "en", 0], ["corruption", "orange", "en", 0], ["fraud", "orange", "en", 0],
  ["collusion", "orange", "en", 0], ["bid rigging", "orange", "en", 0], ["korupsi", "orange", "id", 0], ["tersangka", "orange", "id", 0], ["suap", "orange", "id", 0],
];
async function loadDefaultKeywords(silent) {
  const have = new Set(state.keywords.map((k) => k.word));
  const batch = writeBatch(db); let n = 0;
  for (const [word, level, lang, q] of DEFAULT_KEYWORDS) {
    if (have.has(word)) continue;
    const ref = doc(collection(db, "keywords"));
    const data = { word, level, lang, use_in_query: q };
    batch.set(ref, data); state.keywords.push({ id: ref.id, ...data }); n++;
  }
  if (n) await batch.commit();
  if (!silent) { toast(`기본 키워드 ${n}개를 추가했습니다`); renderAdmin(); }
}
$("#btnKwDefault").onclick = () => loadDefaultKeywords(false);
$("#kwForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const word = String(fd.get("word")).trim();
  if (!word || state.keywords.some((k) => k.word === word)) return toast("이미 있는 키워드입니다");
  const data = { word, level: fd.get("level"), lang: fd.get("lang"), use_in_query: fd.get("use_in_query") ? 1 : 0 };
  const ref = await addDoc(collection(db, "keywords"), data);
  state.keywords.push({ id: ref.id, ...data });
  ev.target.reset(); renderAdmin();
};
$("#rcForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const fd = Object.fromEntries(new FormData(ev.target));
  const email = fd.email.trim();
  if (state.recipients.some((r) => r.email === email)) return toast("이미 등록된 주소입니다");
  const data = { email, name: fd.name?.trim() || null, active: true };
  const ref = await addDoc(collection(db, "recipients"), data);
  state.recipients.push({ id: ref.id, ...data });
  ev.target.reset(); renderAdmin();
};

// ---------- 시스템 ----------
function renderSystem() {
  const s = state.status, c = s.connections || {};
  const lists = s.sanction_lists ? Object.entries(s.sanction_lists).map(([k, v]) => `${k} ${v}`).join(", ") : "";
  const rows = [
    ["네이버 뉴스 검색 API", c.naver, "Secret: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET"],
    ["Google News RSS", c.google_news ?? true, "키 불필요"],
    ["Claude AI 판정", c.claude, c.claude ? `모델 ${s.claude_model}` : "Secret: ANTHROPIC_API_KEY (없으면 키워드 규칙 판정)"],
    ["DART 기업정보", c.dart, s.corp_master ? `기업목록 ${Number(s.corp_master).toLocaleString()}개 · ${s.dart_synced_at}` : "Secret: DART_API_KEY → Actions에서 dart 작업 1회 실행"],
    ["MDB 제재리스트", !!lists && !/오류/.test(lists), lists || "첫 스캔 때 자동으로 내려받습니다"],
    ["조달청 부정당제재 API", c.pps, "Secret: DATA_GO_KR_KEY / PPS_SANCTION_API_URL"],
    ["메일 발송 (SMTP)", c.smtp, "Secret: SMTP_USER / SMTP_PASSWORD"],
  ];
  const known = !!s.connections;
  $("#connList").innerHTML = (known ? "" : `<div class="notice">아직 Actions가 실행된 적이 없어 연결 상태를 알 수 없습니다.</div>`) +
    rows.map(([k, ok, d]) => `<div class="conn"><div><div class="k">${k}</div><div class="d">${esc(d)}</div></div>${!known ? `<span class="badge yellow">확인 전</span>` : ok ? `<span class="badge none">연결됨</span>` : `<span class="badge yellow">미설정</span>`}</div>`).join("");
  const KIND = { scan: "스캔", report: "리포트 발송", dart: "DART 기업목록" };
  $("#runList").innerHTML = state.runs.map((r) => `<div class="run"><b>${esc(KIND[r.kind] || r.kind)}</b> · ${esc(r.at)} ${r.ok ? `<span class="badge none">정상</span>` : `<span class="badge orange">일부 오류</span>`}<pre>${esc(JSON.stringify(r.detail, null, 1)).slice(0, 1500)}</pre></div>`).join("")
    || `<div class="empty">실행 이력 없음</div>`;
}

// ---------- 리포트 ----------
async function loadReport() {
  const snap = await getDoc(doc(db, "meta", "report_preview"));
  const d = snap.exists() ? snap.data() : null;
  $("#reportFrame").srcdoc = d?.html || `<p style="font-family:sans-serif;color:#667085;padding:24px">아직 생성된 리포트가 없습니다. 스캔을 한 번 실행하면 미리보기가 만들어집니다.</p>`;
  $("#reportMeta").textContent = d ? `${d.generated_at} 생성 · 신규 ${d.items}건 · 제목: ${d.subject}` : "아직 생성된 리포트가 없습니다.";
}
$("#btnTestSend").onclick = () => actionsGuide("테스트 메일 보내기", "report-test", "<br>· <b>테스트 메일 받을 주소</b>에 내 이메일 입력");
$("#btnSend").onclick = () => actionsGuide("수신자 전체에게 지금 발송", "report", "<br>· 매일 07:30에는 자동 발송되므로 보통은 필요 없습니다");
