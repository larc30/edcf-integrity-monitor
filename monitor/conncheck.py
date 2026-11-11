"""API 연결 확인 — 대시보드 설정 > 고급 > [연결 확인] 요청 때 실행

각 API를 가볍게 한 번씩 실제로 불러 보고 결과를 meta/status.conn_check 에 저장한다.
(평소 '연결됨' 표시는 '키가 등록돼 있는지'만 본 것이라, 키가 만료됐는지는 이걸로 확인)
검색어·업체 이름은 쓰지 않음. 공개 로그에는 성공 건수만.
"""
import smtplib

import httpx

from . import config, store
from .sources import news, pps

T = 20


def _ok(msg="정상"):
    return {"ok": True, "msg": msg}


def _no(msg):
    return {"ok": False, "msg": str(msg)[:120]}


def _err(e: Exception) -> dict:
    code = getattr(getattr(e, "response", None), "status_code", None)
    return _no(f"{type(e).__name__}{f' {code}' if code else ''}")


def check(get=httpx.get) -> dict:
    out = {}

    def run(key, fn):
        try:
            out[key] = fn()
        except Exception as e:  # 하나가 실패해도 나머지는 계속
            out[key] = _err(e)

    def gnews():
        if not config.GOOGLE_NEWS_ENABLED:
            return _no("꺼져 있음 (GOOGLE_NEWS_ENABLED)")
        return _ok(f"기사 {len(news.google_news('수출입은행', 'ko', 3))}건 받음")

    def naver():
        if not news.naver_enabled():
            return _no("키 없음")
        return _ok(f"기사 {len(news.naver_news('수출입은행', 3))}건 받음")

    def claude():
        if not config.ANTHROPIC_API_KEY:
            return _no("키 없음 (키워드 규칙으로 판정 중)")
        import anthropic
        anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY).models.list(limit=1)  # 비용 없는 호출
        return _ok(f"모델 {config.CLAUDE_MODEL}")

    def dart():
        if not config.DART_API_KEY:
            return _no("키 없음")
        r = get("https://opendart.fss.or.kr/api/company.json", params={"crtfc_key": config.DART_API_KEY, "corp_code": "00126380"}, timeout=T)
        r.raise_for_status()
        st = r.json().get("status")
        return _ok() if st == "000" else _no(f"응답 코드 {st}")

    def pps_():
        if not pps.enabled():
            return _no("키 없음 (DATA_GO_KR_KEY)")
        pps.basic_info("1234567890")  # 없는 번호 — 응답만 오면 키는 정상
        return _ok()

    def mdb():
        r = get(f"{config.OPENSANCTIONS_BASE}/worldbank_debarred/index.json", timeout=T, follow_redirects=True)
        r.raise_for_status()
        return _ok("OpenSanctions 응답")

    def mofa():
        from . import geo
        if not config.MOFA_TRAVEL_KEY:
            return _no("키 없음 (DATA_GO_KR_KEY)")
        n = len(geo.fetch_alerts(get))
        return _ok(f"{n}개국") if n else _no("응답은 왔지만 자료 없음 (활용신청 확인)")

    def usgs():
        from . import geo
        r = get(geo.USGS_URL, timeout=T)
        r.raise_for_status()
        return _ok(f"지진 {len(r.json().get('features', []))}건")

    def smtp():
        if not (config.SMTP_USER and config.SMTP_PASSWORD):
            return _no("SMTP_USER · SMTP_PASSWORD 없음")
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=T) as s:
            s.starttls()
            s.login(config.SMTP_USER, config.SMTP_PASSWORD)
        return _ok("로그인 성공")

    for k, fn in (("google_news", gnews), ("naver", naver), ("claude", claude), ("dart", dart), ("pps", pps_),
                  ("mdb", mdb), ("mofa", mofa), ("usgs", usgs), ("smtp", smtp)):
        run(k, fn)
    return out


def run_and_save() -> dict:
    res = check()
    store.update("meta", "status", {"conn_check": {"at": store.now_str(), "results": res}})
    return {"ok": sum(1 for v in res.values() if v["ok"]), "total": len(res)}
