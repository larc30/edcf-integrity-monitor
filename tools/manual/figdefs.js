const { fig, shot, fresh, wait, run } = require('./figs');
const DR = { x: 800, y: 0, width: 800, height: 900 };
const closeDrawer = async (p) => { await p.evaluate(() => document.querySelector('#drawerClose')?.click()); await wait(p, 400); };
const closeModal = async (p) => { await p.evaluate(() => document.querySelector('#modalClose')?.click()); await wait(p, 400); };

fig('01-login', async () => {
  const { b, p } = await fresh();
  await p.evaluate(() => { document.querySelector('#appView').classList.add('hidden'); document.querySelector('#loginView').classList.remove('hidden'); });
  await shot(p, '01-login', { clip: { x: 400, y: 150, width: 800, height: 600 } });
  await b.close();
});

fig('02-home', async () => {
  const { b, p } = await fresh();
  await p.setViewportSize({ width: 1600, height: 1320 }); await wait(p, 700); await shot(p, '02-home', { marks: [
    [1, '#logoHome'], [2, '#modeSwitch'], [3, '#topSearch'], [4, '#btnAdmin'], [5, '#acct'],
    [6, '#scopeSeg'], [7, '#btnReport'], [8, '#btnScan'],
    [9, '#kboard', { pad: 0 }], [10, '#wkCard', { pad: 0 }], [11, '#noteCard', { pad: 0 }], [12, '.d-radar', { pad: 0 }], [13, '.d-projects', { pad: 0 }],
  ] }); await p.setViewportSize({ width: 1600, height: 900 }); await wait(p, 700); 
  // 계정 메뉴
  await p.click('#acct summary'); await wait(p, 300);
  await shot(p, '03-acct', { clip: { x: 1180, y: 0, width: 420, height: 330 }, marks: [[1, '#userEmail', { pad: 6 }], [2, '.font-ctl'], [3, '#btnTheme'], [4, '.acct-check'], [5, '#btnLogout']] });
  await p.click('#acct summary');
  // 등급 칸 · 최근 7일 · 공식 제재 명단
  await shot(p, '04-grade', { clip: '.d-risk', marks: [[1, '#kboard .rk.red'], [2, '#kboard .rk.orange'], [3, '#kboard .rk.none, #kboard .rk.green'], [4, '#wkCard', { pad: 0 }], [5, '#noteCard', { pad: 0 }]] });
  // 레이더
  await shot(p, '05-radar', { clip: '.d-radar', marks: [[1, '#radar .rdot.red', { pad: 8, round: 20 }], [2, '#radar .rdot.orange', { pad: 8, round: 20 }], [3, '#radar .rlabel'], [4, '#radarNames', { pad: 2 }]] });
  // 사업 목록
  await shot(p, '06-projects', { clip: '.d-projects', marks: [[1, '#projectMap .pj'], [2, '#projectMap .pj .pj-role'], [3, '#projectMap .pj .cchip[data-cid]'], [4, '#projectMap .pj.ln']] });
  // 이슈 목록
  await p.evaluate(() => { const c = document.querySelector('#issuesCard'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 90); }); await wait(p, 400);
  await shot(p, '07-issues', { marks: [[1, '#btnGuide'], [2, '#periodSeg'], [3, '#feed .item'], [4, '#feed .item [data-act="reviewed"]'], [5, '#feed .item [data-act="dismissed"]'], [6, '.issue-foot', { pad: 2 }]] });
  await b.close();
});

