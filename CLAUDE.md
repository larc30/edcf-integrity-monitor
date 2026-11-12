# CLAUDE.md — EDCF RADAR (부정당업자 자동감지)

사용자: 한국수출입은행 EDCF 담당자(정보통신팀), 비개발자. 한국어로 쉽게 설명. 요청한 것만 만들고, 큰 변경은 의도를 먼저 짧게 설명.
변경 기록(v12~v41)과 예전 결정 배경은 `docs/HISTORY.md` — 필요할 때만 찾아 읽을 것.

## 꼭 지킬 것
- 실제 업체에 대한 가짜 제재 데이터를 화면 캡처·문서에 남기지 않음. 데모·테스트는 지어낸 이름만.
- `.github/workflows/monitor.yml` 은 Claude가 수정하지 않음(봇이 마지막으로 고치면 예약 실행이 멈출 수 있음).
- Firestore 무료 한도(하루 읽기 5만): 진단용 preview/scan 을 함부로 돌리지 않음. 대시보드 1회 로드 ≈ 1,500 읽기.
- 공개 Actions 로그에는 건수만(업체명·사업자번호·메일 주소 금지). 자세한 내용은 Firestore runs·업체 last_check.
- 실제 업무 명단(코랩 202곳·EXIMIIS 13건)은 저장소에 넣지 않음 — 사용자가 대시보드에서 올림.
- 커밋·PR에 모델 이름 넣지 않음.

## 구조
- 화면: GitHub Pages `index.html` + `assets/app.js`·`style.css` / 데이터: Firebase Firestore(프로젝트 edcf-monitor) / 검사: GitHub Actions `monitor/`(Python). 저장소 larc30/edcf-integrity-monitor(public).
- 로그인: Google. 관리자 = `assets/firebase-config.js` ALLOWED_EMAILS·`firestore.rules` owner(), 추가 계정 = meta/access.emails(설정 > 로그인 계정, 규칙 재게시 필요). 데이터 권한(firestore.rules, 2026-11-12): 읽기는 등록 계정 모두, 쓰기는 관리자(owner)만. 팀원은 findings 의 확인 완료/관련 없음(status·reviewed_by·reviewed_at·review_note)만. 화면도 관리자가 아니면 body.viewer 로 스캔·등록·수정 버튼을 숨김. 규칙은 사용자가 Firebase 콘솔에 다시 게시해야 적용.
- 화면 탭: 업체 리스크 ↔ 수원국 리스크(미끄러지는 스위치, 카드 뒤집기 전환 · 가벼운 모드면 바로 전환). 업체 관리·사업 관리·설정은 관리자 모드에서만(상단 오른쪽 주황 [관리자 모드] 버튼, 관리자 계정에만 보임). 관리자 모드는 별도 모드: 켜면 업체·수원국 스위치가 숨고 관리 탭만, [관리자 모드 나가기]나 로고로 나옴. 화면에서만 막은 것이고 Firestore 규칙은 그대로.
- 기간 구분(업체 이슈·수원국 이벤트 같게): 전체 · 24시간(처음 잡힌 때 기준) · 최근 7일 · 최근 30일 · 30일 이전. 공식 제재 기록은 기간과 무관하게 항상(30일 이전 제외).
- 이슈 버튼: ✓ 확인 완료(맞음 · 등급 유지 · AI에 '관련 있음' 예시) / ✕ 관련 없음(아님 · 등급에서 빠짐 · AI에 '관련 없음' 예시). 둘 다 같은 기사는 다시 안 가져옴.
- [지금 스캔]: 업체 리스크·수원국 리스크 같은 버튼 = 빠른 스캔(task quick: 제재 키워드 기사 + 공식 명단 3종 + geo, 업체명 검색 없음). 업체명 검색까지 하는 전체 스캔은 매일 아침 자동 + 설정 > 고급 > [전체 스캔]. quick·dartfill 은 monitor.yml 선택지에 없어서 항상 requests(queue)로만 실행.
- 이슈 카드는 업체별로 따로(같은 기사라도 업체가 다르면 묶지 않음: 제재는 법인 단위). 이슈 목록은 화면 높이 안에서 스크롤(.issue-scroll).
- 업체 수 표기는 '곳' 대신 '업체 N'. 공식 제재 명단 창은 출처별 세 칸(EDCF·조달청·MDB) + 접힌 EXIMIIS 올리기·검사 범위.
- 보기 범위 버튼 숫자: 업체 리스크는 '업체 N', 수원국 리스크는 '사업 N'으로 단위를 붙여 표시.
- 실행: 회사망은 api.github.com·script.google.com 차단 → [지금 스캔]은 Firestore requests 에 저장 → Apps Script(tools/relay.gs) tick(평일 08~19시 5분마다)이 queue 디스패치. 매일 아침은 Apps Script daily()(07~08시) + GitHub cron(30 22 UTC). run.py 는 자동 실행이면 하루 한 번만(meta/status.last_daily_at).
- 데모: `index.html?demo=1` (demo/fb-*.js 가짜 Firebase + demo/data.js 가상 데이터, 216곳 규모). `&guest` 붙이면 관리자 아닌 팀원 화면. demo/mail.js 는 tools/demo 스크립트로 생성.

