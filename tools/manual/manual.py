"""EDCF RADAR 사용 매뉴얼 (쪽 단위 · 격자 맞춤). 화면 하나 = 한 쪽.
- 본문 폭 182mm, 칸 사이 G = 10mm 하나로 통일
- 그림 여러 장을 한 줄에: 높이를 같게 하고 좌우 끝을 본문 폭에 딱 맞춤(gallery). 번호 설명 칸도 그 그림 폭 그대로
- 그림 + 설명: 그림 칸 폭을 정해 두고(side) 설명은 남은 폭
- 그림은 옆이 잘리지 않게: 높이는 원래 비율 이하로만 줄이고, 줄일 때는 아래쪽만 자름
- 장마다 앱과 같은 색(쪽 머리 띠 · 번호 원 · 제목 번호), 장 첫 쪽은 띠를 크게
- 쪽의 마지막 알림 줄은 맨 아래에 붙여 아래 끝을 맞춤(foot)
python3 manual3.py → manual.html → node topdf.js
"""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, '..', 'font', 'web', 'woff2', 'PretendardVariable.woff2')
W, G = 182.0, 10.0   # 본문 폭 · 칸 사이 (mm)
AR = {}
def ar(name):  # 높이 / 폭
    if name not in AR:
        im = Image.open(os.path.join(HERE, 'fig', name + '.jpg')); AR[name] = im.height / im.width
    return AR[name]

CH = {  # 장 색: 앱과 같은 계열
    '1': ('#4F5BD5', '#22A6D6', '시작하기'),
    '2': ('#6D4BEF', '#2FA8E8', '업체 리스크'),
    '3': ('#0C93C9', '#16A864', '수원국 리스크'),
    '4': ('#E8890C', '#E4572E', '관리자 모드'),
    '5': ('#475569', '#64748B', '운영'),
}
pages, toc = [], []
cur = {'ch': '', 'no': '', 'first': False}

B = lambda s: f'<span class="btn">{s}</span>'
RED = '<span class="bd red">경고</span>'; ORA = '<span class="bd ora">주의</span>'; GRN = '<span class="bd grn">정상</span>'
REF = '<span class="bd ref">참고</span>'; IDLE = '<span class="bd ref">미참여</span>'
OK = '<span class="ch ok">✓ 관련 있음</span>'; NO = '<span class="ch no">✕ 관련 없음</span>'

def chapter(no, title, lead=''):
    cur.update(ch=title, no=no, first=True, lead=lead)
    toc.append((1, no, title, len(pages) + 1))

def page(title, *blocks):
    sub = len([t for t in toc if t[0] == 2 and t[1].startswith(cur['no'] + '.')]) + 1
    no = f"{cur['no']}.{sub}"
    toc.append((2, no, title, len(pages) + 1))
    c1, c2, short = CH[cur['no']]
    if cur['first']:
        band = f'<div class="band big"><span class="bk">CHAPTER {cur["no"]}</span><span class="bt">{cur["ch"]}</span>' + (f'<span class="bl">{cur["lead"]}</span>' if cur.get('lead') else '') + '</div>'
        cur['first'] = False
    else:
        band = f'<div class="band"><span class="bn">{cur["no"]}</span><span class="bt">{cur["ch"]}</span></div>'
    head = f'{band}<h2><span>{no}</span>{title}</h2>'
    pages.append(f'<section class="pg" style="--c1:{c1};--c2:{c2}">{head}{"".join(blocks)}</section>')

def _fig(name, wmm, hmm, cap):
    return (f'<figure class="shot" style="width:{wmm:.2f}mm"><div class="im" style="height:{hmm:.2f}mm"><img src="fig/{name}.jpg"></div>'
            + (f'<figcaption>{cap}</figcaption>' if cap else '') + '</figure>')

def full(name, cap='', h=None):
    nat = W * ar(name)
    return _fig(name, W, min(h or nat, nat), cap)

def gallery(items, legends=None, h=None):
    """items = [(이름, 설명)] 한 줄. 높이를 같게 하고 좌우 끝을 본문 폭에 맞춤. legends = 그림마다 아래 번호 설명"""
    k = sum(1 / ar(n) for n, _ in items)               # 높이 1mm 당 폭
    H = (W - G * (len(items) - 1)) / k
    if h and h < H:                                     # 더 낮게 원하면 같은 비율로 줄이고 가운데 정렬 대신 왼쪽부터
        H = h
    ws = [H / ar(n) for n, _ in items]
    cols = ' '.join(f'{x:.2f}mm' for x in ws)
    figs = ''.join(_fig(n, w, H, c) for (n, c), w in zip(items, ws))
    out = f'<div class="grid" style="grid-template-columns:{cols}">{figs}</div>'
    if legends:
        out += f'<div class="grid" style="grid-template-columns:{cols}">' + ''.join(f'<div>{l}</div>' for l in legends) + '</div>'
    return out

def side(name, content, frac=0.5, cap='', h=None):
    """그림 칸(본문 폭의 frac) + 설명 칸. 둘 다 위 끝을 맞춤"""
    wi = (W - G) * frac
    nat = wi * ar(name)
    return (f'<div class="grid" style="grid-template-columns:{wi:.2f}mm 1fr">' + _fig(name, wi, min(h or nat, nat), cap)
            + f'<div class="sidec">{content}</div></div>')

def cols2(a, b, frac=0.5):
    wi = (W - G) * frac
    return f'<div class="grid" style="grid-template-columns:{wi:.2f}mm 1fr"><div class="sidec">{a}</div><div class="sidec">{b}</div></div>'

def legend(items, cols=2):
    rows = ''.join(f'<div class="li"><i>{n}</i><div><b>{k}</b>' + (f'<span>{d}</span>' if d else '') + '</div></div>' for n, k, d in items)
    return f'<div class="leg c{cols}">{rows}</div>'

