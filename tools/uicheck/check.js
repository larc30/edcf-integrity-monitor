// JG css 확인: 데모 화면을 띄워 글자 크기 · 버튼/입력칸 높이 · 카드 여백 · 줄 맞춤 · 넘침을 재고 어긋난 곳을 뽑음
// 쓰는 법 (저장소 맨 위에서):  python3 -m http.server 8765 &   →   node tools/uicheck/check.js [geo|home|all] [캡처 저장 폴더]
// 사업 190개로 부풀린 데모(실제 규모)에서 1680 · 1280 폭, 어두운 · 밝은 화면을 봄. 숫자만 뽑으므로 캡처는 꼭 눈으로도 볼 것
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../.."), which = process.argv[2] || "all", OUT = process.argv[3] || "";
const VIEWS = { home: ["#view-home", "업체 리스크"], geo: ["#view-geo", "수원국 리스크"] };
const FS_OK = [12, 13, 15, 16, 20, 30]; // --fs-xs · sm · base · md · lg · xl (글자 크기 보통일 때 px)
const H_OK = [28, 34, 38, 40, 44]; // --h-s · --h-m · 필터 묶음 · --h-l · 화면 제목 줄 버튼

const big = () => {
  const src = fs.readFileSync(path.join(ROOT, "demo/data.js"), "utf8");
  const extra = `
  { const CC = ["KE","TZ","MN","LA","BD","VN","KH","UZ","PH","ET","GH","MM","LK","NP","RW","UG","EG","BO","PY","CO","PE","EC","GT","SN","MZ"]; const TT = ["ict","water","transport","health"]; const KK = ["행정정보망 고도화사업","상수도 확충사업","교통관제센터 구축사업","국립병원 현대화사업","변전소 현대화사업","재난 조기경보 시스템 구축사업"];
    for (let i = 0; i < 181; i++) projects["x" + i] = { name: "시험" + i + " " + KK[i % KK.length], country: CC[i % CC.length], team: TT[i % 4], owner: OTHER, created_at: "9" + i }; }
`;
  const mod = src.replace(/(p9: \{[^\n]*\n  \};)/, `$1${extra}`);
  if (mod === src) throw new Error("demo/data.js 모양이 바뀌어 사업을 부풀리지 못함");
  return mod;
};