## Firestore
projects{name,country,owner,created_at} · companies{name,name_en,aliases,category,category_source,biz_no,corp_code,country,watch,engagements:[{project_id,role,stage,order}],last_check,...} · findings{company_id,source_type(news/official),source_name,title,url,published_at,level(red/orange/yellow/none),category,summary,rationale,analyzer,dedup_key,relevant,status(new/reviewed/dismissed),same_as,reported_at,review_note} · seen/{업체id}(이미 본 기사 키) · edcf_sanctions(EXIMIIS 명단) · keywords{word,lang}(추가 키워드) · recipients · requests · runs · meta/status·settings·access·geo.
- meta/geo{updated_at, alerts{ISO2:{level 1~4, partial, regions, special}}, alerts_at, news_at, events[{id,type,country,lat,lng,title,url,at_ms,source,mag}]} — monitor/geo.py 가 daily 때 저장(문서 1개 = 대시보드 읽기 1회). projects.lat/lng(+site_en) 있으면 그 위치에 핀: 사업 등록·수정 창(같은 팝업, openProjectEdit(null)=등록)의 사업지 지도(geo.js mountSitePicker)에서 눌러서 지정.
- 사업 완료: projects.status="done"(사업 수정 창의 체크). 대시보드 두 곳·내 담당·집중 감시·geo 수집에서 빠지고 사업 관리에는 흐리게 남음(app.js live() ↔ scanner·geo.py).
- 내 사업 = projects.owner(로그인 이메일 1개). owner 없으면 모두에게 내 사업. watch=true 업체는 모두의 내 담당.

## 검사 (monitor/scanner.py)
- 매일: 기본 키워드 25개(TOPIC_QUERIES) + 추가 키워드(최대 12) 뉴스 검색 → 전체 명단 대조. MDB(OpenSanctions 5종, 비상업 라이선스)·조달청·EXIMIIS 대조는 모든 업체 매일.
- 집중 감시(사업 연결 또는 watch): 매일 업체명 검색 + '업체명+추가 키워드' 심층. 기본 감시: 업체명 검색 주 1회. 다시 스캔(force)은 10년 범위.
- 업체명 일치: textutil.name_matches(짧은 이름은 독립 단어·업종 문맥 필요).
- EXIMIIS: 명단에 '등록'이어도 제재기간 끝 날짜가 지났으면 참고(기간 만료)로 내림(scanner._period_ended ↔ app.js edcfEnded).
- 조달청: data.go.kr 15129466, 사업자번호로 현재 유효 제재만. 오류 줄이기: 동시 2건·지연/5xx/429 는 두 번 더 시도(pps._call), 빠른 스캔은 오늘 이미 정상 조회한 업체를 다시 부르지 않음(last_check.pps.reused). 같은 부정당번호에 정지·해제 줄이 있거나, 저장된 제재가 기간 중 사라지면 경고(집행정지 확인).
- 사업자번호·영문명·업종: DART corpCode 정확 일치 1건일 때만 자동, 아니면 수기. 업체 관리 [DART로 빈 정보 채우기](task dartfill): 1건이면 채우고 여러 건이면 companies.dart_cands 에 후보 저장 → [DART 후보 고르기]에서 선택.
- AI 판정: Claude(config.CLAUDE_MODEL, 기본 Haiku), 키 없으면 analyzer.RULE_KEYWORDS 규칙 판정. 처분 대상이 모회사·자회사·계열사(다른 법인)면 이 업체는 참고(yellow) 이하. 확정된 처분은 시작일 전이어도 위험. 분류에 '영업정지·등록말소' 있음. 계속 배우기: 모든 업체의 ✓/✕ 사례(analyzer.SHARED)와 판정 지침(meta/ai_guide.auto: AI가 주 1회 요약, 직접 적는 칸은 없앰)을 판정마다 함께 줌(화면에는 보이지 않음: 사용자가 설정 카드도 빼 달라고 함). 업체별 '관련 없음'·'확인했음' 제목을 예시로 전달('과거 이력 일괄 정리'는 제외). 재판정은 monitor/rejudge.py.

