"""EDCF RADAR 사용 매뉴얼 (HTML → PDF). python3 manual.py → manual.html"""
import os, html
HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, '..', 'font', 'web', 'woff2', 'PretendardVariable.woff2')
out = []
toc = []
sec_no = [0, 0]

def w(s): out.append(s)
def chapter(title, lead=''):
    sec_no[0] += 1; sec_no[1] = 0
    toc.append((1, f'{sec_no[0]}', title))
    w(f'<section class="chapter"><div class="ch-head"><span class="ch-no">{sec_no[0]}</span><h1 id="c{sec_no[0]}">{title}</h1></div>' + (f'<p class="lead">{lead}</p>' if lead else ''))
def end(): w('</section>')
def h2(title):
    sec_no[1] += 1
    no = f'{sec_no[0]}.{sec_no[1]}'
    toc.append((2, no, title))
    w(f'<h2 id="s{no}"><span>{no}</span>{title}</h2>')
def p(*ss):
    for s in ss: w(f'<p>{s}</p>')
def ul(items): w('<ul>' + ''.join(f'<li>{i}</li>' for i in items) + '</ul>')
def steps(items): w('<ol class="steps">' + ''.join(f'<li>{i}</li>' for i in items) + '</ol>')
def note(s, kind='tip'):
    label = {'tip': '참고', 'warn': '주의', 'who': '권한'}[kind]
    w(f'<div class="note {kind}"><b>{label}</b><span>{s}</span></div>')
def table(head, rows, cls=''):
    w(f'<table class="t {cls}"><thead><tr>' + ''.join(f'<th>{h}</th>' for h in head) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows) + '</tbody></table>')
fig_no = [0]
def fig(name, cap, legend=None, width='100%', side=False):
    """legend = [(번호, 이름, 설명)]. side=True 면 그림 왼쪽 · 설명 오른쪽"""
    fig_no[0] += 1
    img = f'<div class="shot" style="width:{width}"><img src="fig/{name}.jpg"></div>'
    leg = ''
    if legend:
        leg = '<table class="leg"><tbody>' + ''.join(f'<tr><td class="n"><i>{n}</i></td><td class="k">{k}</td><td>{d}</td></tr>' for n, k, d in legend) + '</tbody></table>'
    capt = f'<div class="cap">그림 {fig_no[0]}. {cap}</div>'
    if side:
        col = side if isinstance(side, int) else 38
        w(f'<figure class="fig side" style="grid-template-columns:{col}% 1fr"><div class="fl">{img}{capt}</div><div class="fr">{leg}</div></figure>')
    else:
        w(f'<figure class="fig"><div class="keep">{img}{capt}</div>{leg}</figure>')
B = lambda s: f'<span class="btn">{s}</span>'
RED = '<span class="bd red">경고</span>'; ORA = '<span class="bd ora">주의</span>'; GRN = '<span class="bd grn">정상</span>'; REF = '<span class="bd ref">참고</span>'; IDLE = '<span class="bd ref">미참여</span>'
OK = '<span class="ch ok">✓ 관련 있음</span>'; NO = '<span class="ch no">✕ 관련 없음</span>'

# ───────────────────────── 1. 시작하기
chapter('시작하기', 'EDCF RADAR는 EDCF 사업에 참여하는 업체의 제재·수사 이슈와 수원국의 안전 상황을 매일 자동으로 모아 한 화면에서 보여 주는 시스템입니다.')
h2('무엇을 하는 시스템인가')
table(['구분', '하는 일', '확인하는 자료'], [
    ['업체 리스크', '참여 업체에 걸린 제재·수사·과징금 등 이슈를 찾아 경고·주의·정상으로 등급을 매깁니다.', '뉴스(네이버·구글), 조달청 나라장터 부정당제재, MDB 5곳 제재 리스트, EXIMIIS 부정당업자 명단'],
    ['수원국 리스크', '사업지 주변의 여행경보·지진·재해·분쟁·감염병을 모아 사업지별 등급을 매깁니다.', '외교부 여행경보, USGS 지진, GDACS 재해, WHO 발표, 뉴스'],
    ['알림', '매일 아침 새로 잡힌 이슈를 메일로 보내고, 필요할 때 보고서를 만듭니다.', '아침 메일, PDF 보고서, 업체별 한글(HWPX) 보고서'],
], 'c3')
note('이 매뉴얼의 화면 예시는 모두 <b>가상 데이터</b>입니다. 업체 이름·이슈·메일 주소는 실제와 관계가 없습니다.')
h2('접속과 로그인')
steps(['브라우저(크롬·엣지)에서 대시보드 주소를 엽니다.', f'{B("Google 계정으로 로그인")}을 누르고 <b>등록된 Google 계정</b>을 고릅니다.', '로그인하면 업체 리스크 화면이 열립니다. 다음부터는 로그인 상태가 유지됩니다.'])
fig('01-login', '로그인 화면', width='52%')
note('"OO 계정은 등록되지 않았습니다"가 나오면 팀 관리자에게 계정 등록을 요청하세요. 계정은 관리자 모드의 설정 &gt; 계정·권한에서 추가합니다.', 'warn')
h2('권한')
table(['권한', '할 수 있는 일'], [
    ['<b>팀원</b>', '모든 화면 보기 · 우리 팀 사업에 참여한 업체의 이슈 처리(' + OK + ' ' + NO + ') · 보고서 만들기'],
    ['<b>팀 관리자</b>', '팀원 권한 + 지금 스캔 · 업체 추가·수정 · 우리 팀 사업 등록·수정·업체 연결 · 우리 팀 팀원 계정 관리 · 수원국 이벤트 처리'],
    ['<b>슈퍼관리자</b>', '팀 관리자 권한 + 모든 팀의 사업·계정 관리 · 리스크 키워드 · 메일 받는 사람 · 고급 설정 · 전체 업체 스캔'],
], 'c2')
p('팀은 정보통신팀 · 수자원에너지팀 · 교통팀 · 보건팀 네 곳이며, 사업은 한 팀에만 속합니다. 업체 명단은 네 팀이 함께 씁니다.')
h2('화면 구성')
p('화면은 <b>업체 리스크</b>와 <b>수원국 리스크</b> 두 가지이고, 관리자에게는 <b>관리자 모드</b>(업체 관리 · 사업 관리 · 설정)가 따로 있습니다. 맨 위 줄은 어느 화면에서나 같습니다.')
fig('02-home', '업체 리스크 화면 전체', [
    (1, '로고', '어디서든 누르면 업체 리스크 화면으로 돌아옵니다. 관리자 모드에서는 관리자 모드를 나옵니다.'),
    (2, '화면 스위치', '업체 리스크 ↔ 수원국 리스크를 바꿉니다.'),
    (3, '업체 검색', '업체명·별칭·영문명·사업자번호로 찾아 업체 상세를 엽니다.'),
    (4, '관리자 모드', '관리자 계정에만 보입니다. 켜면 업체 관리 · 사업 관리 · 설정 탭이 나옵니다.'),
    (5, '계정 메뉴', '글자 크기 · 화면 밝기 · 가벼운 모드 · 로그아웃.'),
    (6, '보기 범위', '우리 팀 사업 / EDCF 전체. 아래 모든 숫자와 목록이 이 범위를 따릅니다.'),
    (7, '보고서', '지금 고른 범위로 PDF 보고서를 만듭니다.'),
    (8, '지금 스캔', '업체를 바로 다시 검사합니다(관리자).'),
    (9, '업체 등급', '경고 · 주의 · 정상 업체 수. 누르면 그 등급의 업체 목록이 열립니다.'),
    (10, '최근 7일', '날마다 새로 잡힌 경고 · 주의 이슈 수.'),
    (11, '공식 제재 명단', 'EXIMIIS · 조달청 · MDB 명단에서 지금 제재 중인 업체 수. 누르면 자세히.'),
    (12, '리스크 레이더', '경고 · 주의 업체를 점으로 보여 줍니다. 가운데일수록 높은 등급입니다.'),
    (13, '사업 목록', '범위 안의 사업과 사업별 참여 업체 등급. 아래에는 확인이 필요한 이슈 목록이 이어집니다.'),
])
fig('03-acct', '계정 메뉴', [
    (1, '내 계정', '로그인한 메일 주소와 권한 · 소속 팀.'),
    (2, '글자 크기', '가− / 가+ 로 화면 전체 글자 크기를 바꿉니다. 가운데는 지금 크기입니다.'),
    (3, '화면', '어두운 화면 ↔ 밝은 화면.'),
    (4, '가벼운 모드', 'PC가 느릴 때 레이더와 점의 움직임을 줄입니다.'),
    (5, '로그아웃', '다른 계정으로 바꿀 때 사용합니다.'),
], width='100%', side=36)
p('글자 크기 · 화면 밝기 · 가벼운 모드는 그 브라우저에 기억됩니다.')
end()

