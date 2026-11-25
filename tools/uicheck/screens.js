// 관리 화면·팝업·오른쪽 창을 한 번씩 띄워 캡처 (두 버전을 견주는 용도). node shots.js <주소> <폴더>
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const base = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const errs = [];
  const fresh = async (view) => {
    const p = await b.newPage({ viewport: { width: 1680, height: 1100 }, deviceScaleFactor: 1 });
    p.on('pageerror', e => errs.push(view + ': ' + e.message));
    await p.addInitScript(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); });
    await p.goto(base + '/index.html?demo=1'); await p.waitForTimeout(2500); if (process.env.THEME) await p.evaluate((t) => { document.documentElement.dataset.theme = t; }, process.env.THEME);
    if (view && view !== 'home') { await p.click('#btnAdmin').catch(() => {}); await p.waitForTimeout(500); await p.click(`#tabs [data-view="${view}"]`).catch(() => {}); await p.waitForTimeout(1200); }
    return p;
  };
  const shot = async (p, name, sel) => { await p.waitForTimeout(500); const el = sel ? await p.$(sel) : null; if (sel && !el) { console.log('  (없음)', name, sel); return; } await (el || p).screenshot({ path: `${out}/${name}.png` }); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.log('  실패', name, String(e.message).split('\n')[0]); } };
  const closeModal = async (p) => { await p.click('#modalClose').catch(() => {}); await p.waitForTimeout(300); };

  // 업체 관리
  let p = await fresh('companies');
  await step('co', async () => { await shot(p, '10-업체관리'); });
  await step('co-add', async () => { await p.click('#btnAddCompany'); await shot(p, '11-업체추가', '#modal'); await p.hover('#modal .btn.primary:not(.sm)'); await shot(p, '11b-업체추가-버튼올림', '#modal'); await closeModal(p); });
  await step('co-edit', async () => { await p.click('#coTable tbody tr td .co-name, #coTable tbody tr [data-edit], #coTable tbody tr td:nth-child(2) button, #coTable tbody tr td:nth-child(1) button'); await shot(p, '12-업체수정', '#modal'); await closeModal(p); });
  await step('co-bulk', async () => { await p.evaluate(() => document.querySelector('#btnBulk').click()); await shot(p, '13-일괄등록', '#modal'); await closeModal(p); });
  await step('co-more', async () => { const bt = await p.$('#coMoreBtn, [data-comore], #btnCoMore'); if (bt) { await bt.click(); await shot(p, '14-상세필터'); } });
  await p.close();
  // 사업 관리
  p = await fresh('projects');
  await step('pj', async () => { await shot(p, '20-사업관리'); });
  await step('pj-add', async () => { await p.click('#btnAddProject'); await p.waitForTimeout(1500); await shot(p, '21-사업등록', '#modal'); await closeModal(p); });
  await p.close();
  // 설정
  p = await fresh('settings');
  await step('set', async () => { await shot(p, '30-설정'); await p.hover('#btnPreview'); await shot(p, '30b-설정-메일버튼올림'); });
  await step('set-adv', async () => { await p.evaluate(() => { const d = document.querySelector('#advCard'); if (d) d.open = true; }); await p.waitForTimeout(800); await p.evaluate(() => document.querySelector('#advCard')?.scrollIntoView()); await shot(p, '31-설정-고급'); await p.hover('#btnConnCheck'); await shot(p, '31b-고급-연결확인올림'); });
  await step('set-mail', async () => { await p.evaluate(() => window.scrollTo(0, 0)); await p.click('#btnPreview'); await p.waitForTimeout(1500); await shot(p, '32-메일미리보기', '#modal'); await closeModal(p); });
  await p.close();
  // 업체 리스크의 팝업·오른쪽 창
  p = await fresh('home');
  await step('report', async () => { await p.click('#btnReport'); await p.waitForTimeout(1500); await shot(p, '40-보고서', '#modal'); await closeModal(p); });
  await step('official', async () => { await p.click('#noteCard'); await p.waitForTimeout(800); await shot(p, '41-공식제재명단', '#modal'); await closeModal(p); });
  await step('guide', async () => { await p.click('#btnGuide'); await p.waitForTimeout(800); await shot(p, '42-판단가이드', '#modal'); await closeModal(p); });
  await step('risklist', async () => { await p.click('#kboard .rk.red'); await p.waitForTimeout(800); await shot(p, '43-등급별업체', '#drawer'); await p.click('#drawerClose, #drawer .x, #drawer [data-close]').catch(() => {}); await p.keyboard.press('Escape'); });
  await step('company', async () => { await p.click('#feed .item-company'); await p.waitForTimeout(1000); await shot(p, '44-업체상세', '#drawer'); await p.keyboard.press('Escape'); await p.waitForTimeout(300); });
  await step('dismiss', async () => { await p.click('#feed .act-no'); await p.waitForTimeout(600); await shot(p, '45-관련없음이유', '#modal'); await closeModal(p); });
  await step('acct', async () => { await p.click('#acctBtn, .acct-btn, #userBtn').catch(() => {}); await shot(p, '46-계정메뉴'); });
  await p.close();
  p = await fresh('home');
  await step('project', async () => { await p.click('#projectMap .pj'); await p.waitForTimeout(1000); await shot(p, '47-사업상세', '#drawer'); });
  await p.close();
  console.log('화면 오류', errs.length ? errs : '없음'); await b.close();
})();