## 등급 (3단계: 위험·경고·정상, 2026-11-11 결정)
- 업체 등급: 위험 = 지금 유효한 제재(입찰제한·MDB·영업정지·등록말소·EXIMIIS 등록) / 경고 = 제재로 이어질 진행 중 사안(수사·기소·과징금·부도·회생, 집행정지) / 정상 = 그 밖.
- 기록의 level 값은 그대로 red/orange/yellow/none. yellow 는 등급이 아니라 '참고 이력'(회색 '참고' 배지) — 업체 등급 계산(app.js compute·report.load_overview)에서 정상으로 봄. AI 판정 기준(analyzer)은 안 바꿈.
- 확인할 이슈·메일·업체 미확인 수는 위험·경고만. 참고는 접힌 '참고 이력'.
- 배지(모두 꽉 찬 색): 밝은 화면 위험 #D92D20/흰 · 경고 #F57C00/#2B1400 · 참고 #E2E8F0/#475569, 어두운 화면 #FF5A5F · #FF9F1C · 참고 #334155/#CBD5E1. style.css .badge ↔ report.BADGE ↔ app.js BF 같게.
- 수원국 등급(assets/geo.js siteRisk · GEO_RULES 표): 사업지마다 정하고 나라 등급 = 그 나라 사업 중 가장 높은 등급. 위험 = 여행경보 4단계·특별여행주의보·전역 3단계, 사업지 예상 진도 6+ 지진(7일), 50km 안 테러·분쟁(14일) / 경고 = 일부 지역 3단계·전역 2단계, 예상 진도 5 지진(7일), 200km 안 테러·분쟁(14일), 100km 안 홍수·태풍·산불·화산(7일), 50km 안 시위·감염병(7일) / 정상. 사업 카드에 '근거' 줄. 예상 진도 = geo.js siteMMI (USGS 진도 예측식 Atkinson & Wald 2007, 규모·진앙 거리·깊이; 2026-11-11 사용자 예시 거리 기준에서 바꿈).

## 수원국 리스크 (초안, monitor/geo.py ↔ assets/geo.js)
- 지도: Leaflet + 저장소 안 세계 지도 assets/world-50m.json(world-atlas · Natural Earth 1:50m, topojson 3.0.2 cdnjs)로 바다·육지·국경선만 그리는 완전 플랫(바깥 지도 서비스·키 없음). 색은 style.css --map-sea·--map-land·--map-border. 위험·경고 수원국만 육지 색에 등급 색을 섞어 칠함(정상은 안 칠함: 초록이 바다처럼 보임). 나라 이름은 그림자 없는 글자(사업 나라는 대문자 굵게, 그 밖은 확대할수록 큰→중간→작은 나라). Esri 타일·위성 버튼은 없앰. 남극은 빼고, 날짜변경선을 넘는 땅(피지·러시아 동쪽)은 경도를 이어 붙임(안 그러면 지도를 가로지르는 줄이 생김).
- 여행경보: 공공데이터포털 '외교부_국가·지역별 여행경보'(TravelAlarmService2) + 특별여행주의보. 키는 조달청과 같은 DATA_GO_KR_KEY 그대로(따로 입력 안 함, 활용신청만). MOFA_TRAVEL_KEY 는 다른 키를 쓸 때만. 응답 필드명은 실제 키로 아직 확인 못 함. 연결 상태는 대시보드가 아니라 설정 > 고급 > API 연결에.
- 지진: USGS 4.5_week(키 없음) 가운데 규모 5.5 이상만(QUAKE_MIN, geo.py ↔ geo.js), 사업지·수원국 600km 안. 브라우저에서도 실시간으로 한 번 더 받음(회사망에서 막히면 저장본).
- 뉴스: Google·네이버 '나라 이름 + 사건 단어', 제목에 나라 이름 있는 것만(AI 판정 없이 단어로만 분류). 정치·선거(politics: 선거·정권 교체·탄핵 등)는 참고용으로 등급에 안 넣음. 이벤트는 1년 보관, 최대 300건.
- 지도 표시: 이벤트는 종류별 색 아이콘 배지(이모티콘 안 씀), 지명은 영어(Esri 이름 층 + 'Nairobi, Kenya'). 오른쪽 사업을 누르면 사업지 둘레 100~500km 레이더 모양 원(실선·십자선·도는 빛) + 600km 안 이벤트까지 거리선·거리, 근거와 가까운 사건은 오른쪽 사업 카드 안에 펼침(지도 위 안내 상자는 안 씀). 다시 누르거나 지도 오른쪽 위 [‹ 전체 지도](사업 골랐을 때만 보임)로 해제.
- 핀 옆 사업명(나라 이름·'사업' 뺀 짧은 이름). 겹치면 declutter(): 원래 쪽 → 반대쪽 → 아래 → 위, 모두 막히면 숨김(위험 순서대로 자리 차지, 지도 밖 잘림도 막힘으로 봄). 나라 이름도 핀·사업명·이벤트와 겹치면 숨김.
- 첫 실제 수집(11/11 스캔): 여행경보 145개국 · 지진 2 · 뉴스 이벤트 62 (수원국 6개국). 특별여행주의보 API 는 HTTP 오류(활용신청 또는 주소 확인 필요).