fig('08-drawers', async () => {
  const { b, p } = await fresh();
  await p.click('#kboard .rk.red'); await wait(p, 700);
  await shot(p, '08-risklist', { clip: { ...DR, height: 400 }, marks: [[1, '#drawerTitle', { pad: 6 }], [2, '#drawerBody .rl-row', { pad: 2 }]] });
  await p.click('#drawerBody .rl-row'); await wait(p, 800);
  await p.setViewportSize({ width: 1600, height: 1350 }); await wait(p, 700); await shot(p, '09-company', { clip: { ...DR, height: 1350 }, marks: [[1, '.d-back, #dBack'], [2, '#dScan'], [3, '#dHwpx'], [4, '#dFeed .item', { pad: 2 }], [5, '#dEdit'], [6, '.d-info', { pad: 2 }], [7, '#drawerBody .d-list', { pad: 2 }], [8, '#drawerBody .ck-grid', { pad: 2 }]] });
  await p.evaluate(() => { const b = document.querySelector('#drawerBody'); b.scrollTop = b.scrollHeight; }); await wait(p, 400);
  await closeDrawer(p);
  await p.click('#projectMap .pj'); await wait(p, 700);
  await p.setViewportSize({ width: 1600, height: 1150 }); await wait(p, 700); await shot(p, '10-project', { clip: { ...DR, height: 1150 }, marks: [[1, '#drawerTitle', { pad: 6 }], [2, '#drawerBody .pd-grp', { pad: 2 }], [3, '#drawerBody .pd-row', { pad: 0 }]] }); await p.setViewportSize({ width: 1600, height: 900 }); await wait(p, 700); 
  await closeDrawer(p);
  await p.click('#noteCard'); await wait(p, 700);
  await shot(p, '11-official', { clip: '#modal', marks: [[1, '#modal .oc-src', { pad: 0 }], [2, '#modal .oc-past', { pad: 2 }], [3, '#modal details.oc-more', { pad: 2 }]] });
  await closeModal(p);
  await p.evaluate(() => { const c = document.querySelector('#issuesCard'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 90); }); await wait(p, 300);
  await p.click('#feed .item [data-act="dismissed"]'); await wait(p, 600);
  await shot(p, '12-dismiss', { clip: '#modal', marks: [[1, '#drForm', { pad: 4 }]] });
  await closeModal(p);
  await p.click('#btnGuide'); await wait(p, 700);
  await shot(p, '13-guide', { clip: '#modal', cpad: 10 });
  await closeModal(p);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('#btnReport'); await wait(p, 1500);
  await shot(p, '14-report', { clip: '#modal', marks: [[1, '#rpForm', { pad: 4 }], [2, '#modal .rp-prev, #modal .rp-paper, #modal iframe', { pad: 2 }]] });
  await closeModal(p);
  await p.click('#btnScan'); await wait(p, 9000);
  await shot(p, '16-scan', { clip: { x: 760, y: 60, width: 840, height: 120 }, marks: [[1, '#jobState', { pad: 6 }], [2, '#btnStop']] });
  await p.click('#coFind'); await p.keyboard.type('도', { delay: 80 }); await wait(p, 600);
  await shot(p, '15-search', { clip: { x: 500, y: 0, width: 420, height: 330 }, marks: [[1, '#coFindSug', { pad: 2 }]] });
  await b.close();
});

fig('20-geo', async () => {
  const { b, p } = await fresh();
  await p.click('#modeSwitch [data-view="geo"]'); await wait(p, 4500);
  await p.setViewportSize({ width: 1600, height: 1280 }); await wait(p, 700); await shot(p, '20-geo', { marks: [[1, '#geoScope'], [2, '#geoScan'], [3, '#gboard', { pad: 0 }], [4, '#evSummary', { pad: 6 }], [5, '#geoMap', { pad: 0 }], [6, '#geoProjects', { pad: 6 }]] }); await p.setViewportSize({ width: 1600, height: 900 }); await wait(p, 700); 
  await p.click('#geoProjects .gc-h'); await wait(p, 2500);
  await shot(p, '21-geo-country', { marks: [[1, '#geoProjects .gc.open', { pad: 2 }], [2, '#mapAll'], [3, '#geoMap .gpin', { pad: 6, round: 20 }]] });
  await p.click('#geoProjects .gc.open [data-gpid]'); await wait(p, 2500);
  await shot(p, '22-geo-project', { marks: [[1, '#geoProjects .gc.open [data-gpid]', { pad: 2 }], [2, '#mapAll'], [3, '#geoProjects .gp-detail, #geoProjects .gc-d, #geoProjects .gd', { pad: 2 }]] });
  await p.click('#mapAll'); await wait(p, 1200); await p.click('#mapAll').catch(() => {}); await wait(p, 1800);
  await p.click('#gboard .rk.orange'); await wait(p, 800);
  await shot(p, '23-geo-grade', { clip: { ...DR, height: 420 }, marks: [[1, '#drawerBody [data-glc]', { pad: 2 }]] });
  await closeDrawer(p);
  await p.evaluate(() => document.querySelector('#evSeg [data-p="30d"], #evSeg button:nth-child(4)')?.click()); await wait(p, 600);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await wait(p, 500);
  await p.setViewportSize({ width: 1600, height: 1150 }); await wait(p, 700); await shot(p, '24-geo-events', { marks: [[1, '#evSeg'], [2, '#evFeed .ev-item', { pad: 2 }], [3, '#evFeed [data-evrv="ok"]'], [4, '#evFeed [data-evrv="no"]']] });
  await b.close();
});

