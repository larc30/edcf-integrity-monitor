# EDCF 부정당업자 자동감지 시스템

EDCF 사업 참여 업체(컨설턴트·본구매·입찰·우선협상)의 부정 이슈를 매일 자동으로 점검하고, 대시보드와 일일 메일로 알려주는 시스템입니다.

- **대시보드**: GitHub Pages(index.html). Google 로그인 후 허용된 계정만 볼 수 있습니다.
- **데이터**: Firebase Firestore
- **매일 실행**: GitHub Actions가 07:30(KST)에 Python으로 뉴스 수집 → AI 판정 → 제재리스트 매칭 → 메일 발송

```
[GitHub Pages: 대시보드·관리자]  ⇄  [Firestore]  ⇄  [GitHub Actions: monitor/ (Python, 매일 07:30)]
```

## 처음 설정 (한 번만)

### 1. Firestore 보안 규칙 게시
Firebase 콘솔 → Firestore Database → **규칙** 탭 → 이 저장소의 `firestore.rules` 내용을 전부 붙여넣고 **[게시]**를 누릅니다.

### 2. GitHub Secrets 등록
저장소 **Settings → Secrets and variables → Actions → New repository secret**에서 등록합니다.

| 이름 | 값 | 필수 |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase 서비스 계정 JSON 파일 **내용 전체** | ✅ |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 네이버 개발자센터 검색 API | 권장 |
| `SMTP_USER` / `SMTP_PASSWORD` | Gmail 주소 / 앱 비밀번호(16자리) | 메일 발송 시 |
| `ANTHROPIC_API_KEY` | Claude API 키 | 선택 (없으면 키워드 규칙 판정) |
| `DART_API_KEY` | DART OpenAPI 인증키 | 선택 (업체 자동완성) |
| `DATA_GO_KR_KEY` / `PPS_SANCTION_API_URL` | 공공데이터포털 조달청 부정당제재 API | 선택 |

### 3. GitHub Pages 켜기
**Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**. 1~2분 뒤 `https://larc30.github.io/edcf-integrity-monitor/`로 접속할 수 있습니다.

### 4. Firebase 승인된 도메인
Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 `larc30.github.io`를 추가합니다.

### 5. 업체 등록 → 첫 스캔
1. 대시보드 → **관리자 → 엑셀 일괄 등록**: 엑셀에서 `사업명 | 구분 | 업체명` 3개 열을 복사해서 붙여넣기 → 미리보기 → 등록
2. **관리자 → 메일 수신자** 추가
3. GitHub **Actions → 업체 모니터링 → Run workflow**에서 작업 `scan`을 선택해 실행합니다(3~10분).
4. 대시보드 상단 **↻** 버튼으로 새로고침

## GitHub Actions 작업 종류

| 작업 | 내용 |
|---|---|
| (매일 07:30 자동) | 스캔 → 신규 신호만 메일 발송 |
| `scan` | 스캔 + 리포트 미리보기 갱신 (메일 없음). `companies`에 업체명을 넣으면 그 업체만 스캔 |
| `report-test` | `test_to` 주소로 테스트 메일 1통 (보고 처리 안 함) |
| `report` | 수신자 전체 발송 |
| `daily` | 스캔 + 전체 발송 (자동 실행과 동일) |
| `dart` | DART 기업목록을 `data/corp_master.json`으로 저장 (자동완성용) |

## 팀원 추가
1. `firestore.rules`의 이메일 목록에 추가 → Firebase 콘솔 규칙 탭에 다시 게시
2. `assets/firebase-config.js`의 `ALLOWED_EMAILS`에 추가

## 등급 기준

| 등급 | 기준 |
|---|---|
| 위험 | 현재 유효한 부정당 제재 / MDB 제재리스트 등재 / 영업정지·부도·회생 |
| 경고 | 최근 1년 내 담합·뇌물·사기 등으로 수사·기소·과징금, 또는 제재리스트 유사명 매칭 |
| 주의 | 1년이 지난 과거 이력, 의혹·고발, 소송, 중대재해 |

뉴스 기반 신호는 '제재 확정'이 아니라 '검토 필요 신호'입니다. 무관한 기사는 **오탐/무관**으로 처리하면 집계에서 빠지고, 다시 수집되지 않습니다.

## 참고
- MDB 제재리스트는 OpenSanctions 공개 데이터셋(World Bank·ADB·AfDB·IDB·EBRD)을 사용합니다. **비상업적 이용 라이선스(CC BY-NC)**이므로 정식 도입 시에는 라이선스를 확인해야 합니다.
- 공개 저장소에서는 60일 동안 커밋이 없으면 GitHub가 예약 실행을 멈춥니다. 그럴 때는 Actions 탭에서 다시 켜면 됩니다.
- `assets/firebase-config.js`의 apiKey는 웹용 공개 값입니다. 데이터 보호는 보안 규칙과 로그인으로 합니다.

## 구조
```
index.html, assets/        대시보드 (GitHub Pages)
firestore.rules            Firestore 보안 규칙
monitor/                   매일 실행되는 Python (GitHub Actions)
  run.py                   진입점 (daily / scan / report / dart ...)
  scanner.py               수집 → 필터 → 판정 → 제재리스트 매칭
  analyzer.py              Claude 판정 / 키워드 규칙
  report.py                일일 HTML 리포트 + 메일
  sources/                 news(네이버·구글), sanctions(MDB·조달청), dart
.github/workflows/monitor.yml
```
