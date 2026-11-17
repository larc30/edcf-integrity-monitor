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
- 로그인: Google 유지(2026-11-18 결정). 팀 권한(2026-11-18): 슈퍼관리자 1명 고정(firebase-config.js SUPER_ADMIN ↔ firestore.rules isSuper()) · 팀 관리자(팀당 1명 권장) · 팀원. 계정 = users/{메일}{role admin|member, team}, 설정 > 계정·권한에서 관리(슈퍼: 누구나·팀·역할 / 팀 관리자: 자기 팀 팀원만). 팀 = TEAMS{ict 정보통신팀, water 수자원에너지팀, transport 교통팀, health 보건팀}. 사업은 한 팀에만(projects.team), '내 사업' = 우리 팀 사업(isMine: p.team == 내 팀, owner 는 선택 담당자). 팀 관리자는 자기 팀 사업만 등록·수정·삭제·업체 연결(다른 팀 사업 카드는 .ro 보기 전용), 업체 기본정보는 팀 관리자 누구나(공통 명단). 이슈 ✓/✕ 는 자기 팀 사업에 참여한 업체만(사업 미연결 업체는 관리자 누구나): 규칙이 companies.teams(참여 팀, app 이 저장·syncCompanyTeams 로 맞춤)로 확인. 메일·키워드·고급 설정은 슈퍼만(.super-only). 처음 슈퍼관리자 로그인 때 migrateRoles(): 예전 ALLOWED_EMAILS·meta/access 계정을 users 로(팀원), 팀 없는 사업은 정보통신팀으로. 규칙은 사용자가 Firebase 콘솔에 다시 게시해야 적용(옮기기가 끝난 뒤 게시).
- 상단 업체 검색(#coFind, 모든 사용자): 업체명·별칭·영문명·사업자번호로 찾아 업체 상세를 엶(팀원은 읽기 전용).
- 화면 탭: 업체 리스크 ↔ 수원국 리스크(미끄러지는 스위치, 카드 뒤집기 전환 · 가벼운 모드면 바로 전환). 업체 관리·사업 관리·설정은 관리자 모드에서만(상단 오른쪽 주황 [관리자 모드] 버튼, 관리자 계정에만 보임). 관리자 모드는 별도 모드: 켜면 업체·수원국 스위치가 숨고 관리 탭만, [관리자 모드 나가기]나 로고로 나옴. 화면에서만 막은 것이고 Firestore 규칙은 그대로.
- 기간 구분(업체 이슈·수원국 이벤트 같게): 전체 · 24시간(처음 잡힌 때 기준) · 최근 7일 · 최근 30일 · 30일 이전. 공식 제재 기록은 기간과 무관하게 항상(30일 이전 제외).
- 이슈 버튼: ✓ 확인 완료(맞음 · 등급 유지 · AI에 '관련 있음' 예시) / ✕ 관련 없음(아님 · 등급에서 빠짐 · AI에 '관련 없음' 예시, 이유를 꼭 고름: DISMISS_REASONS 동명이인·다른 법인·단순 언급·과거 일·기타 → review_reason·review_note, review_note 는 AI 예시에 같이 감). 둘 다 같은 기사는 다시 안 가져옴. 되돌리기는 같은 사건으로 자동 처리된 기사(auto_same)도 함께 풀고, AI 예시는 다음 스캔부터 빠짐(주간 요약 지침에는 최대 1주 남을 수 있음). 이슈 목록 머리 [판단 가이드](GUIDE_HTML, 초안, 인쇄·PDF): 4개 팀 공통 기준 검토용.
- [지금 스캔]: 업체 리스크·수원국 리스크 같은 버튼 = 빠른 스캔(task quick: 제재 키워드 기사 + 공식 명단 3종 + geo, 업체명 검색 없음). 업체명 검색까지 하는 전체 스캔은 매일 아침 자동 + 설정 > 고급 > [전체 스캔]. quick·dartfill 은 monitor.yml 선택지에 없어서 항상 requests(queue)로만 실행.
- 이슈 카드는 업체별로 따로(같은 기사라도 업체가 다르면 묶지 않음: 제재는 법인 단위). 이슈 목록은 화면 높이 안에서 스크롤(.issue-scroll).
- 업체 수 표기는 '곳' 대신 '업체 N'. 공식 제재 명단 창은 출처별 세 칸(EDCF·조달청·MDB) + 접힌 EXIMIIS 올리기·검사 범위.
- 보기 범위 버튼 숫자: 업체 리스크는 '업체 N', 수원국 리스크는 '사업 N'으로 단위를 붙여 표시.
- 실행: 회사망은 api.github.com·script.google.com 차단 → [지금 스캔]은 Firestore requests 에 저장 → Apps Script(tools/relay.gs) tick(평일 08~19시 5분마다)이 queue 디스패치. 매일 아침은 Apps Script daily()(07~08시) + GitHub cron(30 22 UTC). run.py 는 자동 실행이면 하루 한 번만(meta/status.last_daily_at).
- 데모: `index.html?demo=1` (demo/fb-*.js 가짜 Firebase + demo/data.js 가상 데이터, 216곳 규모). `&guest` = 정보통신팀 팀원, `&teamadmin` = 수자원에너지팀 관리자 화면. demo/mail.js 는 tools/demo 스크립트로 생성.

## Firestore
projects{name,country,owner,created_at} · companies{name,name_en,aliases,category,category_source,biz_no,corp_code,country,watch,engagements:[{project_id,role,stage,order}],last_check,...} · findings{company_id,source_type(news/official),source_name,title,url,published_at,level(red/orange/yellow/none),category,summary,rationale,analyzer,dedup_key,relevant,status(new/reviewed/dismissed),same_as,reported_at,review_note} · seen/{업체id}(이미 본 기사 키) · edcf_sanctions(EXIMIIS 명단) · keywords{word,lang}(추가 키워드) · recipients · requests · runs · meta/status·settings·access·geo.
- meta/geo{updated_at, alerts{ISO2:{level 1~4, partial, regions, special}}, alerts_at, news_at, events[{id,type,country,lat,lng,title,url,at_ms,source,mag}]} — monitor/geo.py 가 daily 때 저장(문서 1개 = 대시보드 읽기 1회). projects.lat/lng(+site_en) 있으면 그 위치에 핀: 사업 등록·수정 창(같은 팝업, openProjectEdit(null)=등록)의 사업지 지도(geo.js mountSitePicker)에서 눌러서 지정.
- 사업 완료: projects.status="done"(사업 수정 창의 체크). 대시보드 두 곳·내 담당·집중 감시·geo 수집에서 빠지고 사업 관리에는 흐리게 남음(app.js live() ↔ scanner·geo.py).
- 내 사업 = projects.owner(로그인 이메일 1개)가 나인 사업만(2026-11-16 변경: 담당 미지정 사업은 EDCF 전체에서만 보임). 집중 감시(watch)는 검사 강도(매일 업체명 검색)만 바꾸고 내 담당에는 넣지 않음.

## 검사 (monitor/scanner.py)
- 매일: 기본 키워드 25개(TOPIC_QUERIES) + 추가 키워드(최대 12) 뉴스 검색 → 전체 명단 대조. MDB(OpenSanctions 5종, 비상업 라이선스)·조달청·EXIMIIS 대조는 모든 업체 매일.
- 집중 감시(사업 연결 또는 watch): 매일 업체명 검색 + '업체명+추가 키워드' 심층. 기본 감시: 업체명 검색 주 1회. 다시 스캔(force)은 10년 범위.
- 같은 사건 자동 처리(2026-11-17, scanner._inherit_review): AI same_as 가 담당자가 처리한 기록(확인 완료·관련 없음)을 가리키면 새 기사도 같은 상태(reviewed_by '자동 (같은 사건: …)', auto_same=true). 새 기사 등급이 더 높으면(수사→처분) 새 이슈로 둠. 메일에서도 빠짐. AI 에 주는 recent 에 처리 상태 표시.
- Google 뉴스 429(속도 제한, 하루 한도 아님): news._google_get 이 호출 간격 0.6초·429면 4초/10초 뒤 재시도.
- 업체명 일치: textutil.name_matches(짧은 이름은 독립 단어·업종 문맥 필요).
- EXIMIIS: 명단에 '등록'이어도 제재기간 끝 날짜가 지났으면 참고(기간 만료)로 내림(scanner._period_ended ↔ app.js edcfEnded).
- 조달청: data.go.kr 15129466, 사업자번호로 현재 유효 제재만. 오류 줄이기: 동시 2건·지연/5xx/429 는 두 번 더 시도(pps._call), 빠른 스캔은 오늘 이미 정상 조회한 업체를 다시 부르지 않음(last_check.pps.reused). 같은 부정당번호에 정지·해제 줄이 있거나, 저장된 제재가 기간 중 사라지면 경고(집행정지 확인).
- 사업자번호는 업체마다 하나(2026-11-18): 업체 추가·수정·일괄 등록·DART 고르기에서 같은 번호면 막음(app.js bizOwner), 일괄 등록은 이름이 달라도 번호가 같으면 같은 업체로. 기존 중복은 업체 관리 [사업자번호 중복 N]. 업체명 변경 알림: 전체 스캔 때 DART 기업목록(고유번호 → 지금 이름, API 호출 없음)과 비교해 companies.name_change → 업체 관리 [업체명 변경 N]에서 [새 이름으로](옛 이름은 별칭) / [무시](name_change_ignored). 고유번호(corp_code) 없는 업체는 못 찾음.
- 사업자번호·영문명·업종: DART corpCode 정확 일치 1건일 때만 자동, 아니면 수기. 업체 관리 [DART 일괄 조회](task dartfill, ids 주면 그 업체만): 1건이면 채우고 여러 건이면 companies.dart_cands 에 후보 저장 → [DART 동명 기업 고르기]에서 선택. 업체 추가 창: 업체명 옆 [DART에서 가져오기](task dartlookup → requests.result.cands, 화면이 4초마다 확인, 회사망은 tick 대기로 최대 5분 남짓) · 안 누르고 추가하면 그 업체만 dartfill 자동 요청.
- AI 판정: Claude(config.CLAUDE_MODEL, 기본 Haiku), 키 없으면 analyzer.RULE_KEYWORDS 규칙 판정. 처분 대상이 모회사·자회사·계열사(다른 법인)면 이 업체는 참고(yellow) 이하. 확정된 처분은 시작일 전이어도 위험. 분류에 '영업정지·등록말소' 있음. 계속 배우기: 모든 업체의 ✓/✕ 사례(analyzer.SHARED)와 판정 지침(meta/ai_guide.auto: AI가 주 1회 요약, 직접 적는 칸은 없앰)을 판정마다 함께 줌(화면에는 보이지 않음: 사용자가 설정 카드도 빼 달라고 함). 업체별 '관련 없음'·'확인했음' 제목을 예시로 전달('과거 이력 일괄 정리'는 제외). 재판정은 monitor/rejudge.py.

## 등급 (3단계: 위험·경고·정상, 2026-11-11 결정)
- 업체 등급: 위험 = 지금 유효한 제재(입찰제한·MDB·영업정지·등록말소·EXIMIIS 등록) / 경고 = 제재로 이어질 진행 중 사안(수사·기소·과징금·부도·회생, 집행정지) / 정상 = 그 밖.
- 기록의 level 값은 그대로 red/orange/yellow/none. yellow 는 등급이 아니라 '참고 이력'(회색 '참고' 배지) — 업체 등급 계산(app.js compute·report.load_overview)에서 정상으로 봄. AI 판정 기준(analyzer)은 안 바꿈.
- 확인할 이슈·메일·업체 미확인 수는 위험·경고만. 참고는 접힌 '참고 이력'.
- 배지(모두 꽉 찬 색): 밝은 화면 위험 #D92D20/흰 · 경고 #F57C00/#2B1400 · 참고 #E2E8F0/#475569, 어두운 화면 #FF5A5F · #FF9F1C · 참고 #334155/#CBD5E1. style.css .badge ↔ report.BADGE ↔ app.js BF 같게.
- 수원국 등급(assets/geo.js siteRisk · GEO_RULES 표): 사업지마다 정하고 나라 등급 = 그 나라 사업 중 가장 높은 등급. 여행경보는 '사업지 단계'(geo.js siteAlert, 2026-11-17): 나라 안 일부 지역만 높으면 사업지가 그 지역일 때만 그 단계(라오스 골든트라이앵글 4단계 때문에 비엔티안이 위험 되던 문제). 판단 순서 = 사업 수정 창에서 고른 단계(projects.alert_lv) → 핀·도시 좌표가 GEO_ZONES(지역 대략 원)·문구 속 GEO_CITY 30km 안 → 사업명 글자 → 없으면 '나머지 지역' 단계(alerts.base). 높은 지역은 카드에 '참고'로만. 위험 = 사업지 3·4단계·전 지역 특별여행주의보, 사업지 예상 진도 6+ 지진(7일), 50km 안 테러·분쟁(14일) / 경고 = 사업지 2단계·일부 지역 특별여행주의보, 예상 진도 5 지진(7일), 200km 안 테러·분쟁(14일), 100km 안 홍수·태풍·산불·화산(7일), 50km 안 시위·감염병(7일) / 정상. 사업 카드에 '근거' 줄. 예상 진도 = geo.js siteMMI (USGS 진도 예측식 Atkinson & Wald 2007, 규모·진앙 거리·깊이; 2026-11-11 사용자 예시 거리 기준에서 바꿈).

## 수원국 리스크 (초안, monitor/geo.py ↔ assets/geo.js)
- 지도: Leaflet + 저장소 안 세계 지도 assets/world-50m.json(world-atlas · Natural Earth 1:50m, topojson 3.0.2 cdnjs)로 바다·육지·국경선만 그리는 완전 플랫(바깥 지도 서비스·키 없음). 색은 style.css --map-sea·--map-land·--map-border. 위험·경고 수원국만 육지 색에 등급 색을 섞어 칠함(정상은 안 칠함: 초록이 바다처럼 보임). 나라 이름은 그림자 없는 글자(사업 나라는 대문자 굵게, 그 밖은 확대할수록 큰→중간→작은 나라). Esri 타일·위성 버튼은 없앰. 남극은 빼고, 날짜변경선을 넘는 땅(피지·러시아 동쪽)은 경도를 이어 붙임(안 그러면 지도를 가로지르는 줄이 생김).
- 여행경보: 공공데이터포털 '외교부_국가·지역별 여행경보'(TravelAlarmService2) + 특별여행주의보. 키는 조달청과 같은 DATA_GO_KR_KEY 그대로(따로 입력 안 함, 활용신청만). MOFA_TRAVEL_KEY 는 다른 키를 쓸 때만. 응답 확인함(2026-11-17, 210줄): alarm_lvl·region_ty(전체/일부)·remark(지역 문구, '…제외한 지역'이 나머지 지역)·country_iso_alp2 → meta/geo.alerts{level(최고), base(나머지 지역), partial, zones[{lv,text,rest}], regions}. 특별여행주의보 API 는 403 SERVICE_KEY_IS_NOT_REGISTERED(활용신청 필요). 연결 상태는 대시보드가 아니라 설정 > 고급 > API 연결에.
- 지진: USGS 4.5_week(키 없음) 가운데 규모 5.5 이상만(QUAKE_MIN, geo.py ↔ geo.js), 사업지·수원국 600km 안. 브라우저에서도 실시간으로 한 번 더 받음(회사망에서 막히면 저장본).
- GDACS(2026-11-18, geo.fetch_gdacs): gdacsapi events/geteventlist/SEARCH 태풍·홍수·화산·산불(TC·FL·VO·WF) 주황·빨강만, 최근 30일까지 이어진 사건, 600km 안 → events{source GDACS, gdacs Red|Orange}. 지진은 USGS, 가뭄은 뺌. 등급: 빨강 300km·7일 위험, 주황 300km·7일 경고.
- WHO Disease Outbreak News(geo.fetch_who): who.int/api/news/diseaseoutbreaknews 최근 90일, 제목 속 나라 이름(WHO_ALIAS 포함)으로 수원국만 → 나라 가운데 점(country_level, 거리 규칙에서 빠짐). 등급: 같은 나라 사업 30일 경고.
- 뉴스: Google·네이버 '나라 이름 + 사건 단어', 제목에 나라 이름 있는 것만 단어로 잡은 뒤 AI가 최종 판정(analyzer.judge_events: 사업에 영향 줄 사건만 남기고 종류·한 줄 요약(note)·ai=true 저장, 영향 없음은 meta/geo.rejected 에 id 를 남겨 다시 판정 안 함, 한 번에 60건, 키 없거나 실패하면 단어 분류 유지 후 다음에 재시도). 정치·선거(politics: 선거·정권 교체·탄핵 등)는 참고용으로 등급에 안 넣음. 이벤트는 1년 보관, 최대 300건.
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
- 최근 7일 선 그래프(v63, 2026-11-16 사용자 결정): 그날 새로 잡힌 위험·경고 이슈 수(first_seen_ms 기준, 같은 사건은 groupFindings로 1건, 관련 없음 제외, 처리 상태와 무관, 지금 보는 범위 기준). 위험·경고를 위아래 두 줄, 부드러운 곡선+채움, 지난 날은 작은 꽉 찬 점·작은 숫자(0은 흐리게), 오늘만 큰 점·큰 숫자. 막대보다 선을 원함. 어제와 비교(등급 칸의 +/−)는 날짜별 위험·경고 업체 수를 되짚어 계산. 30일 선 그래프는 뜻이 안 보인다고 해서 뺌. report.save_history 의 meta/history 기록은 계속 쌓지만 화면은 아직 안 씀.
- 칸 폭: 업체 리스크는 3 : 4 : 5(등급 · 레이더 · 사업, 레이더 칸을 레이더 크기에 맞춰 여백이 남지 않게), 수원국 리스크는 지도가 넓게. 왼쪽 칸은 가볍게: 공식 제재 명단 카드는 출처별 제재 중 수 한 줄(자세한 것은 카드를 누르면), 최근 7일 선은 글자 크게. 레이더 위험 점은 같은 색 점선 테두리가 천천히 돌고 은은하게 깜빡임(흰 호는 과하다고 함), 경고 점은 반짝임, 지도 최근 사건도 점선 테두리가 돎(가벼운 모드에서는 꺼짐. 회사 PC의 '애니메이션 효과 끄기'(prefers-reduced-motion)에서도 점 움직임은 유지하도록 예외를 둠). 계정 메뉴: 메일·가벼운 모드·[설정 (관리자)]·로그아웃. 지도는 4 이상 확대하면 주요 도시(GEO_CITY) 점·이름. 사업명 표시는 어느 쪽이든 왼쪽 등급 색 띠. 이벤트 요약은 [전체] + 다섯 묶음(GEO_GROUPS: 지진·화산 / 분쟁·테러 / 시위·정치 / 기상재해 / 감염병).
- 레이더 아래는 범례 '위험 · 경고 · 정상'만 가운데 한 줄(글자 배율 따라 커짐, 마지막 스캔은 제목 옆에만, 2026-11-18). 수원국 사업 카드 근거에는 여행경보 줄을 넣지 않음(칩과 중복), '사업지 위치로 판단'은 지역마다 단계가 다른 나라만. 화면 문구의 '—'는 esc()가 ' · '로 바꿔 보여줌(서버 문구도 ·로, MDB 기록 제목은 중복 판단 키라 그대로).
- 휴대폰(≤640px): 머리글은 따라 내려오지 않고 로고·오른쪽 버튼 한 줄, 글자 크기 버튼 숨김, 사업 관리 업체 목록 숨김(끌어놓기 불가), 계정 목록은 메일 한 줄 + 팀·역할 아래. Playwright iPhone 13·iPad Mini 로 점검.
- 다크 기본, 대시보드 배치 'B 관제실'. backdrop-filter·blur 애니메이션 금지(느려짐, 가벼운 모드 html.lite 있음).
- 글자 크기는 var(--fs-xs·sm·base·md·lg·xl)만. 화면 문구에 '—' 쓰지 않기. 창 닫기 버튼은 마지막 .actions 줄 주 버튼 오른쪽.
- 메일(report.py): 제목 '[EDCF RADAR] MM/DD 위험 N · 경고 N', 오늘 새 위험·경고만 한 줄씩. 본문 위에 보고서처럼 업체 등급 세 칸. 설정 > 메일 [미리보기 · 보내기] 창 안에서 '내 주소로 테스트'와 'N명에게 지금 보내기'(둘 다 확인 창). 데모 메일은 tools/demo 로 다시 만듦(pip firebase-admin httpx 필요). PDF 보고서: 기본 한 장 요약, [보고서] 창 오른쪽에 A4 미리보기(고르면 바로 바뀜, 인쇄 여백 13mm 12mm 같게).
- 줄 맞춤: 업체 리스크 오른쪽 사업 목록은 이슈 목록 끝까지(contain: size, 넘치면 안에서 스크롤). 수원국 리스크는 가운데 줄(등급·지도·사업) 높이 같게, 최근 이벤트는 전체 폭 2열. 칸 폭은 글자 크기 따라가게 em 단위(가−/가+ 아주 크게에서도 안 깨짐).

## 테스트
- Python: store/news/sanctions/dart/pps 를 메모리 가짜로 바꿔 scanner.run_scan.
- 화면: Playwright로 `?demo=1` 또는 Firebase 모듈을 가짜(window.__DB)로 바꿔 실행.

## 자료
- 발표 자료(Slides Artifact): https://claude.ai/artifact/P8sKcUGGNPhx8tiRM22g61 — 14장, 사용자가 직접 순서·스크립트를 고침(업체 리스크가 기본, 수원국은 더해서 보는 기능). 순서: 표지 · 배경(200+, 5+, 계약 후 0회) · 흐름 · 시스템 구조 · 등급 · 업체 화면 · 수원국 화면 · 운영 · 추진 단계 · 정식 운영 준비(보안, 라이선스, 운영, 비용 네 칸, 지금 → 그래서 필요한 일, 비용은 10명 남짓 넘으면 유료 · 팀 전체 월 1~2만 원 예상) · 함께 쓰기(두 가지) · 시연 순서(카드 6개 한 장) · 질문 · 만든 과정. 밝은 톤, 화면 캡처는 다크, 선 아이콘, 가운뎃점(·)과 ● 쓰지 않기. 스크립트는 사용자 원문의 큰 축을 유지하고 다듬기만. 고칠 때는 반드시 Artifact read 로 최신본(사용자 편집 포함)을 받아 그 위에서 수정.
- 즉시 스캔 함수(선택, 미배포·미검증): functions/index.js(requests 생성 → queue 디스패치), 설치 안내 docs/INSTANT.md, 배포 설정 firebase.json·.firebaserc. Blaze 요금제 필요.
- 설계도(Artifact): https://claude.ai/artifact/JtxkBSsA5KA4Z2b57Nd8tU · 해커톤 키트: docs/HACKATHON.md
- 팀 매뉴얼 기준: 필요자료 = 사업자번호·영문명. ① EXIMIIS 부정당업자(등록=위험, 해지=이력) ② MDB 5곳 영문명 조회 후 국적 한국 확인 ③ 나라장터 부정당제재(제재정지면 확인 필요).

## 남은 일
- 세계은행 직접 연결 불가(2026-11-18 확인): apigwext.worldbank.org 제재 API 는 구독 키(subscription key)가 있어야 하고 공개 발급이 없음(세계은행 웹페이지 안에 든 키를 가져다 쓰는 것은 하지 않음). OpenSanctions worldbank_debarred 가 매일 갱신(1,409곳, 교차제재 포함), 한국 국적은 롯데정보통신 계열 3곳뿐이라 'MDB 0'은 정상. 대조 정확도는 영문명 보완이 핵심.
- 다음 후보: 뉴스 키워드 AI 추천(설명회 7번, 사용자 '하면 좋을듯'), 집행정지 기사로 조달청 위험 기록을 경고로 내리는 연결(설명회 4번, 고민 중), 동의 붙임자료(양식 받으면), 매뉴얼 PPT(요청 시).
- 수원국 리스크 초안 다음: 외교부 키 연결·응답 확인, 사업지 좌표 입력(사업 관리), 지역별 여행경보와 사업지 대조.
- 사용자: 추가 계정 4개(팀 대표 계정 권장) + Firebase 규칙 재게시 확인, 사업자번호 88곳 보완, 11/5 이전 공개 실행 로그 삭제(다음 주).
- 발표 후: 라이트 버전, 보완 엑셀.
