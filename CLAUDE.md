# CLAUDE.md — EDCF 부정당업자 자동감지 시스템 (인수인계)

사용자: 한국수출입은행 EDCF 담당자(정보통신팀). 해커톤 출품용. 한국어로 대화, 비개발자 기준으로 쉽게 안내.
작업 원칙: 사용자가 요청한 것만 만든다. 큰 변경 전 의도를 짧게 설명. 실제 업체에 대한 가짜 제재 데이터는 화면 캡처·문서에 절대 남기지 않는다(테스트는 '가상○○' 이름만).

## 구조
```
[GitHub Pages: index.html + assets/]  ⇄  [Firebase Firestore]  ⇄  [GitHub Actions: monitor/ (Python)]
         ↑ Google 로그인(허용 이메일)            ↑ requests(실행 요청)        ↑ 매일 07:30 KST daily, 10분마다 queue
         └── [지금 스캔] → requests 저장 → (즉시) tools/relay.gs(Apps Script) → workflow_dispatch(queue)
```
- 회사망: api.github.com 차단, Google 도메인(Firebase·script.google.com 추정)은 허용 → 대시보드에서 GitHub API 직접 호출 불가. 그래서 Firestore 요청 + Apps Script 중계.
- GitHub 예약 실행(cron)이 한 번도 안 돌았음(2026-11-03 확인). 원인 추정: 워크플로 cron 줄을 마지막으로 수정한 주체가 GitHub App(봇) → 사용자가 GitHub 웹에서 monitor.yml을 한 번 직접 수정·커밋해야 할 수 있음.
- 저장소: larc30/edcf-integrity-monitor (public). Firebase 프로젝트: edcf-monitor. 허용 이메일: larc30730@gmail.com (firestore.rules, assets/firebase-config.js, tools/relay.gs 세 곳).

## Firestore 컬렉션
projects{name,country,created_at} / companies{name,name_en,aliases,category,context_keywords,country,search_langs,corp_code,biz_no,bizno_source,ceo,note,watch,engagements:[{project_id,role,stage,rank}],last_check,last_deep_at,dart_checked_at,pps_basic_checked_at}
findings{company_id,company_name,source_type(news/official/manual),source_name,title,url,published_at,snippet,level(red/orange/yellow/none),category,summary,rationale,analyzer,dedup_key,relevant,status(new/reviewed/dismissed),first_seen_ms,reported_at}
keywords{word,level,lang,use_in_query} / recipients{email} / requests{task,companies,test_to,status(pending/running/done/error),progress,result}
meta/status, meta/progress, meta/settings{relay_url,keywords_version}, meta/report_preview / runs

## 스캔 로직 (monitor/scanner.py)
- 제재 키워드 검색(TOPIC_QUERIES 25개 + 설정의 추가 키워드, 인턴 코랩 QUERIES 기반) → 기사를 전체 명단과 대조(match_sweep).
- 집중 감시(사업 연결 또는 watch=true): 매일 업체명 검색 + 매일 '업체명+추가 키워드' 심층(v34, 7일 → 매일). 기본 감시(명단만): 키워드 대조·MDB·조달청 매일(v32, 조달청 3일 → 매일), 업체명 검색 주 1회.
- 업체명 일치(textutil.name_matches): 4자 이상 포함 일치, 3자 이하 독립 단어만, 2자 이하는 업종 문맥 단어 필요, KTX/KT&G 제외. 오탐 기사 자동 '관련 없음' 정리.
- 조달청: 나라장터 사용자정보 서비스(data.go.kr 15129466) getUnptRsttCorpInfo02, 사업자번호(inqryDiv=1)로 '현재 유효' 제재만. 업체명→사업자번호 조회 없음.
- 사업자번호·영문명: DART corpCode(약 10만 개, 비상장 포함·공시대상 위주) 정확 일치 1건일 때만 자동, 나라장터 기본정보로 영문명 보강. 없으면 수기 입력.
- MDB: OpenSanctions 공개 데이터셋 5종(비상업 라이선스). 유사명 매칭은 오탐 위험.
- AI 판정(Claude, ANTHROPIC_API_KEY) 없으면 키워드 규칙 판정.
- 실측(8개 업체): 스캔 9초, Actions 전체 27초. 230개 시뮬레이션 데일리 약 6초.

## Secrets / 연결 현황 (2026-11-03 16:40 확인)
- 연결됨: FIREBASE_SERVICE_ACCOUNT, DATA_GO_KR_KEY(조달청), DART_API_KEY, NAVER_APIHUB_KEY_ID·NAVER_APIHUB_KEY(실제 200 응답 확인), SMTP_USER·SMTP_PASSWORD(테스트 메일 회사 메일함 수신 확인, 약 50분 지연), ANTHROPIC_API_KEY(등록됨, 단 크레딧 부족으로 400 → 규칙 판정 대체 중).
- 즉시 실행: 회사망은 script.google.com 차단 → Apps Script 시간 트리거 tick(평일 08~19시 5분마다 queue 디스패치)로 해결, 동작 확인. 웹 앱 배포(relay_url)는 없음.
- 예약 실행: 사용자가 11:03 monitor.yml 직접 수정(첫 줄 공백). 이후 schedule 실행 1회 확인. monitor.yml은 Claude가 수정하지 말 것(마지막 수정자가 봇이 되면 예약 중단 우려). 매일 실행 시각 변경 권장(30 22 → 17 22, TASK 식 64번째 줄도 같이) — 사용자 몫.
- 남은 일: Anthropic 크레딧 충전, EXIMIIS 명단 입력, 메일 받는 사람 등록(대시보드), 앱 비밀번호 재발급 여부 확인, 업체 일괄 등록·사업자번호 보완.

