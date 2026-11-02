// Firebase 웹 앱 설정 (공개용 값 — 웹페이지에 들어가는 것이 정상입니다.
// 실제 데이터 보호는 Firestore 보안 규칙(firestore.rules)과 로그인 허용 이메일로 합니다.)
export const firebaseConfig = {
  apiKey: "AIzaSyDTbM3V302S2gN9c-9s4M1-BgG8EBWnuUI",
  authDomain: "edcf-monitor.firebaseapp.com",
  projectId: "edcf-monitor",
  storageBucket: "edcf-monitor.firebasestorage.app",
  messagingSenderId: "90133314405",
  appId: "1:90133314405:web:57c0fa8ed97763d2837f8c",
};

// 대시보드 접근 허용 이메일 — firestore.rules 의 목록과 같이 수정하세요.
export const ALLOWED_EMAILS = ["larc30730@gmail.com"];

// GitHub 저장소 (Actions 실행 링크용)
export const GITHUB_REPO = "larc30/edcf-integrity-monitor";
