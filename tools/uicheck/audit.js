// 모든 화면·팝업·오른쪽 창을 띄워 규격을 잼 (JG css 전체 점검). node tools/uicheck/audit.js <주소> <캡처 폴더>
//   글자 크기: 규격(--fs-*: 12 · 13 · 15 · 16 · 20 · 30px) 밖의 크기, 12px 글자의 비율
//   높이: 버튼·입력칸·고르기 칸이 규격(28 · 34 · 38 · 40 · 44px) 밖인 것
//   간격: 나란히 놓인 버튼·입력칸·칩 사이가 6px 미만으로 붙은 것, 제목과 내용 사이가 6px 미만인 것, 카드끼리 12px 미만인 것
const { chromium } = require('playwright'); const fs = require('fs');
const FS_OK = [12, 13, 15, 16, 20, 30], H_OK = [28, 34, 38, 40, 44];
const measure = (rootSel) => {
  const R = document.querySelector(rootSel); if (!R) return null;
  const vis = (el) => { const r = el.getBoundingClientRect(), c = getComputedStyle(el); return r.width > 1 && r.height > 1 && c.visibility !== 'hidden' && c.display !== 'none' && +c.opacity > 0.05 && r.bottom > 0 && r.top < innerHeight + 4000; };
  const name = (el) => (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') || el.tagName.toLowerCase();
  const txt = (el) => (el.innerText || el.value || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 14);
  const fonts = {}, off = [], small = []; let nText = 0;
  R.querySelectorAll('*').forEach((el) => {
    if (!vis(el) || el.closest('svg, .leaflet-container, .radar, .rp-page, iframe, .itip > .tip')) return;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!own && !(el.matches('input, select, textarea') && (el.value || el.placeholder))) return;
    const px = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10; nText++;
    fonts[px] = (fonts[px] || 0) + 1;
    if (!window.__FS.some((v) => Math.abs(v - px) < 0.6) && !el.matches('.itip') && !el.closest('.rk-num')) off.push(`${px}px ${name(el)} "${(own || txt(el)).slice(0, 12)}"`);
    if (px < 12.6) small.push(`${name(el)} "${(own || txt(el)).slice(0, 10)}"`);
  });
  // 높이
  const ctrls = [...R.querySelectorAll('button, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), select, a.btn')].filter((el) => vis(el) && !el.closest('.leaflet-container, .radar, .rp-page'));
  const badH = [];
  ctrls.forEach((el) => { const h = Math.round(el.getBoundingClientRect().height); if (h < 20 || el.matches('.x-close, .xbtn, .kx, .itip, .rdot, .cpin, .gpin, .rk, .ev-chip, .ev-more, .d-back, .co-name, .cn, .pname, .u-link') || el.closest('.seg, .sw, .acct-menu, .scope-switch, #coFindSug')) return; // 글자 버튼 · 줄 전체가 버튼인 것은 높이 규격 대상이 아님
    if (!window.__H.some((v) => Math.abs(v - h) <= 1)) badH.push(`${h}px ${name(el)} "${txt(el)}"`); });
  // 붙은 간격: 버튼·입력칸·고르기 칸·칩
  const parts = [...R.querySelectorAll('button, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), select, a.btn, .badge, .tag, .count')].filter((el) => vis(el) && !el.closest('.leaflet-container, .radar, .rp-page, .seg, .sw, .scope-switch'));
  const tight = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j]; if (a.contains(b) || b.contains(a)) continue;
    const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
    const vOver = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top), hOver = Math.min(p.right, q.right) - Math.max(p.left, q.left);
    const hGap = Math.max(q.left - p.right, p.left - q.right), vGap = Math.max(q.top - p.bottom, p.top - q.bottom);
    if (vOver > Math.min(p.height, q.height) * 0.5 && hGap > -1 && hGap < 6) tight.push(`가로 ${Math.round(hGap)}px ${name(a)} "${txt(a)}" | ${name(b)} "${txt(b)}"`);
    else if (hOver > Math.min(p.width, q.width) * 0.5 && vGap > -1 && vGap < 6 && a.parentElement !== b.parentElement) tight.push(`세로 ${Math.round(vGap)}px ${name(a)} "${txt(a)}" | ${name(b)} "${txt(b)}"`);
  }
  // 제목과 내용 사이
  const headGap = [];
  R.querySelectorAll('h2, h3').forEach((h) => { if (!vis(h)) return; const box = h.closest('.card-head, .conn-head, .oc-head') || h; let n = box.nextElementSibling; while (n && !vis(n)) n = n.nextElementSibling; if (!n) return;
    const g = Math.round(n.getBoundingClientRect().top - box.getBoundingClientRect().bottom); if (g >= 0 && g < 6) headGap.push(`${g}px "${txt(h)}" → ${name(n)}`); });
  // 카드끼리
  const cards = [...R.querySelectorAll('.card')].filter(vis), cardGap = [];
  cards.forEach((a, i) => cards.slice(i + 1).forEach((b) => { if (a.contains(b) || b.contains(a)) return; const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
    const hOver = Math.min(p.right, q.right) - Math.max(p.left, q.left), vOver = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top), vGap = Math.max(q.top - p.bottom, p.top - q.bottom), hGap = Math.max(q.left - p.right, p.left - q.right);
    if (hOver > 40 && vGap > -1 && vGap < 12) cardGap.push(`세로 ${Math.round(vGap)}px ${name(a)} | ${name(b)}`); if (vOver > 40 && hGap > -1 && hGap < 12) cardGap.push(`가로 ${Math.round(hGap)}px ${name(a)} | ${name(b)}`); }));
  const uniq = (l, n = 8) => [...new Set(l)].slice(0, n);
  return { fonts, nText, off: uniq(off), small: { n: small.length, ex: uniq(small, 6) }, badH: uniq(badH), tight: uniq(tight, 10), headGap: uniq(headGap), cardGap: uniq(cardGap) };
};
(async () => {
  const base = process.argv[2] || 'http://localhost:8765', out = process.argv[3] || '/tmp/uiaudit'; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const errs = []; let bad = 0; const report = [];
  const fresh = async (view) => {
    const p = await b.newPage({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 }); p.on('pageerror', (e) => errs.push(view + ': ' + e.message)); p.on('dialog', (d) => d.dismiss().catch(() => {}));
    await p.addInitScript(([f, h]) => { window.__FS = f; window.__H = h; }, [FS_OK, H_OK]);
    await p.goto(base + '/index.html?demo=1'); await p.waitForTimeout(2600); if (process.env.THEME) await p.evaluate((t) => { document.documentElement.dataset.theme = t; }, process.env.THEME);
    if (view === 'geo') { await p.evaluate(() => [...document.querySelectorAll('button, a')].find((e) => /수원국 리스크/.test(e.textContent) && e.offsetParent)?.click()); await p.waitForTimeout(3500); }
    else if (view !== 'home') { await p.click('#btnAdmin').catch(() => {}); await p.waitForTimeout(500); await p.click(`#tabs [data-view="${view}"]`).catch(() => {}); await p.waitForTimeout(1200); }
    return p; };
  const look = async (p, name, root) => {
    await p.waitForTimeout(500); const m = await p.evaluate(measure, root).catch((e) => ({ err: String(e.message).split('\n')[0] }));
    if (!m) { console.log(`■ ${name}: (없음 ${root})`); return; }
    const el = await p.$(root); await (root === 'main' || root.startsWith('#view') ? p : el).screenshot({ path: `${out}/${name}.png`, fullPage: root === 'main' || root.startsWith('#view') }).catch(() => {});
    if (m.err) { console.log(`■ ${name}: 재지 못함 ${m.err}`); return; }
    const lines = [];
    if (m.off.length) lines.push('  글자 크기 규격 밖: ' + m.off.join(' · '));
    if (m.badH.length) lines.push('  높이 규격 밖: ' + m.badH.join(' · '));
    if (m.tight.length) lines.push('  붙은 간격: ' + m.tight.join(' · '));
    if (m.headGap.length) lines.push('  제목과 내용: ' + m.headGap.join(' · '));
    if (m.cardGap.length) lines.push('  카드 사이: ' + m.cardGap.join(' · '));
    bad += lines.length; const share = m.nText ? Math.round((m.small.n / m.nText) * 100) : 0;
    console.log(`■ ${name}  글자 ${Object.entries(m.fonts).sort((a, c) => a[0] - c[0]).map(([k, v]) => `${k}px×${v}`).join(' ')}  · 12px ${share}%${share >= 25 ? ' (' + m.small.ex.join(' · ') + ')' : ''}${lines.length ? '\n' + lines.join('\n') : ''}`);
    report.push({ name, share }); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.log(`■ ${name}: 열지 못함 ${String(e.message).split('\n')[0]}`); } };
  const closeModal = async (p) => { await p.evaluate(() => document.querySelector('#modalBg').classList.remove('open')); await p.waitForTimeout(200); };
  const closeDrawer = async (p) => { await p.evaluate(() => document.querySelector('#drawerClose')?.click()); await p.waitForTimeout(300); };
  const js = (p, f, a) => p.evaluate(f, a);

  let p = await fresh('home');
  await step('01-업체화면', () => look(p, '01-업체화면', '#view-dashboard, main'));
  await step('02-보고서', async () => { await p.click('#btnReport'); await p.waitForTimeout(1500); await look(p, '02-보고서', '#modal'); await closeModal(p); });
  await step('03-공식제재명단', async () => { await p.click('#noteCard'); await p.waitForTimeout(700); await js(p, () => document.querySelectorAll('#modal details').forEach((d) => { d.open = true; })); await look(p, '03-공식제재명단', '#modal'); });
  await step('04-MDB', async () => { await js(p, () => document.querySelector('#dcMdb').click()); await look(p, '04-MDB', '#modal'); await js(p, () => document.querySelector('#mkBack').click()); await p.waitForTimeout(300); });
  await step('05-EXIMIIS붙여넣기', async () => { await js(p, () => { document.querySelectorAll('#modal details').forEach((d) => { d.open = true; }); document.querySelector('#edcfPaste').click(); }); await look(p, '05-EXIMIIS붙여넣기', '#modal'); await closeModal(p); });
  await step('06-판단가이드', async () => { await p.click('#btnGuide'); await look(p, '06-판단가이드', '#modal'); await closeModal(p); });
  await step('07-등급별업체', async () => { await p.click('#kboard .rk.red'); await p.waitForTimeout(600); await look(p, '07-등급별업체', '#drawer'); await closeDrawer(p); });
  await step('08-업체상세', async () => { await p.click('#radarNames .rn-chip'); await p.waitForTimeout(900); await look(p, '08-업체상세', '#drawer'); await closeDrawer(p); });
  await step('09-사업상세', async () => { await p.click('#projectMap .pj'); await p.waitForTimeout(900); await look(p, '09-사업상세', '#drawer'); await closeDrawer(p); });
  await step('10-관련없음이유', async () => { await p.click('#feed .act-no'); await look(p, '10-관련없음이유', '#modal'); await closeModal(p); });
  await step('11-계정메뉴', async () => { await js(p, () => { document.querySelector('#acct').open = true; }); await look(p, '11-계정메뉴', '#acct .acct-menu'); await js(p, () => { document.querySelector('#acct').open = false; }); });
  await step('12-상단검색', async () => { await p.fill('#coFind', '건설'); await p.waitForTimeout(500); await look(p, '12-상단검색', '#coFindSug'); await p.fill('#coFind', ''); });
  await p.close();

  p = await fresh('geo');
  await step('15-수원국화면', () => look(p, '15-수원국화면', '#view-geo, main'));
  await step('16-등급별나라', async () => { await p.click('#gboard .rk.on'); await p.waitForTimeout(700); await look(p, '16-등급별나라', '#drawer'); await closeDrawer(p); });
  await p.close();

  p = await fresh('companies');
  await step('20-업체관리', () => look(p, '20-업체관리', '#view-companies'));
  await step('21-상세필터', async () => { await p.click('#fMoreBtn'); await look(p, '21-상세필터', '#view-companies .co-filters, #view-companies'); });
  await step('22-업체추가', async () => { await p.click('#btnAddCompany'); await look(p, '22-업체추가', '#modal'); await closeModal(p); });
  await step('23-업체수정', async () => { await p.click('#coTable tbody tr td .co-name, #coTable tbody tr td:nth-child(2) button'); await look(p, '23-업체수정', '#modal'); await closeModal(p); });
  await step('24-일괄등록', async () => { await js(p, () => document.querySelector('#btnBulk').click()); await look(p, '24-일괄등록', '#modal'); await closeModal(p); });
  await step('25-DART고르기', async () => { await js(p, () => document.querySelector('#btnDartPick').click()); await look(p, '25-DART고르기', '#modal'); await closeModal(p); });
  await step('26-사업자번호중복', async () => { await js(p, () => [...document.querySelectorAll('#view-companies button')].find((e) => /사업자번호 중복/.test(e.textContent))?.click()); await look(p, '26-사업자번호중복', '#modal'); await closeModal(p); });
  await p.close();

  p = await fresh('projects');
  await step('30-사업관리-목록', async () => { await js(p, () => [...document.querySelectorAll('#view-projects button')].find((e) => e.textContent.trim() === '목록')?.click()); await look(p, '30-사업관리-목록', '#view-projects'); });
  await step('31-사업관리-카드', async () => { await js(p, () => [...document.querySelectorAll('#view-projects button')].find((e) => e.textContent.trim() === '카드')?.click()); await look(p, '31-사업관리-카드', '#view-projects'); });
  await step('32-사업등록', async () => { await p.click('#btnAddProject'); await p.waitForTimeout(1500); await look(p, '32-사업등록', '#modal'); await closeModal(p); });
  await p.close();

  p = await fresh('settings');
  await step('40-설정', () => look(p, '40-설정', '#view-settings'));
  await step('41-설정-고급', async () => { await js(p, () => { const d = document.querySelector('#advCard'); d.open = true; d.dispatchEvent(new Event('toggle')); }); await p.waitForTimeout(1200); await look(p, '41-설정-고급', '#advCard'); });
  await step('42-메일미리보기', async () => { await js(p, () => window.scrollTo(0, 0)); await p.click('#btnPreview'); await p.waitForTimeout(1500); await look(p, '42-메일미리보기', '#modal'); await closeModal(p); });
  await p.close();

  console.log(`\n규격에서 벗어난 묶음 ${bad}개 · 화면 오류 ${errs.length ? errs.join(' / ') : '없음'}`); await b.close();
})();
