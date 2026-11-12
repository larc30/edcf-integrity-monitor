// 즉시 실행 함수 (선택 사항, 설치 방법은 docs/INSTANT.md)
// 대시보드가 Firestore requests 에 실행 요청을 남기면, 그 순간 GitHub Actions 의 '요청 처리(queue)'를 깨운다.
// → 5분마다 확인하던 대기가 없어지고, 회사망 우회용 Apps Script 중계도 필요 없어진다.
// 키는 Firebase Secret(GH_TOKEN)에만 두고 화면(브라우저)에는 보내지 않는다.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const GH_TOKEN = defineSecret("GH_TOKEN"); // GitHub 토큰 (이 저장소의 Actions 읽기·쓰기 권한만)
const REPO = "larc30/edcf-integrity-monitor";
const REGION = "asia-northeast3"; // Firestore 데이터베이스 위치와 같게 (docs/INSTANT.md 3번)

exports.kickQueue = onDocumentCreated({ document: "requests/{id}", region: REGION, secrets: [GH_TOKEN] }, async (event) => {
  const req = event.data && event.data.data();
  if (!req || req.status !== "pending") return;
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/monitor.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GH_TOKEN.value()}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "edcf-radar-functions" },
    body: JSON.stringify({ ref: "main", inputs: { task: "queue", companies: "", test_to: "" } }),
  });
  // 공개 저장소라 로그에는 작업 종류와 결과 코드만 남긴다 (업체명·메일 주소는 남기지 않음)
  logger.info("queue dispatch", { task: String(req.task || ""), status: r.status });
});