# ───────────────────────── 2. 업체 리스크
chapter('업체 리스크 화면', '참여 업체에 걸린 이슈를 등급으로 보고, 새로 잡힌 이슈가 우리 업체 이야기가 맞는지 판단하는 화면입니다.')
h2('업체 등급')
table(['표시', '뜻', '예'], [
    [RED, '지금 유효한 제재', '입찰참가자격 제한 · MDB 제재 · EXIMIIS 등록 · 기간 중인 영업정지'],
    [ORA, '제재로 이어질 수 있는 진행 중 사안', '수사 · 기소 · 과징금 · 부도 · 회생'],
    [GRN, '경고 · 주의 이슈 없음', '참고 이력만 있는 업체도 정상입니다.'],
    [REF, '등급이 아닌 기록', '1년 지난 처분, 계열사가 받은 처분, 의혹 단계 기사. 이슈 목록 아래 접힌 "참고 이력"에 모입니다.'],
    [IDLE, '진행 중인 사업에 참여하지 않는 업체', '사업이 모두 완료됐거나 사업에 연결되지 않은 업체. 등급을 매기지 않습니다.'],
], 'c3g')
p('업체 등급은 그 업체에 걸린 이슈 가운데 가장 높은 등급입니다. 대시보드는 <b>진행 중인 사업에 참여 중인 업체</b>만 셉니다.')
fig('04-grade', '업체 등급 · 최근 7일 · 공식 제재 명단', [
    (1, '경고', '경고 업체 수. 누르면 오른쪽에 경고 업체 목록이 열립니다.'),
    (2, '주의', '주의 업체 수. 옆의 +2 / −2 는 어제와의 차이입니다.'),
    (3, '정상', '정상 업체 수.'),
    (4, '최근 7일', '그날 새로 잡힌 이슈 수입니다(위 줄 경고 · 아래 줄 주의). 오늘은 큰 숫자로 보입니다.'),
    (5, '공식 제재 명단', 'EDCF(EXIMIIS) · 조달청 · MDB 명단에서 지금 제재 중인 우리 업체 수. 누르면 명단 창이 열립니다.'),
], width='100%', side=25)
h2('리스크 레이더')
fig('05-radar', '리스크 레이더', [
    (1, '경고 점', '빨간 점 = 경고 업체. 누르면 업체 상세가 열립니다.'),
    (2, '주의 점', '주황 점 = 주의 업체. 마우스를 올리면 이름이 보입니다.'),
    (3, '이름표', '경고 업체는 이름표가 붙습니다(10곳까지).'),
    (4, '이름 줄', '점이 어느 업체인지 등급별로 보여 줍니다. 이름을 누르면 업체 상세, [외 N]을 누르면 전체 목록.'),
], width='100%', side=33)
ul(['가운데 원 = 경고, 가운데 띠 = 주의, 바깥 띠 = 정상(정상 업체는 숫자로만 보입니다).', '레이더의 빈 곳을 누르면 한 번 더 훑습니다. 오른쪽 사업 카드에 마우스를 올리면 그 사업의 업체만 밝게 남습니다.'])
h2('사업 목록과 사업 상세')
fig('06-projects', '사업 목록', [
    (1, '사업 카드', '경고 · 주의 업체가 참여한 사업입니다. 누르면 사업 상세가 열립니다.'),
    (2, '역할 묶음', 'F/S · 컨설턴트 · 본구매 역할별로 업체를 묶어 보여 줍니다.'),
    (3, '업체 이름', '경고 · 주의 업체는 이름으로, 나머지는 "정상 N"으로 보입니다. 이름을 누르면 업체 상세.'),
    (4, '이상 없음', '경고 · 주의 업체가 없는 사업은 한 줄로 보입니다.'),
], width='100%', side=42)
fig('10-project', '사업 상세 (오른쪽 창)', [
    (1, '사업 이름', '사업명과 등급, 수원국 · 담당 팀 · 담당자.'),
    (2, '역할별 참여 업체', '역할마다 한 묶음입니다. 묶음 안은 경고 → 주의 → 정상 순서입니다.'),
    (3, '업체 줄', '누르면 그 업체의 상세로 넘어갑니다. 아래에는 이 사업 업체들의 확인할 이슈가 이어집니다.'),
], width='70%')
h2('확인이 필요한 이슈')
p('새로 잡힌 경고 · 주의 이슈가 모이는 곳입니다. 담당자가 <b>이 업체 이야기가 맞는지</b> 판단해 주면 목록에서 빠지고, 그 판단을 AI가 다음 판정에 참고합니다.')
fig('07-issues', '확인이 필요한 이슈', [
    (1, '판단 가이드', '네 팀이 같이 쓰는 판단 기준입니다. 헷갈릴 때 먼저 봅니다.'),
    (2, '기간', '전체 · 24시간 · 최근 7일 · 최근 30일 · 30일 이전. 공식 제재 기록은 기간과 관계없이 항상 보입니다.'),
    (3, '이슈 카드', '등급 · 업체 · 분류 / 요약 한 줄 / 출처 · 날짜 · 원문. "같은 내용 N건 더"를 누르면 묶인 기사가 펼쳐집니다.'),
    (4, '✓ 관련 있음', '이 업체 이야기가 맞습니다. 등급은 그대로 유지됩니다.'),
    (5, '✕ 관련 없음', '이 업체 이야기가 아닙니다. 이유를 고르면 등급 계산에서 빠집니다.'),
    (6, '접힌 칸', '참고 이력, 관련 있음으로 처리한 이슈가 접혀 있습니다. 누르면 펼쳐집니다.'),
])
table(['버튼', '언제 누르나', '누르면'], [
    [OK, '기사 · 기록이 이 업체(같은 법인)의 제재 · 수사 이야기일 때', '등급 유지 · 목록에서 "관련 있음으로 처리한 이슈"로 이동'],
    [NO, '이름만 같은 다른 회사, 계열사 이야기, 단순 언급, 이미 끝난 일일 때', '이유 선택 → 등급에서 제외 · 같은 기사는 다시 가져오지 않음'],
    [B('되돌리기'), '잘못 눌렀을 때', '처리 전 상태로 돌아갑니다. 같은 사건으로 자동 처리된 기사도 함께 풀립니다.'],
], 'c3b')
fig('12-dismiss', '관련 없음 이유 고르기', [
    (1, '이유', '동명이인·다른 회사 / 다른 법인(모회사·자회사·계열사) / 단순 언급 / 이미 끝난 과거 일 / 기타. 기타는 메모를 꼭 적습니다.'),
], width='100%', side=42)
ul(['처리한 사건의 후속 기사가 들어오면 같은 판단으로 <b>자동 처리</b>됩니다("(자동)" 표시). 후속 기사의 등급이 더 높으면 새 이슈로 다시 올라옵니다.', '요약에 마우스를 올리면 AI가 그렇게 판단한 근거가 보입니다.', '팀원은 우리 팀 사업에 참여한 업체의 이슈만 처리할 수 있습니다.'])
fig('13-guide', '이슈 판단 가이드', width='100%')
p(f'판단 가이드는 {B("인쇄 · PDF로 저장")}으로 A4 가로 한 장으로 뽑을 수 있습니다.')
h2('등급별 업체 목록과 업체 상세')
p('등급 숫자, 레이더의 점, 업체 이름을 누르면 화면 오른쪽에 창이 열립니다. 창은 오른쪽 위 X 로 닫습니다.')
fig('08-risklist', '등급별 업체 목록', [
    (1, '제목', '고른 등급과 업체 수, 지금 보기 범위.'),
    (2, '업체 줄', '업체 · 참여 사업 · 대표 이슈가 보입니다. 누르면 업체 상세로 넘어갑니다.'),
], width='74%')
fig('09-company', '업체 상세', [
    (1, '뒤로', '들어온 목록으로 돌아갑니다.'),
    (2, '업체 스캔', '이 업체만 바로 다시 검사합니다(관리자).'),
    (3, '보고서', '이 업체의 리스크 모니터링 보고서를 한글(HWPX) 파일로 내려받습니다.'),
    (4, '이슈', '이 업체의 이슈. 여기서도 ✓ / ✕ 로 처리할 수 있습니다.'),
    (5, '정보 수정', '업체 정보 창을 엽니다(관리자). 수정은 그 창에서만 합니다.'),
    (6, '업체 정보', '사업자등록번호 · 대표자 · 영문명 · 업종.'),
    (7, '참여 사업', '역할 · 사업명 · 단계(계약체결 / 우선협상 / 입찰중).'),
    (8, '검사 결과', '마지막 스캔에서 뉴스 · AI 판정 · MDB · 조달청 · EDCF 명단을 확인했는지 보여 줍니다.'),
], width='58%')
table(['검사 결과 표시', '뜻'], [['✓', '대조했습니다.'], ['!', '일부만 했습니다(사업자번호나 영문명이 없어서).'], ['✕', '실패했습니다(검색 실패 · 조회 오류).'], ['–', '해당 없음(해외 업체 · 명단 없음 등).']], 'c2n')
note('표시는 "검사를 했는지"만 뜻합니다. 걸린 것이 있는지는 아랫줄 글에 나오며, 지금 제재 중이면 빨간 글자로 보입니다.')
h2('공식 제재 명단')
fig('11-official', '공식 제재 명단 창', [
    (1, '출처별 칸', 'EDCF(EXIMIIS) · 조달청 · MDB 순서. 지금 제재 중이거나 확인이 필요한 업체만 펼쳐 보입니다. 업체 이름을 누르면 업체 상세.'),
    (2, '과거 기록', '해지 · 기간 만료된 기록은 접혀 있습니다.'),
    (3, 'EXIMIIS 명단 올리기', 'EXIMIIS에서 내려받은 부정당업자 명단을 올립니다(엑셀 올리기 / 표 붙여넣기). 아래 "검사 범위 보기"에서 마지막 스캔이 무엇을 확인했는지 볼 수 있습니다.'),
], width='78%')
note('EXIMIIS 명단은 자동으로 가져올 수 없어 담당자가 올려야 합니다. EXIMIIS → 경협 → 업무지원 → 부정당업자조회에서 내려받은 엑셀을 그대로 올리면 됩니다.', 'warn')
h2('업체 검색')
fig('15-search', '상단 업체 검색', [
    (1, '검색 결과', '업체명 · 별칭 · 영문명 · 사업자번호 일부만 적어도 찾습니다. 고르면 업체 상세가 열립니다. 사업에 참여하지 않는 업체는 "미참여"로 보입니다.'),
], width='100%', side=32)
h2('지금 스캔')
p(f'{B("지금 스캔")}은 진행 중인 사업에 연결된 업체를 바로 다시 검사합니다. 제재 키워드 기사와 공식 명단(조달청 · MDB · EXIMIIS)을 대조하며 보통 1분 안팎 걸립니다.')
fig('16-scan', '스캔 진행 표시', [
    (1, '진행 상황', '요청 후 보통 1~2분 안에(늦어도 5분) 시작되고 "스캔 중 22/216"처럼 진행이 보입니다. 끝나면 화면이 자동으로 바뀝니다.'),
    (2, '중지', '진행 중인 스캔을 멈춥니다. 그때까지 검사한 업체는 반영됩니다.'),
], width='78%')
table(['스캔', '대상', '언제'], [
    ['아침 스캔', '진행 중 사업에 연결된 업체 + 수원국. 업체명으로 뉴스를 검색합니다.', '매일 아침 자동(07~08시) · 끝나면 메일 발송'],
    ['지금 스캔 (업체 화면)', '진행 중 사업에 연결된 업체. 업체명 검색은 건너뜁니다.', '버튼을 누를 때'],
    ['지금 스캔 (수원국 화면)', '수원국 정보만', '버튼을 누를 때'],
    ['업체 스캔', '그 업체 한 곳(업체명 검색 포함)', '업체 상세의 버튼'],
    ['전체 업체 스캔', '등록된 모든 업체 + 수원국', '업체 관리 &gt; 도구 (슈퍼관리자)'],
], 'c3s')
h2('보고서')
fig('14-report', '보고서 창', [
    (1, '옵션', '범위(우리 팀 사업 / EDCF 전체)와 이슈 기간을 고릅니다. "자세한 목록 포함"을 켜면 기사 목록과 원문 링크가, "처리한 이슈 포함"을 켜면 이미 처리한 이슈도 들어갑니다.'),
    (2, '미리보기', '고르는 대로 바로 바뀝니다. [PDF로 저장]을 누르면 인쇄 창이 열리고, 대상을 "PDF로 저장"으로 고르면 파일로 남습니다.'),
], width='88%')
p('보고서는 "지금 상태"를 담습니다: 등급별 업체 수 → 경고 · 주의 업체와 대표 이슈 → 경고 · 주의 업체가 있는 사업. 업체 한 곳의 보고서가 필요하면 업체 상세의 [보고서](한글 HWPX)를 씁니다.')
end()

