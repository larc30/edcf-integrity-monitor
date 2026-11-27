// 시연 동영상 녹화 틀: 화면을 초당 25장으로 받아 ffmpeg 에 바로 넘기고, 자막 시각을 기록
const { open } = require('./common'); const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path');
const W = 1600, H = 810, DSF = 1.2, FPS = 25; // 화면 1600×810 을 1.2배로 받아 1920×972 (아래 108px 는 자막 띠)

async function start(outRaw) {
  const o = await open({ w: W, h: H, dsf: DSF });
  o.p.on('dialog', (d) => d.accept().catch(() => {}));
  const { p, ctx } = o;
  await p.addStyleTag({ content: `.demo-banner{display:none!important}
    #mkCur{position:fixed;left:0;top:0;z-index:2147483600;width:26px;height:26px;pointer-events:none;transform:translate(-200px,-200px);will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
    .mkRip{position:fixed;z-index:2147483599;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #FFD54A;pointer-events:none;animation:mkRip .55s ease-out forwards}
    @keyframes mkRip{from{transform:scale(.6);opacity:1}to{transform:scale(3.6);opacity:0}}
    #mkCard{position:fixed;inset:0;z-index:2147483500;display:grid;place-items:center;background:linear-gradient(150deg,#0B101C 0%,#17224A 55%,#1C4D7A 100%);color:#fff;opacity:0;pointer-events:none;transition:opacity .45s;font-family:"Pretendard Variable",sans-serif;text-align:center}
    #mkCard.on{opacity:1} #mkCard .k{font-size:26px;font-weight:700;letter-spacing:.14em;color:#7FD8F5;margin-bottom:18px} #mkCard .t{font-size:76px;font-weight:800;letter-spacing:-.02em;line-height:1.2} #mkCard .s{font-size:30px;font-weight:500;opacity:.78;margin-top:22px}` });
  await p.evaluate(() => {
    const c = document.createElement('div'); c.id = 'mkCur';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2 L4 19 L8.6 14.9 L11.6 21.6 L14.4 20.4 L11.5 13.8 L17.6 13.6 Z" fill="#fff" stroke="#0B101C" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const mv = (e) => { c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; };
    document.addEventListener('mousemove', mv, true); document.addEventListener('dragover', mv, true); document.addEventListener('drag', (e) => { if (e.clientX || e.clientY) mv(e); }, true);
    document.addEventListener('mousedown', (e) => { const r = document.createElement('div'); r.className = 'mkRip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true);
    const k = document.createElement('div'); k.id = 'mkCard'; document.body.appendChild(k);
  });
  const cdp = await ctx.newCDPSession(p);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14', '-pix_fmt', 'yuv420p', outRaw], { stdio: ['pipe', 'inherit', 'inherit'] });
  let last = null, t0 = 0, written = 0, got = 0, stopped = false;
  cdp.on('Page.screencastFrame', (f) => { last = Buffer.from(f.data, 'base64'); got++; if (!t0) t0 = Date.now(); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.round(W * DSF), maxHeight: Math.round(H * DSF), everyNthFrame: 1 });
  const timer = setInterval(() => { if (!t0 || stopped) return; const want = Math.floor((Date.now() - t0) / (1000 / FPS)); while (written < want) { ff.stdin.write(last); written++; } }, 20);
  const now = () => (t0 ? (Date.now() - t0) / 1000 : 0);
  const caps = []; let chapter = '';
  const api = {
    p, now, caps,
    wait: (ms) => p.waitForTimeout(ms),
    // 자막: 다음 자막이 나올 때까지 보임
    cap(text) { const t = now(); if (caps.length && caps[caps.length - 1].end == null) caps[caps.length - 1].end = t; if (text) caps.push({ start: t, end: null, text, chapter }); },
    setChapter(c) { chapter = c; },
    async card(k, t, s, ms = 2600) { api.cap(''); await p.evaluate(([k, t, s]) => { const c = document.querySelector('#mkCard'); c.innerHTML = `<div><div class="k">${k}</div><div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`; c.classList.add('on'); }, [k, t, s]); await p.waitForTimeout(ms); await p.evaluate(() => document.querySelector('#mkCard').classList.remove('on')); await p.waitForTimeout(550); },
    pos: { x: W / 2, y: H / 2 },
    async moveXY(x, y, ms = 650) { const n = Math.max(8, Math.round(ms / 16)); const { x: x0, y: y0 } = api.pos; for (let i = 1; i <= n; i++) { const k = i / n, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await p.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e); await p.waitForTimeout(14); } api.pos = { x, y }; },
    // 요소 자리: 브라우저에서 바로 잼 (움직이는 점도 기다리지 않음). 화면 밖이면 가운데로 옮김
    async box(sel, nth = 0) { const b = await p.evaluate(([s, n]) => { const el = document.querySelectorAll(s)[n]; if (!el) return null; let r = el.getBoundingClientRect(); if (r.width < 2 && el.closest('label')) r = el.closest('label').getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 10) { el.scrollIntoView({ block: 'center', behavior: 'instant' }); r = el.getBoundingClientRect(); } return { x: r.left, y: r.top, width: r.width, height: r.height }; }, [sel, nth]); if (!b || !b.width) throw new Error('없음: ' + sel + ' #' + nth); return b; },
    async move(sel, o = {}) { const b = await api.box(sel, o.nth || 0); await api.moveXY(b.x + b.width * (o.fx ?? .5), b.y + b.height * (o.fy ?? .5), o.ms); },
    async click(sel, o = {}) { await api.move(sel, o); await p.waitForTimeout(o.before ?? 260);
      const b = await api.box(sel, o.nth || 0), x = b.x + b.width * (o.fx ?? .5), y = b.y + b.height * (o.fy ?? .5); if (Math.hypot(x - api.pos.x, y - api.pos.y) > 3) { await api.moveXY(x, y, 250); await p.waitForTimeout(120); } // 그 사이 자리가 바뀌었으면 다시 맞춤
      await p.mouse.down(); await p.waitForTimeout(70); await p.mouse.up(); await p.waitForTimeout(o.after ?? 700); },
    async type(text, delay = 110) { await p.keyboard.type(text, { delay }); },
    async scrollTo(y, ms = 700) { await p.evaluate(([y, ms]) => new Promise((res) => { const y0 = scrollY, t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; scrollTo(0, y0 + (y - y0) * e); k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); }), [y, ms]); await p.waitForTimeout(250); },
    async scrollToSel(sel, off = 110, ms = 700) { const y = await p.evaluate(([s, off]) => document.querySelector(s).getBoundingClientRect().top + scrollY - off, [sel, off]); await api.scrollTo(Math.max(0, y), ms); },
    async stop() { api.cap(''); const end = now(); stopped = true; clearInterval(timer); const want = Math.floor(end * FPS); while (written < want) { ff.stdin.write(last); written++; }
      await cdp.send('Page.stopScreencast').catch(() => {}); await new Promise((res) => { ff.on('close', res); ff.stdin.end(); }); await o.b.close();
      return { seconds: end, frames: written, shots: got, errs: o.errs }; },
  };
  return api;
}
// 자막 파일(ASS): 아래 띠 가운데에 자막, 왼쪽에 장 이름
function writeAss(caps, file, total) {
  const ts = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${x.toFixed(2).padStart(5, '0')}`; };
  const esc = (s) => s.replace(/\n/g, '\\N');
  let out = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n`;
  out += `Style: Cap,Pretendard Variable,36,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,330,90,0,1\n`;
  out += `Style: Ch,Pretendard Variable,25,&H00F5D87F,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,4,44,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  for (const c of caps) { const e = c.end ?? total; if (e - c.start < .2) continue;
    out += `Dialogue: 0,${ts(c.start)},${ts(e)},Cap,,0,0,0,,{\\pos(1010,1026)\\fad(150,100)}${esc(c.text)}\n`;
    if (c.chapter) out += `Dialogue: 0,${ts(c.start)},${ts(e)},Ch,,0,0,0,,{\\pos(44,1026)}${esc(c.chapter)}\n`; }
  fs.writeFileSync(file, out);
}
module.exports = { start, writeAss, W, H, FPS };
