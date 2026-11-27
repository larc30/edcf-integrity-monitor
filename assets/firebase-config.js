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

// 슈퍼관리자 (고정 4명, 전체 권한·계정·팀 지정). firestore.rules 의 superAdmins() 와 같게
export const SUPER_ADMINS = ["larc30730@gmail.com", "lical0331@gmail.com", "ahra.bella@gmail.com", "juliana0513m@gmail.com"];
export const SUPER_ADMIN = SUPER_ADMINS[0]; // 첫 옮기기 기록용
// 팀 (사업은 한 팀에만 속함). 코드 → 이름
export const TEAMS = { ict: "정보통신팀", water: "수자원에너지팀", transport: "교통팀", health: "보건팀" };
// 예전 방식 관리자 목록: 슈퍼관리자가 처음 들어올 때 users(계정·권한)로 옮김. 그 뒤로는 쓰지 않음
export const ALLOWED_EMAILS = ["larc30730@gmail.com", "juliana0513m@gmail.com", "ahra.bella@gmail.com"];

// GitHub 저장소 (Actions 실행 링크용)
export const GITHUB_REPO = "larc30/edcf-integrity-monitor";

// 사용 매뉴얼 링크 (계정 메뉴의 [사용 매뉴얼]: 비어 있으면 그 버튼은 안 보임)
export const MANUAL = { pdf: "", video: "" };
