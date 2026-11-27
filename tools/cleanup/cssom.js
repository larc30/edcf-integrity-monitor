// 들어낸 뒤 남은 규칙이 예전과 글자 그대로·같은 순서인지 브라우저가 읽은 규칙으로 확인
const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('about:blank'); 
  const res = await p.evaluate(([a, c, dead]) => {
    const flat = (text) => { const s = new CSSStyleSheet(); s.replaceSync(text); const out = []; const walk = (rules, path) => { for (const r of rules) { if (r.cssRules && r.constructor.name !== 'CSSStyleRule' && r.constructor.name !== 'CSSKeyframesRule') walk(r.cssRules, path + ' @' + (r.conditionText || r.constructor.name)); else out.push(path + ' | ' + r.cssText); } }; walk(s.cssRules, ''); return out; };
    const A = flat(a), C = flat(c);
    let i = 0; const removed = [];
    for (const r of A) { if (i < C.length && C[i] === r) i++; else removed.push(r); }
    const leftover = C.length - i;
    const names = new Set(dead);
    const noDead = removed.filter((r) => { const sel = r.split(' | ')[1].split('{')[0]; return ![...sel.matchAll(/[.#]([A-Za-z_][\w-]*)/g)].some((m) => names.has(m[1])); });
    return { before: A.length, after: C.length, removed: removed.length, leftover, noDead: noDead.slice(0, 5), nNoDead: noDead.length };
  }, [fs.readFileSync(process.argv[2], 'utf8'), fs.readFileSync(process.argv[3], 'utf8'), [...new Set(JSON.parse(fs.readFileSync(process.argv[4], 'utf8')).flatMap((x) => x.names))]]);
  console.log(JSON.stringify(res, null, 1)); await b.close(); })();