fig('30-admin', async () => {
  const { b, p } = await fresh();
  await p.click('#btnAdmin'); await wait(p, 900);
  await p.setViewportSize({ width: 1600, height: 1500 }); await wait(p, 700); await shot(p, '30-companies', { marks: [[1, '#btnAdmin'], [2, '#tabs', { pad: 2 }], [3, '#coViews', { pad: 2 }], [4, '#coToolMenu'], [5, '#btnAddCompany'], [6, '#coTable thead', { pad: 0 }], [7, '#btnDartPick'], [8, '#btnBizDup']] }); await p.setViewportSize({ width: 1600, height: 900 }); await wait(p, 700); 
  await p.evaluate(() => document.querySelector('#coToolMenu summary, #coToolMenu > button')?.click()); await wait(p, 400);
  await shot(p, '30b-tools', { clip: { x: 1100, y: 80, width: 500, height: 260 } });
  await p.evaluate(() => document.querySelector('#coToolMenu summary, #coToolMenu > button')?.click());
  await p.click('#btnAddCompany'); await wait(p, 900);
  await shot(p, '31-co-add', { clip: '#modal', marks: [[1, '#coForm [name=name]'], [2, '#dlBtn'], [3, '#coForm [name=biz_no]'], [4, '#coEngs', { pad: 2 }]] });
  await closeModal(p);
  await p.click('#coTable .co-name'); await wait(p, 900);
  await shot(p, '32-co-edit', { clip: '#modal', marks: [[1, '#dlBtn'], [2, '#coEngs', { pad: 2 }], [3, '#coDel'], [4, '#coIssues']] });
  await closeModal(p);
  await p.evaluate(() => document.querySelector('#btnBulk').click()); await wait(p, 800);
  await shot(p, '33-bulk', { clip: '#modal', marks: [[1, '#bulkTpl'], [2, '#bulkRun']] });
  await closeModal(p);
  await p.click('#tabs [data-view="projects"]'); await wait(p, 900);
  await shot(p, '34-projects', { marks: [[1, '#pjScope', { pad: 2 }], [2, '.pj-tools', { pad: 2 }], [3, '#btnAddProject'], [4, '#sideList', { pad: 4 }], [5, '#projBoard .pl-row, #projBoard .pbox', { pad: 0 }]] });
  await p.evaluate(() => document.querySelector('#pjView [data-pv="list"]')?.click()); await wait(p, 500);
  await p.click('#projBoard .pl-row'); await wait(p, 700);
  await shot(p, '35-project-row', { marks: [[1, '#projBoard .pl-row', { pad: 0 }], [2, '#projBoard .zone, #projBoard [data-role]', { pad: 0 }], [3, '#projBoard .pl-edit']] });
  await p.click('#projBoard .pl-edit'); await wait(p, 3500);
  await shot(p, '36-project-edit', { clip: '#modal', marks: [[1, '#pjEditForm [name=country]'], [2, '#pjEditForm [name=name]'], [3, '#pjEditForm [name=city]'], [4, '#modal .leaflet-container', { pad: 0 }]] });
  await p.fill('#pjEditForm [name=city]', ''); await p.click('#pjEditForm [name=city]'); await p.keyboard.type('비엔', { delay: 90 }); await wait(p, 1500);
  await shot(p, '36b-city', { clip: await p.evaluate(() => { const a = document.querySelector('#pjEditForm [name=city]').getBoundingClientRect(), s = document.querySelector('#citySug'); const b = s && s.getBoundingClientRect().height ? s.getBoundingClientRect() : a; const m = document.querySelector('#modal').getBoundingClientRect(); return { x: m.left + 4, y: Math.max(0, a.top - 60), width: Math.min(560, a.width + 80), height: Math.max(b.bottom, a.bottom) - a.top + 90 }; }), marks: [[1, '#citySug', { pad: 2 }]] });
  await closeModal(p);
  await p.click('#tabs [data-view="settings"]'); await wait(p, 900);
  await shot(p, '37-settings', { marks: [[1, '#kwForm', { pad: 4 }], [2, '#accForm', { pad: 4 }], [3, '#accList', { pad: 2 }], [4, '#rcForm', { pad: 4 }], [5, '#btnPreview']] });
  await p.evaluate(() => { const a = document.querySelector('#advCard'); if (a.tagName === 'DETAILS') a.open = true; else a.querySelector('summary, .adv-head, h2')?.click(); a.scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); }); await wait(p, 900);
  await p.setViewportSize({ width: 1600, height: 1700 }); await wait(p, 700); await shot(p, '38-advanced', { marks: [[1, '#btnConnCheck'], [2, '#connList', { pad: 2 }], [3, '#usageList', { pad: 2 }], [4, '#runList', { pad: 2 }]] });
  await p.evaluate(() => window.scrollTo(0, 0)); await p.click('#btnPreview'); await wait(p, 1500);
  await shot(p, '39-mail', { clip: '#modal', marks: [[1, '#runTestMail'], [2, '#runMailAll']] });
  await b.close();
});

run();