def sec(title, *blocks):
    return f'<div class="sec">' + (f'<h3>{title}</h3>' if title else '') + ''.join(blocks) + '</div>'

def table(head, rows, widths=None):
    cg = ''.join(f'<col style="width:{x}">' for x in widths) if widths else ''
    return f'<table class="t"><colgroup>{cg}</colgroup><thead><tr>' + ''.join(f'<th>{h}</th>' for h in head) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows) + '</tbody></table>'

def note(s, kind='tip'):
    label = {'tip': '참고', 'warn': '주의', 'who': '권한'}[kind]
    return f'<div class="note {kind}"><b>{label}</b><span>{s}</span></div>'

def foot(*blocks): return '<div class="foot">' + ''.join(blocks) + '</div>'
def p(s): return f'<p>{s}</p>'
def ul(items): return '<ul>' + ''.join(f'<li>{i}</li>' for i in items) + '</ul>'
def steps(items): return '<ol class="steps">' + ''.join(f'<li>{i}</li>' for i in items) + '</ol>'

# ═════════════ 1. 시작하기
chapter('1', '시작하기', '로그인 · 권한 · 화면 구성')
page('EDCF RADAR 한눈에 보기',
    p('EDCF 사업에 참여하는 업체의 제재·수사 이슈와 수원국의 안전 상황을 매일 자동으로 모아 한 화면에서 보여 주는 시스템입니다.'),
    table(['구분', '하는 일', '확인하는 자료'], [
        ['<b>업체 리스크</b>', '참여 업체의 제재·수사·과징금 이슈를 찾아 경고·주의·정상으로 등급을 매깁니다.', '뉴스(네이버·구글) · 조달청 부정당제재 · MDB 5곳 제재 리스트 · EXIMIIS 명단'],
        ['<b>수원국 리스크</b>', '사업지 주변의 여행경보·지진·재해·분쟁·감염병을 모아 사업지별 등급을 매깁니다.', '외교부 여행경보 · USGS 지진 · GDACS 재해 · WHO 발표 · 뉴스'],
        ['<b>알림</b>', '매일 아침 새로 잡힌 이슈를 메일로 보내고, 필요할 때 보고서를 만듭니다.', '아침 메일 · PDF 보고서 · 업체별 한글(HWPX) 보고서'],
    ], ['17%', '45%', '38%']),
    side('01-login', sec('접속과 로그인',
            steps(['브라우저(크롬·엣지)에서 대시보드 주소를 엽니다.', f'{B("Google 계정으로 로그인")}을 누르고 등록된 계정을 고릅니다.', '업체 리스크 화면이 열립니다. 로그인은 유지됩니다.']),
            note('"등록되지 않았습니다"가 나오면 팀 관리자에게 계정 등록을 요청하세요.', 'warn')), frac=0.36, cap='로그인 화면'),
    sec('권한',
        table(['권한', '할 수 있는 일'], [
            ['<b>팀원</b>', f'모든 화면 보기 · 우리 팀 사업 참여 업체의 이슈 처리({OK} {NO}) · 보고서'],
            ['<b>팀 관리자</b>', '팀원 권한 + 지금 스캔 · 업체 추가·수정 · 우리 팀 사업 등록·수정 · 우리 팀 계정 관리 · 수원국 이벤트 처리'],
            ['<b>슈퍼관리자</b>', '팀 관리자 권한 + 모든 팀의 사업·계정 · 리스크 키워드 · 메일 받는 사람 · 고급 설정 · 전체 업체 스캔'],
        ], ['17%', '83%']),
        p('팀은 정보통신팀 · 수자원에너지팀 · 교통팀 · 보건팀 네 곳입니다. 사업은 한 팀에만 속하고, 업체 명단은 네 팀이 함께 씁니다.')),
    side('03-acct', sec('계정 메뉴',
            legend([(1, '내 계정', '로그인한 메일 · 권한 · 팀.'), (2, '글자 크기', '가− / 가+ 로 화면 전체 글자 크기.'), (3, '화면', '어두운 화면 ↔ 밝은 화면.'), (4, '가벼운 모드', 'PC가 느릴 때 움직임을 줄임.'), (5, '로그아웃', '')], cols=1)),
        frac=0.36, cap='계정 메뉴 (오른쪽 위 동그라미)'),
    foot(note('이 매뉴얼의 화면 예시는 모두 <b>가상 데이터</b>입니다. 업체 이름·이슈·메일 주소는 실제와 관계가 없습니다.')),
)