# ───────────────────────── 3. 수원국 리스크
chapter('수원국 리스크 화면', '사업지 주변의 안전 상황을 지도로 보는 화면입니다. 위쪽 스위치에서 [수원국 리스크]를 누르면 열립니다.')
h2('화면 구성')
fig('20-geo', '수원국 리스크 화면 전체', [
    (1, '보기 범위', '우리 팀 사업 / EDCF 전체.'),
    (2, '지금 스캔', '수원국 정보(여행경보 · 지진 · 재해 · 뉴스)만 바로 새로 받습니다(관리자).'),
    (3, '수원국 등급', '경고 · 주의 · 정상 나라 수. 누르면 그 등급의 나라 목록이 열립니다.'),
    (4, '이벤트 요약', '최근 7일 사건을 종류별로 셉니다. 종류를 누르면 지도와 목록이 그 종류만 보여 줍니다.'),
    (5, '지도', '나라마다 핀 하나(숫자 = 사업 수, 색 = 나라 등급). 경고 · 주의 나라는 땅에도 색이 칠해집니다.'),
    (6, '나라 목록', '등급 순서. 여행경보 단계 · 새 사건 수 · 사업 수 · 등급이 보입니다.'),
])
h2('수원국 등급 기준')
p('등급은 <b>사업지마다</b> 매기고, 나라 등급은 그 나라 사업 가운데 가장 높은 등급입니다.')
table(['등급', '여행경보 (사업지 기준)', '사업지 주변 사건'], [
    [RED, '3단계(출국권고) · 4단계(여행금지) · 전 지역 특별여행주의보', '예상 진도 6 이상 지진(7일) · 50km 안 테러 · 분쟁(14일) · 300km 안 큰 재해(GDACS 빨강, 7일)'],
    [ORA, '2단계(여행자제) · 일부 지역 특별여행주의보', '예상 진도 5 지진(7일) · 200km 안 테러 · 분쟁(14일) · 100km 안 홍수 · 태풍 · 산불 · 화산(7일) · 50km 안 시위 · 감염병(7일)'],
    [GRN, '1단계(여행유의) 이하', '해당 사건 없음'],
], 'c3g')
ul(['나라 안 일부 지역만 단계가 높으면, 사업지가 그 지역에 있을 때만 그 단계로 봅니다.', '다른 나라에서 난 분쟁 · 시위 · 감염병은 거리가 가까워도 잇지 않습니다. 지진 · 태풍 · 홍수 같은 자연재해는 국경과 관계없이 거리로 봅니다.', '정치 · 선거 소식은 참고용이며 등급에 넣지 않습니다.'])
h2('지도 보기: 전체 → 나라 → 사업')
p('지도와 오른쪽 목록은 같은 세 단계로 움직입니다. 나라를 누르면 그 나라로 확대되고, 사업을 누르면 사업지가 보입니다. 지도 오른쪽 위 뒤로 버튼은 한 단계씩 되돌아갑니다.')
fig('21-geo-country', '나라를 골랐을 때', [
    (1, '펼친 나라', '그 나라의 사업이 줄로 펼쳐집니다(번호 · 사업명 · 근거 한 줄). 지역별 여행경보 문구도 여기 보입니다.'),
    (2, '뒤로', '"‹ 전체 지도". 나라를 다시 눌러 접어도 전체 지도로 돌아갑니다.'),
    (3, '사업 핀', '번호는 오른쪽 목록의 번호와 같습니다. 주변 사건은 종류별 아이콘으로 찍힙니다.'),
])
fig('22-geo-project', '사업을 골랐을 때', [
    (1, '고른 사업', '사업 줄을 누르면 사업지 둘레에 100~500km 원이 그려지고, 600km 안 사건까지 거리선이 이어집니다.'),
    (2, '뒤로', '"‹ 나라 이름". 한 번 누르면 나라 화면, 한 번 더 누르면 전체 지도.'),
    (3, '사업 상세', '사업지 · 여행경보 · 등급 근거 · 가까운 사건 · 참여 업체(경고 · 주의 업체는 이름을 누르면 업체 상세).'),
])
note('사업지를 정하지 않은 사업은 나라 가운데에 점선 "미지정" 핀으로 묶여 보입니다. 정확한 판단을 위해 사업 관리에서 사업지를 지정해 주세요.', 'warn')
h2('등급별 나라 목록')
fig('23-geo-grade', '등급을 눌렀을 때', [
    (1, '나라 카드', '여행경보 단계와 최근 사건(왜 그 등급인지), 사업 수가 보입니다. 누르면 창이 닫히고 지도가 그 나라로 이동합니다.'),
], width='74%')
h2('확인이 필요한 이벤트')
fig('24-geo-events', '이벤트 목록', [
    (1, '기간', '전체 · 24시간 · 최근 7일 · 최근 30일 · 30일 이전.'),
    (2, '이벤트 카드', '종류 · 나라 · 제목 · 출처. 같은 사건의 기사는 하나로 묶입니다("같은 내용 N건 더").'),
    (3, '✓ 관련 있음', '사업에 영향을 줄 수 있는 사건이 맞습니다. 목록에서 "관련 있음으로 처리한 이벤트"로 옮겨집니다.'),
    (4, '✕ 관련 없음', '이유(다른 나라 이야기 · 지난 일 · 칼럼·해설·전망 · 사업과 무관 · 기타)를 고르면 목록 · 지도 · 등급에서 빠집니다.'),
])
note('이벤트 처리(✓ / ✕)는 관리자만 할 수 있습니다. 처리한 이벤트는 목록 아래 접힌 칸에서 [되돌리기] 할 수 있습니다.', 'who')
end()