## 테스트 방법
- Python: store/news/sanctions/dart/pps 함수를 메모리 가짜로 바꿔 scanner.run_scan 실행.
- 화면: Playwright로 gstatic Firebase 모듈을 메모리 가짜(window.__DB)로 대체해 index.html 실행.
- 실제 실행: `gh workflow run monitor.yml --repo larc30/edcf-integrity-monitor -f task=scan|queue`, 로그 `gh run view <id> --log`.

## 화면 (2026-11-03 v12: 다크 글래스 + 한 화면 대시보드)
- 사용자 평가: GitHub 스타일(v11)보다 이전 다크·레이더 디자인(v10)이 낫다 → v10 톤으로 되돌리고 구조만 개선. 다크 기본(localStorage edcf_theme3).
- 상단 한 줄: 로고+제목 / 탭(대시보드 · 업체 · 사업 · 설정) / 사용자·글자 크기·테마. (v21에서 '자동 감시 중' 표시 제거 — 마지막 스캔 시각은 대시보드 부제목)
- (v14) 사용자 선호로 대시보드는 초안(v10) 구조로 복귀: 히어로(제목·범위·스캔 + 오른쪽 레이더) → KPI 3칸 → 검사 범위 → 이슈 | 진행중 사업(내부 스크롤)·등급별 업체. 탭은 상단 유지. 아래 한 화면 구성은 v12~13 기록:
- 대시보드는 스크롤 없이 한 화면(1366×768 이상): 왼쪽 리스크 레이더(구역=사업 번호, 가운데일수록 위험, 미연결 업체는 '주요' 구역) + 등급 수 + 검사 범위 + MDB 한국 국적(모달) / 가운데 이슈(내부 스크롤) / 오른쪽 진행중 사업(컴팩트 행, 번호=레이더 구역, 마우스 올리면 구역 강조) + 리스크 업체. 1180px 이하에서는 세로로 쌓임.
- 범위: '진행중 사업 업체'(projects.owner == 로그인 사용자 또는 미지정 + watch) / 'EDCF 주요 업체'(전체).
- 업체·사업: [일괄 등록] 모달(양식 CSV 내려받기 → 엑셀·CSV 업로드 또는 표 붙여넣기, 열: 업체명·사업자번호·영문명·업종(분류)·별칭·사업명·역할, 코랩 COMPANIES 코드 그대로 붙여넣기도 가능), [+ 업체 추가], 필터·검색 (v19 구성은 아래).
- 설정: EXIMIIS 업로드, 메일 수신자, 연결 상태(5묶음), 고급 설정, 맨 아래 '연결 작업 목록'(상태 자동 판정, 단계별 방법). 예약 실행 확인용 meta/status.last_daily_at(run.py daily).

- 성능(v13): backdrop-filter(유리 흐림)가 움직이는 레이더 위에서 매 프레임 다시 그려져 매우 느렸음(소프트웨어 렌더링 8fps). 흐림 제거·배경 빛 고정·정상 업체 점 파동 제거로 60fps. 버벅이면 자동 '가벼운 모드'(html.lite, localStorage edcf_lite), 고급 설정에서 수동 전환. 다시 backdrop-filter·filter:blur 애니메이션을 넣지 말 것.
- 역할 순서는 사업 진행 순서 F/S → 컨설턴트 → 본구매 (ROLES, ROLE_ORDER, report.ROLE_ORDER).

- (v16, 사용자 피드백) 대시보드 재구성: 머리(제목·범위 스위치 "내 담당 사업 / EDCF 전체"·지금 스캔+한 줄 상태) → 요약 카드 4개(위험/경고/주의 업체, 확인할 이슈; 누르면 이슈 등급 필터, i 툴팁) → 이슈 목록(전체 탭 맨 앞, 근거는 마우스오버) | 레이더(밴드 색+리스크 업체 이름 최대 6개, 사업 행에 마우스 올리면 그 사업 업체 강조)·사업(리스크 순, 내부 스크롤)·데이터 점검 버튼(검사 범위·EDCF 명단·MDB 한국 국적·보완 업체를 모달로). 등급별 업체 카드·48시간 감지·검사 범위 줄은 중복이라 제거.
- 피드백 반영: '관련 없음'(자동 정리 제외)·'확인했음' 기사 제목을 업체별로 AI 판정 프롬프트에 예시로 전달(analyzer._feedback_text).

