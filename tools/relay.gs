/**
 * EDCF 부정당업자 자동감지 — 즉시 실행 중계 (Google Apps Script)
 *
 * 회사망에서 api.github.com이 막혀도, 대시보드 → (Google) 이 스크립트 → GitHub 로
 * 스캔을 바로 시작시키기 위한 중계기입니다. 대시보드 로그인(Firebase) 사용자만 실행할 수 있습니다.
 *
 * 설정 (README의 '즉시 실행 중계' 참고)
 *  1) 프로젝트 설정 ⚙ → 스크립트 속성 → GITHUB_TOKEN 추가 (이 저장소 Actions: Read and write 권한의 토큰)
 *  2) 배포 → 새 배포 → 유형: 웹 앱 / 실행 계정: 나 / 액세스 권한: 모든 사용자 → 배포 → 웹 앱 URL 복사
 *  3) 대시보드 → 설정 → 연결 상태 → '즉시 실행 중계'에 URL 붙여넣기
 */
const REPO = "larc30/edcf-integrity-monitor";
const WORKFLOW = "monitor.yml";
const FIREBASE_API_KEY = "AIzaSyDTbM3V302S2gN9c-9s4M1-BgG8EBWnuUI"; // 웹용 공개 키 (assets/firebase-config.js와 동일)
const ALLOWED_EMAILS = ["larc30730@gmail.com"];                     // 대시보드 허용 이메일과 같게 유지

function doGet() {
  return json_({ ok: true, service: "edcf-relay", token: !!PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN") });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    // 1) 대시보드 로그인 확인 (Firebase ID 토큰 → 이메일)
    const who = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, {
      method: "post", contentType: "application/json", muteHttpExceptions: true,
      payload: JSON.stringify({ idToken: body.idToken || "" }),
    });
    const user = (JSON.parse(who.getContentText()).users || [])[0];
    if (!user || ALLOWED_EMAILS.indexOf(user.email) < 0) return json_({ ok: false, error: "허용되지 않은 사용자입니다" });

    // 2) 1분 안에 이미 보냈으면 다시 보내지 않음 (연속 클릭 방지)
    const cache = CacheService.getScriptCache();
    if (cache.get("recent")) return json_({ ok: true, skipped: true });

    // 3) GitHub Actions 실행 (대기 중인 요청을 처리하는 queue 작업)
    const token = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
    if (!token) return json_({ ok: false, error: "스크립트 속성에 GITHUB_TOKEN이 없습니다" });
    const r = UrlFetchApp.fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/" + WORKFLOW + "/dispatches", {
      method: "post", contentType: "application/json", muteHttpExceptions: true,
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
      payload: JSON.stringify({ ref: "main", inputs: { task: "queue", companies: "", test_to: "" } }),
    });
    const code = r.getResponseCode();
    if (code === 204 || code === 200) { cache.put("recent", "1", 60); return json_({ ok: true }); }
    return json_({ ok: false, error: "GitHub " + code + ": " + r.getContentText().slice(0, 200) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** 처음 한 번 실행해서 권한을 승인하세요 (실행 ▶ → authorize). */
function authorize() {
  UrlFetchApp.fetch("https://api.github.com/zen");
  Logger.log("OK — GITHUB_TOKEN 설정: " + !!PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN"));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