# ───────────────────────── 4. 관리자 모드
chapter('관리자 모드', '업체와 사업을 등록하고 설정을 바꾸는 곳입니다. 관리자 계정에만 보입니다.')
h2('들어가기와 나가기')
p(f'오른쪽 위 {B("관리자 모드")}를 켜면 화면 스위치 자리에 <b>업체 관리 · 사업 관리 · 설정</b> 탭이 나옵니다. {B("관리자 모드 나가기")}나 로고를 누르면 대시보드로 돌아옵니다.')
h2('업체 관리')
fig('30-companies', '업체 관리', [
    (1, '관리자 모드 나가기', '대시보드로 돌아갑니다.'),
    (2, '관리 탭', '업체 관리 · 사업 관리 · 설정.'),
    (3, '보기 탭', '전체 / 계약 전 점검(우선협상 · 입찰중 업체) / 리스크 업체 / 미확인 이슈 / 정보 보완 필요(사업자번호 등 빈 업체).'),
    (4, '도구', '일괄 등록 · DART 일괄 조회 · 전체 업체 스캔(슈퍼관리자).'),
    (5, '업체 추가', '업체 한 곳을 등록합니다.'),
    (6, '표', '열 제목을 누르면 정렬됩니다. 업체명을 누르면 업체 정보 창이 열립니다. 왼쪽 체크로 여러 곳을 골라 삭제할 수 있습니다.'),
    (7, 'DART 동명 기업 고르기', '이름이 같은 회사가 여러 곳이라 자동으로 채우지 못한 업체입니다. 눌러서 맞는 회사를 고릅니다.'),
    (8, '사업자번호 중복', '같은 사업자번호로 등록된 업체입니다. 눌러서 남길 업체를 고르고 [합치기] 합니다.'),
])
p('표 위의 검색칸과 팀 · 사업 · 업종 고르기로 좁혀 볼 수 있고, [상세 필터]를 누르면 등급 · 역할 · 단계 · 국내/해외 조건이 더 나옵니다. (7)(8) 같은 주황 버튼은 할 일이 있을 때만 보입니다.')
h2('업체 추가')
fig('31-co-add', '업체 추가 창', [
    (1, '업체명', '이름을 적는 동안 DART 기업 후보가 아래에 나옵니다. 후보를 누르면 이름이 들어갑니다. 법인 표기는 (주) · 주식회사만 씁니다.'),
    (2, 'DART 검색', '고른 기업의 사업자등록번호 · 대표자 · 영문명 · 업종을 가져와 채웁니다.'),
    (3, '사업자등록번호', '필수입니다(해외 업체는 옆의 "해외 업체"를 체크하면 생략). 같은 번호의 업체가 이미 있으면 알려 줍니다.'),
    (4, '참여 사업', '사업 · 역할 · 단계를 고르고 + 를 누르면 연결됩니다. 여러 사업을 연결할 수 있습니다.'),
], width='100%', side=40)
ul(['<b>별칭</b>: 뉴스에서 다르게 불리는 이름(쉼표로 구분). <b>보조 키워드</b>: 이름이 흔해 다른 회사와 섞일 때 함께 찾을 단어.', '이미 등록된 업체의 이름이나 사업자번호를 적으면 "이미 등록된 업체입니다 [열기]"가 나오고 추가가 막힙니다.', '영문명은 MDB 제재 리스트 대조에, 사업자등록번호는 조달청 조회에 쓰이므로 꼭 채워 주세요.'])
h2('업체 정보 수정')
fig('32-co-edit', '업체 정보 창', [
    (1, 'DART 검색 / 다시 조회', 'DART 값과 비교해 달라진 칸만 채웁니다. 업체명은 바꾸지 않습니다.'),
    (2, '참여 사업', '역할 · 단계를 바꾸거나 휴지통으로 빼고, 맨 아래 줄에서 새 사업을 연결합니다. [저장]을 눌러야 반영됩니다.'),
    (3, '업체 삭제', '업체와 그 이슈 기록을 지웁니다.'),
    (4, '이슈 · 검사 결과 보기', '오른쪽 업체 상세 창을 엽니다.'),
], width='100%', side=40)
note('입력 칸이 있는 창은 바깥을 눌러도 닫히지 않습니다. 오른쪽 위 X 로 닫습니다.')
h2('일괄 등록')
fig('33-bulk', '업체 일괄 등록', [
    (1, '양식 내려받기', '엑셀에서 열리는 양식(CSV)을 받습니다. 한 줄에 업체 한 곳: 업체명 · 사업자번호 · 영문명 · 분류 · 별칭 · 사업명 · 역할.'),
    (2, '등록하기', '채운 파일을 올리면 미리보기가 나오고, 확인 후 등록합니다. 사업명 · 역할을 적으면 사업에 바로 연결됩니다.'),
], width='100%', side=42)
fig('30b-tools', '도구 메뉴', [
    ('', '일괄 등록', '위의 일괄 등록 창을 엽니다.'),
    ('', 'DART 일괄 조회', '사업자번호 · 영문명이 빈 업체를 DART에서 한꺼번에 찾아 채웁니다. 이름이 정확히 같은 회사가 한 곳일 때만 자동으로 채웁니다.'),
    ('', '전체 업체 스캔', '사업에 연결되지 않은 업체까지 모두 검사합니다(슈퍼관리자, 약 10분).'),
], width='100%', side=36)
h2('사업 관리')
fig('34-projects', '사업 관리 (카드 보기)', [
    (1, '팀 탭', '전체 / 우리 팀(슈퍼관리자는 네 팀 모두).'),
    (2, '필터 · 보기', '상태(진행 중 · 완료 · 전체) · 수원국 · 사업명 검색 · [목록] / [카드] 보기.'),
    (3, '사업 등록', '새 사업을 등록합니다.'),
    (4, '업체 목록', '업체를 끌어서 오른쪽 사업의 역할 칸에 놓으면 연결됩니다. 누르면 업체 상세.'),
    (5, '사업 카드', '역할 칸(F/S · 컨설턴트 · 본구매)마다 업체가 들어 있습니다. 단계를 고르고, 줄에 마우스를 올리면 [대표](대표사 지정)와 빼기 버튼이 나옵니다. 아래 연필 = 수정, 휴지통 = 삭제.'),
])
fig('35-project-row', '사업 관리 (목록 보기)', [
    (1, '사업 줄', '사업명 · 수원국 · 팀 · 역할별 업체 수 · 등급. 누르면 그 줄 아래에 역할 칸이 펼쳐집니다.'),
    (2, '역할 칸', '왼쪽 업체를 끌어다 놓는 자리입니다. 맨 위 업체가 대표사입니다.'),
    (3, '수정', '사업명 옆 연필을 누르면 사업 수정 창이 열립니다.'),
])
note('팀 관리자는 자기 팀 사업만 고칠 수 있습니다. 다른 팀 사업은 보기만 됩니다.', 'who')
h2('사업 등록 · 수정')
fig('36-project-edit', '사업 수정 창', [
    (1, '수원국', '먼저 수원국을 고릅니다(필수).'),
    (2, '사업명', '사업명을 적고, 아래에서 담당 팀과 담당자를 고릅니다.'),
    (3, '사업지', '도시 이름을 적어 고르면 지도에 핀이 찍힙니다. 목록에 없는 곳은 지도를 직접 눌러 핀을 찍습니다.'),
    (4, '지도', '핀이 사업지입니다. 수원국 리스크의 거리 계산은 이 핀을 기준으로 합니다.'),
], width='92%')
ul(['<b>사업지 여행경보</b>: 보통 "자동"으로 둡니다. 나라 안에서 지역마다 단계가 다르고 자동 판단이 맞지 않을 때만 직접 고릅니다.', '<b>사업 완료</b>를 체크하면 대시보드 · 스캔 · 메일에서 빠지고 사업 관리에만 흐리게 남습니다.', '사업지가 여러 곳이면 대표 사업지 한 곳(중심 도시)으로 지정합니다.'])
h2('설정')
fig('37-settings', '설정', [
    (1, '리스크 키워드', '매일 뉴스 검색에 쓰는 단어입니다. 기본 키워드 외에 추가 키워드를 12개까지 넣을 수 있습니다(슈퍼관리자).'),
    (2, '계정 추가', 'Google 계정 메일 · 팀 · 권한을 골라 [추가]. 팀 관리자는 자기 팀 팀원만 추가할 수 있습니다.'),
    (3, '계정 목록', '팀 · 권한을 바꾸거나 휴지통으로 삭제합니다. 위의 팀 칩과 검색으로 좁혀 볼 수 있습니다.'),
    (4, '메일 받는 사람', '아침 메일을 받을 주소를 추가합니다(슈퍼관리자).'),
    (5, '미리보기 · 보내기', '오늘 메일을 미리 보고, 테스트로 보내거나 지금 바로 보냅니다.'),
])
fig('39-mail', '아침 메일 미리보기', [
    (1, '내 주소로 테스트', '내 주소로만 한 통 보냅니다.'),
    (2, '모두에게 지금 보내기', '받는 사람 전체에게 지금 보냅니다(확인 창이 한 번 더 나옵니다).'),
], width='66%')
h2('고급 (슈퍼관리자)')
fig('38-advanced', '설정 &gt; 고급', [
    (1, '연결 확인', '바깥 서비스들이 지금 정상인지 실제로 한 번씩 불러 봅니다.'),
    (2, 'API 연결', '실행 · 데이터 / 업체 검사 / 수원국 / 알림 묶음별 상태. 문제가 있으면 이유가 한 줄로 나옵니다.'),
    (3, '이번 달 요금', 'Claude AI와 Firebase 사용량으로 셈한 추정 금액입니다. 실제 청구액은 각 콘솔 링크에서 확인합니다.'),
    (4, '실행 기록', '최근 스캔 · 메일 실행 결과(시각 · 걸린 시간 · 새 이슈 수 · 오류).'),
])
end()

