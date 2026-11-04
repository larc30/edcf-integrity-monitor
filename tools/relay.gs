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
 *  (회사망에서 script.google.com이 막혀 있으면 2·3 대신) 왼쪽 ⏰ 트리거 → tick 함수를 5분마다 실행하도록 추가
 *  4) 매일 아침 자동 스캔: 왼쪽 ⏰ 트리거 → daily 함수 / 일 단위 타이머 / 오전 7시~8시
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
    const res = dispatch_({ task: "queue", companies: "", test_to: "" });
    if (res.ok) cache.put("recent", "1", 60);
    return json_(res);
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function dispatch_(inputs) {
  const token = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!token) return { ok: false, error: "스크립트 속성에 GITHUB_TOKEN이 없습니다" };
  const r = UrlFetchApp.fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/" + WORKFLOW + "/dispatches", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
    payload: JSON.stringify({ ref: "main", inputs: inputs }),
  });
  const code = r.getResponseCode();
  return code === 204 || code === 200 ? { ok: true } : { ok: false, error: "GitHub " + code + ": " + r.getContentText().slice(0, 200) };
}

/**
 * 회사망에서 이 중계 주소(script.google.com)가 막혀 있을 때를 위한 자동 확인.
 * 5분마다 GitHub에 '요청 확인(queue)'을 보내, 대시보드 [지금 스캔] 요청을 5분 안에 처리합니다(요청이 없으면 바로 끝남).
 * 평일 08~19시(한국시간)만 동작. 설정: 편집기 왼쪽 ⏰ 트리거 → 트리거 추가 → 함수 tick / 시간 기반 / 분 단위 타이머 / 5분마다 → 저장
 */
function tick() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const h = kst.getUTCHours(), d = kst.getUTCDay();
  if (d === 0 || d === 6 || h < 8 || h >= 19) return;
  const res = dispatch_({ task: "queue", companies: "", test_to: "" });
  if (!res.ok) Logger.log(res.error);
}

/**
 * 매일 아침 자동 스캔 + 메일. GitHub 자체 예약(07:30)이 자주 건너뛰어져서 Apps Script 타이머로 실행합니다.
 * 설정: 왼쪽 ⏰ 트리거 → 트리거 추가 → 함수 daily / 시간 기반 / 일 단위 타이머 / 오전 7시~8시 → 저장
 * (GitHub 예약과 겹쳐도 하루 한 번만 실행됩니다. 메일은 대시보드 '메일 받는 사람'에 등록된 주소로만 갑니다.)
 */
function daily() {
  const res = dispatch_({ task: "daily", companies: "", test_to: "auto" });
  Logger.log(res.ok ? "매일 스캔 시작 요청 완료" : res.error);
}

/** 처음 한 번 실행해서 권한을 승인하세요 (실행 ▶ → authorize). */
function authorize() {
  // 토큰으로 저장소 접근을 확인 (토큰 없이 호출하면 GitHub가 Google 서버를 403으로 막는 경우가 많음)
  const token = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!token) { Logger.log("스크립트 속성에 GITHUB_TOKEN이 없습니다"); return; }
  const r = UrlFetchApp.fetch("https://api.github.com/repos/" + REPO, {
    muteHttpExceptions: true, headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
  });
  Logger.log(r.getResponseCode() === 200 ? "OK — 권한 승인 + 토큰 정상" : "토큰 확인 실패 " + r.getResponseCode() + ": " + r.getContentText().slice(0, 200));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
