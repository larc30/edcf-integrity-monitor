const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + path.join(__dirname, 'manual.html')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
  await p.pdf({ path: path.join(__dirname, process.argv[2] || 'manual.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#8A93A6;padding:0 15mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>EDCF RADAR 사용 매뉴얼</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: '17mm', bottom: '16mm', left: '15mm', right: '15mm' } });
  await b.close(); })();
