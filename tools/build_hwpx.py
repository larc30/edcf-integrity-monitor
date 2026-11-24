"""업체별 '리스크 모니터링 보고서' HWPX 양식 → 화면이 채워 쓰는 틀(assets/hwpx-company.json).

쓰는 법:  python3 tools/build_hwpx.py 양식.hwpx
- 양식의 예시 값·메모·화면 캡처 그림은 빼고(실제 업체 이름·캡처가 저장소에 남지 않게), 채울 자리에 {{이름}} 표시를 넣는다.
- 되풀이되는 줄·문단은 <!--#each 이름--> … <!--/each 이름--> 로 감싼다 (assets/app.js companyHwpx 가 채움).
- 양식이 바뀌면 이 스크립트를 다시 돌린다. 문단 순서가 달라지면 아래 번호(P)를 고쳐야 한다.
"""
import base64
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = zipfile.ZipFile(sys.argv[1])
sec = src.read("Contents/section0.xml").decode("utf-8")
head = src.read("Contents/header.xml").decode("utf-8")

# 줄 배치 기록(한글이 열 때 다시 계산) · 메모 · 그림은 뺌
sec = re.sub(r"<hp:linesegarray>.*?</hp:linesegarray>", "", sec, flags=re.S)
sec = re.sub(r'<hp:ctrl><hp:fieldBegin [^>]*type="MEMO".*?</hp:fieldBegin></hp:ctrl>', "", sec, flags=re.S)
sec = re.sub(r"<hp:ctrl><hp:fieldEnd [^>]*/></hp:ctrl>", "", sec)
sec = re.sub(r"<hp:pic .*?</hp:pic>", "", sec, flags=re.S)
assert "fieldBegin" not in sec and "<hp:pic" not in sec
# 예시 값의 파란 글자는 검정으로
head = head.replace('textColor="#0000FF"', 'textColor="#000000"')


def top_paras(s: str) -> tuple[str, list[str], str]:
    """구역 바로 아래 문단들 (표 안 문단은 그 문단에 포함)"""
    out, depth, start, first = [], 0, 0, None
    for m in re.finditer(r"<hp:p[ >]|</hp:p>", s):
        if m.group(0) != "</hp:p>":
            if depth == 0:
                start = m.start()
                first = start if first is None else first
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                out.append(s[start:m.end()])
                last = m.end()
    return s[:first], out, s[last:]


pre, P, post = top_paras(sec)
assert len(P) == 70, len(P)


def text(p: str) -> str:
    return "".join(re.findall(r"<hp:t>(.*?)</hp:t>", p, re.S))


def setruns(p: str, runs: list[tuple[str, str]]) -> str:
    """문단의 내용을 주어진 (글자 모양, 글)들로 바꿈"""
    op = re.match(r"<hp:p [^>]*>", p).group(0)
    return op + "".join(f'<hp:run charPrIDRef="{c}"><hp:t>{t}</hp:t></hp:run>' for c, t in runs) + "</hp:p>"


def rep(p: str, old: str, new: str, count: int = 1) -> str:
    assert p.count(old) >= 1, old
    return p.replace(old, new, count)


def each(name: str, body: str) -> str:
    return f"<!--#each {name}-->{body}<!--/each {name}-->"


def chk(i: int, part: str) -> str:
    assert part in text(P[i]), (i, part, text(P[i])[:60])
    return P[i]


# 제목 · 날짜
P[0] = rep(chk(0, "[회사명]"), "[회사명]", "[{{NAME}}]")
P[1] = rep(chk(1, "(20XX"), "(20XX. X. X.)", "({{DATE}})")
# 기업현황 표
p = chk(6, "기업명")
for old, new in [(">현대<", ">{{NAME}}<"), (">Hyundia  LTD.<", ">{{NAME_EN}}<"), (">111-11-111<", ">{{BIZ}}<"), (">XXX<", ">{{CEO}}<"), (">건설,시공<", ">{{CAT}}<"), (">위험<", ">{{LEVEL}}<")]:
    if old not in p and old == ">Hyundia  LTD.<":
        old = ">Hyundia LTD.<"
    p = rep(p, old, new)