## 같은 기준을 두 곳에서 유지
- TOPIC_QUERIES: monitor/scanner.py ↔ assets/app.js
- 업종 6종: monitor/category.py ↔ app.js CATS·CAT_RULES
- 이슈 묶기: monitor/grouping.py ↔ app.js groupFindings (같은 제목·주소 / 같은 업체·분류 3일 / 제목 유사 0.6 / 같은 공식 기록 / AI same_as)
- 역할 순서 F/S → 컨설턴트 → 본구매: app.js ROLES·ROLE_ORDER ↔ report.ROLE_ORDER
- 수원국 좌표·도시 좌표·이벤트 종류: monitor/geo.py COUNTRY·CITY·EVENT_WORDS ↔ assets/geo.js GEO_COUNTRY·GEO_CITY(영문명 포함)·GEO_TYPES(이름·색·아이콘)

## API 연결 확인 (monitor/conncheck.py)
- 설정 > 고급 > [연결 확인] → requests{task:'check'} → queue 에서 각 API를 가볍게 실제 호출(Claude는 models.list, 조달청은 없는 번호 조회) → meta/status.conn_check{at, results{키:{ok,msg}}}. 평소 '연결됨'은 키 등록 여부(마지막 스캔 기준)만.

## 화면 규칙
- 디자인(v52, 2026-11-12 사용자 결정): 그라데이션·빛 효과는 유지(업체 리스크 보라·하늘, 수원국 리스크 하늘·초록으로 구분 — 평평한 단색으로 바꾸지 말 것). 제목 영역은 한 줄(부제는 '마지막 스캔/갱신'만). 글자 크기·다크/라이트 버튼은 상단에 그대로, 계정 메뉴에는 메일·로그아웃만. 이슈 카드의 ✓/✕ 버튼은 제목 줄 오른쪽. 오른쪽 사업 목록은 위험·경고 업체만 이름 + '정상 N', 사업 카드를 누르면 사업 상세(openProject, 오른쪽 창). 수원국 사업 카드는 평소 두 줄, 누르면 자세히. 상세는 오른쪽 창(drawer), 팝업은 등록·설정용. 설명 글은 word-break: keep-all(한 글자만 넘어가지 않게), i 표시는 제목 줄 가운데.
- 어제와 비교·최근 7일 선 그래프(위험 빨강·경고 주황, 날마다 점과 숫자. 막대보다 선을 원함): 화면에서 이슈의 first_seen_ms 로 날짜별 위험·경고 업체 수를 되짚어 계산(지금 보는 범위 기준). 30일 선 그래프는 뜻이 안 보인다고 해서 뺌. report.save_history 의 meta/history 기록은 계속 쌓지만 화면은 아직 안 씀.
- 업체 리스크와 수원국 리스크는 같은 칸 폭(왼쪽 등급 · 가운데 레이더/지도 · 오른쪽 사업). 레이더 위험 점은 같은 색 점선 테두리가 천천히 돌고 은은하게 깜빡임(흰 호는 과하다고 함), 경고 점은 반짝임, 지도 최근 사건도 점선 테두리가 돎(가벼운 모드에서는 꺼짐. 회사 PC의 '애니메이션 효과 끄기'(prefers-reduced-motion)에서도 점 움직임은 유지하도록 예외를 둠). 계정 메뉴: 메일·가벼운 모드·[설정 (관리자)]·로그아웃. 지도는 4 이상 확대하면 주요 도시(GEO_CITY) 점·이름. 사업명 표시는 어느 쪽이든 왼쪽 등급 색 띠. 이벤트 요약에 [전체].
- 다크 기본, 대시보드 배치 'B 관제실'. backdrop-filter·blur 애니메이션 금지(느려짐, 가벼운 모드 html.lite 있음).
- 글자 크기는 var(--fs-xs·sm·base·md·lg·xl)만. 화면 문구에 '—' 쓰지 않기. 창 닫기 버튼은 마지막 .actions 줄 주 버튼 오른쪽.
- 메일(report.py): 제목 '[EDCF RADAR] MM/DD 위험 N · 경고 N', 오늘 새 위험·경고만 한 줄씩. 본문 위에 보고서처럼 업체 등급 세 칸. 설정 > 메일 [미리보기 · 보내기] 창 안에서 '내 주소로 테스트'와 'N명에게 지금 보내기'(둘 다 확인 창). 데모 메일은 tools/demo 로 다시 만듦(pip firebase-admin httpx 필요). PDF 보고서: 기본 한 장 요약, [보고서] 창 오른쪽에 A4 미리보기(고르면 바로 바뀜, 인쇄 여백 13mm 12mm 같게).
- 줄 맞춤: 업체 리스크 오른쪽 사업 목록은 이슈 목록 끝까지(contain: size, 넘치면 안에서 스크롤). 수원국 리스크는 가운데 줄(등급·지도·사업) 높이 같게, 최근 이벤트는 전체 폭 2열. 칸 폭은 글자 크기 따라가게 em 단위(가−/가+ 아주 크게에서도 안 깨짐).

