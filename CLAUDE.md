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
- 제재 키워드 검색(TOPIC_QUERIES 18개, 인턴 코랩 QUERIES 기반) → 기사를 전체 명단과 대조(match_sweep).
- 집중 감시(사업 연결 또는 watch=true): 매일 업체명 검색 + 7일마다 '업체명+리스크키워드' 심층. 기본 감시(명단만): 키워드 대조·MDB 매일, 조달청 3일, 업체명 검색 주 1회.
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

## 남은 일
- 사용자: Apps Script 중계 설정, monitor.yml 웹에서 한 번 수정(예약 실행), EXIMIIS 엑셀 업로드, 코랩 명단 붙여넣기, (선택) 네이버 API HUB·SMTP·ANTHROPIC 키.
- 2부(수원국 리스크 지도)는 보류.

## 팀 매뉴얼 '부정당업자 제재처분 확인방법' (2026.11) 요약 — 시스템 설계 기준
- 필요자료: 사업자등록번호, 회사 영문명 (사업자등록증 영문). 업체 등록 시 이 두 가지를 기본 입력으로.
- ① EDCF 제재: EXIMIIS–경협–업무지원–부정당업자–부정당업자조회 (사업자번호 기준, 경협평가부 관리). 엑셀 열: 업체명, 상태(등록/해지), 제재기간, 제재사유, 경협사업번호, 관련사업명, 관련사업국가, 부정당업자등록기관, 대표자명, 사업자번호, 법인등록번호, 주소. → 엑셀 업로드로 Firestore edcf_sanctions에 적재, 사업자번호(없으면 이름) 대조. 등록=위험, 해지=과거 이력(주의).
- ② MDB 상호제재: 영문명으로 ADB·WB·AfDB·EBRD·IDB 조회, 결과 없으면 국적 대한민국으로 최종 확인. 현재 한국기업: 롯데정보통신 및 계열 3사 WB 영구제재('22.12.10~), 대한전선 '26.10 해지, IDB에 Ocean C&I·Taihan CNS·Taihan Ocean Works(WBG cross debarment, ~2026.10). → OpenSanctions에서 국적 KR 목록을 별도 표시.
- ③ 국가계약법: 나라장터 '부정당제재정보공개'(사업자번호, '16.9.3부터). 조회돼도 '제재정지(집행정지)'일 수 있음 → rsttProgrsNm에 정지·해제 포함 시 위험 아님, '확인 필요'.
- 개선의견: 사업별 입찰자·계약자 기본정보 등록·관리, 좌표방식 RPA 지양(API 사용), 언론보도 키워드(부정당, 제재, 재해, 소송, 위반).