- (v17) 사용자: v16 GitHub/밝은 정리형이 갈수록 별로 → 예전(v10) 다크 브리핑 디자인 기반으로 재구성 + 배치 시안 3종(A 브리핑 / B 관제실 / C 사이드)을 대시보드 오른쪽 아래 '디자인 시안' 버튼으로 바꿔 볼 수 있게 함(localStorage edcf_layout, ?layout=a|b|c). 사용자가 고르면 그 배치를 기본으로 하고 시안 버튼은 제거할 것.
  - 12열 격자 한 장(.dash, grid-template-areas)에 제목·요약·레이더·이슈·사업 컴포넌트를 배치해 선이 맞음. 히어로 판은 .hero-bg 를 같은 격자 칸에 깔아서 표현.
  - 요약 카드는 i 툴팁 대신 카드 안에 '지금 상태(업체 이름)'와 '등급 뜻'을 글로 표시. 레이더: 평소 회전, 빈 곳 클릭 시 다시 훑기(burst), 스캔 중 빠르게, 처음 열 때 한 번 훑기, 리스크 업체 점은 빛이 지날 때 반짝. 이름표는 fixLabels()로 칸 밖·겹침 자동 회피.
- 데모: index.html?demo=1 — head 스크립트가 import map으로 Firebase 모듈을 demo/fb-*.js(메모리 가짜 + demo/data.js 가상 데이터)로 바꿔 로그인 없이 화면 확인. [지금 스캔]도 흉내(진행률·완료). 실제 업체명 사용 금지(가상 이름만).

- (v18, 사용자 선택) B 관제실 확정 → 시안 A/C·시안 버튼 제거. 배치: [제목 ─ 범위·스캔] / [리스크 업체 판(위험·경고·주의) + '비고' 확인할 이슈 카드(점선) | 레이더(4열) | 담당 사업(5열, 행 2~3에 걸쳐 세로로 길게, sticky)] / [이슈(7열)].
  - 사업 줄: '하나라도 위험이면 사업이 위험' 표시를 없애고, 업체 등급 분포 막대 + '위험 1 · 경고 1 / 3곳' 형태로. 위험 많은 사업부터 정렬.
  - 레이더가 안 돌던 원인: v17 CSS 정리 때 @keyframes spin 을 지워버림 → radarSpin/spin 복구. 윈도우 '애니메이션 끄기'(prefers-reduced-motion)여도 레이더는 10초 회전 유지.
  - 모바일 다크에서 상단 탭이 제목을 덮던 버그: :root[data-theme=dark] 의 --top:60px 가 미디어쿼리 :root{--top:auto} 보다 우선 → 미디어쿼리에 테마 선택자 추가.
- 매일 아침 실행: GitHub 예약(30 22)이 이틀 연속 안 옴 → Apps Script daily() (일 단위 타이머 오전 7~8시, test_to='auto') 추가. run.py 는 자동 실행(test_to=auto 또는 GITHUB_EVENT_NAME=schedule)이면 meta/status.last_daily_at 가 오늘일 때 건너뜀(하루 한 번). 수동 Run workflow daily 는 항상 실행.

- (v19) 업체·사업 탭 재구성: 자주 쓰는 보기(전체/계약 전 점검=입찰중·우선협상/리스크 업체/미확인 이슈/정보 보완 필요, 개수 표시) + 세부 필터(담당·사업·역할·단계·등급·업종·국내/해외, 필터 초기화) + 업체 표(업체명·업종·참여 사업·역할·단계·등급·미확인·사업자번호·영문명, 제목 눌러 정렬, 행 끌어서 사업 칸에 놓기, 누르면 상세) | 오른쪽 사업 카드(등급 분포 막대, sticky).
  - 업종 6가지 고정: 건설·시공 / 엔지니어링·설계·감리 / ICT·시스템 / 제조·플랜트 / 상사·유통 / 기타 (monitor/category.py ↔ app.js CATS·CAT_RULES 같은 기준 유지).
  - 자동 분류: 스캔(_identify) 때 DART company.json 의 induty_code(KSIC) → 업종(category_source 'DART 업종'), 없으면 업체명 규칙('이름 추정'). DART는 업종이 비었거나 '이름 추정'일 때만 덮어씀(cat_checked_at 30일). '명단'(일괄 등록)·'직접 입력'은 그대로. 예전 분류명(엔지니어링·설계·CM·감리 등)은 normalize, '상사·교육·기타'처럼 묶인 이름은 업체별로 다시 추정. 화면은 업종이 아직 없으면 이름으로 추정해 '추정' 표시(c.catGuess, 저장 안 함).
  - 일괄 등록: 기존 업체는 빈 정보만 채움(사업자번호·영문명을 덮어쓰지 않음). CSV는 parseCSV(따옴표 안 쉼표·BOM) + readText(UTF-8 아니면 EUC-KR — 엑셀 'CSV(쉼표로 분리)' 저장본).
  - KT·LG CNS 같은 대문자 약칭은 국내 업체(newCompany krAbbr). 그 외 영문만 이름은 해외.
  - EDCF 명단 일치는 업체별로 묶어 표시(edcfByCompany: 제재 중/해지·건수).
