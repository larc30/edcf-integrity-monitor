"""뉴스 수집: 네이버 검색 API + Google News RSS

모든 결과는 출처(매체명, 원문 URL, 게시일)를 함께 반환한다.
"""
import logging
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


def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return ""


def naver_news(query: str, display: int | None = None) -> list[dict]:
    if not (config.NAVER_CLIENT_ID and config.NAVER_CLIENT_SECRET):
        return []
    try:
        r = httpx.get(
            "https://openapi.naver.com/v1/search/news.json",
            params={"query": query, "display": display or config.NEWS_PER_QUERY, "sort": "date"},
            headers={
                "X-Naver-Client-Id": config.NAVER_CLIENT_ID,
                "X-Naver-Client-Secret": config.NAVER_CLIENT_SECRET,
            },
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
    except httpx.HTTPError as e:
        log.warning("naver news error (%s): %s", query, e)
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


def google_news(query: str, lang: str = "ko") -> list[dict]:
    if not config.GOOGLE_NEWS_ENABLED:
        return []
    hl, gl, ceid = _GNEWS_LOCALE.get(lang, _GNEWS_LOCALE["en"])
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl={hl}&gl={gl}&ceid={ceid}"
    r = httpx.get(url, timeout=_TIMEOUT, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    root = ET.fromstring(r.content)
    out = []
    for item in list(root.iter("item"))[: config.NEWS_PER_QUERY]:
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