# ═════════════ 2. 업체 리스크
chapter('2', '업체 리스크 화면', '참여 업체의 제재 · 수사 이슈를 등급으로 보고 판단하는 화면')
page('화면 구성',
    full('02-home', h=138),
    legend([
        (1, '로고', '어디서든 누르면 이 화면으로 돌아옵니다.'),
        (2, '화면 스위치', '업체 리스크 ↔ 수원국 리스크.'),
        (3, '업체 검색', '업체명·별칭·영문명·사업자번호로 찾아 업체 상세를 엽니다.'),
        (4, '관리자 모드', '관리자에게만 보입니다. 업체·사업 관리와 설정.'),
        (5, '계정 메뉴', '글자 크기 · 화면 밝기 · 가벼운 모드 · 로그아웃.'),
        (6, '보기 범위', '우리 팀 사업 / EDCF 전체. 아래 숫자와 목록이 모두 따라 바뀝니다.'),
        (7, '보고서', '지금 범위로 PDF 보고서를 만듭니다.'),
        (8, '지금 스캔', '업체를 바로 다시 검사합니다(관리자).'),
        (9, '업체 등급', '경고 · 주의 · 정상 업체 수. 누르면 그 등급의 업체 목록.'),
        (10, '최근 7일', '날마다 새로 잡힌 경고 · 주의 이슈 수.'),
        (11, '공식 제재 명단', 'EXIMIIS · 조달청 · MDB 에서 지금 제재 중인 업체 수.'),
        (12, '리스크 레이더', '경고 · 주의 업체를 점으로. 가운데일수록 높은 등급.'),
        (13, '사업 목록', '사업별 참여 업체의 등급. 누르면 사업 상세.'),
    ]),
    foot(note('대시보드는 <b>진행 중인 사업에 참여 중인 업체</b>만 셉니다. 사업이 끝났거나 연결되지 않은 업체는 "미참여"로 업체 관리·검색에서만 보입니다.')),
)
page('등급 · 레이더 · 사업 목록',
    table(['등급', '뜻', '예'], [
        [RED, '지금 유효한 제재', '입찰참가자격 제한 · MDB 제재 · EXIMIIS 등록 · 기간 중인 영업정지'],
        [ORA, '제재로 이어질 수 있는 진행 중 사안', '수사 · 기소 · 과징금 · 부도 · 회생'],
        [GRN, '경고 · 주의 이슈 없음', '참고 이력만 있는 업체도 정상'],
        [REF, '등급이 아닌 기록', '1년 지난 처분 · 계열사 처분 · 의혹 단계 기사 → 이슈 목록 아래 "참고 이력"'],
        [IDLE, '진행 중 사업에 참여하지 않음', '등급을 매기지 않습니다.'],
    ], ['13%', '34%', '53%']),
    gallery([('05-radar', '리스크 레이더'), ('06-projects', '사업 목록')], legends=[
        legend([(1, '경고 점', '빨간 점. 누르면 업체 상세.'), (2, '주의 점', '주황 점. 마우스를 올리면 이름.'), (3, '이름표', '경고 업체 이름(10곳까지).'), (4, '이름 줄', '점이 어느 업체인지. [외 N] = 전체.')], cols=1),
        legend([(1, '사업 카드', '경고 · 주의 업체가 참여한 사업. 누르면 사업 상세.'), (2, '역할 묶음', 'F/S · 컨설턴트 · 본구매별로 업체를 묶음.'), (3, '업체 이름', '경고 · 주의는 이름, 나머지는 "정상 N".'), (4, '이상 없음', '경고 · 주의 업체가 없는 사업은 한 줄로.')], cols=1),
    ]),
    foot(note('업체 등급은 그 업체에 걸린 이슈 가운데 가장 높은 등급입니다. 사업 카드에 마우스를 올리면 레이더에 그 사업의 업체만 밝게 남습니다.')),
)
page('확인이 필요한 이슈',
    full('07-issues', h=86),
    legend([
        (1, '판단 가이드', '네 팀 공통 판단 기준. 헷갈릴 때 먼저 봅니다.'),
        (2, '기간', '전체 · 24시간 · 7일 · 30일 · 30일 이전. 공식 제재 기록은 항상 보입니다.'),
        (3, '이슈 카드', '등급 · 업체 · 분류 / 요약 / 출처 · 날짜 · 원문.'),
        (4, '✓ 관련 있음', '이 업체 이야기가 맞음. 등급 유지.'),
        (5, '✕ 관련 없음', '이 업체 이야기가 아님. 이유를 고르면 등급 제외.'),
        (6, '접힌 칸', '참고 이력 · 관련 있음으로 처리한 이슈.'),
    ]),
    table(['버튼', '언제', '누르면'], [
        [OK, '같은 법인의 제재·수사 이야기', '등급 유지 · 목록에서 빠짐'],
        [NO, '다른 회사 · 계열사 · 단순 언급 · 끝난 일', '이유 선택 · 등급 제외 · 같은 기사 다시 안 가져옴'],
        [B('되돌리기'), '잘못 눌렀을 때', '처리 전으로 (같은 사건으로 자동 처리된 기사도 함께)'],
    ], ['17%', '38%', '45%']),
    gallery([('12-dismiss', '관련 없음: 이유 고르기'), ('13-guide', '판단 가이드 (인쇄 · PDF 가능)')]),
    foot(note('처리한 사건의 후속 기사는 같은 판단으로 자동 처리됩니다("(자동)" 표시). 등급이 더 높은 후속 기사는 새 이슈로 올라옵니다. 판단은 AI가 다음 판정에 참고합니다.')),
)
page('업체 상세 · 사업 상세',
    gallery([('09-company', '업체 상세 (등급 숫자 · 점 · 업체 이름을 누르면)'), ('10-project', '사업 상세 (사업 카드를 누르면)')], legends=[
        legend([(1, '뒤로', '들어온 목록으로.'), (2, '업체 스캔', '이 업체만 다시 검사(관리자).'), (3, '보고서', '이 업체 보고서를 한글(HWPX)로.'), (4, '이슈', '여기서도 ✓ / ✕ 처리.'), (5, '정보 수정', '업체 정보 창(관리자).'), (6, '업체 정보', '사업자번호 · 대표자 · 영문명 · 업종.'), (7, '참여 사업', '역할 · 사업명 · 단계.'), (8, '검사 결과', '뉴스 · AI · MDB · 조달청 · EDCF 대조 여부.')], cols=1),
        sec('', legend([(1, '사업 이름', '등급 · 수원국 · 담당 팀 · 담당자.'), (2, '역할별 업체', '역할마다 한 묶음. 경고 → 주의 → 정상 순.'), (3, '업체 줄', '누르면 그 업체 상세로.')], cols=1),
            table(['검사 결과', '뜻'], [['✓', '대조함'], ['!', '일부 못 함 (사업자번호·영문명 없음)'], ['✕', '실패 (검색·조회 오류)'], ['–', '해당 없음 (해외 업체 · 명단 없음)']], ['30%', '70%'])),
    ]),
    foot(note('검사 결과 표시는 "검사를 했는지"만 뜻합니다. 걸린 것은 아랫줄 글로 보이고, 지금 제재 중이면 빨간 글자입니다. 창은 오른쪽 위 X 로 닫습니다.')),
)
page('공식 제재 명단 · 업체 검색',
    full('11-official', cap='공식 제재 명단 (왼쪽 칸 "공식 제재 명단"을 누르면)'),
    legend([
        (1, '출처별 칸', 'EDCF(EXIMIIS) · 조달청 · MDB. 지금 제재 중이거나 확인이 필요한 업체만 펼쳐 둠. 이름을 누르면 상세.'),
        (2, '과거 기록', '해지 · 기간 만료 기록은 접혀 있음.'),
        (3, 'EXIMIIS 명단 올리기', '엑셀 올리기 / 표 붙여넣기. "검사 범위 보기"는 마지막 스캔이 확인한 범위.'),
    ]),
    side('15-search', sec('', legend([(1, '검색 결과', '업체명 · 별칭 · 영문명 · 사업자번호 일부만 적어도 찾습니다. 고르면 업체 상세. 사업에 참여하지 않는 업체는 "미참여".')], cols=1)), frac=0.44, cap='상단 업체 검색'),
    foot(note('EXIMIIS 명단은 자동으로 가져올 수 없습니다. EXIMIIS → 경협 → 업무지원 → 부정당업자조회에서 내려받은 엑셀을 그대로 올리세요.', 'warn')),
)
page('지금 스캔 · 보고서',
    full('16-scan', cap='스캔 진행 표시'),
    legend([
        (1, '진행 상황', '요청 후 보통 1~2분 안에(늦어도 5분) 시작되고 "스캔 중 22/216"처럼 진행이 보입니다. 끝나면 화면이 자동으로 바뀝니다.'),
        (2, '중지', '진행 중인 스캔을 멈춥니다. 그때까지 검사한 업체는 반영됩니다.'),
    ]),
    table(['스캔', '대상', '언제'], [
        ['아침 스캔', '진행 중 사업 연결 업체 + 수원국 (업체명 뉴스 검색 포함)', '매일 07~08시 자동 · 끝나면 메일'],
        ['지금 스캔 (업체 화면)', '진행 중 사업 연결 업체 (업체명 검색은 건너뜀)', '버튼'],
        ['지금 스캔 (수원국 화면)', '수원국 정보만', '버튼'],
        ['업체 스캔', '그 업체 한 곳 (업체명 검색 포함)', '업체 상세의 버튼'],
        ['전체 업체 스캔', '등록된 모든 업체 + 수원국', '업체 관리 > 도구 (슈퍼관리자)'],
    ], ['26%', '46%', '28%']),
    side('14-report', sec('', legend([(1, '옵션', '범위 · 이슈 기간. "자세한 목록 포함"은 기사 목록과 원문 링크를 넣습니다.'), (2, '미리보기', '고르는 대로 바로 바뀝니다. [PDF로 저장] → 인쇄 창에서 "PDF로 저장".')], cols=1)), frac=0.62, cap='보고서 창'),
    foot(note('보고서는 "지금 상태"(등급별 업체 수 · 경고 · 주의 업체 · 해당 사업), 메일은 "오늘 새로 나온 것"을 담습니다.')),
)

