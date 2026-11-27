"""쓸 수 없는 스타일 규칙 찾기 · (옵션 --apply) 그 규칙만 정확히 들어내기
'쓸 수 없는 규칙' = 선택자의 모든 갈래가, 화면 코드 어디에도 글자로 없는 클래스·id 이름을 꼭 필요로 하는 규칙.
보수적으로 봄: 이름을 이어 붙여 만드는 앞부분(`xx-${…}`, "xx-" + …)이 코드에 있으면 살아 있는 것으로, :not() :is() :where() :has() 안의 이름은 따지지 않음.
python3 deadcss.py <저장소> [--apply] [--list 파일]
"""
import re, sys, json
root = sys.argv[1]
apply = '--apply' in sys.argv
css_path = root + '/assets/style.css'
css = open(css_path).read()
SRC = ['index.html', 'assets/app.js', 'assets/geo.js', 'assets/firebase-config.js', 'demo/data.js', 'demo/fb-app.js', 'demo/fb-auth.js', 'demo/fb-firestore.js']
src = ''.join(open(root + '/' + f).read() for f in SRC)
words = set(re.findall(r'[A-Za-z_][\w-]*', src))
dyn = set(re.findall(r'([A-Za-z_][\w-]*-)\$\{', src)) | set(re.findall(r'([A-Za-z_][\w-]*-)["\']\s*\+', src))

def alive(name):
    return name in words or name.startswith('leaflet') or any(name.startswith(d) for d in dyn)

def strip_funcs(s):
    """:not(...) 같은 괄호 안을 통째로 뺌 (겹친 괄호 포함)"""
    out, depth = [], 0
    for ch in s:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        elif depth == 0:
            out.append(ch)
    return ''.join(out)

def split_top(sel):
    """쉼표로 갈래 나누기 (괄호 안 쉼표는 무시)"""
    parts, depth, cur = [], 0, ''
    for ch in sel:
        if ch == '(': depth += 1
        if ch == ')': depth -= 1
        if ch == ',' and depth == 0:
            parts.append(cur); cur = ''
        else:
            cur += ch
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]

def needs_dead(part):
    s = re.sub(r'\[[^\]]*\]', '', part)
    s = strip_funcs(s)
    return [n for n in re.findall(r'[.#]([A-Za-z_][\w-]*)', s) if not alive(n)]

nocom = re.sub(r'/\*.*?\*/', lambda m: re.sub(r'[^\n]', ' ', m.group(0)), css, flags=re.S)
dead = []   # (시작, 끝, 선택자, 죽은 이름들)
total = [0, 0]

def walk(lo, hi):
    pos = lo
    while pos < hi:
        m = re.compile(r'[^{}]+\{').search(nocom, pos, hi)
        if not m:
            break
        seg = m.group(0)[:-1]
        start = m.start() + (len(seg) - len(seg.lstrip()))
        sel = seg.strip()
        j, depth = m.end(), 1
        while j < hi and depth:
            depth += nocom[j] == '{'; depth -= nocom[j] == '}'; j += 1
        if sel.startswith('@media') or sel.startswith('@supports'):
            walk(m.end(), j - 1)
        elif not sel.startswith('@') and sel:
            total[0] += 1; total[1] += j - start
            bads = [needs_dead(p) for p in split_top(sel)]
            if bads and all(bads):
                dead.append((start, j, sel, sorted({n for b in bads for n in b})))
        pos = j

walk(0, len(nocom))
size = sum(e - s for s, e, _, _ in dead)
print(f'규칙 {total[0]}개 · {total[1]:,}바이트 가운데 쓸 수 없는 규칙 {len(dead)}개 · {size:,}바이트 ({size * 100 // total[1]}%)')
if '--list' in sys.argv:
    json.dump([{'sel': re.sub(r'\s+', ' ', sel), 'names': names, 'line': css.count('\n', 0, s) + 1} for s, e, sel, names in dead], open(sys.argv[sys.argv.index('--list') + 1], 'w'), ensure_ascii=False, indent=0)
if apply:
    out, last = [], 0
    for s, e, _, _ in sorted(dead):
        out.append(css[last:s]); last = e
    out.append(css[last:])
    new = ''.join(out)
    # 규칙을 들어낸 자리에 남은 빈 줄·줄 끝 공백 정리 (다른 글자는 건드리지 않음)
    old_lines = css.split('\n'); new_lines = new.split('\n')
    keep = set(l for l in old_lines)
    cleaned = []
    for l in new_lines:
        if l in keep:
            cleaned.append(l)           # 원래 있던 줄 그대로
        elif l.strip() == '':
            continue                    # 규칙이 빠져 비게 된 줄
        else:
            cleaned.append(l.rstrip())
    new = '\n'.join(cleaned)
    # 안이 비게 된 @media 묶음
    n_empty = len(re.findall(r'@media[^{}]*\{\s*\}', new))
    new = re.sub(r'[ \t]*@media[^{}]*\{\s*\}\n?', '', new)
    open(css_path, 'w').write(new)
    print(f'들어냄: {len(css):,} → {len(new):,}바이트 · 비게 된 @media {n_empty}개 정리')