# ───────────────────────── 5. 자동으로 돌아가는 일
chapter('자동으로 돌아가는 일', '사람이 누르지 않아도 매일 돌아가는 것들입니다.')
h2('매일 아침')
steps(['<b>07~08시</b>: 진행 중 사업에 연결된 업체를 검사하고(뉴스 · 조달청 · MDB · EXIMIIS 명단), 수원국 정보를 새로 받습니다.', 'AI가 기사마다 이 업체의 제재 · 수사 이야기인지 판정하고 등급을 붙입니다. 담당자가 누른 ✓ / ✕ 사례를 함께 참고합니다.', '새로 잡힌 경고 · 주의 이슈가 있으면 받는 사람에게 메일을 보냅니다. 제목은 "[EDCF RADAR] MM/DD 경고 N · 주의 N" 꼴입니다.'])
ul(['같은 업체의 뉴스를 7일 안에 이미 보냈으면 메일에서는 생략합니다(등급이 오르면 다시 보냅니다). 대시보드에는 그대로 보입니다.', '메일은 "오늘 새로 나온 것", 보고서는 "지금 상태"를 담습니다.'])
h2('담당자가 해 줄 일')
table(['언제', '할 일', '어디서'], [
    ['매일', '확인이 필요한 이슈를 보고 ✓ / ✕ 로 판단', '업체 리스크 화면'],
    ['가끔', '수원국 이벤트 ✓ / ✕ (관리자)', '수원국 리스크 화면'],
    ['명단이 바뀔 때', 'EXIMIIS 부정당업자 명단 올리기', '공식 제재 명단 창'],
    ['사업 · 업체가 바뀔 때', '사업 등록 · 업체 연결 · 단계 변경 · 사업 완료 처리', '관리자 모드'],
    ['주황 버튼이 보일 때', 'DART 동명 기업 고르기 · 사업자번호 중복 합치기 · 업체명 변경 확인', '업체 관리'],
], 'c3s')
end()

