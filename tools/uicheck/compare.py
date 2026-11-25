"""두 캡처 폴더를 화면별로 견줌: python3 tools/uicheck/compare.py <예전 폴더> <지금 폴더>
screens.js 로 예전 버전(git worktree 를 다른 포트로 띄움)과 지금 버전을 각각 찍은 뒤 돌린다.
시각 표시처럼 몇 글자만 다른 것은 0.1% 미만으로 나온다."""
import os
import sys

from PIL import Image, ImageChops

a, b = sys.argv[1], sys.argv[2]
for f in sorted(os.listdir(b)):
    if not os.path.exists(f"{a}/{f}"):
        print(f, "예전 캡처 없음")
        continue
    x, y = Image.open(f"{a}/{f}").convert("RGB"), Image.open(f"{b}/{f}").convert("RGB")
    if x.size != y.size:
        print(f, "크기 다름", x.size, y.size)
        continue
    d = ImageChops.difference(x, y).convert("L").point(lambda v: 255 if v > 24 else 0)
    n = sum(d.histogram()[255:])
    print(f, "같음" if not n else f"다름 {n / (x.size[0] * x.size[1]) * 100:.2f}% 영역 {d.getbbox()}")
