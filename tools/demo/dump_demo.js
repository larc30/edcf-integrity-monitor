// 데모(가상 데이터) DB를 JSON으로 꺼냄 → 메일 미리보기 생성에 사용
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html' };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route('**/*', async (route) => { const u = new URL(route.request().url()); if (u.hostname === 'site.test') { const fp = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname); return route.fulfill({ contentType: TYPES[path.extname(fp)] || 'text/plain', body: fs.readFileSync(fp) }); } return route.abort(); });
  await p.goto('http://site.test/?demo=1'); await p.waitForTimeout(2000);
  const db = await p.evaluate(() => JSON.stringify({ db: window.__DB, now: Date.now() }));
  fs.writeFileSync(process.argv[2], db);
  await b.close();
})();
