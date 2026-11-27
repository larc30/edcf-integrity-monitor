// 매뉴얼 캡처·동영상 공통: 데모 화면 열기 (Pretendard 글꼴은 받아 둔 파일로 대신 줌)
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const FONT = path.join(__dirname, '..', 'font', 'web');
const BASE = process.env.BASE || 'http://localhost:8765';
async function open(opt = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: opt.w || 1600, height: opt.h || 900 }, deviceScaleFactor: opt.dsf || 1, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await ctx.route('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/**', (r) => {
    const f = path.join(FONT, r.request().url().split('/dist/web/variable/')[1].split('?')[0].replace('.min.css', '.css'));
    if (!fs.existsSync(f)) return r.abort();
    r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.css') ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' } });
  });
  // 실제 계정의 메일 주소와 아이디(메일 앞부분: 담당자 이름으로 보임)는 화면에서 가상 이름으로 바꿔 보여 줌
  const REPO = process.env.REPO || '/home/user/edcf-integrity-monitor';
  const mails = [...new Set((fs.readFileSync(REPO + '/assets/firebase-config.js', 'utf8').match(/[\w.+-]+@gmail\.com/g) || []))];
  await ctx.addInitScript((mails) => {
    const pairs = []; mails.forEach((m, i) => { pairs.push([m, `admin${i + 1}@example.com`]); pairs.push([m.split('@')[0], `admin${i + 1}`]); });
    const hit = (s) => pairs.some(([a]) => s.includes(a));
    const sub = (s) => { for (const [a, b] of pairs) if (s.includes(a)) s = s.split(a).join(b); return s.replace(/[\w.+-]+@gmail\.com/g, 'user@example.com'); };
    const fixNode = (n) => { if (n.nodeValue && (hit(n.nodeValue) || n.nodeValue.includes('@gmail.com'))) n.nodeValue = sub(n.nodeValue); };
    const fix = (root) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) fixNode(n);
      (root.querySelectorAll ? root.querySelectorAll('[title], [data-tip], [aria-label]') : []).forEach((el) => { for (const a of ['title', 'data-tip', 'aria-label']) { const v = el.getAttribute(a); if (v && (hit(v) || v.includes('@gmail.com'))) el.setAttribute(a, sub(v)); } }); };
    const start = () => { fix(document.body); new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') fixNode(m.target); else m.addedNodes.forEach((n) => { if (n.nodeType === 3) fixNode(n); else if (n.nodeType === 1) fix(n); }); } }).observe(document.body, { childList: true, subtree: true, characterData: true }); };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }, mails);
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '/index.html?demo=1' + (opt.q || '')); await p.waitForTimeout(2800);
  await p.evaluate(() => document.fonts.ready);
  return { b, ctx, p, errs };
}
module.exports = { open, BASE };
