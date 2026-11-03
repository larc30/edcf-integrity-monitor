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

## Secrets (GitHub)
필수 FIREBASE_SERVICE_ACCOUNT / 연결됨: DATA_GO_KR_KEY, DART_API_KEY / 미연결: NAVER_APIHUB_KEY_ID·NAVER_APIHUB_KEY(네이버 API HUB, 2026-07-31부터 개발자센터 신규 발급 종료), SMTP_USER·SMTP_PASSWORD, ANTHROPIC_API_KEY. Apps Script 중계(tools/relay.gs)는 사용자 설정 필요(스크립트 속성 GITHUB_TOKEN).

## 테스트 방법
- Python: store/news/sanctions/dart/pps 함수를 메모리 가짜로 바꿔 scanner.run_scan 실행.
- 화면: Playwright로 gstatic Firebase 모듈을 메모리 가짜(window.__DB)로 대체해 index.html 실행.
- 실제 실행: `gh workflow run monitor.yml --repo larc30/edcf-integrity-monitor -f task=scan|queue`, 로그 `gh run view <id> --log`.

## 화면 (2026-11-03 v12: 다크 글래스 + 한 화면 대시보드)
- 사용자 평가: GitHub 스타일(v11)보다 이전 다크·레이더 디자인(v10)이 낫다 → v10 톤으로 되돌리고 구조만 개선. 다크 기본(localStorage edcf_theme3).
- 상단 한 줄: 로고+제목 / 탭(대시보드·업체·사업·설정) / 자동 감시 상태(meta/status.last_scan_at) / 사용자.
- 대시보드는 스크롤 없이 한 화면(1366×768 이상): 왼쪽 리스크 레이더(구역=사업 번호, 가운데일수록 위험, 미연결 업체는 '주요' 구역) + 등급 수 + 검사 범위 + MDB 한국 국적(모달) / 가운데 이슈(내부 스크롤) / 오른쪽 진행중 사업(컴팩트 행, 번호=레이더 구역, 마우스 올리면 구역 강조) + 리스크 업체. 1180px 이하에서는 세로로 쌓임.
- 범위: '진행중 사업 업체'(projects.owner == 로그인 사용자 또는 미지정 + watch) / 'EDCF 주요 업체'(전체).
- 업체·사업: [일괄 등록] 모달(양식 CSV 내려받기 → 엑셀·CSV 업로드 또는 표 붙여넣기, 열: 업체명·사업자번호·영문명·분류·별칭·사업명·역할), [+ 업체 추가], 필터·검색.
- 설정: EXIMIIS 업로드, 메일 수신자, 연결 상태(5묶음), 고급 설정, 맨 아래 '연결 작업 목록'(상태 자동 판정, 단계별 방법). 예약 실행 확인용 meta/status.last_daily_at(run.py daily).

## 남은 일
- 사용자: Apps Script 중계 설정, monitor.yml 웹에서 한 번 수정(예약 실행), EXIMIIS 엑셀 업로드, 코랩 명단 붙여넣기, (선택) 네이버 API HUB·SMTP·ANTHROPIC 키.
- 2부(수원국 리스크 지도)는 보류.

## 팀 매뉴얼 '부정당업자 제재처분 확인방법' (2026.11) 요약 — 시스템 설계 기준
- 필요자료: 사업자등록번호, 회사 영문명 (사업자등록증 영문). 업체 등록 시 이 두 가지를 기본 입력으로.
- ① EDCF 제재: EXIMIIS–경협–업무지원–부정당업자–부정당업자조회 (사업자번호 기준, 경협평가부 관리). 엑셀 열: 업체명, 상태(등록/해지), 제재기간, 제재사유, 경협사업번호, 관련사업명, 관련사업국가, 부정당업자등록기관, 대표자명, 사업자번호, 법인등록번호, 주소. → 엑셀 업로드로 Firestore edcf_sanctions에 적재, 사업자번호(없으면 이름) 대조. 등록=위험, 해지=과거 이력(주의).
- ② MDB 상호제재: 영문명으로 ADB·WB·AfDB·EBRD·IDB 조회, 결과 없으면 국적 대한민국으로 최종 확인. 현재 한국기업: 롯데정보통신 및 계열 3사 WB 영구제재('22.12.10~), 대한전선 '26.10 해지, IDB에 Ocean C&I·Taihan CNS·Taihan Ocean Works(WBG cross debarment, ~2026.10). → OpenSanctions에서 국적 KR 목록을 별도 표시.
- ③ 국가계약법: 나라장터 '부정당제재정보공개'(사업자번호, '16.9.3부터). 조회돼도 '제재정지(집행정지)'일 수 있음 → rsttProgrsNm에 정지·해제 포함 시 위험 아님, '확인 필요'.
- 개선의견: 사업별 입찰자·계약자 기본정보 등록·관리, 좌표방식 RPA 지양(API 사용), 언론보도 키워드(부정당, 제재, 재해, 소송, 위반).
