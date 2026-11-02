"""기사 관련성 판정 + 리스크 등급 분류

- ANTHROPIC_API_KEY 가 있으면 Claude로 판정 (동명 업체 오탐 제거, 요약, 등급)
- 없거나 실패하면 키워드 규칙 기반으로 판정
"""
import json
import logging
from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel

from . import config

log = logging.getLogger(__name__)

LEVEL_ORDER = {"red": 3, "orange": 2, "yellow": 1, "none": 0, None: 0, "": 0}

Category = Literal[
    "부정당업자 제재", "MDB 제재", "입찰담합", "뇌물·부패", "사기·허위서류", "횡령·배임",
    "수사·기소", "과징금·행정처분", "부도·회생·재무악화", "중대재해·부실시공", "소송·분쟁", "기타", "무관",
]


class ArticleJudgement(BaseModel):
    idx: int
    is_about_company: bool
    risk_level: Literal["red", "orange", "yellow", "none"]
    category: Category
    summary_ko: str
    rationale: str
    event_date: str


class BatchJudgement(BaseModel):
    results: list[ArticleJudgement]


SYSTEM_PROMPT = """당신은 한국수출입은행 EDCF(대외경제협력기금) 사업의 조달 청렴성 모니터링 분석가입니다.
EDCF 사업에 참여 중인 업체(컨설턴트, 본구매 계약자, 입찰참가자, 우선협상대상자)에 대한 뉴스를 검토하여,
계약 이행·입찰 자격에 영향을 줄 수 있는 리스크 신호를 선별합니다.

각 기사에 대해 판단하세요.
1. is_about_company: 기사가 '이 업체'(동명의 다른 회사·인물·일반명사 아님)에 관한 내용인지.
   업종, 대표자, 보조 키워드, 기사 맥락으로 판단하고, 확신이 없으면 false.
2. risk_level:
   - red: 현재 유효한 부정당업자 제재(입찰참가자격 제한), MDB 제재, 영업정지, 부도·회생절차 등
          입찰·계약 이행에 직접적인 장애가 되는 사실
   - orange: 최근 1년 내 입찰담합·뇌물·사기·횡령 등으로 수사/압수수색/기소/유죄판결/공정위 제재·과징금,
             또는 제재 처분 예고·청문
   - yellow: 1년 이상 지난 과거 이력, 의혹 제기·고발 단계, 소송, 중대재해, 재무악화 등 간접 리스크
   - none: 무관하거나, 수주·실적·MOU 등 중립/긍정 기사
3. category: 가장 가까운 유형 하나.
4. summary_ko: 담당자가 바로 읽을 수 있는 한국어 1~2문장 요약 (누가, 무엇을, 언제, 어떤 처분).
5. rationale: 등급 판단 근거 한 문장.
6. event_date: 사건 발생/처분 일자를 알 수 있으면 YYYY-MM-DD 또는 YYYY, 모르면 빈 문자열.

주의: 뉴스는 '제재 확정'이 아니라 '검토 필요 신호'입니다. 기사에 없는 사실을 추정하지 마세요."""


_KW_CATEGORY = [
    ("부정당", "부정당업자 제재"), ("입찰참가", "부정당업자 제재"), ("입찰 참가", "부정당업자 제재"), ("debar", "MDB 제재"),
    ("담합", "입찰담합"), ("collusion", "입찰담합"), ("bid rigging", "입찰담합"),
    ("뇌물", "뇌물·부패"), ("brib", "뇌물·부패"), ("corruption", "뇌물·부패"), ("korupsi", "뇌물·부패"), ("suap", "뇌물·부패"),
    ("횡령", "횡령·배임"), ("배임", "횡령·배임"), ("허위", "사기·허위서류"), ("fraud", "사기·허위서류"),
    ("과징금", "과징금·행정처분"), ("공정위", "과징금·행정처분"), ("영업정지", "과징금·행정처분"),
    ("압수수색", "수사·기소"), ("기소", "수사·기소"), ("구속", "수사·기소"), ("tersangka", "수사·기소"),
    ("회생", "부도·회생·재무악화"), ("법정관리", "부도·회생·재무악화"), ("부도", "부도·회생·재무악화"),
    ("중대재해", "중대재해·부실시공"), ("부실시공", "중대재해·부실시공"), ("소송", "소송·분쟁"),
]


