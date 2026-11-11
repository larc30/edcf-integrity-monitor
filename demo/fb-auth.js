// 데모용 로그인 대체 — 로그인 없이 바로 가상 데이터 화면을 엽니다
import { ALLOWED_EMAILS } from "../assets/firebase-config.js";

// ?demo=1&guest → 관리자가 아닌 팀원 계정으로 보기 (관리자 모드 버튼이 없는 화면)
const GUEST = /[?&]guest\b/.test(location.search);
const auth = { currentUser: { email: GUEST ? "teammate@example.com" : ALLOWED_EMAILS[0], getIdToken: async () => "demo-token" } };
export const getAuth = () => auth;
export class GoogleAuthProvider {}
export const signInWithPopup = async () => {};
export const signOut = async () => { location.href = location.pathname; }; // 데모 종료 → 실제 로그인 화면
export const onAuthStateChanged = (a, cb) => setTimeout(() => cb(auth.currentUser), 10);