# ───────────────────────── 6. 자주 묻는 질문
chapter('자주 묻는 질문')
qa = [
    ('로그인이 안 됩니다.', '등록되지 않은 계정입니다. 팀 관리자에게 Google 계정 메일 주소를 알려 주고 등록을 요청하세요.'),
    ('[관리자 모드] 버튼이 안 보입니다.', '팀원 계정에는 보이지 않습니다. 권한은 설정 &gt; 계정·권한에서 관리자가 바꿉니다.'),
    ('등록한 업체가 대시보드에 안 보입니다.', '대시보드는 진행 중인 사업에 참여 중인 업체만 보여 줍니다. 사업에 연결하지 않았거나 사업이 완료된 업체는 "미참여"로 표시되고 업체 관리 · 검색에서만 보입니다.'),
    ('잘못 눌렀습니다.', '처리한 이슈는 이슈 목록 아래 접힌 칸이나 업체 상세에서 [되돌리기]를 누르면 처리 전으로 돌아갑니다.'),
    ('[지금 스캔]을 눌렀는데 시작하지 않습니다.', '요청은 보통 1~2분 안에, 늦어도 5분 안에 시작됩니다. 끝나면 화면이 자동으로 바뀌므로 기다리면 됩니다.'),
    ('원문 링크가 열리지 않습니다.', '일부 기사는 Google 뉴스를 거쳐 열리는데, 회사 Google 계정으로 로그인한 브라우저에서는 막힐 수 있습니다. 기사 제목으로 포털에서 검색하거나 다른 브라우저 창에서 열어 보세요.'),
    ('화면이 느립니다.', '계정 메뉴에서 "가벼운 모드"를 켜면 레이더와 점의 움직임이 줄어듭니다.'),
    ('공식 제재 명단의 MDB가 0입니다.', '세계은행 등 5개 기관 제재 리스트에 우리 업체가 없다는 뜻입니다. 대조는 영문명으로 하므로 업체의 영문명이 비어 있지 않은지 확인하세요.'),
    ('조달청 칸에 다른 기관 이름이 나옵니다.', '나라장터에는 여러 발주기관이 통보한 제재가 모입니다. 통보 기관이 조달청이 아니어도 입찰참가자격 제한은 같습니다.'),
    ('같은 기사가 계속 올라옵니다.', '한 번 ✓ / ✕ 로 처리한 기사는 다시 가져오지 않고, 같은 사건의 후속 기사는 자동으로 같은 처리가 됩니다. 처리하지 않고 두면 비슷한 기사가 계속 쌓일 수 있습니다.'),
]
w('<div class="qa">' + ''.join(f'<div class="q"><b>Q. {q}</b><p>{a}</p></div>' for q, a in qa) + '</div>')
end()