- 글자 크기 통일(v19): CSS font-size 전부 rem(본문 15 · 보조 13 · 제목 30, 레이더 SVG 7.5px만 예외). 상단 [가] 버튼으로 보통/크게(112.5%)/아주 크게(125%) — html[data-font], localStorage edcf_font. 세 탭 제목(.page-head h1, .d-title .hero-title) 1.875rem 같은 크기, 설정·업체 탭에도 eyebrow. 글자를 키우면 상단 줄 넘침 방지로 이메일·감시 상태·로고 글자를 폭에 따라 숨김.
- 실제 업무 명단(코랩 200곳 + EXIMIIS 13건)은 저장소에 넣지 않고 CSV로 만들어 사용자가 대시보드에서 올림(일괄 등록 / 설정 → EDCF 명단).
- (v20, 사용자 요청) 확인할 이슈 중복을 한 건으로: 저장은 그대로 두고 보여줄 때만 묶음(monitor/grouping.py ↔ app.js groupFindings 같은 기준). ① 제목(매체 꼬리·[단독] 제외, 8자 이상)이나 원문 주소가 같으면 업체가 달라도 하나(업체 이름 함께 표시) ② 같은 업체·같은 분류(기타 제외)·보도일 3일 이내 ③ 같은 업체·업체명 뺀 제목 글자쌍 일치율 0.6 이상 ④ 같은 업체·같은 공식 명단 기록 여러 건. 처리 상태가 다르면 묶지 않음. 대표는 등급 → 공식 → 최신.
  - 대시보드: 확인할 이슈 수·기간별 수·업체별 미확인 수(c.open)·상세의 이슈 수 모두 묶음 기준. '확인했음·관련 없음·되돌리기'는 묶음 전체(writeBatch). 묶인 기사는 '같은 내용 N건 더'(details)로 펼쳐 봄.
  - 메일: 신규 N건·KPI·목록을 묶음 기준으로, 대표 아래 '같은 내용 N건 더: 매체 링크'. 묶음 안 기록은 모두 reported_at 처리.
- (v21, 사용자 요청) 화면 정리:
  - 탭 분리: **업체**(표: 체크박스 일괄 삭제·행 휴지통, 업체명만 눌러 상세(링크 커서), 자주 쓰는 보기·필터, 머리 버튼 [EDCF 부정당업자 명단](건수 표시, 창에서 엑셀 올리기/붙여넣기)·[일괄 등록]·[+ 업체 추가]) / **사업**(왼쪽 업체 이름만 목록(검색, 끌기) + 사업 카드 격자(역할 칸 F/S·컨설턴트·본구매, 단계 버튼, 빼기), 전체/내 사업). 끌어다 놓기는 #view-projects 안에서만.
  - 업체 상세: 머리(이름·등급·참여 사업) / [다시 스캔][네이버 뉴스][집중 감시] / 이슈(묶음) / 검사 결과 5칸(뉴스·판정·MDB·조달청·EDCF) / 참여 사업 / 식별 정보 2열 정렬 / 맨 아래 업체 삭제. '직접 확인한 제재 기록 추가'와 감시 방식 설명 문구는 제거.
  - 설정: 리스크 키워드(등급별 3칸, ★=심층 검색어 use_in_query 토글) + 메일(받는 사람, 미리보기 창, 테스트 메일) / 고급(접힘): API 연결 10개, 최근 실행(사람이 읽는 요약, JSON 안 보임), 즉시 실행 중계, 수동 실행, 가벼운 모드. '연결 작업 목록'과 EDCF 명단 카드는 제거(명단은 업체 탭).
  - 글자: font-size 는 토큰 5단계만(--fs-xs 12 · sm 13 · base 15 · md 16 · lg 20 · xl 30, 큰 숫자 2rem 예외). 새 CSS도 var(--fs-*)만 쓸 것. button/input/select/summary 글꼴 상속.
  - 메일(report.py): 대시보드 밝은 화면과 같은 색·글꼴(남색 머리 + 레이더 마크, 등급 카드 4칸, 왼쪽 색 막대 카드, 점 배지, 그라데이션 버튼).
  - run.py: daily/scan/preview 실행 때 '데이터: 업체 N곳 …' 건수만 로그(이름은 공개 로그에 남기지 않음). 2026-11-04 확인: 실제 Firebase에는 업체 9곳·사업 4개·EDCF 명단 0건 — 코랩 202곳·EXIMIIS 13건 CSV는 아직 업로드 전.
- (v21 보완) 2026-11-04 사용자가 코랩 업체 CSV(202행)를 EDCF 명단 칸에 잘못 올림 → EDCF 명단 202건, 모든 업체에 가짜 'EDCF 제재 해지' 기록. 대응:
  - 대시보드 rowsToEdcf: '상태'·'제재기간' 열이 없거나 업종·별칭·역할·영문명 열이 있으면 거부(업체 명단은 일괄 등록으로 안내).
  - 명단 반영 때: 새 명단과 맞는 업체가 아닌 EDCF 기록(dedup_key 'edcf-')은 바로 삭제. 스캐너도 매 스캔 업체별로 현재 명단과 맞지 않는 'edcf-' 기록을 삭제(store.delete_many) — 자동 대조 결과라 삭제해도 됨.
  - 메일: 자세한 카드는 등급순 30건까지(MAX_ITEMS), 나머지는 '대시보드에서 확인' 한 줄.
  - 사용자가 올바른 EXIMIIS CSV(13건)를 업체 탭 [EDCF 부정당업자 명단]으로 다시 올려야 함.