# ═════════════ 3. 수원국 리스크
chapter('3', '수원국 리스크 화면', '사업지 주변의 여행경보 · 재해 · 분쟁 · 감염병을 지도로 보는 화면')
page('화면 구성',
    full('20-geo', h=132),
    legend([
        (1, '보기 범위', '우리 팀 사업 / EDCF 전체.'),
        (2, '지금 스캔', '수원국 정보만 새로 받습니다(관리자).'),
        (3, '수원국 등급', '경고 · 주의 · 정상 나라 수. 누르면 그 등급의 나라 목록.'),
        (4, '이벤트 요약', '최근 7일 사건을 종류별로. 누르면 그 종류만.'),
        (5, '지도', '나라마다 핀 하나(숫자 = 사업 수, 색 = 나라 등급).'),
        (6, '나라 목록', '등급 순. 여행경보 · 새 사건 수 · 사업 수 · 등급.'),
    ]),
    foot(sec('수원국 등급 기준 · 사업지마다 매기고, 나라 등급은 그 나라 사업 중 가장 높은 등급',
        table(['등급', '여행경보 (사업지 기준)', '사업지 주변 사건'], [
            [RED, '3단계 · 4단계 · 전 지역 특별여행주의보', '진도 6 이상 지진 · 50km 안 테러·분쟁 · 300km 안 큰 재해'],
            [ORA, '2단계 · 일부 지역 특별여행주의보', '진도 5 지진 · 200km 안 테러·분쟁 · 100km 안 홍수·태풍 · 50km 안 시위·감염병'],
            [GRN, '1단계 이하', '해당 사건 없음'],
        ], ['13%', '37%', '50%']),
        p('일부 지역만 단계가 높으면 사업지가 그 지역일 때만 그 단계로 봅니다. 다른 나라의 분쟁·시위·감염병은 잇지 않고, 자연재해는 국경과 관계없이 거리로 봅니다.'))),
)
page('지도 보기: 전체 → 나라 → 사업',
    full('21-geo-country', cap='나라를 골랐을 때', h=84),
    legend([
        (1, '펼친 나라', '그 나라 사업이 펼쳐짐(번호 · 사업명 · 근거). 지역별 여행경보 문구도 여기.'),
        (2, '뒤로', '"‹ 전체 지도". 나라를 다시 눌러 접어도 같음.'),
        (3, '사업 핀', '번호 = 오른쪽 목록 번호. 사건은 종류별 아이콘.'),
    ], cols=3),
    full('22-geo-project', cap='사업을 골랐을 때', h=84),
    legend([
        (1, '고른 사업', '사업지 둘레 100~500km 원과 600km 안 사건까지 거리선.'),
        (2, '뒤로', '"‹ 나라 이름" → 한 번 더 누르면 전체 지도.'),
        (3, '사업 상세', '여행경보 · 등급 근거 · 가까운 사건 · 참여 업체.'),
    ], cols=3),
    foot(note('지도와 오른쪽 목록은 같은 세 단계로 움직이고, 뒤로 버튼은 한 단계씩 되돌아갑니다. 사업지를 정하지 않은 사업은 점선 "미지정" 핀으로 묶여 보입니다.', 'warn')),
)
page('등급별 나라 · 확인이 필요한 이벤트',
    side('23-geo-grade', sec('', legend([(1, '나라 카드', '여행경보 단계와 최근 사건(왜 그 등급인지), 사업 수. 누르면 창이 닫히고 지도가 그 나라로.')], cols=1)), frac=0.58, cap='등급을 눌렀을 때'),
    full('24-geo-events', cap='이벤트 목록 (화면 아래)', h=118),
    legend([
        (1, '기간', '전체 · 24시간 · 7일 · 30일 · 30일 이전.'),
        (2, '이벤트 카드', '종류 · 나라 · 제목 · 출처. 같은 사건은 하나로 묶음.'),
        (3, '✓ 관련 있음', '사업에 영향을 줄 사건. 처리한 이벤트 칸으로 이동.'),
        (4, '✕ 관련 없음', '이유를 고르면 목록 · 지도 · 등급에서 빠짐.'),
    ]),
    foot(note('이벤트 처리는 관리자만 할 수 있습니다. 처리한 이벤트는 목록 아래 접힌 칸에서 [되돌리기] 할 수 있습니다.', 'who')),
)

