"""환경설정 — GitHub Actions에서는 저장소 Secrets가 환경변수로 들어온다."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

try:  # 로컬 테스트용 .env (선택)
    from dotenv import load_dotenv

    load_dotenv(BASE_DIR / ".env")
except ImportError:
    pass


def _get(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


# --- Firebase (서비스 계정 JSON 전체 문자열) ---
FIREBASE_SERVICE_ACCOUNT = _get("FIREBASE_SERVICE_ACCOUNT")

# --- 뉴스 ---
# 네이버 검색: 2026-07-31부터 신규 발급은 NAVER API HUB(네이버 클라우드)에서만 가능
NAVER_APIHUB_KEY_ID = _get("NAVER_APIHUB_KEY_ID")
NAVER_APIHUB_KEY = _get("NAVER_APIHUB_KEY")
# (구) 네이버 개발자센터 키 — 이미 갖고 있는 경우에만. 2027-06-30 종료 예정
NAVER_CLIENT_ID = _get("NAVER_CLIENT_ID")
NAVER_CLIENT_SECRET = _get("NAVER_CLIENT_SECRET")
GOOGLE_NEWS_ENABLED = _get("GOOGLE_NEWS_ENABLED", "true").lower() == "true"
NEWS_LOOKBACK_DAYS = int(_get("NEWS_LOOKBACK_DAYS", "3650"))  # 기본 10년 (과거 이력 포함)
NEWS_PER_QUERY = int(_get("NEWS_PER_QUERY", "30"))

# --- 업체 마스터 (DART) ---
DART_API_KEY = _get("DART_API_KEY")
CORP_MASTER_PATH = BASE_DIR / "data" / "corp_master.json"

# --- 제재 리스트 ---
OPENSANCTIONS_DATASETS = [
    d.strip()
    for d in _get(
        "OPENSANCTIONS_DATASETS",
        "worldbank_debarred,adb_sanctions,afdb_sanctions,iadb_sanctions,ebrd_ineligible",
    ).split(",")
    if d.strip()
]
OPENSANCTIONS_BASE = _get("OPENSANCTIONS_BASE", "https://data.opensanctions.org/datasets/latest")
# 조달청 나라장터 사용자정보 서비스 (공공데이터포털, Decoding 인증키)
DATA_GO_KR_KEY = _get("DATA_GO_KR_KEY")
PPS_BASE_URL = _get("PPS_BASE_URL", "https://apis.data.go.kr/1230000/ao/UsrInfoService02")

# --- AI 분석 (Claude) ---
ANTHROPIC_API_KEY = _get("ANTHROPIC_API_KEY")
CLAUDE_MODEL = _get("AI_MODEL", "claude-opus-5-5")
CLAUDE_EFFORT = _get("AI_EFFORT", "low")

# --- 메일 ---
SMTP_HOST = _get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(_get("SMTP_PORT", "587"))
SMTP_USER = _get("SMTP_USER")
SMTP_PASSWORD = _get("SMTP_PASSWORD")
MAIL_FROM = _get("MAIL_FROM") or SMTP_USER
DASHBOARD_URL = _get("DASHBOARD_URL", "https://larc30.github.io/edcf-integrity-monitor/")

TIMEZONE = "Asia/Seoul"