- (v22, 사용자 요청) 탭 이름 '업체 관리'·'사업 관리', 로고(#logoHome) 누르면 대시보드. 업체 관리 버튼 이름 'EXIMIIS 제재 명단'(사용자가 코랩 명단과 헷갈림 — 감시 업체 명단과 별개임을 창에 설명). 창(modal) 닫기 버튼은 마지막 .actions 줄에 나란히(주 버튼 오른쪽).
  - 사업 수정: 카드 제목/[수정] → 사업명·수원국·담당 변경, 사업 삭제도 이 창에서. 역할 색: F/S 청록 · 컨설턴트 파랑 · 본구매 자홍(--consult/--buy).
  - 설정: 메일 카드에 [지금 보내기](report). 'DART 기업목록 갱신' 버튼 제거(스캔 때 corp_master 자동 내려받음). 고급: Apps Script 상태 = meta/status.last_tick_at (run.py: queue + GITHUB_EVENT_NAME=workflow_dispatch 때 기록), 즉시 실행(웹 앱 주소·GitHub 토큰)은 접힌 '선택' 설정으로 설명과 함께. 최근 실행 오류는 눌러서 출처·내용별로 묶어 보기(errGroups, errHint: 시간 초과·한도·키·잔액·서버 오류).
- (v23) 2026-11-04 실제 207곳 첫 스캔(약 6분): 외부 호출 706건 전부 200 OK (Google 223 · Claude 219 · 조달청 123 · DART 109 · 네이버 22 · OpenSanctions 10). 데모의 '네이버 429·조달청 시간 초과'는 가상 예시 — 사용자가 실제로 오해해서 '(데모 예시)' 표시.
  - AI 같은 사건 판단: 판정 프롬프트에 그 업체의 최근 이슈 20건(E1~)을 주고 same_event_as(E번호 또는 같은 배치 idx)를 받음 → findings.same_as(다른 기록 id). grouping.py·groupFindings 가 same_as 로도 묶음(⑤). 규칙 ①~④는 그대로.
  - 보고서(PDF): 대시보드 [보고서] → 범위(내 담당/전체)·이슈 기간·확인 완료 포함 → 숨긴 iframe 에 A4 HTML(메일과 같은 디자인) → 브라우저 인쇄 'PDF로 저장'. 사업별 현황·리스크 업체·확인할 이슈(묶음, 최대 300). 데모에서는 window.__lastReport 로 확인.
- (v24) EXIMIIS 제재 명단 202건 = 사용자가 13:47 코랩 업체 CSV를 옛 설정 화면의 명단 칸에 올린 것(파일명이 'EDCF_…'로 시작해 헷갈림). 실제 제재 명단은 EXIMIIS 13건. 대응: 상태·제재기간이 둘 다 없는 행은 제재 기록이 아님 → 스캐너 match_edcf·대시보드 edcfMatches 에서 제외(다음 스캔 때 가짜 'edcf-' 기록 자동 삭제), 명단 창에 경고 + [잘못된 명단 비우기](clearEdcf), 버튼 배지 '확인 필요'.
  - 사업 관리: 역할 칸 안 순서(engagement.order, 맨 위 = 대표사, 2곳 이상일 때 '대표' 표시), ▲ 버튼·다른 업체 줄 위에 끌어 놓기로 순서 변경(reorderZone), 카드에 [수정][삭제] 둘 다. 대시보드 사업 줄·보고서도 역할 → 순서.
- (중요) 2026-11-04 15시경 Firestore 무료(Spark) 한도 초과 — 429 Quota exceeded(하루 읽기 5만 건). 원인: 대시보드가 5분마다 전체 다시 읽기(업체 207·관련 이슈 ~1,000·명단 202 ≈ 1,500건/회) + 스캔·진단 실행. 한도는 태평양 자정(한국 17시)에 초기화. 대응: autoRefresh 는 meta/status 1건만 읽고 last_scan_at 이 바뀐 때만 loadAll(10분 간격), run.py log_counts 는 count() 집계로. 진단용 preview/scan 을 함부로 돌리지 말 것. 데이터가 더 늘면 Blaze(종량제) 전환 권장.
- (v26, 11-04 19시) 스캔 변경분만: 업체별 이미 본 기사 키를 seen/{업체 id} 문서에 보관, run_scan 은 관련 이슈(relevant)만 한 번에 읽어 업체별로 나눔 → 업체별 findings 전체 읽기 제거(시험 기준 데일리 읽기 3,900 → 470). 첫 스캔·다시 스캔(업체 1~3곳 지정, force)은 10년 범위, 이후 매일은 last_news_at 7일 전부터. force 는 주간 제한 없이 업체명 검색(Google+네이버)하고 예전에 관련 없다고 본 기사도 다시 판정. seen 문서가 없으면 그 업체만 한 번 전체를 읽어 만듦.
  - 11-04 정리 스캔: 업체 216 · 사업 9 · EDCF 13건(사용자가 올바른 명단 업로드), 가짜 EDCF 기록 191건 삭제, 0 오류, 3분. 영진종합건설 다시 스캔(force) → 92건 수집·57건 판정·새 이슈 16건.
  - 로그인 계정: 관리자 = firebase-config.js ALLOWED_EMAILS(고정), 추가 계정 = meta/access.emails(설정 > 로그인 계정). firestore.rules 가 owner() || added() — 사용자가 Firebase 콘솔에서 규칙을 다시 게시해야 추가 계정이 동작. tools/relay.gs 의 ALLOWED_EMAILS 는 웹 앱 중계(거의 안 씀)에만 해당.
  - EXIMIIS 제재 명단은 설정 오른쪽 카드(요약 + [관리])로 이동. 메일과 대시보드 보고서 구성 통일: 요약(위험·경고·주의 업체, 이슈) → 이슈 → 리스크 업체(등급·업체·참여 사업·역할·미확인) → 사업별 현황.
- (v27, 11-05 사용자 피드백) 메일 '리스크 업체가 코드로 나옴' 원인 = v26에서 사업별 현황을 넣으며 반복문 변수 rows 가 리스크 업체 표 HTML 변수를 덮어씀(내 버그) → prs 로 변경. 메일은 요약형: 위험·경고 카드 최대 10, 주의 한 줄 목록 최대 10, 30일 지난 과거 이력은 건수만, 리스크 업체 표는 위험·경고 최대 15, 태그 사이 공백 제거(대규모 날도 ~40KB). 제목에 위험·경고 건수.
  - 등급 기준(사용자): 위험 = 지금 유효한 제재(입찰참가자격 제한·MDB·영업정지·등록말소, EXIMIIS 등록), 경고 = 제재로 이어질 수 있는 진행 중 사안(수사·기소·과징금·처분 예고·부도·회생), 주의 = 참고 이력. analyzer 프롬프트·LEVEL_DEF·기본 키워드(부도·회생절차·법정관리 → 경고, KEYWORDS_VERSION 4 에서 기존 키워드도 옮김) 일치.
  - 대시보드: 범위 설명·레이더 설명·등급 뜻 문구는 i(마우스 올리면 설명)로. 비고 카드 → '공식 제재 명단' 카드(EDCF·조달청·MDB 출처별 제재 중/그 밖 업체 수) → 창: 우리 업체 대조 결과 표 + EXIMIIS 명단 표(올리기·붙여넣기·잘못된 명단 비우기) + 검사 내역(예전 데이터 점검). 데이터 점검 버튼·설정의 EXIMIIS 카드 제거. 레이더는 정상 업체 점 없이 바깥 원 숫자만, 점 최대 40.
  - 사업 관리: 범례 제거, 단계는 선택 상자(입찰중 / 우선협상 / 우선협상 1~3순위 / 계약), 안내 문구는 목록 위. 설정: 즉시 실행(웹 앱·토큰) 화면 제거, ★ 키워드 = 매일 뉴스 검색어 + 집중 감시 업체 주간 심층 검색(topic_sweep extra). 글자 크기 가−/가+ (작게 93.75% · 보통 · 크게 · 아주 크게).
- (v28, 11-05) '정보 보완 필요' 버튼 깨짐(i 툴팁 클래스 .info 와 겹침 → .itip), 사업 단계는 입찰중·우선협상·계약 3개만, 사업 관리 안내 한 줄, 고급의 '실행 요청 방식' 문구 제거, 글자 크기 가운데에 '보통 (기본)' 표시(누르면 기본으로). 공개 Actions 로그에서 업체 이름 제거: 스캔 진행은 25곳마다 건수만, 스캔 결과는 건수만, 업체 스캔 실패·네이버 오류는 오류 종류만(자세한 내용은 Firestore runs/업체 last_check).
- (v29, 11-05) 대시보드 리스크 업체의 위험·경고·주의를 누르면 오른쪽 창에 그 등급 업체 목록(openRiskList: 업체명·업종·미확인 건수·참여 사업·대표 이슈) → 업체를 누르면 상세, '← ○○ 업체 목록'으로 돌아감(state.riskList/drawerBack, rerender 때 유지). 예전처럼 아래 이슈 목록을 등급으로 거르던 기능(levelFilter·#levelNote)은 제거 — 업체 수(확인했음 포함 등급)와 이슈 수(미확인·기간 필터)가 어긋나 0건으로 보이던 문제. 0곳 등급 버튼은 disabled. 공식 제재 명단 카드의 'EXIMIIS N건' 표시 제거(명단이 없을 때만 경고).
- (v30, 11-05 오후) 공개 로그 추가 정리: httpx 등 HTTP 요청 줄(검색 주소에 업체명·사업자번호) 끔, 메일 발송 로그는 받는 사람 주소 대신 인원수. scanner._days_since 가 한국시간 문자열을 UTC 서버 시계로 빼서 9시간 짧게 계산 → '주 1회'가 8일마다·조달청 3일이 4일마다 돌던 버그 수정. monitor/health.py: preview 작업 때 건수만 로그(데이터·스캔 커버리지·식별·이슈 등급·EXIMIIS 대조·중복·자동 실행). 등급 색 강화(위험 배지 꽉 찬 빨강, 경고 주황 테두리, 주의 노랑 바탕, 라이트 모드 점·막대는 --yellow-fill), 사업 단계 선택은 글자 폭(field-sizing).
  - 11-05 점검 결과: 업체 216 전부 26시간 내 검사·오류 0·Google/네이버/Claude 정상, 집중 27곳 매일 업체명 검색, seen 216, EXIMIIS 13건 대조 누락 0, 중복 0. 사업자번호 128/216(88곳 없음 → 조달청 조회 불가, DART 직접 입력 필요 89), 영문명 129. 이슈(관련·미처리) 위험 93·경고 79·주의 523, 그중 뉴스 판정 위험 88건(1년 지난 기사 21) — v27 이전 기준으로 판정된 것이 섞여 업체 등급 위험 18곳으로 과대 → 새 기준 재판정 제안(사용자 확인 대기). 규칙 판정 34건.
- (v31, 11-05 14시) 재판정 실행(monitor/rejudge.py, meta/settings.rejudge_version=1 이면 끝): 대상 180건·28곳 → 161건 갱신(위험→경고 63, 위험→주의·관련없음 9, 위험 유지 4), 19건은 AI 응답 누락으로 다음 daily/scan 때 자동 재시도(rejudged_at 있는 건 제외). 결과 업체 등급 위험 18→7·경고 12→16·주의 51→58, 규칙 판정 0. 같이 고친 것: analyzer 프로필에서 사업 연결 stage 없으면 KeyError → 규칙 판정으로 넘어가던 버그, report._eng_text 도 같은 KeyError(메일 중단 위험), Claude SDK 로그(httpx2) 끔. 사업자번호 88곳은 사용자가 실제 운영 때 채우기로 함. 해커톤 방식은 규칙을 들은 뒤 결정.
- (v32, 11-06) 조달청 조회를 기본 감시 업체도 매일로(3일 건너뛰기 제거, 사용자 요청). 시스템 이름 'EDCF RADAR'(Risk Alert & Debarment Auto-Reporter)로 결정 — 발표 자료(https://claude.ai/artifact/P8sKcUGGNPhx8tiRM22g61)와 대시보드(탭 제목·로그인·로고)·메일 제목/머리·PDF 보고서·데모 메일·README 모두 'EDCF RADAR'로 변경. 11/5 이전 공개 실행 로그 삭제는 다음 주로 미룸.
- (v33, 11-06) 설정 리스크 키워드 카드에 '기본 검색어'(고정 23개, 보기만) 표시 — assets/app.js TOPIC_QUERIES ↔ monitor/scanner.py TOPIC_QUERIES 같은 목록 유지. 설명: 매일 뉴스 검색어 = 기본 검색어 + ★, ★ 없는 단어는 판정 기준만. 데모 데이터(demo/data.js)를 실제 운영 규모로: 업체 216 · 사업 9(실제 수원국 + 지어낸 사업명) · 업체 등급 위험 7 · 경고 16 · 주의 57 · EXIMIIS 13건, 업체명은 '가나건설' 대신 실제처럼 보이는 지어낸 이름(서마루엔지니어링·도레온건설 등, 실존 업체와 우연히 같을 가능성은 확인 못 함). 어제 이전 기록은 reported_at 처리(메일 신규 6건). demo/mail.js 는 tools/demo 스크립트로 다시 만듦(firebase-admin 필요). 사용자 결정: 발표 때는 실제 대시보드를 잠깐 보여주고(B), 데모는 가상 이름 + 실제 규모(C).
- (v34, 11-06 사용자 결정) 키워드 구조 단순화: 설정 = 기본 키워드(고정 TOPIC_QUERIES 23, 보기만) + 추가 키워드(직접 입력·삭제). ★·위험/경고/주의 칸 제거 — 등급은 AI가 기사 내용으로 판정, 키워드는 검색어 + AI 참고용. 추가 키워드는 모두 매일 검색(topic_sweep extra, 최대 12)·집중 감시 업체 '업체명+추가 키워드'(앞 6개). AI를 못 쓸 때의 예비 등급 기준은 analyzer.RULE_KEYWORDS(코드, 화면에 없음), 추가 키워드가 거기 없으면 주의. analyzer.build_keywords(docs) 가 추가 키워드(user=True)+예비 기준을 합쳐 scanner·rejudge 에 전달. app.js KEYWORDS_VERSION 5: 첫 로그인 때 예전 기본 키워드 41개 중 새 기본 8개(압수수색·뇌물·횡령·배임·기소·회생절차·법정관리·시정명령) 외는 삭제(사용자가 직접 넣은 단어는 남김), 키워드를 다 지워도 되살리지 않음. 집중 감시 심층 검색을 매일로(업체당 검색 약 9회).
- (v35, 11-06) 재판정(rejudge): AI가 빠뜨린 기사는 그 기사만 한 번 더 물어봄, 실패 이유를 runs.detail.errors 에 남김(업체명은 Firestore 에만, 공개 로그는 건수), meta/settings.rejudge_tries 3번 실패하면 예전 등급 유지로 끝냄(매일 오류 기록이 쌓이지 않게). 대시보드 고급 > 최근 실행: '재판정(새 등급 기준)' 이름·요약(대상·갱신·못 받음), 오류 내용 없는 예전 기록도 눌러서 설명. 추가 키워드 입력칸·버튼 정렬.
- (v36, 11-06 사용자 질문: 나라장터 '제재'(1차) → '제재정지'(2차, 법원 집행정지)) pps.sanctions: 같은 부정당번호(R26UF00002196 형식, 없으면 같은 통보기관) 안에 정지·해제·취소 줄이 하나라도 있으면 그 제재 전체를 경고(확인 필요)로 — 예전엔 1차 '제재' 줄 때문에 위험으로 나올 수 있었음. 위험 요약에 '집행정지 여부 확인' 안내. scanner: 이미 저장된 pps- 기록도 매 조회 결과에 맞춰 등급·요약 갱신, 오늘 조회 안 되면(만료·해제) 주의(지난 이력)로. AI 판정 기준에도 '집행정지·효력정지면 red 아님 → orange' 추가. 실제 API가 차수별 줄을 주는지·필드 이름은 키가 없어 확인 못 함.
- (v37, 11-08 팀 리뷰 반영) ① 대시보드 내 사업 카드: 업체를 역할(F/S·컨설턴트·본구매)별 줄로(pjRoles, roleTag), 범례 제거. ② '확인이 필요한 이슈' = 위험·경고만(c.open 도 위험·경고 기준), 주의는 접힌 '참고 이력 · 주의 N건 — 확인하지 않아도 됩니다'(#refWrap, 펼칠 때만 100건까지 그림). '과거 이력'(1년 지난 기사) 탭에 [모두 확인했음] 일괄 정리(bulkReview, review_note '과거 이력 일괄 정리' → AI 예시에서 제외). ③ 메일 간단히: 제목 '[EDCF RADAR] MM/DD 위험 N · 경고 N', 오늘 새 위험·경고만 한 줄씩(최대 15), 주의·30일 지난 기사는 건수만, 리스크 업체 표·사업별 현황 제거. PDF 보고서: 기본 한 장 요약(위험·경고 표 20건 + 사업별 리스크 수), '자세한 목록 포함' 체크 시 예전 전체 보고서. ④ 조달청 집행정지: TOPIC_QUERIES 에 '입찰제한 집행정지'·'부정당 집행정지'(25개), pps 기록에 rstt_end 저장, 저장된 pps 제재가 조회 안 될 때 기간이 남았으면 경고(pps_state missing_active, '집행정지·해제 가능성'), 끝났으면 주의(expired). 정지·해제 이력까지 주는 공공데이터 API 는 검색으로 못 찾음(15129466 은 현재 유효 제재만).
- (v38, 11-08) 발표 자료(Slides Artifact P8sK…) 개편: 글꼴 맑은 고딕(faces 비움), 데모 새 캡처 9장(asset), 5쪽 시스템 구조도(입력 → ①수집·②AI 판정·③정리 → 결과, 확인 결과 되돌림, 운영 기반 줄), 새 장 process(기획·설계 → 개발 → 테스트·검증[지금 여기] → 오픈) · discuss(정보시스템부 협의: 보안·운영 / 비용 / 데이터 정합성 + 확장성) · roadmap(11월 시연 → 11월 말 통합테스트 → 12월 초~중순 베타테스트 → 12월 말 오픈 목표, 안), next 장 삭제, ask 는 '베타테스트부터 이렇게 함께 써 주세요'(19쪽). 순서 20장.
- 해커톤 재구현 키트: docs/HACKATHON.md (A안 코드 가져가기 프롬프트 / B안 마스터 프롬프트 + 단계별 9개 + 시행착오 결정 표).
- 설계도(사용자용 비공개 Artifact): https://claude.ai/artifact/JtxkBSsA5KA4Z2b57Nd8tU — 전체 구조·하루 일정·검사 순서·등급 기준·결과 흐름·노동법 같은 새 검사 붙이는 방법. 구조가 바뀌면 Artifact read 로 원본을 받아 고친 뒤 같은 URL 로 다시 게시.

## 남은 일
- 사용자: Apps Script 중계 설정, monitor.yml 웹에서 한 번 수정(예약 실행), EXIMIIS 엑셀 업로드, 코랩 명단 붙여넣기, (선택) 네이버 API HUB·SMTP·ANTHROPIC 키.
- 2부(수원국 리스크 지도)는 보류.

## 팀 매뉴얼 '부정당업자 제재처분 확인방법' (2026.11) 요약 — 시스템 설계 기준
- 필요자료: 사업자등록번호, 회사 영문명 (사업자등록증 영문). 업체 등록 시 이 두 가지를 기본 입력으로.
- ① EDCF 제재: EXIMIIS–경협–업무지원–부정당업자–부정당업자조회 (사업자번호 기준, 경협평가부 관리). 엑셀 열: 업체명, 상태(등록/해지), 제재기간, 제재사유, 경협사업번호, 관련사업명, 관련사업국가, 부정당업자등록기관, 대표자명, 사업자번호, 법인등록번호, 주소. → 엑셀 업로드로 Firestore edcf_sanctions에 적재, 사업자번호(없으면 이름) 대조. 등록=위험, 해지=과거 이력(주의).
- ② MDB 상호제재: 영문명으로 ADB·WB·AfDB·EBRD·IDB 조회, 결과 없으면 국적 대한민국으로 최종 확인. 현재 한국기업: 롯데정보통신 및 계열 3사 WB 영구제재('22.12.10~), 대한전선 '26.10 해지, IDB에 Ocean C&I·Taihan CNS·Taihan Ocean Works(WBG cross debarment, ~2026.10). → OpenSanctions에서 국적 KR 목록을 별도 표시.
- ③ 국가계약법: 나라장터 '부정당제재정보공개'(사업자번호, '16.9.3부터). 조회돼도 '제재정지(집행정지)'일 수 있음 → rsttProgrsNm에 정지·해제 포함 시 위험 아님, '확인 필요'.
- 개선의견: 사업별 입찰자·계약자 기본정보 등록·관리, 좌표방식 RPA 지양(API 사용), 언론보도 키워드(부정당, 제재, 재해, 소송, 위반).
