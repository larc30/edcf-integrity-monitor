"""뉴스 수집: 네이버 검색 API + Google News RSS

모든 결과는 출처(매체명, 원문 URL, 게시일)를 함께 반환한다.
"""
import logging
import threading
import time
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus, urlparse

import httpx

from .. import config
from ..textutil import parse_date, strip_html

log = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(20.0)

# Google News RSS 언어/지역 설정
_GNEWS_LOCALE = {
    "ko": ("ko", "KR", "KR:ko"),
    "en": ("en-US", "US", "US:en"),
    "id": ("id", "ID", "ID:id"),
}


# Google 뉴스는 짧은 시간에 요청이 몰리면 429(Too Many Requests)로 잠시 막는다 (하루 한도가 아니라 '속도' 제한).
# 여러 스레드가 동시에 불러도 Google 호출 사이에 최소 간격을 두고, 429면 잠깐 쉬었다가 두 번 더 시도한다.
_G_GAP = 0.6  # 초
_g_lock = threading.Lock()
_g_last = [0.0]


def _google_get(url: str):
    for wait in (0, 4, 10):
        if wait:
            time.sleep(wait)
        with _g_lock:
            gap = _G_GAP - (time.monotonic() - _g_last[0])
            if gap > 0:
                time.sleep(gap)
            _g_last[0] = time.monotonic()
        r = httpx.get(url, timeout=_TIMEOUT, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code != 429:
            break
        with _g_lock:  # 막혔으면 다른 스레드도 같이 조금 쉬게
            _g_last[0] = time.monotonic() + 3
    r.raise_for_status()
    return r


def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return ""


APIHUB_NEWS_URL = "https://naverapihub.apigw.ntruss.com/search/v1/news"
LEGACY_NEWS_URL = "https://openapi.naver.com/v1/search/news.json"


def naver_endpoint() -> tuple[str, dict] | None:
    """NAVER API HUB 키가 있으면 우선, 없으면 (구) 개발자센터 키. 둘 다 없으면 None.
    검색 조건(query·display·sort)과 결과 형식은 두 방식이 같다."""
    if config.NAVER_APIHUB_KEY_ID and config.NAVER_APIHUB_KEY:
        return APIHUB_NEWS_URL, {"X-NCP-APIGW-API-KEY-ID": config.NAVER_APIHUB_KEY_ID, "X-NCP-APIGW-API-KEY": config.NAVER_APIHUB_KEY}
    if config.NAVER_CLIENT_ID and config.NAVER_CLIENT_SECRET:
        return LEGACY_NEWS_URL, {"X-Naver-Client-Id": config.NAVER_CLIENT_ID, "X-Naver-Client-Secret": config.NAVER_CLIENT_SECRET}
    return None


def naver_enabled() -> bool:
    return naver_endpoint() is not None


def naver_news(query: str, display: int | None = None, sort: str = "date") -> list[dict]:
    """sort: date(최신순) / sim(관련도순 — 오래된 사건도 잡힘)"""
    ep = naver_endpoint()
    if not ep:
        return []
    url, headers = ep
    try:
        r = httpx.get(url, params={"query": query, "display": display or config.NEWS_PER_QUERY, "sort": sort}, headers=headers, timeout=_TIMEOUT)
        r.raise_for_status()
    except httpx.HTTPError as e:
        # 공개 로그라 검색어(업체 이름)·주소는 남기지 않음 — 자세한 내용은 실행 기록(Firestore)에
        log.warning("naver news error: %s %s", type(e).__name__, getattr(getattr(e, "response", None), "status_code", ""))
        raise
    out = []
    for it in r.json().get("items", []):
        url = it.get("originallink") or it.get("link")
        out.append(
            {
                "title": strip_html(it.get("title")),
                "snippet": strip_html(it.get("description")),
                "url": url,
                "naver_url": it.get("link"),
                "published_at": parse_date(it.get("pubDate")),
                "source_name": _domain(url),
                "via": "네이버 뉴스",
            }
        )
    return out


def google_news(query: str, lang: str = "ko", limit: int | None = None) -> list[dict]:
    if not config.GOOGLE_NEWS_ENABLED:
        return []
    hl, gl, ceid = _GNEWS_LOCALE.get(lang, _GNEWS_LOCALE["en"])
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl={hl}&gl={gl}&ceid={ceid}"
    r = _google_get(url)
    root = ET.fromstring(r.content)
    out = []
    for item in list(root.iter("item"))[: limit or config.NEWS_PER_QUERY]:
        title = item.findtext("title") or ""
        src = item.find("source")
        source_name = src.text if src is not None and src.text else ""
        source_home = src.get("url") if src is not None else ""
        if source_name and title.endswith(f" - {source_name}"):
            title = title[: -len(source_name) - 3]
        out.append(
            {
                "title": strip_html(title),
                "snippet": strip_html(item.findtext("description") or "")[:400],
                "url": item.findtext("link"),
                "published_at": parse_date(item.findtext("pubDate")),
                "source_name": source_name or _domain(source_home),
                "via": "Google News",
            }
        )
    return out