// 브라우저 안에서 재는 부분
const measure = ({ root, FS_OK, H_OK }) => {
  const R = document.querySelector(root), out = { fonts: {}, fontOdd: [], heights: {}, heightOdd: [], pads: {}, cols: [], clipped: [], spill: [], wraps: [], heads: [] };
  const vis = (el) => { const r = el.getBoundingClientRect(), c = getComputedStyle(el); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none" && +c.opacity > 0.05; };
  const name = (el) => { const c = [...el.classList].slice(0, 2).join("."); const p = el.parentElement; return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${c ? "." + c : ""} ‹ ${p ? (p.id ? "#" + p.id : "." + [...p.classList].slice(0, 1).join(".")) : ""}`; };
  const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24);
  const inMap = (el) => !!el.closest(".leaflet-container, svg");
  // 1) 글자 크기: 글자를 직접 가진 요소만
  R.querySelectorAll("*").forEach((el) => {
    if (!vis(el) || inMap(el)) return;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) return;
    const c = getComputedStyle(el), px = Math.round(parseFloat(c.fontSize) * 10) / 10;
    out.fonts[px] = (out.fonts[px] || 0) + 1;
    if (el.closest(".rk-num, .itip, .gpin, .gp-no")) return; // 정해 둔 예외: 등급 숫자 · i 표시 · 핀 번호
    if (!FS_OK.some((v) => Math.abs(v - px) < 0.3)) out.fontOdd.push(`${px}px · ${name(el)} · "${txt(el)}"`);
  });
  // 2) 버튼·입력칸 높이
  R.querySelectorAll("button, input, select, .btn").forEach((el) => {
    if (!vis(el) || inMap(el)) return;
    const h = Math.round((el.closest(".seg") && el.tagName === "BUTTON" ? el.closest(".seg") : el).getBoundingClientRect().height); // 필터 묶음은 묶음 높이로
    out.heights[h] = (out.heights[h] || 0) + 1;
    if (!H_OK.some((v) => Math.abs(v - h) <= 1) && el.matches(".btn, input, select, .seg button, .sc-btn")) out.heightOdd.push(`${h}px · ${name(el)} · "${txt(el)}"`);
  });
  // 3) 카드 여백 · 제목 크기
  R.querySelectorAll(".card").forEach((el) => { if (!vis(el)) return; const c = getComputedStyle(el); out.pads[name(el)] = `${c.paddingTop} ${c.paddingRight} ${c.paddingBottom} ${c.paddingLeft}`; });
  R.querySelectorAll("h2").forEach((el) => { if (!vis(el)) return; const c = getComputedStyle(el), r = el.getBoundingClientRect(), card = el.closest(".card")?.getBoundingClientRect(); out.heads.push(`${parseFloat(c.fontSize)}px/${c.fontWeight} · 카드 왼쪽에서 ${card ? Math.round(r.left - card.left) : "?"}px · 위에서 ${card ? Math.round(r.top - card.top) : "?"}px · "${txt(el)}"`); });
  // 4) 가운데 세 칸의 위·아래 끝
  [".d-risk", ".d-radar, .d-map", ".d-projects"].forEach((s) => { const el = R.querySelector(s); if (el && vis(el)) { const r = el.getBoundingClientRect(); out.cols.push(`${s} 위 ${Math.round(r.top)} · 아래 ${Math.round(r.bottom)} · 폭 ${Math.round(r.width)}`); } });
  // 5) 잘린 글자(말줄임) · 카드 밖으로 넘침 · 한 줄이어야 할 줄이 두 줄
  R.querySelectorAll("*").forEach((el) => {
    if (!vis(el) || inMap(el) || !el.children.length && !txt(el)) return;
    const c = getComputedStyle(el), r = el.getBoundingClientRect();
    if (c.overflow.includes("hidden") && el.scrollWidth > el.clientWidth + 1 && c.textOverflow === "ellipsis") out.clipped.push(`${name(el)} · "${txt(el)}"`);
    const card = el.closest(".card");
    if (card && card !== el) { const k = card.getBoundingClientRect(); if (r.right > k.right + 1 || r.left < k.left - 1) { const sc = el.closest(".plist, .issue-scroll, [style*='overflow']"); if (!sc) out.spill.push(`${name(el)} · 카드 밖 ${Math.round(Math.max(r.right - k.right, k.left - r.left))}px · "${txt(el)}"`); } }
    if (el.matches(".gc-h, .gc-pt, .card-head, .pj-top, .ev-top, .d-title, .ctrl-row, .seg, .item-top, .rk")) { const lh = parseFloat(c.lineHeight) || parseFloat(c.fontSize) * 1.5; const kids = [...el.children].filter(vis).map((k) => k.getBoundingClientRect()); const tops = kids.map((k) => Math.round(k.top + k.height / 2)); if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > lh * 0.9 && !el.matches(".rk")) out.wraps.push(`${name(el)} · "${txt(el)}"`); }
  });
  return out;
};

(async () => {
  const b = await chromium.launch(), data = big(), todo = which === "all" ? Object.keys(VIEWS) : [which];
  let bad = 0;
  for (const [w, h] of [[1680, 1050], [1280, 800]]) for (const theme of ["dark", "light"]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.route("**/demo/data.js", (r) => r.fulfill({ contentType: "application/javascript", body: data }));
    await p.addInitScript((t) => { try { localStorage.setItem("edcf_theme3", t); } catch {} }, theme);
    await p.goto("http://localhost:8765/index.html?demo=1"); await p.waitForTimeout(2800);
    for (const v of todo) {
      const [root, label] = VIEWS[v];
      await p.evaluate((l) => { const x = [...document.querySelectorAll("button")].find((y) => y.textContent.includes(l)); x && x.click(); }, label);
      await p.waitForTimeout(v === "geo" ? 3000 : 800);
      for (const scope of ["mine", "all"]) {
        const sb = await p.$(`${root} [data-s="${scope}"]`); if (sb) { await sb.click(); await p.waitForTimeout(v === "geo" ? 1800 : 700); }
        const m = await p.evaluate(measure, { root, FS_OK, H_OK }), tag = `${v}-${w}-${theme}-${scope}`;
        if (OUT) await p.screenshot({ path: path.join(OUT, `${tag}.png`), fullPage: true });
        const lines = [];
        if (errs.length) lines.push(`  화면 오류: ${errs.join(" / ")}`);
        if (m.fontOdd.length) lines.push(`  규격 밖 글자 크기 ${m.fontOdd.length}: ${[...new Set(m.fontOdd)].slice(0, 12).join(" | ")}`);
        if (m.heightOdd.length) lines.push(`  규격 밖 버튼·입력칸 높이 ${m.heightOdd.length}: ${[...new Set(m.heightOdd)].slice(0, 10).join(" | ")}`);
        if (m.spill.length) lines.push(`  카드 밖으로 넘침 ${m.spill.length}: ${[...new Set(m.spill)].slice(0, 8).join(" | ")}`);
        if (m.wraps.length) lines.push(`  한 줄이어야 할 줄이 두 줄 ${m.wraps.length}: ${[...new Set(m.wraps)].slice(0, 8).join(" | ")}`);
        const b3 = m.cols.map((c) => +c.match(/아래 (\d+)/)[1]), t3 = m.cols.map((c) => +c.match(/위 (\d+)/)[1]);
        if (w > 1100 && v === "geo" && (Math.max(...b3) - Math.min(...b3) > 2 || Math.max(...t3) - Math.min(...t3) > 2)) lines.push(`  가운데 세 칸의 위·아래 끝이 안 맞음: ${m.cols.join(" | ")}`);
        bad += lines.length;
        console.log(`\n■ ${tag}${lines.length ? "" : "  이상 없음"}`); lines.forEach((l) => console.log(l));
        if (scope === "all" && theme === "dark" && w === 1680) {
          console.log(`  (참고) 글자 크기별 수: ${JSON.stringify(m.fonts)}`);
          console.log(`  (참고) 버튼·입력칸 높이별 수: ${JSON.stringify(m.heights)}`);
          console.log(`  (참고) 카드 제목: ${m.heads.join(" | ")}`);
          console.log(`  (참고) 카드 여백: ${Object.entries(m.pads).map(([k, x]) => `${k} = ${x}`).join(" | ")}`);
          console.log(`  (참고) 세 칸: ${m.cols.join(" | ")}`);
          console.log(`  (참고) 말줄임으로 잘린 글자 ${m.clipped.length}: ${[...new Set(m.clipped)].slice(0, 10).join(" | ")}`);
        }
      }
    }
    await p.close();
  }
  console.log(`\n어긋난 항목 ${bad}개`);
  await b.close();
})();