# ═════════════ 4. 관리자 모드
chapter('4', '관리자 모드', f'오른쪽 위 [관리자 모드]를 켜면 업체 관리 · 사업 관리 · 설정 탭이 나옵니다')
page('업체 관리',
    full('30-companies', h=160),
    legend([
        (1, '관리자 모드 나가기', '대시보드로. 로고를 눌러도 같음.'),
        (2, '관리 탭', '업체 관리 · 사업 관리 · 설정.'),
        (3, '보기 탭', '전체 · 계약 전 점검 · 리스크 업체 · 미확인 이슈 · 정보 보완 필요.'),
        (4, '도구', '일괄 등록 · DART 일괄 조회 · 전체 업체 스캔(슈퍼).'),
        (5, '업체 추가', '업체 한 곳 등록.'),
        (6, '표', '제목을 누르면 정렬, 업체명을 누르면 업체 정보 창.'),
        (7, 'DART 동명 기업 고르기', '이름이 같은 회사가 여러 곳이라 직접 고를 업체.'),
        (8, '사업자번호 중복', '같은 번호의 업체. 남길 업체를 골라 [합치기].'),
    ]),
    foot(note('주황 버튼(7)(8)은 할 일이 있을 때만 보입니다. 표 위 검색칸과 팀·사업·업종, [상세 필터]로 좁혀 볼 수 있습니다.')),
)
page('업체 추가 · 수정 · 일괄 등록',
    gallery([('31-co-add', '업체 추가'), ('32-co-edit', '업체 정보 (수정)')], h=92, legends=[
        legend([(1, '업체명', '적는 동안 DART 후보가 나옵니다. 법인 표기는 (주) · 주식회사만.'), (2, 'DART 검색', '사업자번호 · 대표자 · 영문명 · 업종을 채웁니다.'), (3, '사업자등록번호', '필수(해외 업체는 체크하면 생략).'), (4, '참여 사업', '사업 · 역할 · 단계를 고르고 + 로 연결.')], cols=1),
        legend([(1, 'DART 다시 조회', '달라진 칸만 채움. 업체명은 그대로.'), (2, '참여 사업', '역할·단계 변경, 휴지통으로 빼기. [저장]해야 반영.'), (3, '업체 삭제', '업체와 이슈 기록 삭제.'), (4, '이슈 · 검사 결과', '오른쪽 업체 상세 창.')], cols=1),
    ]),
    gallery([('33-bulk', '일괄 등록 (도구 > 일괄 등록)'), ('30b-tools', '도구 메뉴')], legends=[
        p(f'{B("① 양식 내려받기")} → 한 줄에 업체 한 곳 → {B("② 채운 파일 올리기")} → 미리보기 확인 → {B("등록하기")}.'),
        p('<b>DART 일괄 조회</b>: 사업자번호 · 영문명이 빈 업체를 한꺼번에 채움. <b>전체 업체 스캔</b>: 미연결 업체까지 모두 검사(슈퍼).'),
    ]),
    foot(note('영문명은 MDB 대조에, 사업자번호는 조달청 조회에 쓰입니다. 꼭 채워 주세요.', 'warn')),
)
page('사업 관리',
    full('34-projects', cap='카드 보기', h=88),
    legend([
        (1, '팀 탭', '전체 / 우리 팀(슈퍼는 네 팀).'),
        (2, '필터 · 보기', '상태 · 수원국 · 검색 · [목록]/[카드].'),
        (3, '사업 등록', '새 사업 등록.'),
        (4, '업체 목록', '끌어서 오른쪽 역할 칸에 놓으면 연결.'),
        (5, '사업 카드', '역할 칸마다 업체. 단계 · [대표] · 휴지통 · 연필.'),
    ]),
    full('35-project-row', cap='목록 보기 (사업이 많을 때)', h=88),
    legend([
        (1, '사업 줄', '사업명 · 수원국 · 팀 · 역할별 업체 수 · 등급.'),
        (2, '역할 칸', '업체를 끌어다 놓는 자리. 맨 위가 대표사.'),
        (3, '연필', '사업 수정 창.'),
    ], cols=3),
    foot(note('팀 관리자는 자기 팀 사업만 고칠 수 있습니다. 다른 팀 사업은 보기만 됩니다.', 'who')),
)
page('사업 등록 · 수정',
    full('36-project-edit'),
    legend([
        (1, '수원국', '먼저 고릅니다(필수).'),
        (2, '사업명', '그 아래에서 담당 팀 · 담당자.'),
        (3, '사업지', '도시를 골라 핀을 찍습니다. 없는 곳은 지도를 직접 누릅니다.'),
        (4, '지도', '핀 = 사업지. 수원국 거리 계산의 기준입니다.'),
    ]),
    side('36b-city', sec('', legend([(1, '도시 후보', '고른 수원국의 도시만 나옵니다. 고르면 지도에 핀이 찍힙니다. 목록에 없는 작은 마을은 [온라인 지도에서 찾기] 또는 지도를 직접 누릅니다.')], cols=1)), frac=0.5, cap='사업지 도시 찾기'),
    foot(ul([
        '<b>사업지 여행경보</b>는 보통 "자동"으로 둡니다. 지역마다 단계가 다르고 자동 판단이 맞지 않을 때만 직접 고릅니다.',
        '<b>사업 완료</b>를 체크하면 대시보드 · 스캔 · 메일에서 빠지고 사업 관리에만 흐리게 남습니다.',
        '사업지가 여러 곳이면 대표 사업지 한 곳(중심 도시)으로 지정합니다.',
    ])),
)
page('설정',
    full('37-settings'),
    legend([
        (1, '리스크 키워드', '매일 뉴스 검색 단어. 추가 키워드 12개까지(슈퍼).'),
        (2, '계정 추가', 'Google 메일 · 팀 · 권한. 팀 관리자는 자기 팀 팀원만.'),
        (3, '계정 목록', '팀 · 권한 변경, 휴지통으로 삭제.'),
        (4, '메일 받는 사람', '아침 메일 받을 주소(슈퍼).'),
        (5, '미리보기 · 보내기', '오늘 메일을 보고 테스트로 보냄.'),
    ]),
    side('39-mail', sec('', legend([(1, '내 주소로 테스트', '내 주소로만 한 통.'), (2, '모두에게 지금 보내기', '받는 사람 전체에게(확인 창이 한 번 더).')], cols=1)), frac=0.58, cap='아침 메일 미리보기'),
    foot(note('아침 메일 제목은 "[EDCF RADAR] MM/DD 경고 N · 주의 N" 꼴입니다. 같은 업체 뉴스는 7일 안에 이미 보냈으면 생략합니다(등급이 오르면 다시 보냄).')),
)
page('고급 (슈퍼관리자)',
    full('38-advanced', h=190),
    legend([
        (1, '연결 확인', '바깥 서비스를 실제로 한 번씩 불러 봅니다.'),
        (2, 'API 연결', '묶음별 상태. 문제가 있으면 이유가 한 줄로.'),
        (3, '이번 달 요금', 'Claude AI · Firebase 사용량으로 셈한 추정. 실제 청구액은 콘솔 링크에서.'),
        (4, '실행 기록', '최근 스캔 · 메일 실행 결과(시각 · 걸린 시간 · 새 이슈 · 오류).'),
    ]),
    foot(note('요금은 사용량으로 셈한 추정입니다. 실제 청구액은 [Claude 콘솔] · [Firebase 콘솔] 링크에서 확인하고, 다르면 [실제 금액 맞추기]로 그달 추정을 맞출 수 있습니다.')),
)