P[6] = p
# 주요 재무현황 (8~10): 지금은 데이터가 없어 뺌 (양식 메모: DART 에서 확인 안 되면 삭제)
chk(8, "주요 재무현황")
P[8] = P[9] = P[10] = ""
# 참여 현황
P[13] = setruns(chk(13, "현재 총"), [("11", " □ 현재 총 "), ("33", "{{N_PROJ}}"), ("11", "개 EDCF 사업에 참여 중")])
p = chk(14, "참여단계")
rows = re.findall(r"<hp:tr>.*?</hp:tr>", p, re.S)
assert len(rows) == 6
H = int(re.search(r'<hp:sz width="\d+" widthRelTo="ABSOLUTE" height="(\d+)"', p).group(1))


def row_tpl(tr: str) -> str:
    cells = re.findall(r"<hp:tc .*?</hp:tc>", tr, re.S)
    assert len(cells) == 5
    for cell, tok in zip(cells, ["{{TEAM}}", "{{STAGE}}", "{{CTRY}}", "{{PROJ}}", "{{GEO}}"]):
        para = re.search(r"<hp:p .*?</hp:p>", cell, re.S).group(0)
        sub = re.search(r"(<hp:subList [^>]*>)(.*)(</hp:subList>)", cell, re.S)  # 칸 안 문단은 하나만 (예시는 두 줄로 적힌 칸이 있음)
        new = cell[:sub.start(2)] + setruns(para, [("36", tok)]) + cell[sub.end(2):]
        new = re.sub(r'rowAddr="\d+"', 'rowAddr="{{ROW}}"', new)
        tr = tr.replace(cell, new)
    return tr


body = each("ENG_FIRST", row_tpl(rows[1])) + each("ENG_MID", row_tpl(rows[2])) + each("ENG_LAST", row_tpl(rows[5]))
a, b = p.index(rows[1]), p.index(rows[5]) + len(rows[5])
p = p[:a] + body + p[b:]
p = rep(p, 'rowCnt="6"', 'rowCnt="{{ENG_ROWS}}"')
p = rep(p, f'height="{H}" heightRelTo', 'height="{{ENG_H}}" heightRelTo')
P[14] = p
# 업체 리스크 세부사항
P[18] = setruns(chk(18, "(공식제재)"), [("11", " □ (공식제재)"), ("33", " {{OFFICIAL}}")])
chk(20, "조달청")
P[19] = each("OFF", P[19] + setruns(P[20], [("33", "  ◦ {{T}}")]))
P[20] = ""
P[22] = setruns(chk(22, "주요기사"), [("11", " □ (주요기사) "), ("33", "{{NEWS_HEAD}}")])
chk(24, "(담합)")
P[23] = each("NEWS", P[23] + setruns(P[24], [("33", "  ◦ {{T}}")]))
for i in (24, 25, 26, 27, 28):
    P[i] = ""
P[30] = setruns(chk(30, "(기타사항)"), [("11", " □ (기타사항)"), ("33", " ")])
# 수원국 리스크 세부사항
P[34] = setruns(chk(34, "국가에서 사업 진행"), [("11", " □ "), ("33", "{{GEO_SUM}}")])
chk(36, "(가나)"), chk(38, "사업지에서 약")
P[35] = each("GEOC", P[35] + setruns(P[36], [("11", " □ "), ("33", "({{C}}) {{T}}")]) + each("GEOE", P[37] + setruns(P[38], [("33", "  ◦ {{T}}")])))
for i in range(36, 45):
    P[i] = ""
