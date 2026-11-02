"""업체명 정규화 / 텍스트 유틸"""
import hashlib
import html
import re
from datetime import datetime
from email.utils import parsedate_to_datetime

# 업체명에서 제거할 법인 형태 표기
_CORP_SUFFIXES = [
    "주식회사", "(주)", "㈜", "유한회사", "(유)", "합자회사", "사단법인", "재단법인",
    "co., ltd.", "co.,ltd.", "co. ltd.", "co ltd", "company limited", "limited", "ltd.", "ltd",
    "corporation", "corp.", "corp", "inc.", "inc", "llc", "plc", "gmbh", "s.a.", "(persero)", "persero", "tbk",
]
_RANK_RE = re.compile(r"\(\s*\d+\s*순위\s*\)")


def clean_display_name(raw: str) -> tuple[str, int | None]:
    """'포스코 인터내셔널(1순위)' -> ('포스코 인터내셔널', 1)"""
    rank = None
    m = re.search(r"\(\s*(\d+)\s*순위\s*\)", raw)
    if m:
        rank = int(m.group(1))
    name = _RANK_RE.sub("", raw)
    for s in ["주식회사", "(주)", "㈜"]:
        name = name.replace(s, "")
    return re.sub(r"\s+", " ", name).strip(), rank


def norm(name: str) -> str:
    """매칭용 정규화: 소문자, 법인표기 제거, 공백/구두점 제거"""
    if not name:
        return ""
    s = name.lower()
    s = re.sub(r"^pt[.\s]+", "", s)  # 인도네시아 PT.
    for suf in _CORP_SUFFIXES:
        s = s.replace(suf, " ")
    s = re.sub(r"[^0-9a-z가-힣]", "", s)
    return s


def strip_html(s: str) -> str:
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s).strip()


def parse_date(s: str) -> str:
    """RFC822 등 -> 'YYYY-MM-DD'"""
    if not s:
        return ""
    try:
        return parsedate_to_datetime(s).strftime("%Y-%m-%d")
    except Exception:
        pass
    for fmt in ("%Y-%m-%d", "%Y%m%d", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(s[: len(fmt) + 2], fmt).strftime("%Y-%m-%d")
        except Exception:
            continue
    return s[:10]


def dedup_key(title: str, url: str = "") -> str:
    """같은 기사가 여러 매체/URL로 들어와도 제목 기준으로 중복 제거"""
    t = re.sub(r"\s*[-|]\s*[^-|]{1,30}$", "", title or "")  # ' - 연합뉴스' 같은 매체 꼬리 제거
    t = re.sub(r"[^0-9a-zA-Z가-힣]", "", t).lower()
    base = t if len(t) >= 8 else (url or t)
    return hashlib.sha1(base.encode()).hexdigest()[:20]


def mentions(text: str, names: list[str]) -> bool:
    """본문(제목+요약)에 업체명이 실제로 등장하는지 (공백 무시)"""
    flat = re.sub(r"\s+", "", (text or "").lower())
    for n in names:
        n2 = re.sub(r"\s+", "", (n or "").lower())
        if len(n2) >= 2 and n2 in flat:
            return True
    return False