# ═════════════ 5. 운영
chapter('5', '운영과 자주 묻는 질문', '매일 돌아가는 일 · 담당자가 할 일 · 자주 묻는 질문')
page('매일 돌아가는 일 · 담당자가 할 일',
    cols2(sec('매일 아침 자동',
            steps([
                '<b>07~08시</b> 진행 중 사업 연결 업체를 검사(뉴스 · 조달청 · MDB · EXIMIIS)하고 수원국 정보를 새로 받습니다.',
                'AI가 기사마다 이 업체의 제재 · 수사 이야기인지 판정해 등급을 붙입니다. 담당자의 ✓ / ✕ 사례를 함께 참고합니다.',
                '새 경고 · 주의 이슈가 있으면 받는 사람에게 메일을 보냅니다.',
            ])),
          sec('담당자가 할 일',
            table(['언제', '할 일'], [
                ['매일', '확인이 필요한 이슈 ✓ / ✕'],
                ['가끔', '수원국 이벤트 ✓ / ✕ (관리자)'],
                ['명단이 바뀔 때', 'EXIMIIS 명단 올리기'],
                ['사업 · 업체가 바뀔 때', '사업 등록 · 업체 연결 · 단계 · 완료'],
                ['주황 버튼이 보일 때', 'DART 동명 기업 · 사업자번호 중복'],
            ], ['40%', '60%']))),
    (sec('자주 묻는 질문',
        '<div class="qa">' + ''.join(f'<div class="q"><b>{q}</b><span>{a}</span></div>' for q, a in [
            ('로그인이 안 됩니다.', '등록되지 않은 계정입니다. 팀 관리자에게 Google 메일 주소를 알려 주고 등록을 요청하세요.'),
            ('[관리자 모드]가 안 보입니다.', '팀원 계정에는 보이지 않습니다. 권한은 설정 > 계정·권한에서 바꿉니다.'),
            ('등록한 업체가 대시보드에 없습니다.', '진행 중인 사업에 연결해야 대시보드에 나옵니다. 연결 전에는 "미참여"입니다.'),
            ('잘못 눌렀습니다.', '이슈 목록 아래 접힌 칸이나 업체 상세에서 [되돌리기]를 누르세요.'),
            ('스캔이 시작되지 않습니다.', '요청 후 보통 1~2분, 늦어도 5분 안에 시작됩니다. 끝나면 화면이 자동으로 바뀝니다.'),
            ('원문 링크가 안 열립니다.', '회사 Google 계정 브라우저에서는 Google 뉴스 주소가 막힐 수 있습니다. 기사 제목으로 검색하세요.'),
            ('화면이 느립니다.', '계정 메뉴에서 "가벼운 모드"를 켜세요.'),
            ('MDB가 0입니다.', '5개 기관 제재 리스트에 우리 업체가 없다는 뜻입니다. 대조는 영문명으로 하니 영문명을 채워 두세요.'),
            ('DART에서 회사가 안 나옵니다.', 'DART 등록 이름으로 찾으세요. 예) DB Inc. → "DB"'),
            ('참고 이력은 무엇인가요?', '등급에 넣지 않는 기록(지난 처분 · 계열사 처분 · 의혹 기사)입니다. 꼭 처리하지 않아도 됩니다.'),
            ('팀원인데 ✓ / ✕ 가 안 눌립니다.', '우리 팀 사업에 참여한 업체의 이슈만 처리할 수 있습니다.'),
            ('메일이 오지 않습니다.', '설정 > 메일 받는 사람에 주소가 있는지 확인하세요(슈퍼관리자).'),
            ('사업이 끝났습니다.', '사업 수정 창에서 "사업 완료"를 체크하면 대시보드 · 스캔 · 메일에서 빠집니다.'),
            ('사업 핀이 엉뚱한 곳에 있습니다.', '사업 수정 창에서 수원국과 사업지(도시 · 핀)를 확인하세요.'),
        ]) + '</div>')),
)