# ───────────────────────── 조립
toc_html = ''.join(f'<div class="toc-{lv}"><span>{no}</span><a href="#{"c" + no if lv == 1 else "s" + no}">{t}</a></div>' for lv, no, t in toc)
LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity=".45"/><circle cx="12" cy="12" r="5" opacity=".7"/><path d="M12 12 L19 6"/><circle cx="12" cy="12" r="1.6" fill="#fff" stroke="none"/></svg>'
CSS = """
@font-face { font-family: "Pretendard Variable"; font-weight: 45 920; src: url("file://%s") format("woff2-variations"); }
@page { size: A4; margin: 17mm 15mm 16mm; }
* { box-sizing: border-box; }
html { font-family: "Pretendard Variable", sans-serif; font-size: 10pt; color: #1B2335; line-height: 1.62; word-break: keep-all; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; }
.cover { height: 262mm; display: flex; flex-direction: column; justify-content: space-between; padding: 22mm 14mm 10mm; border-radius: 6mm; background: linear-gradient(150deg, #0B101C 0%%, #17224A 55%%, #1C4D7A 100%%); color: #fff; page-break-after: always; }
.cover .lg { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 13pt; letter-spacing: .02em; }
.cover .lg i { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: linear-gradient(135deg, #6C7BFF, #22C5E8); } .cover .lg svg { width: 20px; height: 20px; }
.cover h1 { margin: 0; font-size: 40pt; line-height: 1.15; font-weight: 800; letter-spacing: -.02em; }
.cover h1 span { display: block; font-size: 17pt; font-weight: 600; opacity: .75; margin-top: 12px; letter-spacing: 0; }
.cover .meta { font-size: 10pt; opacity: .7; display: flex; justify-content: space-between; }
.tocp { page-break-after: always; } .tocp h1 { font-size: 20pt; margin: 2mm 0 4mm; }
.toc { columns: 2; column-gap: 12mm; } .toc-1, .toc-2 { break-inside: avoid; } .toc-1:first-child { margin-top: 0; }
.toc-1 { display: flex; gap: 12px; font-weight: 750; font-size: 11pt; margin-top: 11px; padding-bottom: 4px; border-bottom: 1.5px solid #1B2335; } .toc-1 span { width: 20px; }
.toc-2 { display: flex; gap: 12px; font-size: 9.6pt; padding: 2.5px 0 2.5px 32px; color: #3A455C; border-bottom: 1px solid #E6EAF2; } .toc-2 span { width: 30px; color: #7C879C; }
.toc-1 a, .toc-2 a { color: inherit; text-decoration: none; }
.chapter { page-break-before: always; }
.ch-head { display: flex; align-items: center; gap: 14px; padding-bottom: 10px; border-bottom: 2.5px solid #1B2335; margin-bottom: 12px; }
.ch-no { width: 38px; height: 38px; border-radius: 11px; background: linear-gradient(135deg, #5B6CFF, #22B8E0); color: #fff; font-weight: 800; font-size: 17pt; display: grid; place-items: center; }
h1 { font-size: 21pt; margin: 0; letter-spacing: -.01em; }
.lead { font-size: 11pt; color: #3A455C; margin: 0 0 6px; }
h2 { font-size: 13.5pt; margin: 22px 0 8px; padding: 6px 12px; border-radius: 8px; background: #EEF1FB; display: flex; gap: 10px; align-items: baseline; page-break-after: avoid; break-after: avoid; }
h2 span { color: #5B6CFF; font-weight: 800; font-size: 11.5pt; }
p { margin: 6px 0; } ul, ol { margin: 6px 0; padding-left: 20px; } li { margin: 3px 0; }
ol.steps { list-style: none; padding: 0; counter-reset: st; } ol.steps li { counter-increment: st; position: relative; padding: 2px 0 2px 30px; }
ol.steps li::before { content: counter(st); position: absolute; left: 0; top: 3px; width: 20px; height: 20px; border-radius: 50%%; background: #1B2335; color: #fff; font-size: 8.5pt; font-weight: 750; display: grid; place-items: center; }
.btn { display: inline-block; padding: 0 7px; border-radius: 6px; border: 1px solid #C9D0E0; background: #F6F8FC; font-weight: 650; font-size: 9.2pt; line-height: 1.55; white-space: nowrap; }
.bd { display: inline-block; padding: 0 9px; border-radius: 999px; font-weight: 750; font-size: 9pt; line-height: 1.6; white-space: nowrap; }
.bd.red { background: #D92D20; color: #fff; } .bd.ora { background: #F57C00; color: #2B1400; } .bd.grn { background: #D8F3EC; color: #0B7A6C; } .bd.ref { background: #E2E8F0; color: #475569; }
.ch { display: inline-block; padding: 0 8px; border-radius: 6px; font-weight: 700; font-size: 9pt; line-height: 1.6; white-space: nowrap; } .ch.ok { background: #DDF5EE; color: #0B7A6C; } .ch.no { background: #FDE5E3; color: #B42318; }
.note { display: flex; gap: 10px; margin: 10px 0; padding: 8px 12px; border-radius: 8px; background: #F3F6FC; font-size: 9.4pt; page-break-inside: avoid; }
.note b { flex: none; padding: 0 8px; height: 19px; line-height: 19px; border-radius: 5px; background: #5B6CFF; color: #fff; font-size: 8.4pt; margin-top: 1px; }
.note.warn { background: #FFF5E8; } .note.warn b { background: #E86A00; } .note.who { background: #EEF8F5; } .note.who b { background: #0B8074; }
table.t { width: 100%%; border-collapse: collapse; margin: 8px 0 10px; font-size: 9.4pt; page-break-inside: avoid; }
table.t th { text-align: left; padding: 6px 10px; background: #1B2335; color: #fff; font-weight: 650; font-size: 9pt; } table.t th:first-child { border-radius: 6px 0 0 0; } table.t th:last-child { border-radius: 0 6px 0 0; }
table.t td { padding: 6px 10px; border-bottom: 1px solid #E3E8F1; vertical-align: top; }
table.c3 td:first-child { width: 17%%; font-weight: 700; } table.c3 td:nth-child(2) { width: 45%%; }
table.c2 td:first-child { width: 17%%; } table.c2n td:first-child { width: 20%%; font-weight: 800; }
table.c3g td:first-child { width: 11%%; } table.c3g td:nth-child(2) { width: 36%%; }
table.c3b td:first-child { width: 17%%; } table.c3b td:nth-child(2) { width: 43%%; }
table.c3s td:first-child { width: 24%%; font-weight: 650; } table.c3s td:nth-child(2) { width: 44%%; }
figure.fig { margin: 12px 0 14px; } figure.fig .keep, figure.side { page-break-inside: avoid; break-inside: avoid; } table.leg tr { page-break-inside: avoid; break-inside: avoid; }
.shot { margin: 0 auto; border-radius: 8px; overflow: hidden; border: 1px solid #C9D0E0; background: #0B101C; line-height: 0; }
.shot img { width: 100%%; display: block; }
.cap { text-align: center; font-size: 8.8pt; color: #66728A; margin: 6px 0 6px; font-weight: 600; }
table.leg { width: 100%%; border-collapse: collapse; font-size: 9.2pt; }
table.leg td { padding: 4px 8px; border-bottom: 1px solid #E9EDF4; vertical-align: top; }
table.leg td.n { width: 30px; padding-right: 0; } table.leg td.n i { display: grid; place-items: center; width: 19px; height: 19px; border-radius: 50%%; background: #1B2335; color: #fff; font-style: normal; font-weight: 750; font-size: 8.4pt; margin-top: 1px; } table.leg td.n i:empty { width: 7px; height: 7px; margin: 7px 6px; }
table.leg td.k { width: 23%%; font-weight: 700; white-space: nowrap; }
figure.side { display: grid; grid-template-columns: 38%% 1fr; gap: 16px; align-items: start; } figure.side .fr table.leg td.k { width: 30%%; white-space: normal; }
.qa .q { padding: 9px 0; border-bottom: 1px solid #E3E8F1; page-break-inside: avoid; } .qa .q b { font-size: 10.4pt; } .qa .q p { margin: 3px 0 0; color: #3A455C; }
""" % FONT
doc = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>EDCF RADAR 사용 매뉴얼</title><style>{CSS}</style></head><body>
<div class="cover"><div class="lg"><i>{LOGO}</i>EDCF RADAR</div>
<h1>사용 매뉴얼<span>업체 · 수원국 리스크 모니터링</span></h1>
<div class="meta"><span>한국수출입은행 EDCF</span><span>2026. 11. 27. 기준</span></div></div>
<div class="tocp"><h1>차례</h1><div class="toc">{toc_html}</div></div>
{''.join(out)}
</body></html>"""
open(os.path.join(HERE, 'manual.html'), 'w').write(doc)
print('그림', fig_no[0], '· 장', sec_no[0], '· 글자', len(doc))
