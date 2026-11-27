// PDF 매뉴얼용 화면 캡처: 번호 표시(흰 테두리 + 번호)를 화면 위에 얹어 찍음. node figs.js [그림 이름 일부]
const { open } = require('./common'); const fs = require('fs');
const OUT = __dirname + '/fig'; fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
const wait = (p, ms) => p.waitForTimeout(ms);

// 번호 표시를 얹음. marks = [[번호, 선택자, {pad, at}]]  at: 번호 자리 'tl'(기본) 'tr' 'bl' 'l' 't'
async function mark(p, marks) {
  const miss = await p.evaluate((marks) => {
    document.querySelectorAll('.mk-o').forEach((x) => x.remove());
    const miss = [];
    for (const [n, sel, o = {}] of marks) {
      const el = typeof sel === 'string' ? document.querySelector(sel) : null;
      if (!el) { miss.push(n + ':' + sel); continue; }
      const r = el.getBoundingClientRect(), pad = o.pad ?? 4;
      const box = document.createElement('div'); box.className = 'mk-o';
      const x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, h = r.height + pad * 2;
      box.style.cssText = `position:fixed;z-index:2147483000;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:2px solid #fff;border-radius:${o.round ?? 10}px;box-shadow:0 0 0 1.5px rgba(0,0,0,.55),inset 0 0 0 1px rgba(0,0,0,.35);pointer-events:none;box-sizing:border-box;` + (o.nobox ? 'border-color:transparent;box-shadow:none;' : '');
      const b = document.createElement('div'); b.className = 'mk-o'; b.textContent = n;
      const at = o.at || 'tl';
      const bx = at.includes('r') ? x + w - 13 : at === 't' ? x + w / 2 - 13 : x - 13, by = at.includes('b') ? y + h - 13 : at === 'l' ? y + h / 2 - 13 : y - 13;
      b.style.cssText = `position:fixed;z-index:2147483001;left:${Math.max(2, bx + (o.dx || 0))}px;top:${Math.max(2, by + (o.dy || 0))}px;width:26px;height:26px;border-radius:50%;background:#fff;color:#0B101C;font:800 14px/26px "Pretendard Variable",sans-serif;text-align:center;box-shadow:0 0 0 2px #0B101C,0 2px 8px rgba(0,0,0,.5);pointer-events:none;`;
      document.body.append(box, b);
    }
    return miss;
  }, marks);
  if (miss.length) console.log('   (못 찾음)', miss.join('  '));
}
async function shot(p, name, opt = {}) {
  await wait(p, opt.wait ?? 500);
  if (opt.marks) await mark(p, opt.marks);
  let clip;
  if (opt.clip) {
    clip = typeof opt.clip === 'string' ? await p.evaluate(([s, pad]) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.max(0, r.left - pad), y: Math.max(0, r.top - pad), width: r.width + pad * 2, height: r.height + pad * 2 }; }, [opt.clip, opt.cpad ?? 18]) : opt.clip;
    const vp = p.viewportSize(); clip.width = Math.min(clip.width, vp.width - clip.x); clip.height = Math.min(clip.height, vp.height - clip.y);
  }
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 90, clip });
  await p.evaluate(() => document.querySelectorAll('.mk-o').forEach((x) => x.remove()));
  console.log(' ', name);
}
const fresh = async (q = '', opt = {}) => {
  const o = await open({ w: 1600, h: opt.h || 900, dsf: 2, q });
  await o.p.addStyleTag({ content: '.demo-banner{display:none!important} html{scroll-behavior:auto!important}' });
  await wait(o.p, 400);
  return o;
};
const FIGS = {};
const fig = (name, fn) => { FIGS[name] = fn; };
module.exports = { fig, shot, mark, fresh, wait, FIGS, run: async () => {
  for (const [name, fn] of Object.entries(FIGS)) {
    if (only && !name.includes(only)) continue;
    console.log('■', name);
    try { await fn(); } catch (e) { console.log('   실패', String(e.message).split('\n')[0]); }
  }
} };
