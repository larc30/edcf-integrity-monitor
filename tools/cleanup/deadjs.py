"""정의만 있고 어디서도 부르지 않는 함수·상수를 줄 단위로 정확히 들어냄 (이름을 하나씩 지정)"""
import re, sys
root = sys.argv[1]
def unused(t, other):
    names = set(re.findall(r'^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)', t, re.M)) | set(re.findall(r'^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=', t, re.M))
    return sorted(n for n in names if len(re.findall(r'(?<![\w$.])' + re.escape(n) + r'(?![\w$])', t)) + len(re.findall(r'(?<![\w$])' + re.escape(n) + r'(?![\w$])', other)) <= 1)
def drop(t, name):
    L = t.split('\n')
    idx = [i for i, l in enumerate(L) if re.match(r'(?:export\s+)?(?:async\s+)?function\s+' + re.escape(name) + r'\(', l) or re.match(r'(?:export\s+)?(?:const|let|var)\s+' + re.escape(name) + r'\s*=', l)]
    assert len(idx) == 1, (name, idx)
    i = j = idx[0]
    first = L[i].rstrip()
    opens = first.count('{') - first.count('}') + first.count('[') - first.count(']') + first.count('(') - first.count(')')
    if opens > 0 or not (first.endswith(';') or first.endswith('}')):
        while not (L[j].startswith('}') ):   # 여러 줄: 맨 앞이 '}' 인 줄까지
            j += 1
        assert j - i < 40, (name, i, j)
    removed = L[i:j + 1]
    return '\n'.join(L[:i] + L[j + 1:]), removed
total = 0
for f, o in [('assets/app.js', 'assets/geo.js'), ('assets/geo.js', 'assets/app.js')]:
    t = open(root + '/' + f).read(); other = open(root + '/' + o).read() + open(root + '/index.html').read()
    for rnd in range(4):
        us = unused(t, other)
        if not us: break
        for n in us:
            t, rem = drop(t, n); total += sum(len(x) + 1 for x in rem)
            print(f'{f} {n}: {len(rem)}줄 | {rem[0][:70]} … {rem[-1][-30:] if len(rem) > 1 else ""}')
    open(root + '/' + f, 'w').write(t)
print('들어낸 양', total, '바이트')