def _rule_based(company: dict, articles: list[dict], keywords: list[dict]) -> list[dict]:
    out = []
    for i, a in enumerate(articles):
        text = f"{a['title']} {a.get('snippet','')}".lower()
        hits = [k for k in keywords if k["word"].lower() in text]
        if not hits:
            out.append({"idx": i, "relevant": 0, "level": "none"})
            continue
        level = max((k["level"] for k in hits), key=lambda l: LEVEL_ORDER[l])
        why = "키워드 매칭: " + ", ".join(k["word"] for k in hits)
        pub = a.get("published_at") or ""
        if pub and pub < (date.today() - timedelta(days=365)).isoformat() and level != "yellow":
            level = "orange" if level == "red" else "yellow"  # 1년 지난 기사는 한 단계 낮춤
            why += f" / {pub[:4]}년 기사 → 과거 이력으로 하향"
        cat = next((c for w, c in _KW_CATEGORY if any(w in k["word"].lower() for k in hits)), "기타")
        out.append(
            {
                "idx": i,
                "relevant": 1,
                "level": level,
                "category": cat,
                "summary": a["title"],
                "rationale": why,
                "analyzer": "rule",
            }
        )
    return out


def _claude(company: dict, engagements: list[dict], articles: list[dict], keywords: list[dict]) -> list[dict]:
    import anthropic

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    profile = {
        "업체명": company["name"],
        "영문명": company.get("name_en") or "",
        "별칭": company.get("aliases") or "",
        "보조키워드(업종·대표자 등)": company.get("context_keywords") or "",
        "대표자": company.get("ceo") or "",
        "국가": company.get("country") or "",
        "참여사업": [f"{e['project_name']} / {e['role']} / {e['stage']}" for e in engagements],
    }
    payload = [
        {
            "idx": i,
            "title": a["title"],
            "snippet": (a.get("snippet") or "")[:500],
            "published_at": a.get("published_at"),
            "source": a.get("source_name"),
        }
        for i, a in enumerate(articles)
    ]
    user = (
        f"오늘 날짜: {date.today().isoformat()}\n\n"
        f"[업체 프로필]\n{json.dumps(profile, ensure_ascii=False, indent=1)}\n\n"
        f"[담당자 관심 키워드]\n{', '.join(k['word'] for k in keywords)}\n\n"
        f"[기사 목록]\n{json.dumps(payload, ensure_ascii=False, indent=1)}\n\n"
        "모든 기사(idx)에 대해 판정 결과를 반환하세요."
    )
    resp = client.messages.parse(
        model=config.CLAUDE_MODEL,
        max_tokens=16000,
        system=SYSTEM_PROMPT,
        output_config={"effort": config.CLAUDE_EFFORT},
        messages=[{"role": "user", "content": user}],
        output_format=BatchJudgement,
    )
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        raise RuntimeError(f"Claude 응답 없음 (stop_reason={resp.stop_reason})")
    out = []
    for j in resp.parsed_output.results:
        if not (0 <= j.idx < len(articles)):
            continue
        relevant = j.is_about_company and j.risk_level != "none"
        out.append(
            {
                "idx": j.idx,
                "relevant": 1 if relevant else 0,
                "level": j.risk_level if j.is_about_company else "none",
                "category": j.category,
                "summary": j.summary_ko,
                "rationale": j.rationale + (f" (사건일: {j.event_date})" if j.event_date else ""),
                "analyzer": "claude",
            }
        )
    return out


def analyze(company: dict, engagements: list[dict], articles: list[dict], keywords: list[dict]) -> tuple[list[dict], str]:
    """returns (judgements, analyzer_used)"""
    if not articles:
        return [], "-"
    if config.ANTHROPIC_API_KEY:
        try:
            results = []
            for start in range(0, len(articles), 25):  # 25건씩 나눠 판정
                chunk = articles[start : start + 25]
                for r in _claude(company, engagements, chunk, keywords):
                    r["idx"] += start
                    results.append(r)
            return results, "claude"
        except Exception as e:
            log.warning("Claude 분석 실패 → 규칙 기반으로 대체: %r", e)
    return _rule_based(company, articles, keywords), "rule"
