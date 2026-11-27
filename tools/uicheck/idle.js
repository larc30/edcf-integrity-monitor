// 화면이 가만히 있을 때 주 스레드를 얼마나 쓰는지 잼 (CPU 4배 느리게 · 5초). node tools/uicheck/idle.js [주소] ["그대로,모두 끔"]
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8765';
const variants = {
  '그대로': '',
  '모두 끔': '.radar *, .radar *::before, .radar *::after { animation: none !important; }',
  '고리·파동만 끔': '.radar svg.fx * { animation: none !important; }',
  '스윕만 끔': '.radar .sweep { animation: none !important; }',
  '점만 끔': '.radar .rdot, .radar .rdot::before, .radar .rdot::after { animation: none !important; }',
  '가운데 점만 끔': '.radar .radar-core::before, .radar .radar-core::after { animation: none !important; }',
  '고리·파동만 켬': '.radar .sweep, .radar .rdot, .radar .rdot::before, .radar .rdot::after, .radar .radar-core::before, .radar .radar-core::after { animation: none !important; }',
  '스윕만 켬': '.radar svg.fx *, .radar .rdot, .radar .rdot::before, .radar .rdot::after, .radar .radar-core::before, .radar .radar-core::after { animation: none !important; }',
  '점만 켬': '.radar svg.fx *, .radar .sweep, .radar .radar-core::before, .radar .radar-core::after { animation: none !important; }',
};
const only = process.argv[3] ? process.argv[3].split(',') : null;
(async () => {
  const b = await chromium.launch();
  for (const [name, css] of Object.entries(variants)) {
    if (only && !only.includes(name)) continue;
    const p = await b.newPage({ viewport: { width: 1680, height: 1000 } });
    const c = await p.context().newCDPSession(p);
    await c.send('Performance.enable'); await c.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p.goto(BASE + '/index.html?demo=1'); await p.waitForTimeout(4000);
    if (css) await p.addStyleTag({ content: css });
    await p.waitForTimeout(1500);
    const get = async () => Object.fromEntries((await c.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const m0 = await get(); await p.waitForTimeout(5000); const m1 = await get();
    const d = (k) => Math.round((m1[k] - m0[k]) * 1000 / 5);
    console.log(name.padEnd(14), '주 스레드', String(d('TaskDuration')).padStart(4), 'ms/초 · 스타일', String(d('RecalcStyleDuration')).padStart(4), 'ms/초 ·', Math.round((m1.RecalcStyleCount - m0.RecalcStyleCount) / 5), '회/초 · 배치', Math.round((m1.LayoutCount - m0.LayoutCount) / 5), '회/초');
    await p.close();
  }
  await b.close();
})();