# ═════════════ 조립
LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity=".45"/><circle cx="12" cy="12" r="5" opacity=".7"/><path d="M12 12 L19 6"/><circle cx="12" cy="12" r="1.6" fill="#fff" stroke="none"/></svg>'
toc_html = ''.join(
    (f'<div class="t1" style="--c1:{CH[no][0]};--c2:{CH[no][1]}"><span>{no}</span><b>{t}</b></div>' if lv == 1 else f'<div class="t2"><span>{no}</span><em>{t}</em><i>{pg + 1}</i></div>')
    for lv, no, t, pg in toc)
cover = f'''<section class="cover">
<div class="lg"><i>{LOGO}</i>EDCF RADAR</div>
<div class="ct"><h1>사용 매뉴얼</h1><div class="cs">업체 · 수원국 리스크 모니터링</div></div>
<div class="ctoc">{toc_html}</div>
<div class="meta"><span>한국수출입은행 EDCF</span><span>2026. 11. 27. 기준</span></div></section>'''

CSS = """
@font-face { font-family: "Pretendard Variable"; font-weight: 45 920; src: url("file://%s") format("woff2-variations"); }
@page { size: A4; margin: 14mm 14mm 13mm; }
* { box-sizing: border-box; }
html { font-family: "Pretendard Variable", sans-serif; font-size: 9.5pt; color: #1B2335; line-height: 1.55; word-break: keep-all; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; }
section { width: 182mm; height: 269mm; overflow: hidden; page-break-after: always; break-after: page; display: flex; flex-direction: column; gap: 3.2mm; }
section:last-child { page-break-after: auto; break-after: auto; }
/* 표지 */
.cover { padding: 20mm 14mm 10mm; border-radius: 5mm; background: linear-gradient(155deg, #0B101C 0%%, #17224A 50%%, #1C4D7A 100%%); color: #fff; gap: 0; }
.cover .lg { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 13pt; }
.cover .lg i { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: linear-gradient(135deg, #6C7BFF, #22C5E8); } .cover .lg svg { width: 20px; height: 20px; }
.cover .ct { margin-top: 26mm; } .cover h1 { margin: 0; font-size: 40pt; font-weight: 800; letter-spacing: -.02em; line-height: 1.1; } .cover .cs { font-size: 16pt; opacity: .75; margin-top: 10px; font-weight: 600; }
.ctoc { margin-top: auto; margin-bottom: 14mm; columns: 2; column-gap: 12mm; font-size: 9.5pt; }
.ctoc .t1 { break-after: avoid; display: flex; align-items: center; gap: 10px; margin: 11px 0 4px; padding-bottom: 5px; border-bottom: 1px solid rgba(255,255,255,.3); font-size: 10.6pt; } .ctoc .t1:first-child { margin-top: 0; }
.ctoc .t1 span { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font-size: 9pt; font-weight: 800; background: linear-gradient(135deg, var(--c1), var(--c2)); }
.ctoc .t2 { break-inside: avoid; display: flex; gap: 10px; padding: 2px 0 2px 30px; opacity: .85; } .ctoc .t2 span { width: 24px; opacity: .6; } .ctoc .t2 em { font-style: normal; flex: 1; } .ctoc .t2 i { font-style: normal; opacity: .6; }
.cover .meta { display: flex; justify-content: space-between; font-size: 10pt; opacity: .7; }
/* 장 띠: 앱과 같은 색 */
.band { flex: none; display: flex; align-items: center; gap: 3mm; height: 8mm; padding: 0 4mm; border-radius: 2.4mm; color: #fff; background: linear-gradient(100deg, var(--c1), var(--c2)); font-weight: 750; font-size: 9.5pt; letter-spacing: .01em; }
.band .bn { width: 5mm; height: 5mm; border-radius: 1.4mm; background: rgba(255,255,255,.22); display: grid; place-items: center; font-size: 8.5pt; font-weight: 800; }
.band.big { height: 22mm; flex-direction: column; align-items: flex-start; justify-content: center; gap: .6mm; padding: 0 6mm; }
.band.big .bk { font-size: 8pt; letter-spacing: .16em; opacity: .8; font-weight: 800; } .band.big .bt { font-size: 17pt; font-weight: 800; letter-spacing: -.01em; } .band.big .bl { font-size: 9pt; opacity: .85; font-weight: 600; }
h2 { flex: none; margin: .6mm 0 0; font-size: 14.5pt; letter-spacing: -.01em; display: flex; align-items: center; gap: 2.6mm; }
h2 span { font-size: 10pt; color: var(--c1); border: 1.6px solid var(--c1); border-radius: 1.6mm; padding: 0 2mm; font-weight: 800; line-height: 1.5; }
h3 { margin: 0 0 1.6mm; font-size: 10.4pt; font-weight: 750; }
p { margin: 0; } p + p { margin-top: 1.2mm; } .sec > * + * { margin-top: 2mm; } .sidec > * + * { margin-top: 2mm; }
ul, ol { margin: 0; padding-left: 5mm; } li { margin: .6mm 0; }
ol.steps { list-style: none; padding: 0; counter-reset: st; } ol.steps li { counter-increment: st; position: relative; padding: .3mm 0 .3mm 7mm; }
ol.steps li::before { content: counter(st); position: absolute; left: 0; top: .7mm; width: 4.6mm; height: 4.6mm; border-radius: 50%%; background: var(--c1); color: #fff; font-size: 7.6pt; font-weight: 750; display: grid; place-items: center; }
/* 격자 · 그림 */
.grid { display: grid; column-gap: 10mm; align-items: start; }
.shot { margin: 0; }
.shot .im { overflow: hidden; border-radius: 2mm; border: .3mm solid #C9D0E0; background: #0B101C; }
.shot .im img { display: block; width: 100%%; }
.shot figcaption { margin-top: 1.3mm; font-size: 8.2pt; color: #66728A; font-weight: 650; display: flex; align-items: center; gap: 1.6mm; }
.shot figcaption::before { content: ""; width: 1.6mm; height: 1.6mm; border-radius: 50%%; background: var(--c1); flex: none; }
/* 번호 설명: 칸 사이도 10mm (그림 격자와 같은 줄) */
.leg { display: grid; column-gap: 10mm; row-gap: 0; } .leg.c1 { grid-template-columns: 1fr; } .leg.c2 { grid-template-columns: 1fr 1fr; } .leg.c3 { grid-template-columns: 1fr 1fr 1fr; }
.li { display: flex; gap: 2.2mm; align-items: flex-start; padding: 1mm 0; border-bottom: .25mm solid #EAEEF5; break-inside: avoid; }
.li i { flex: none; width: 4.6mm; height: 4.6mm; border-radius: 50%%; background: var(--c1); color: #fff; font-style: normal; font-weight: 750; font-size: 7.6pt; display: grid; place-items: center; margin-top: .3mm; }
.li i:empty { width: 1.8mm; height: 1.8mm; margin: 1.7mm 1.4mm 0; }
.li b { font-weight: 720; margin-right: 1.6mm; } .li span { color: #3A455C; }
/* 표 · 알림 · 칩 */
table.t { width: 100%%; border-collapse: collapse; table-layout: fixed; font-size: 9pt; }
table.t th { text-align: left; padding: 1.4mm 2.6mm; background: #1B2335; color: #fff; font-weight: 650; font-size: 8.6pt; } table.t th:first-child { border-radius: 1.6mm 0 0 0; } table.t th:last-child { border-radius: 0 1.6mm 0 0; }
table.t td { padding: 1.4mm 2.6mm; border-bottom: .25mm solid #E3E8F1; vertical-align: top; }
.note { display: flex; gap: 2.6mm; padding: 2mm 3mm; border-radius: 2mm; background: #F3F6FC; font-size: 8.9pt; }
.note b { flex: none; padding: 0 2mm; height: 4.8mm; line-height: 4.8mm; border-radius: 1.3mm; background: var(--c1); color: #fff; font-size: 7.8pt; margin-top: .1mm; }
.note.warn { background: #FFF5E8; } .note.warn b { background: #E86A00; } .note.who { background: #EEF8F5; } .note.who b { background: #0B8074; }
.foot { margin-top: auto; } .foot > * + * { margin-top: 2mm; }
.btn { display: inline-block; padding: 0 1.6mm; border-radius: 1.3mm; border: .25mm solid #C9D0E0; background: #F6F8FC; font-weight: 650; font-size: 8.6pt; line-height: 1.5; white-space: nowrap; }
.bd { display: inline-block; padding: 0 2.2mm; border-radius: 999px; font-weight: 750; font-size: 8.4pt; line-height: 1.6; white-space: nowrap; }
.bd.red { background: #D92D20; color: #fff; } .bd.ora { background: #F57C00; color: #2B1400; } .bd.grn { background: #D8F3EC; color: #0B7A6C; } .bd.ref { background: #E2E8F0; color: #475569; }
.ch { display: inline-block; padding: 0 1.8mm; border-radius: 1.3mm; font-weight: 700; font-size: 8.4pt; line-height: 1.6; white-space: nowrap; } .ch.ok { background: #DDF5EE; color: #0B7A6C; } .ch.no { background: #FDE5E3; color: #B42318; }
.qa { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10mm; } .qa .q { padding: 1.6mm 0; border-bottom: .25mm solid #E3E8F1; break-inside: avoid; } .qa .q b { display: block; font-size: 9.2pt; } .qa .q span { color: #3A455C; font-size: 8.9pt; }
""" % FONT
doc = f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>EDCF RADAR 사용 매뉴얼</title><style>{CSS}</style></head><body>{cover}{"".join(pages)}</body></html>'
open(os.path.join(HERE, 'manual.html'), 'w').write(doc)
print('쪽', len(pages) + 1)