## 테스트
- Python: store/news/sanctions/dart/pps 를 메모리 가짜로 바꿔 scanner.run_scan.
- 화면: Playwright로 `?demo=1` 또는 Firebase 모듈을 가짜(window.__DB)로 바꿔 실행.

## 자료
- 발표 자료(Slides Artifact): https://claude.ai/artifact/P8sKcUGGNPhx8tiRM22g61 — 14장, 사용자가 직접 순서·스크립트를 고침(업체 리스크가 기본, 수원국은 더해서 보는 기능). 순서: 표지 · 배경(200+, 5+, 계약 후 0회) · 흐름 · 시스템 구조 · 등급 · 업체 화면 · 수원국 화면 · 운영 · 추진 단계 · 정식 운영 준비(보안, 라이선스, 운영, 비용 네 칸, 지금 → 그래서 필요한 일, 비용은 10명 남짓 넘으면 유료 · 팀 전체 월 1~2만 원 예상) · 함께 쓰기(두 가지) · 시연 순서(카드 6개 한 장) · 질문 · 만든 과정. 밝은 톤, 화면 캡처는 다크, 선 아이콘, 가운뎃점(·)과 ● 쓰지 않기. 스크립트는 사용자 원문의 큰 축을 유지하고 다듬기만. 고칠 때는 반드시 Artifact read 로 최신본(사용자 편집 포함)을 받아 그 위에서 수정.
- 즉시 스캔 함수(선택, 미배포·미검증): functions/index.js(requests 생성 → queue 디스패치), 설치 안내 docs/INSTANT.md. Blaze 요금제 필요.
- 설계도(Artifact): https://claude.ai/artifact/JtxkBSsA5KA4Z2b57Nd8tU · 해커톤 키트: docs/HACKATHON.md
- 팀 매뉴얼 기준: 필요자료 = 사업자번호·영문명. ① EXIMIIS 부정당업자(등록=위험, 해지=이력) ② MDB 5곳 영문명 조회 후 국적 한국 확인 ③ 나라장터 부정당제재(제재정지면 확인 필요).

## 남은 일
- 보류: 세계은행 제재 목록 직접 연결(작업 환경에서 worldbank.org 차단, 사용자가 '지금 중요하지 않음'). 원인 후보: 제재 종료일 미확인·국적 미확인.
- 수원국 리스크 초안 다음: 외교부 키 연결·응답 확인, 사업지 좌표 입력(사업 관리), 지역별 여행경보와 사업지 대조.
- 사용자: 추가 계정 4개(팀 대표 계정 권장) + Firebase 규칙 재게시 확인, 사업자번호 88곳 보완, 11/5 이전 공개 실행 로그 삭제(다음 주).
- 발표 후: 라이트 버전, 보완 엑셀.
