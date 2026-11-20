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
// 영문자를 한글 이름으로 읽은 것: '삼성SDS' 로 찾아도 DART 의 '삼성에스디에스'가 나오게 (monitor/sources/dart.ko 와 같게)
const KO_LETTER = { a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치", i: "아이", j: "제이", k: "케이", l: "엘", m: "엠", n: "엔", o: "오", p: "피", q: "큐", r: "알", s: "에스", t: "티", u: "유", v: "브이", w: "더블유", x: "엑스", y: "와이", z: "제트" };
const ko = (k) => k.replace(/[a-z]/g, (ch) => KO_LETTER[ch]);
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
  const idx = new Map(), idx2 = new Map(), list = [], byCode = new Map(), tag = (b, t) => { const m = b.match(new RegExp(`<${t}>([^<]*)</${t}>`)); return m ? unesc(m[1]) : ""; };
  for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const code = tag(m[1], "corp_code"), name = tag(m[1], "corp_name");
    if (!code || !name) continue;
    const k = norm(name), k2 = ko(k), row = [code, name, tag(m[1], "corp_eng_name"), tag(m[1], "stock_code")];
    if (idx.has(k)) idx.get(k).push(row); else idx.set(k, [row]);
    if (idx2.has(k2)) idx2.get(k2).push(row); else idx2.set(k2, [row]);
    list.push([k, row, k2]); byCode.set(code, row);
  }
  return { idx, idx2, list, byCode };
}
// 이름 찾기: 정확히 같은 이름 먼저 → 이름에 그 글자가 들어 있는 곳(앞이든 뒤든, '롯데' → 호텔롯데도). 상장사 → 짧은 이름 → 그 글자로 시작하는 곳 순서
function searchMaster(m, name, limit = 8) {
  const target = norm(name);
  if (target.length < 2) return [];
  // 영문자를 한글로 읽은 이름으로도 맞춰 봄 (삼성SDS = 삼성에스디에스, 엘지 = LG)
  const t2 = ko(target), exact = [...new Set([...(m.idx.get(target) || []), ...((m.idx2 && m.idx2.get(t2)) || [])])];
  const out = exact.slice(0, limit).map((r) => [r, true]);
  if (out.length < limit) {
    const part = m.list.filter(([k, r, k2]) => !exact.includes(r) && (k.includes(target) || (k2 || k).includes(t2)));
    part.sort((x, y) => (!!y[1][3] - !!x[1][3]) || (x[0].length - y[0].length) || (y[0].startsWith(target) - x[0].startsWith(target)));
    for (const [, r] of part.slice(0, limit - out.length)) out.push([r, false]);
  }
  return out;
}
// 기업목록(이름 → 고유번호)은 함수가 살아 있는 동안 기억해 두고 하루에 한 번만 다시 받음
// 함수가 새로 뜰 때마다 DART 에서 목록(수 MB)을 받으면 10~20초가 걸려서, 받은 목록을 Firestore(dart_master)에 압축해 두고
// 새로 뜬 함수는 거기서 읽음(1초 안팎). 저장본이 3일 넘었으면 DART 에서 다시 받아 바꿔 둠.
let master = null, masterAt = 0, masterJob = null;
const CACHE_COL = "dart_master", CACHE_DAYS = 3, CHUNK = 900 * 1024;
const packRows = (m) => zlib.gzipSync(Buffer.from(m.list.map(([, r]) => r.join("\t")).join("\n"), "utf8"));
function unpackRows(buf) {
  const idx = new Map(), idx2 = new Map(), list = [], byCode = new Map();
  for (const line of zlib.gunzipSync(buf).toString("utf8").split("\n")) {
    const row = line.split("\t"); if (row.length < 4 || !row[0]) continue;
    const k = norm(row[1]), k2 = ko(k);
    if (idx.has(k)) idx.get(k).push(row); else idx.set(k, [row]);
    if (idx2.has(k2)) idx2.get(k2).push(row); else idx2.set(k2, [row]);
    list.push([k, row, k2]); byCode.set(row[0], row);
  }
  return { idx, idx2, list, byCode };
}
async function readCache(db) {
  const docs = (await db.collection(CACHE_COL).get()).docs.map((d) => d.data()).sort((a, b) => a.i - b.i);
  if (!docs.length || docs.length !== docs[0].n) return null;
  return { at: docs[0].at || 0, m: unpackRows(Buffer.concat(docs.map((d) => Buffer.from(d.data)))) };
}
async function writeCache(db, m) {
  const buf = packRows(m), n = Math.ceil(buf.length / CHUNK), at = Date.now(), batch = db.batch();
  for (let i = 0; i < n; i++) batch.set(db.doc(`${CACHE_COL}/c${i}`), { i, n, at, data: buf.subarray(i * CHUNK, (i + 1) * CHUNK) });
  await batch.commit();
}
async function fromDart(key, get) {
  const r = await get(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${key}`);
  if (!r.ok) throw new Error(`DART 기업목록 HTTP ${r.status}`);
  return parseMaster(unzipFirst(Buffer.from(await r.arrayBuffer())).toString("utf8"));
}
async function loadMaster(key, get = fetch, db = null) {
  if (master && Date.now() - masterAt < 24 * 3600e3) return master;
  masterJob = masterJob || (async () => {
    let c = null;
    if (db) { try { c = await readCache(db); } catch (e) { c = null; } }
    if (c && Date.now() - c.at < CACHE_DAYS * 24 * 3600e3) { master = c.m; masterAt = Date.now(); return master; }
    try {
      master = await fromDart(key, get); masterAt = Date.now();
      if (db) { try { await writeCache(db, master); } catch (e) { /* 저장을 못 해도 찾기는 됨 */ } }
    } catch (e) {
      if (!c) throw e; // DART 가 안 되면 오래된 저장본이라도 씀
      master = c.m; masterAt = Date.now() - 23 * 3600e3;
    }
    return master;
  })().finally(() => { masterJob = null; });
  return masterJob;
}
const adminDb = () => { if (!getApps().length) initializeApp(); return getFirestore(); };
// 기업 1곳의 상세 (사업자번호·대표자·영문명·업종): DART company.json 한 번
async function detail(r, exact, key, get = fetch) {
  let d = {};
  try { const j = await (await get(`https://opendart.fss.or.kr/api/company.json?crtfc_key=${key}&corp_code=${r[0]}`)).json(); if (j.status === "000") d = j; } catch (e) { /* 상세를 못 받아도 후보는 보여 줌 */ }
  return { corp_code: r[0], name: r[1], name_en: d.corp_name_eng || r[2] || "", ceo: d.ceo_nm || "", biz_no: String(d.bizr_no || "").replace(/\D/g, ""),
    listed: !!r[3], induty_code: d.induty_code || "", category: fromKsic(d.induty_code), exact };
}
async function dartLookup(name, biz, key, get = fetch, db = null) {
  const t0 = Date.now(), warm = !!master, rows = searchMaster(await loadMaster(key, get, db), name), t1 = Date.now();
  let out = await Promise.all(rows.map(([r, exact]) => detail(r, exact, key, get)));
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
      const t0 = Date.now(), res = await dartLookup(req.name, req.biz, DART_API_KEY.value(), fetch, adminDb());
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
    if (!fsdb) fsdb = adminDb();
    if (!(await fsdb.doc(`users/${email}`).get()).exists) throw new HttpsError("permission-denied", "등록된 계정이 아닙니다");
  }
  const key = DART_API_KEY.value(), d = request.data || {}, db = adminDb();
  // 고른 기업 한 곳의 상세: 화면이 이름을 같이 보내면 기업목록을 읽지 않고 DART 에 한 번만 물음 (가장 빠른 길)
  if (d.code && d.name) {
    const t0 = Date.now(), code = String(d.code).replace(/\D/g, "").slice(0, 8);
    return { ...(await detail([code, String(d.name).slice(0, 80), String(d.name_en || "").slice(0, 120), d.listed ? "1" : ""], d.exact !== false, key)), ms: Date.now() - t0 };
  }
  if (d.warm) { const w = !!master; await loadMaster(key, fetch, db); return { ok: true, warm: w }; }
  // 이름 목록만 (상세 조회 없이 바로): 업체명을 적는 동안 보여 주는 후보. 고르면 아래 code 로 그 한 곳만 상세 조회
  if (d.q != null) {
    const rows = searchMaster(await loadMaster(key, fetch, db), String(d.q).slice(0, 40), Math.min(Math.max(+d.limit || 30, 1), 50));
    return { items: rows.map(([r, exact]) => ({ corp_code: r[0], name: r[1], name_en: r[2] || "", listed: !!r[3], exact })) };
  }
  if (d.code) {
    const t0 = Date.now(), r = (await loadMaster(key, fetch, db)).byCode.get(String(d.code).replace(/\D/g, "").slice(0, 8));
    if (!r) throw new HttpsError("not-found", "DART 기업목록에 없는 번호입니다");
    return { ...(await detail(r, d.exact !== false, key)), ms: Date.now() - t0 };
  }
  const res = await dartLookup(String(d.name || "").slice(0, 80), String(d.biz || "").slice(0, 20), key, fetch, db);
  logger.info("dart find", { count: res.count, ms: res.ms, warm: res.warm }); // 공개 로그에는 건수·걸린 시간만
  return res;
});
exports._test = { norm, fromKsic, unzipFirst, parseMaster, searchMaster, dartLookup, loadMaster, packRows, unpackRows, readCache, writeCache, reset: () => { master = null; masterAt = 0; } }; // 점검용 (가짜 응답으로 확인) // 점검용 (tools 에서 가짜 응답으로 확인)
