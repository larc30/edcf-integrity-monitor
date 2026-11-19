// 즉시 실행 함수 (선택 사항, 설치 방법은 docs/INSTANT.md)
// 대시보드가 Firestore requests 에 실행 요청을 남기면, 그 순간 GitHub Actions 의 '요청 처리(queue)'를 깨운다.
// → 5분마다 확인하던 대기가 없어지고, 회사망 우회용 Apps Script 중계도 필요 없어진다.
// 업체 추가 창의 [DART에서 가져오기](task dartlookup)는 GitHub 를 거치지 않고 여기서 바로 DART 에 물어 몇 초 안에 답한다.
// 키는 Firebase Secret(GH_TOKEN·DART_API_KEY)에만 두고 화면(브라우저)에는 보내지 않는다.
const zlib = require("zlib");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const GH_TOKEN = defineSecret("GH_TOKEN"); // GitHub 토큰 (이 저장소의 Actions 읽기·쓰기 권한만)
const DART_API_KEY = defineSecret("DART_API_KEY"); // DART 인증키 (GitHub Secrets 의 DART_API_KEY 와 같은 값)
const REPO = "larc30/edcf-integrity-monitor";
const REGION = "asia-northeast3"; // Firestore 데이터베이스 위치와 같게 (docs/INSTANT.md 3번)

// ---------- DART 바로 찾기 (monitor/scanner.dart_lookup 과 같은 결과) ----------
// 업체명 정규화: monitor/textutil.norm 과 같게
const CORP_SUFFIXES = ["주식회사", "(주)", "㈜", "유한회사", "(유)", "합자회사", "사단법인", "재단법인",
  "co., ltd.", "co.,ltd.", "co. ltd.", "co ltd", "company limited", "limited", "ltd.", "ltd",
  "corporation", "corp.", "corp", "inc.", "inc", "llc", "plc", "gmbh", "s.a.", "(persero)", "persero", "tbk"];
function norm(name) {
  let s = String(name || "").toLowerCase().replace(/^pt[.\s]+/, "");
  for (const suf of CORP_SUFFIXES) s = s.split(suf).join(" ");
  return s.replace(/[^0-9a-z가-힣]/g, "");
}
// 업종코드(KSIC) → 분류: monitor/category.from_ksic 과 같게
function fromKsic(code) {
  const c = String(code || "").replace(/\D/g, "");
  if (c.length < 2) return "";
  const d2 = +c.slice(0, 2);
  if (d2 === 41 || d2 === 42) return "건설·시공";
  if (d2 === 72) return "엔지니어링·설계·감리";
  if ([61, 62, 63].includes(d2) || c.startsWith("582")) return "ICT·시스템";
  if (d2 >= 10 && d2 <= 35) return "제조·플랜트";
  if (d2 >= 45 && d2 <= 47) return "상사·유통";
  return "기타";
}
// zip 안의 첫 파일 풀기 (DART 기업목록은 파일 1개짜리 zip, 따로 설치하는 라이브러리 없이 처리)
function unzipFirst(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("DART 기업목록을 받지 못했습니다 (키 또는 사용 한도 확인)");
  const cd = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(cd + 10), size = buf.readUInt32LE(cd + 20), lh = buf.readUInt32LE(cd + 42);
  const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  const data = buf.subarray(start, start + size);
  return method === 0 ? data : zlib.inflateRawSync(data);
}
const unesc = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
function parseMaster(xml) {
  const idx = new Map(), list = [], tag = (b, t) => { const m = b.match(new RegExp(`<${t}>([^<]*)</${t}>`)); return m ? unesc(m[1]) : ""; };
  for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const code = tag(m[1], "corp_code"), name = tag(m[1], "corp_name");
    if (!code || !name) continue;
    const k = norm(name), row = [code, name, tag(m[1], "corp_eng_name"), tag(m[1], "stock_code")];
    if (idx.has(k)) idx.get(k).push(row); else idx.set(k, [row]);
    list.push([k, row]);
  }
  return { idx, list };
}
// 이름 찾기: 정확히 같은 이름 먼저 → 그 이름으로 시작하는 곳 → 이름에 들어 있는 곳(3자 이상일 때). 상장사·짧은 이름 먼저, 모두 8곳까지
function searchMaster(m, name, limit = 8) {
  const target = norm(name);
  if (target.length < 2) return [];
  const out = (m.idx.get(target) || []).slice(0, limit).map((r) => [r, true]);
  if (out.length < limit) {
    const part = m.list.filter(([k]) => k !== target && (k.startsWith(target) || (target.length >= 3 && k.includes(target))));
    part.sort((x, y) => (!!y[1][3] - !!x[1][3]) || (y[0].startsWith(target) - x[0].startsWith(target)) || (x[0].length - y[0].length));
    for (const [, r] of part.slice(0, limit - out.length)) out.push([r, false]);
  }
  return out;
}
// 기업목록(이름 → 고유번호)은 함수가 살아 있는 동안 기억해 두고 하루에 한 번만 다시 받음
let master = null, masterAt = 0, masterJob = null;
async function loadMaster(key, get = fetch) {
  if (master && Date.now() - masterAt < 24 * 3600e3) return master;
  masterJob = masterJob || (async () => {
    const r = await get(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${key}`);
    if (!r.ok) throw new Error(`DART 기업목록 HTTP ${r.status}`);
    master = parseMaster(unzipFirst(Buffer.from(await r.arrayBuffer())).toString("utf8")); masterAt = Date.now();
    return master;
  })().finally(() => { masterJob = null; });
  return masterJob;
}
async function dartLookup(name, biz, key, get = fetch) {
  const t0 = Date.now(), warm = !!master, rows = searchMaster(await loadMaster(key, get), name), t1 = Date.now();
  let out = await Promise.all(rows.map(async ([r, exact]) => {
    let d = {};
    try { const j = await (await get(`https://opendart.fss.or.kr/api/company.json?crtfc_key=${key}&corp_code=${r[0]}`)).json(); if (j.status === "000") d = j; } catch (e) { /* 상세를 못 받아도 후보는 보여 줌 */ }
    return { corp_code: r[0], name: r[1], name_en: d.corp_name_eng || r[2] || "", ceo: d.ceo_nm || "", biz_no: String(d.bizr_no || "").replace(/\D/g, ""),
      listed: !!r[3], induty_code: d.induty_code || "", category: fromKsic(d.induty_code), exact };
  }));
  const b = String(biz || "").replace(/\D/g, ""), same = b ? out.filter((o) => o.biz_no === b) : []; // 사업자번호를 함께 적었으면 그 번호와 맞는 곳만
  if (same.length) out = same;
  return { cands: out, count: out.length, ms: Date.now() - t0, ms_list: t1 - t0, warm };
}
const nowKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace("T", " ");

