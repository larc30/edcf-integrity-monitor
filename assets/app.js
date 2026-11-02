// EDCF 부정당업자 모니터링 — GitHub Pages + Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ALLOWED_EMAILS, GITHUB_REPO } from "./firebase-config.js?v=8";

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
  const [p, c, f, k, r, st, runs, cfg] = await Promise.all([
    getDocs(collection(db, "projects")),
    getDocs(collection(db, "companies")),
    getDocs(query(collection(db, "findings"), where("relevant", "==", true))),
    getDocs(collection(db, "keywords")),
    getDocs(collection(db, "recipients")),
    getDoc(doc(db, "meta", "status")),
    getDocs(query(collection(db, "runs"), orderBy("at_ms", "desc"), limit(10))),
    getDoc(doc(db, "meta", "settings")),
  ]);
  state.projects = docs(p).sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || a.name.localeCompare(b.name));
  state.companies = docs(c);
  state.findings = docs(f);
  state.keywords = docs(k);
  state.recipients = docs(r);
  state.status = st.exists() ? st.data() : {};
  state.runs = docs(runs);
  state.settings = cfg.exists() ? cfg.data() : {};
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

  // 검사 범위: '정상'이 어디까지 확인한 결과인지
  const cv = coverage();
  const cvItem = (label, n, total, note) => {
    const st = !total ? "na" : n === total ? "ok" : n === 0 ? "bad" : "warn";
    return `<span class="cv ${st}"><b>${label}</b> ${total ? `${n}/${total}` : "-"}${note ? ` <span class="muted">${note}</span>` : ""}</span>`;
  };
  const gapCount = state.companies.filter((c) => c.last_check && checkGaps(c).length).length;
  $("#coverage").innerHTML = !cv.scanned ? "" : `<span class="cv-title">검사 범위</span>
    ${cvItem("뉴스 검색", cv.news, cv.scanned)}
    ${cvItem("MDB 제재리스트 대조", cv.mdb, cv.scanned, cv.mdb < cv.scanned ? "(영문명 필요)" : "")}
    ${cv.ppsConnected ? cvItem("조달청 부정당제재 조회", cv.pps, cv.ppsTotal, cv.pps < cv.ppsTotal ? "(사업자번호 필요)" : "") : `<span class="cv na"><b>조달청 부정당제재 조회</b> 미연결</span>`}
    ${gapCount ? `<button class="btn sm" id="btnGaps">보완할 업체 ${gapCount}곳 보기</button>` : ""}`;
  $("#btnGaps")?.addEventListener("click", showGaps);

  // 등급별 업체
  const groupHtml = (lv, list) => {
    if (lv === "none" || lv === "pending") {
      return `<div class="rgroup ${lv}"><div class="rgroup-head">${lv === "pending" ? "스캔 전" : "정상"} <span class="desc">${lv === "pending" ? "아직 스캔하지 않음" : "확인한 범위에서 발견 없음 · ⚠는 일부 확인 못 함"}</span><span class="n">${list.length}개</span></div>
        <div class="rgroup-body"><div class="chipwrap">${list.map((c) => { const g = lv === "none" ? checkGaps(c) : []; return `<span class="nchip ${g.length ? "partial" : ""}" data-cid="${c.id}" title="${esc(g.join(" / "))}">${g.length ? "⚠ " : ""}${esc(c.name)}</span>`; }).join("") || `<span class="muted small">없음</span>`}</div></div></div>`;
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
function coverage() {
  const cs = state.companies.filter((c) => c.last_check);
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
    <div class="actions left" style="margin-top:0">
      <button class="btn primary" id="dScan">이 업체만 다시 스캔</button>
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
      <h2>식별 정보 <span class="muted small" style="font-weight:500">— 정확한 조회에 필요합니다</span></h2>
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
        <label>메모<input name="note" value="${esc(c.note || "")}"></label>
        <div class="actions"><button class="btn primary">저장</button></div>
      </form>
      <p class="muted small" style="margin:6px 0 0">사업자번호는 DART에 있는 업체면 스캔 때 자동으로 채워집니다. 건축사사무소·대학·소규모 업체는 직접 입력하세요.</p>
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
    </details>`;
  if (fs.length) renderFeed(fs, $("#dFeed"), false);
  if (dismissed.length) renderFeed(dismissed, $("#dDismissed"), false);
  $("#dScan").onclick = () => runWorkflow({ task: "scan", companies: c.name }, `'${c.name}' 재스캔`);
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
        j.status = { pending: "queued", running: "in_progress", done: "completed", error: "completed" }[d.status] || "queued";
        j.conclusion = d.status === "done" ? "success" : d.status === "error" ? "failure" : null;
        j.error = d.result?.error;
      }
    } else {
      const r = await gh("/actions/workflows/monitor.yml/runs?event=workflow_dispatch&per_page=5");
      if (r.ok) {
        const run = (await r.json()).workflow_runs?.find((x) => new Date(x.created_at).getTime() >= j.started - 20000);
        if (run) { j.status = run.status; j.conclusion = run.conclusion; j.url = run.html_url; }
      }
    }
  } catch {}
  const limit = j.mode === "queue" ? 90 * 60e3 : 45 * 60e3;
  if (j.status === "completed") {
    j.done = true;
    try { localStorage.removeItem(JOB_KEY); } catch {}
    if (j.conclusion === "success") { await loadAll(); rerender(); toast(`${j.label} 완료 — 결과를 반영했습니다`, 4000); }
    else toast(`${j.label} 실패${j.error ? `: ${j.error}` : ""}`, 7000);
  } else if (Date.now() - j.started > limit) { j.done = true; j.status = "timeout"; try { localStorage.removeItem(JOB_KEY); } catch {} }
  else setTimeout(trackJob, j.mode === "queue" ? 15000 : 6000);
  renderJob();
}
function renderJob() {
  const j = state.job, el = $("#jobState");
  if (!el) return;
  if (!j) { el.innerHTML = ""; return; }
  const sec = Math.round((Date.now() - j.started) / 1000), mmss = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const link = j.url ? ` · <a href="${esc(j.url)}" target="_blank" rel="noopener">진행 보기 ↗</a>` : j.mode === "queue" ? ` · <a href="${ACTIONS_URL}" target="_blank" rel="noopener">GitHub ↗</a>` : "";
  const late = j.mode === "queue" && !j.done && j.status !== "in_progress" && sec > 25 * 60;
  const waiting = j.mode === "queue" ? (j.relayed ? "곧 시작 (1~2분)" : "요청됨 · GitHub 예약 확인 대기") : "대기 중";
  if (late) {
    el.innerHTML = `<span class="job bad">⚠ ${esc(j.label)} ${mmss}째 대기 — GitHub 예약 실행이 지연 중입니다 · <a href="${ACTIONS_URL}" target="_blank" rel="noopener">직접 실행 ↗</a> (Run workflow → queue)</span>`;
    return;
  }
  el.innerHTML = !j.done ? `<span class="job run">⏳ ${esc(j.label)} ${j.status === "in_progress" ? "실행 중" : waiting} ${mmss}${link}</span>`
    : j.conclusion === "success" ? `<span class="job ok">✓ ${esc(j.label)} 완료</span>`
    : `<span class="job bad" title="${esc(j.error || "")}">✕ ${esc(j.label)} ${j.status === "timeout" ? "확인 시간 초과" : "실패"}${link}</span>`;
}
setInterval(() => { if (state.job && !state.job.done) renderJob(); }, 1000);
$("#btnScan").onclick = () => runWorkflow({ task: "scan" }, "전체 스캔");
// 새로고침 후에도 진행 중이던 작업 이어서 추적
try { const s = JSON.parse(localStorage.getItem(JOB_KEY) || "null"); if (s && Date.now() - s.started < 90 * 60e3) { state.job = { ...s, status: "queued" }; setTimeout(trackJob, 1500); } } catch {}

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
    ["네이버 뉴스", c.naver, "Secret: NAVER_APIHUB_KEY_ID / NAVER_APIHUB_KEY (네이버 클라우드 NAVER API HUB)"],
    ["메일 발송", c.smtp, "Secret: SMTP_USER / SMTP_PASSWORD"],
    ["MDB 제재리스트", !!lists && !/오류/.test(lists), lists || "스캔 때 자동으로 내려받음"],
    ["조달청 부정당제재", c.pps, "Secret: DATA_GO_KR_KEY (공공데이터포털 '나라장터 사용자정보 서비스' Decoding 키)"],
    ["DART 기업정보", c.dart, "Secret: DART_API_KEY — 사업자번호·영문명 자동 채움"],
    ["AI 판정 (Claude)", c.claude, c.claude ? `모델 ${s.claude_model}` : "Secret: ANTHROPIC_API_KEY (없으면 키워드 판정)"],
  ];
  $("#connList").innerHTML = (known ? "" : `<div class="notice">아직 스캔이 실행되지 않아 GitHub 쪽 연결 상태를 알 수 없습니다. 첫 스캔 후 표시됩니다.</div>`) +
    rows.map(([k, ok, d, always]) => `<div class="conn"><div><div class="k">${k}</div><div class="d">${esc(d)}</div></div>${always || known ? (ok ? `<span class="badge none">연결됨</span>` : `<span class="badge yellow">미설정</span>`) : `<span class="badge" style="background:var(--gray-bg);color:var(--gray)">확인 전</span>`}</div>`).join("")
    + `<div class="conn"><div><div class="k">즉시 실행 (선택)</div><div class="d">${ghToken() ? "GitHub 토큰 등록됨 — GitHub에 닿는 망에서는 바로 시작" : "토큰 없이도 실행 요청은 됩니다(5~20분 대기). 개인망에서 바로 시작하려면 GitHub 토큰 등록"}</div></div>
        ${ghToken() ? `<button class="btn sm ghost" id="tokClear">삭제</button>` : `<button class="btn sm" id="tokSet">등록</button>`}</div>
      <div class="conn relay"><div style="flex:1"><div class="k">즉시 실행 중계 (Google Apps Script)</div>
          <div class="d">${state.settings?.relay_url ? "설정됨 — [지금 스캔]이 1~2분 안에 시작됩니다" : "미설정 — [지금 스캔]이 GitHub 예약 확인 때까지 대기합니다. README '즉시 실행 중계' 참고"}</div>
          <div class="add-row" style="margin:6px 0 0"><input id="relayUrl" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(state.settings?.relay_url || "")}">
            <button class="btn sm" id="relaySave">저장</button><button class="btn sm" id="relayTest">연결 테스트</button></div></div></div>
      <div class="actions left">
        <button class="btn sm" id="runTestMail">테스트 메일 받기 (내 주소)</button>
        <button class="btn sm" id="runMailAll">수신자 전체 발송</button>
        <button class="btn sm" id="runDart">DART 기업목록 갱신</button>
      </div>`;
  $("#tokSet")?.addEventListener("click", () => tokenSetup(() => renderConnections()));
  $("#tokClear")?.addEventListener("click", () => { setGhToken(""); toast("토큰을 삭제했습니다"); renderConnections(); });
  $("#runTestMail").onclick = () => runWorkflow({ task: "report-test", test_to: auth.currentUser.email }, "테스트 메일 발송");
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
      toast(d.service === "edcf-relay" ? (d.token ? "✓ 중계기 연결됨 (GitHub 토큰 설정됨)" : "중계기는 연결됐지만 스크립트 속성에 GITHUB_TOKEN이 없습니다") : "응답이 올바르지 않습니다", 5000);
    } catch (e) { errorModal("중계기에 연결하지 못했습니다", e.message, ["배포 시 <b>액세스 권한: 모든 사용자</b>로 했는지 확인", "웹 앱 URL(…/exec)을 정확히 복사했는지 확인", "회사망에서 script.google.com이 막혀 있을 수 있음"]); }
  };
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