# 붙임: 체크리스트
chk(49, "부정당업자 확인")
c0 = re.search(r'<hp:run charPrIDRef="(\d+)"', P[49]).group(1)
P[49] = setruns(P[49], [(c0, "□ 부정당업자 확인({{DATE_S}}자 기준)")])
p = chk(55, "업체명(국문)")
for old, new in [(">현대<", ">{{NAME}}<"), (">HYUNDAI <", ">{{NAME_EN}}<"), (">101-81-16269<", ">{{BIZ}}<")]:
    if old not in p and old == ">HYUNDAI <":
        old = ">HYUNDAI<"
    p = rep(p, old, new)
P[55] = p
P[59] = rep(chk(59, "EXIMIIS"), "해당 없음", "{{R_EDCF}}")
P[61] = rep(chk(61, "MDB"), "해당 없음", "{{R_MDB}}")
P[65] = rep(chk(65, "나라장터"), "해당 없음", "{{R_PPS}}")
P[66] = rep(chk(66, "현대"), ">현대<", ">{{NAME}}<")


# 캡처 그림 자리에는 조회 결과를 글로 (조회 방법·대상·일시·결과). 그림에 맞춰 키워 둔 칸 높이는 줄임
def cap_cells(p: str, slots: dict[int, str]) -> str:
    cells = re.findall(r"<hp:tc .*?</hp:tc>", p, re.S)
    for i, cell in enumerate(cells):
        new = re.sub(r'(<hp:cellSz width="\d+" height=")\d+"', r'\g<1>282"', cell)
        if i in slots:
            para = re.search(r"<hp:p .*?</hp:p>", new, re.S).group(0)
            sub = re.search(r"(<hp:subList [^>]*>)(.*)(</hp:subList>)", new, re.S)
            new = new[:sub.start(2)] + each(slots[i], setruns(para, [("36", "{{T}}")])) + new[sub.end(2):]
        p = p.replace(cell, new, 1)
    rows = len(re.findall(r"<hp:tr>", p))
    return re.sub(r'(<hp:sz width="\d+" widthRelTo="ABSOLUTE" height=")\d+"', lambda m: m.group(1) + str(rows * 1500) + '"', p, count=1)


P[62] = cap_cells(chk(62, "ADB"), {0: "CAP_ADB", 1: "CAP_WB", 4: "CAP_AFDB", 5: "CAP_EBRD", 8: "CAP_IDB"})
P[66] = cap_cells(P[66], {0: "CAP_PPS"})

sec = pre + "".join(P) + post
left = [w for w in ("현대", "Hyundia", "HYUNDAI", "101-81", "111-11") if w in sec]
assert not left, left

hpf = src.read("Contents/content.hpf").decode("utf-8")
hpf = re.sub(r'<opf:item id="image\d+"[^>]*/>', "", hpf)
PNG1 = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
files = []
for n in ["mimetype", "version.xml", "Contents/header.xml", "Contents/section0.xml", "Preview/PrvText.txt", "settings.xml", "Preview/PrvImage.png", "META-INF/container.rdf", "Contents/content.hpf", "META-INF/container.xml", "META-INF/manifest.xml"]:
    if n == "Contents/section0.xml":
        files.append({"name": n, "section": True})
        continue
    data = {"Contents/header.xml": head.encode("utf-8"), "Contents/content.hpf": hpf.encode("utf-8"), "Preview/PrvImage.png": PNG1,
            "Preview/PrvText.txt": "리스크 모니터링 보고서\r\n".encode("utf-8")}.get(n) or src.read(n)
    files.append({"name": n, "b64": base64.b64encode(data).decode("ascii")})
out = {"v": 1, "eng_h": H, "eng_rows": 6, "files": files, "section": sec}
dst = ROOT / "assets" / "hwpx-company.json"
dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("저장:", dst, f"{dst.stat().st_size / 1024:.0f}KB", "· 구역", len(sec), "· 표시", sorted(set(re.findall(r"\{\{(\w+)\}\}", sec))), "· 되풀이", re.findall(r"<!--#each (\w+)-->", sec))
