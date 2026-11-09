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
- 로그인: Google. 관리자 = `assets/firebase-config.js` ALLOWED_EMAILS·`firestore.rules` owner(), 추가 계정 = meta/access.emails(설정 > 로그인 계정, 규칙 재게시 필요). 권한 구분 없음(모두 읽기·쓰기).
- 실행: 회사망은 api.github.com·script.google.com 차단 → [지금 스캔]은 Firestore requests 에 저장 → Apps Script(tools/relay.gs) tick(평일 08~19시 5분마다)이 queue 디스패치. 매일 아침은 Apps Script daily()(07~08시) + GitHub cron(30 22 UTC). run.py 는 자동 실행이면 하루 한 번만(meta/status.last_daily_at).
- 데모: `index.html?demo=1` (demo/fb-*.js 가짜 Firebase + demo/data.js 가상 데이터, 216곳 규모). demo/mail.js 는 tools/demo 스크립트로 생성.

## Firestore
projects{name,country,owner,created_at} · companies{name,name_en,aliases,category,category_source,biz_no,corp_code,country,watch,engagements:[{project_id,role,stage,order}],last_check,...} · findings{company_id,source_type(news/official),source_name,title,url,published_at,level(red/orange/yellow/none),category,summary,rationale,analyzer,dedup_key,relevant,status(new/reviewed/dismissed),same_as,reported_at,review_note} · seen/{업체id}(이미 본 기사 키) · edcf_sanctions(EXIMIIS 명단) · keywords{word,lang}(추가 키워드) · recipients · requests · runs · meta/status·settings·access.
- 내 사업 = projects.owner(로그인 이메일 1개). owner 없으면 모두에게 내 사업. watch=true 업체는 모두의 내 담당.

## 검사 (monitor/scanner.py)
- 매일: 기본 키워드 25개(TOPIC_QUERIES) + 추가 키워드(최대 12) 뉴스 검색 → 전체 명단 대조. MDB(OpenSanctions 5종, 비상업 라이선스)·조달청·EXIMIIS 대조는 모든 업체 매일.
- 집중 감시(사업 연결 또는 watch): 매일 업체명 검색 + '업체명+추가 키워드' 심층. 기본 감시: 업체명 검색 주 1회. 다시 스캔(force)은 10년 범위.
- 업체명 일치: textutil.name_matches(짧은 이름은 독립 단어·업종 문맥 필요).
- 조달청: data.go.kr 15129466, 사업자번호로 현재 유효 제재만. 같은 부정당번호에 정지·해제 줄이 있거나, 저장된 제재가 기간 중 사라지면 경고(집행정지 확인).
- 사업자번호·영문명·업종: DART corpCode 정확 일치 1건일 때만 자동, 아니면 수기.
- AI 판정: Claude(config.CLAUDE_MODEL, 기본 Haiku), 키 없으면 analyzer.RULE_KEYWORDS 규칙 판정. 업체별 '관련 없음'·'확인했음' 제목을 예시로 전달('과거 이력 일괄 정리'는 제외). 재판정은 monitor/rejudge.py.

## 등급
- 위험 = 지금 유효한 제재(입찰제한·MDB·영업정지·등록말소·EXIMIIS 등록) / 경고 = 제재로 이어질 진행 중 사안(수사·기소·과징금·부도·회생, 집행정지) / 주의 = 참고 이력. ('위험·경고·정상' 3단계로 바꿀지 사용자 검토 중)
- 확인할 이슈·메일·업체 미확인 수는 위험·경고만. 주의는 접힌 '참고 이력'.
- 배지(모두 꽉 찬 색): 밝은 화면 위험 #D92D20/흰 · 경고 #F57C00/#2B1400 · 주의 #FBC02D/#3A2A00, 어두운 화면 #FF5A5F · #FF9F1C · #FDE047. style.css .badge ↔ report.BADGE ↔ app.js BF 같게.

## 같은 기준을 두 곳에서 유지
- TOPIC_QUERIES: monitor/scanner.py ↔ assets/app.js
- 업종 6종: monitor/category.py ↔ app.js CATS·CAT_RULES
- 이슈 묶기: monitor/grouping.py ↔ app.js groupFindings (같은 제목·주소 / 같은 업체·분류 3일 / 제목 유사 0.6 / 같은 공식 기록 / AI same_as)
- 역할 순서 F/S → 컨설턴트 → 본구매: app.js ROLES·ROLE_ORDER ↔ report.ROLE_ORDER

## 화면 규칙
- 다크 기본, 대시보드 배치 'B 관제실'. backdrop-filter·blur 애니메이션 금지(느려짐, 가벼운 모드 html.lite 있음).
- 글자 크기는 var(--fs-xs·sm·base·md·lg·xl)만. 화면 문구에 '—' 쓰지 않기. 창 닫기 버튼은 마지막 .actions 줄 주 버튼 오른쪽.
- 메일(report.py): 제목 '[EDCF RADAR] MM/DD 위험 N · 경고 N', 오늘 새 위험·경고만 한 줄씩. PDF 보고서: 기본 한 장 요약.

## 테스트
- Python: store/news/sanctions/dart/pps 를 메모리 가짜로 바꿔 scanner.run_scan.
- 화면: Playwright로 `?demo=1` 또는 Firebase 모듈을 가짜(window.__DB)로 바꿔 실행.

## 자료
- 발표 자료(Slides Artifact): https://claude.ai/artifact/P8sKcUGGNPhx8tiRM22g61 — 19장, 맑은 고딕, 제목 60·본문 28px. 고칠 때는 Artifact read 로 받아 수정.
- 설계도(Artifact): https://claude.ai/artifact/JtxkBSsA5KA4Z2b57Nd8tU · 해커톤 키트: docs/HACKATHON.md (A·B안 풀버전 재구현, C안 라이트 = HTML 하나 즉석 실사)
- 팀 매뉴얼 기준: 필요자료 = 사업자번호·영문명. ① EXIMIIS 부정당업자(등록=위험, 해지=이력) ② MDB 5곳 영문명 조회 후 국적 한국 확인 ③ 나라장터 부정당제재(제재정지면 확인 필요).

## 남은 일
- 검토 중: 등급 3단계(위험·경고·정상), 세계은행 제재 목록 직접 연결(실패 시 OpenSanctions로 대체).
- 사용자: 추가 계정 4개(팀 대표 계정 권장) + Firebase 규칙 재게시 확인, 사업자번호 88곳 보완, 11/5 이전 공개 실행 로그 삭제(다음 주).
- 발표 후: 라이트 버전, 보완 엑셀. 2부(수원국 리스크 지도) 보류.
