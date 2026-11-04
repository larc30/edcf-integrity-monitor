"""업종 분류 — DART 업종코드(한국표준산업분류) 우선, 없으면 업체명으로 추정

분류는 6가지로 통일합니다 (대시보드 assets/app.js 의 CATS / guessCat 과 같은 기준):
  건설·시공 / 엔지니어링·설계·감리 / ICT·시스템 / 제조·플랜트 / 상사·유통 / 기타
"""
import re

CATS = ["건설·시공", "엔지니어링·설계·감리", "ICT·시스템", "제조·플랜트", "상사·유통", "기타"]


def from_ksic(code: str | None) -> str | None:
    """DART company.json 의 induty_code(KSIC) → 분류"""
    c = re.sub(r"\D", "", code or "")
    if len(c) < 2:
        return None
    d2 = int(c[:2])
    if d2 in (41, 42):                      # 종합 건설업, 전문직별 공사업
        return "건설·시공"
    if d2 == 72:                            # 건축기술·엔지니어링 및 기타 과학기술 서비스업
        return "엔지니어링·설계·감리"
    if d2 in (61, 62, 63) or c.startswith("582"):  # 통신, 프로그래밍·시스템통합, 정보서비스, 소프트웨어 개발·공급
        return "ICT·시스템"
    if 10 <= d2 <= 35:                      # 제조업, 전기·가스 공급
        return "제조·플랜트"
    if 45 <= d2 <= 47:                      # 도매 및 소매업
        return "상사·유통"
    return "기타"


# 업체명으로 추정 (위에서부터 먼저 맞는 것)
_NAME_RULES = [
    ("엔지니어링·설계·감리", r"엔지니어링|건설관리|ENG|E&C|이앤씨|기술단|기술공사|기술공단|기술원|설계|건축사|종합건축|감리|씨엠|CM|측량|항측|항업|공간정보|컨설턴트"),
    ("건설·시공", r"건설|토건|건영|종합개발|기업$|산업개발"),
    ("ICT·시스템", r"정보통신|정보기술|시스템|소프트|SDS|CNS|텔레콤|네트웍스|네트워크|통신|데이터|솔루션|유비텍|아이티|IT$|^KT$"),
    ("제조·플랜트", r"중공업|공업|조선|전기|전선|플랜트|기계|산전|기기|메디칼|제철|화학|자동차|로템|에너지|파워|에너빌리티|정밀"),
    ("상사·유통", r"상사|인터내셔널|무역|트레이딩|코퍼레이션|글로벌"),
    ("기타", r"대학교|산학협력단|연구원|연구소|교육|공사$|공단$|재단"),
    ("엔지니어링·설계·감리", r"기술$|기술개발$"),  # '…기술'은 대개 엔지니어링 (정보기술은 위에서 ICT)
]


def guess(name: str | None) -> str | None:
    n = name or ""
    for cat, pat in _NAME_RULES:
        if re.search(pat, n, re.IGNORECASE):
            return cat
    return None


def normalize(cat: str | None) -> str | None:
    """예전 명단의 분류 이름(예: 'IT·시스템·통신·교통시스템')을 6가지로 맞춤"""
    c = (cat or "").strip()
    if not c:
        return None
    if c in CATS:
        return c
    if "기타" in c:  # '상사·교육·기타'처럼 여러 업종을 묶은 이름은 업체별로 다시 분류
        return None
    for target, pat in [("엔지니어링·설계·감리", r"엔지니어링|설계|감리|CM"), ("건설·시공", r"건설|시공|토목"),
                        ("ICT·시스템", r"IT|ICT|시스템|통신|정보"), ("제조·플랜트", r"제조|플랜트|조선|전기|장비|기계"),
                        ("상사·유통", r"상사|유통|무역")]:
        if re.search(pat, c, re.IGNORECASE):
            return target
    return "기타"
