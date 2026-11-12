# 즉시 스캔 함수 붙이기 (선택 사항)

지금은 [지금 스캔]을 누르면 요청이 저장되고, 5분마다 도는 확인이 그 요청을 발견해야 검사가 시작됩니다.
이 함수를 붙이면 요청이 저장되는 순간 검사가 시작됩니다. 검사 자체는 지금처럼 GitHub Actions에서 돕니다.

아직 실제로 배포해 시험해 보지 않은 코드입니다. 처음 붙일 때 아래 5번으로 꼭 확인하세요.

## 필요한 것
- Firebase 요금제를 Blaze(쓴 만큼 내는 요금제)로 변경. 함수는 Blaze에서만 쓸 수 있습니다. 이 함수의 사용량은 무료 범위 안으로 예상됩니다.
- Node.js 가 깔린 PC 한 대 (회사망 밖 권장), 관리자 Google 계정
- GitHub 토큰 1개: 이 저장소만 선택, 권한은 Actions 읽기·쓰기만

## 순서
1. Firebase 콘솔 > 왼쪽 아래 요금제 > Blaze 로 변경
2. PC 에서
   ```bash
   npm install -g firebase-tools
   ```
   ```bash
   firebase login
   ```
3. Firebase 콘솔 > Firestore Database 화면 위쪽에서 데이터베이스 위치를 확인하고, `functions/index.js` 의 `REGION` 을 그 위치에 맞춥니다.
   서울이면 `asia-northeast3`, nam5(미국)이면 `us-central1`.
4. 저장소 폴더에서
   ```bash
   cd functions
   ```
   ```bash
   npm install
   ```
   ```bash
   firebase functions:secrets:set GH_TOKEN --project edcf-monitor
   ```
   (GitHub 토큰을 붙여 넣습니다. 화면에 보이지 않습니다)
   ```bash
   firebase deploy --only functions --project edcf-monitor
   ```
5. 확인: 대시보드에서 [지금 스캔]을 누르고, GitHub Actions 화면에 몇 초 안에 새 실행이 생기는지 봅니다.

## 붙인 뒤
- Apps Script 의 5분 확인(tick)은 그대로 두어도 됩니다. 함수가 실패했을 때의 예비 수단이 됩니다.
- 토큰이 만료되면 4번의 `secrets:set` 과 `deploy` 를 다시 합니다.
- 떼어 내려면
  ```bash
  firebase functions:delete kickQueue --project edcf-monitor
  ```
