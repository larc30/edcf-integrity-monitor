// 쪽마다 내용이 넘치는지(잘리는지) · 아래 빈 공간이 얼마인지
const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 794, height: 1123 } });
  await p.goto('file://' + path.join(__dirname, 'manual.html')); await p.emulateMedia({ media: 'print' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  const r = await p.evaluate(() => [...document.querySelectorAll('section')].map((s, i) => { const sr = s.getBoundingClientRect(); let bottom = 0; for (const c of s.children) bottom = Math.max(bottom, c.getBoundingClientRect().bottom); const mm = (px) => Math.round(px * 25.4 / 96); return { 쪽: i + 1, 제목: (s.querySelector('h2')?.innerText || '표지').replace(/\s+/g, ' ').slice(0, 26), 넘침mm: Math.max(0, mm(s.scrollHeight - s.clientHeight)), 빈곳mm: mm(sr.bottom - bottom) }; }));
  r.forEach((x) => console.log(String(x.쪽).padStart(2), (x.넘침mm ? '넘침 ' + x.넘침mm + 'mm' : '').padEnd(10), '빈곳', String(x.빈곳mm).padStart(3), 'mm ·', x.제목));
  await b.close(); })();