exports.kickQueue = onDocumentCreated({ document: "requests/{id}", region: REGION, secrets: [GH_TOKEN, DART_API_KEY], memory: "512MiB", timeoutSeconds: 60 }, async (event) => {
  const req = event.data && event.data.data();
  if (!req || req.status !== "pending") return;
  // DART 찾기: 여기서 바로 처리하고 끝 (실패하면 아래로 내려가 예전처럼 GitHub 에 맡김)
  if (req.task === "dartlookup") {
    try {
      const t0 = Date.now(), res = await dartLookup(req.name, req.biz, DART_API_KEY.value());
      await event.data.ref.update({ status: "done", finished_at: nowKst(), result: res, handled_by: "function" });
      logger.info("dart lookup", { count: res.count, ms: Date.now() - t0 }); // 공개 로그에는 건수·걸린 시간만
      return;
    } catch (e) { logger.warn("dart lookup failed, falling back to queue", { error: String(e && e.message || e).slice(0, 120) }); }
  }
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/monitor.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GH_TOKEN.value()}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "edcf-radar-functions" },
    body: JSON.stringify({ ref: "main", inputs: { task: "queue", companies: "", test_to: "" } }),
  });
  // 공개 저장소라 로그에는 작업 종류와 결과 코드만 남긴다 (업체명·메일 주소는 남기지 않음)
  logger.info("queue dispatch", { task: String(req.task || ""), status: r.status });
});

// 화면에서 직접 부르는 DART 찾기 (요청 문서를 거치지 않아 더 빠름). 로그인한 등록 계정만.
// { warm: true } 로 부르면 기업목록만 미리 받아 둠 (업체 추가 창을 열 때 불러서, 버튼을 누를 때는 바로 답하게)
const SUPERS = ["larc30730@gmail.com", "lical0331@gmail.com", "ahra.bella@gmail.com", "juliana0513m@gmail.com"]; // firestore.rules superAdmins() 와 같게
let fsdb = null;
exports.dartFind = onCall({ region: REGION, secrets: [DART_API_KEY], memory: "512MiB", timeoutSeconds: 30 }, async (request) => {
  const tk = request.auth && request.auth.token, email = tk && tk.email_verified ? String(tk.email || "").toLowerCase() : "";
  if (!email) throw new HttpsError("unauthenticated", "로그인이 필요합니다");
  if (!SUPERS.includes(email)) {
    if (!fsdb) { if (!getApps().length) initializeApp(); fsdb = getFirestore(); }
    if (!(await fsdb.doc(`users/${email}`).get()).exists) throw new HttpsError("permission-denied", "등록된 계정이 아닙니다");
  }
  const key = DART_API_KEY.value(), d = request.data || {};
  if (d.warm) { const w = !!master; await loadMaster(key); return { ok: true, warm: w }; }
  const res = await dartLookup(String(d.name || "").slice(0, 80), String(d.biz || "").slice(0, 20), key);
  logger.info("dart find", { count: res.count, ms: res.ms, warm: res.warm }); // 공개 로그에는 건수·걸린 시간만
  return res;
});
exports._test = { norm, fromKsic, unzipFirst, parseMaster, searchMaster, dartLookup }; // 점검용 (가짜 응답으로 확인) // 점검용 (tools 에서 가짜 응답으로 확인)
