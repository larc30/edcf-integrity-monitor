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


# 짧은 이름(3자 이하) 뒤에 붙어도 되는 조사·표기 — 이 외의 한글이 붙으면 다른 단어(예: '안세' → '안세하')
_PARTICLES = set("은는이가을를의과와에도로측과만엔서")
_HANGUL_ALNUM = re.compile(r"[가-힣A-Za-z0-9]")


def _flat(s: str) -> str:
    return re.sub(r"\s+", "", (s or "").lower())


def _word_hit(text: str, name: str) -> bool:
    """name이 독립된 단어로 등장하는지 (앞에 글자 없음, 뒤에는 공백·문장부호·조사만 허용)"""
    t, n = (text or "").lower(), name.lower()
    for m in re.finditer(re.escape(n), t):
        before = t[m.start() - 1] if m.start() > 0 else " "
        after = t[m.end()] if m.end() < len(t) else " "
        if _HANGUL_ALNUM.match(before):
            continue
        if re.match(r"[a-z0-9&]", after) or (before == "&"):  # KTX, KT&G 같은 다른 이름 제외
            continue
        if re.match(r"[가-힣]", after) and after not in _PARTICLES:
            continue
        return True
    return False


def is_short(name: str) -> bool:
    """2자 이하 이름(예: 건우·삼안·KT) — 일반 단어·인명과 겹치기 쉬움"""
    core = norm(name) if not (name or "").isascii() else re.sub(r"[^a-z0-9]", "", (name or "").lower())
    return len(core) <= 2


def name_matches(text: str, name: str, context: list[str] | None = None) -> bool:
    """업체명 1개 일치 판정
    - 영문명: 단어 경계 기준 (STraffic ≠ STrafficking)
    - 국문 4자 이상: 공백 무시 포함 여부 ('안세기술' = '안세 기술')
    - 국문 3자 이하(약칭·짧은 상호): 독립 단어일 때만 ('안세' ≠ '안세하', '트라콤' ≠ '트라콤스')"""
    name = (name or "").strip()
    core = norm(name) if not name.isascii() else re.sub(r"[^a-z0-9]", "", name.lower())
    if len(core) < 2:
        return False
    if name.isascii():
        words = re.sub(r"\s+", " ", re.sub(r"(?i)\b(co|ltd|inc|corp|corporation|company|limited|pt|tbk|persero)\b\.?", " ", name)).strip(" .,")
        if not words or not _word_hit(text, words):
            return False
        if len(core) <= 2 and context:
            t = (text or "").lower()
            return any(w.lower() in t for w in context if w)
        return True
    if len(core) >= 4:
        return core in _flat(text) or _flat(name) in _flat(text)
    if not _word_hit(text, name):
        return False
    if len(core) <= 2 and context:  # 2자 이하: 업종·사업 관련 단어가 함께 있어야 인정
        t = (text or "").lower()
        return any(w.lower() in t for w in context if w)
    return True


# 업종별 문맥 단어: 2자 이하 이름이 기사에 나올 때 실제 그 업체 이야기인지 확인하는 데 사용
CATEGORY_HINTS = {
    "엔지니어링": ["엔지니어링", "설계", "감리", "건설사업관리", "CM", "용역", "기술사", "ENG"],
    "건설": ["건설", "시공", "공사", "건설사", "현장", "토건"],
    "제조": ["공업", "제조", "플랜트", "공장", "설비", "중공업", "조선", "전기"],
    "IT": ["시스템", "IT", "솔루션", "통신", "SI", "소프트웨어", "정보"],
    "상사": ["무역", "상사", "교육", "인터내셔널"],
}
# 제재 관련 단어(부정당·담합 등)는 넣지 않음 — 제재 키워드 기사에는 항상 들어 있어 판별에 도움이 안 됨
GENERIC_HINTS = ["입찰", "계약", "수주", "낙찰", "용역", "공사", "발주", "시공", "설계", "건설사", "업체"]


def category_key(category: str | None) -> str | None:
    c = category or ""
    for k in CATEGORY_HINTS:
        if k.lower() in c.lower():
            return k
    if "건축" in c or "감리" in c or "설계" in c:
        return "엔지니어링"
    if "조선" in c or "플랜트" in c or "전기" in c:
        return "제조"
    if "통신" in c or "교통" in c or "시스템" in c:
        return "IT"
    return None


def context_words(company: dict) -> list[str]:
    words = [w.strip() for w in (company.get("context_keywords") or "").split(",") if w.strip()]
    words += CATEGORY_HINTS.get(category_key(company.get("category")) or "", [])
    return words + GENERIC_HINTS


def mentions(text: str, names: list[str], context: list[str] | None = None) -> bool:
    """본문(제목+요약)에 업체명(국문·영문·별칭 중 하나)이 실제로 등장하는지"""
    return any(name_matches(text, n, context) for n in names if n)


def search_names(company: dict) -> list[str]:
    """검색어로 쓸 국문 이름: 대표명 + 4자 이상 별칭 (짧은 약칭은 검색어로 쓰면 잡음이 많아 제외)"""
    out = [company["name"]]
    for a in (company.get("aliases") or "").split(","):
        a = a.strip()
        if a and not a.isascii() and len(norm(a)) >= 4 and a not in out:
            out.append(a)
    # 2자 이하 대표명은 업종 단어를 붙여 검색 (예: "건우" 엔지니어링)
    if is_short(company["name"]):
        hint = (CATEGORY_HINTS.get(category_key(company.get("category")) or "") or ["기업"])[0]
        out[0] = f'{company["name"]}" "{hint}'
    return out
