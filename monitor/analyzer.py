"""기사 관련성 판정 + 리스크 등급 분류

- ANTHROPIC_API_KEY 가 있으면 Claude로 판정 (동명 업체 오탐 제거, 요약, 등급)
- 없거나 실패하면 키워드 규칙 기반으로 판정
"""
import json
import logging
import re
from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel

from . import config

log = logging.getLogger(__name__)

CLAUDE_ERROR: str | None = None  # 이번 스캔 중 Claude 호출이 실패한 이유 (대시보드 표시용)

LEVEL_ORDER = {"red": 3, "orange": 2, "yellow": 1, "none": 0, None: 0, "": 0}

Category = Literal[
    "부정당업자 제재", "MDB 제재", "영업정지·등록말소", "입찰담합", "뇌물·부패", "사기·허위서류", "횡령·배임",
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
    same_event_as: str


class BatchJudgement(BaseModel):
    results: list[ArticleJudgement]


SYSTEM_PROMPT = """당신은 한국수출입은행 EDCF(대외경제협력기금) 사업의 조달 청렴성 모니터링 분석가입니다.
EDCF 사업에 참여 중인 업체(컨설턴트, 본구매 계약자, 입찰참가자, 우선협상대상자)에 대한 뉴스를 검토하여,
계약 이행·입찰 자격에 영향을 줄 수 있는 리스크 신호를 선별합니다.

각 기사에 대해 판단하세요.
1. is_about_company: 기사가 '이 업체'(동명의 다른 회사·인물·일반명사 아님)에 관한 내용인지.
   업종, 대표자, 보조 키워드, 기사 맥락으로 판단하고, 확신이 없으면 false.
   처분·수사의 대상이 이 업체가 아니라 모회사·자회사·계열사(다른 법인)이면, 이 업체 기준으로는
   risk_level 을 yellow(참고) 이하로 하세요. 제재는 법인(사업자번호) 단위입니다.
   (예: 'A건설 자회사 B엔지니어링 영업정지' → B엔지니어링은 red, A건설은 yellow)
2. risk_level (담당자 기준: '위험'은 실제로 지금 제재를 받고 있는 경우만):
   - red(위험): 지금 유효한 제재 처분 — 입찰참가자격 제한(부정당업자 제재) 기간 중, MDB 제재(debarment) 중,
          영업정지·등록말소 처분 중. 처분이 확정·집행 중인 사실이 기사에 있을 때만 (예고·청문·소송 중이면 red 아님,
          법원 집행정지·효력정지 결정으로 처분이 멈춘 상태면 red 아님 → orange)
   - orange(경고): 제재로 이어질 수 있는 진행 중 사안 — 최근 1년 내 입찰담합·뇌물·사기·횡령 등의
             수사·압수수색·기소·유죄판결, 공정위 제재·과징금, 제재 처분 예고·청문, 부도·회생절차·법정관리
   - yellow(주의): 참고할 이력 — 1년 이상 지난 과거 제재·처분, 의혹 제기·고발 단계, 소송·분쟁,
             중대재해·부실시공, 재무악화 등 간접 리스크
   - none: 무관하거나, 수주·실적·MOU 등 중립/긍정 기사
3. category: 기사의 '핵심 처분·사건'을 기준으로 하나. 기사에 명시된 사실만 보고 고르세요.
   - 영업정지·등록말소: 영업정지·등록말소 처분(사고·부실이 원인이어도 처분이 핵심이면 여기)
   - 부정당업자 제재: 입찰참가자격 제한 / MDB 제재: 국제기구 제재(debarment)
   - 과징금·행정처분: 과징금·벌점·시정명령 등 영업정지가 아닌 행정처분
   - 사기·허위서류: 허위 서류 제출·사기 혐의가 기사에 '명시'된 경우만
   - 중대재해·부실시공: 처분 전 단계의 사고·부실시공
   - 맞는 유형이 없으면 '기타' (억지로 비슷한 유형을 고르지 마세요)
4. summary_ko: 담당자가 바로 읽을 수 있는 한국어 1~2문장 요약 (누가, 무엇을, 언제, 어떤 처분).
5. rationale: 등급 판단 근거 한 문장.
6. event_date: 사건 발생/처분 일자를 알 수 있으면 YYYY-MM-DD 또는 YYYY, 모르면 빈 문자열.
7. same_event_as: 이 기사가 [이미 수집된 이 업체 이슈]의 하나(E번호) 또는 이번 기사 목록의 다른 기사(idx 숫자)와
   '같은 사건'(같은 처분·수사·사고·소송 건을 다른 매체가 보도했거나 그 후속 보도)이면 그 번호(예: "E3" 또는 "5"),
   아니면 빈 문자열. 업체만 같고 다른 사건이면 빈 문자열. 확실할 때만 적으세요.

주의: 뉴스는 '제재 확정'이 아니라 '검토 필요 신호'입니다. 기사에 없는 사실을 추정하지 마세요."""


_KW_CATEGORY = [
    ("부정당", "부정당업자 제재"), ("입찰참가", "부정당업자 제재"), ("입찰 참가", "부정당업자 제재"), ("debar", "MDB 제재"),
    ("영업정지", "영업정지·등록말소"), ("등록말소", "영업정지·등록말소"),  # 허위·과징금보다 먼저 (처분이 핵심)
    ("담합", "입찰담합"), ("collusion", "입찰담합"), ("bid rigging", "입찰담합"),
    ("뇌물", "뇌물·부패"), ("brib", "뇌물·부패"), ("corruption", "뇌물·부패"), ("korupsi", "뇌물·부패"), ("suap", "뇌물·부패"),
    ("횡령", "횡령·배임"), ("배임", "횡령·배임"), ("허위", "사기·허위서류"), ("fraud", "사기·허위서류"),
    ("과징금", "과징금·행정처분"), ("공정위", "과징금·행정처분"),
    ("압수수색", "수사·기소"), ("기소", "수사·기소"), ("구속", "수사·기소"), ("tersangka", "수사·기소"),
    ("회생", "부도·회생·재무악화"), ("법정관리", "부도·회생·재무악화"), ("부도", "부도·회생·재무악화"),
    ("중대재해", "중대재해·부실시공"), ("부실시공", "중대재해·부실시공"), ("소송", "소송·분쟁"),
]


# 키워드가 다른 단어의 일부로 들어간 경우 (예: '정부도' 안의 '부도', '재해석' 안의 '재해')
_FALSE_COMPOUNDS = re.compile("정부도|부도덕|부도체|부도심|재해석|구속력|불기소|무혐의|위반하지 않|제재를 피|제재 대상이 아니")


# AI를 쓸 수 없을 때만 쓰는 예비 등급 기준 (화면에는 안 보임). 설정의 '추가 키워드'는 여기 없으면 주의로 봄
RULE_KEYWORDS = [
    ("부정당", "red"), ("입찰참가자격", "red"), ("참가자격제한", "red"), ("입찰참가제한", "red"), ("입찰제한", "red"),
    ("입찰 참가 제한", "red"), ("영업정지", "red"), ("debar", "red"),
    ("회생절차", "orange"), ("법정관리", "orange"), ("부도", "orange"), ("담합", "orange"), ("과징금", "orange"),
    ("압수수색", "orange"), ("기소", "orange"), ("구속", "orange"), ("뇌물", "orange"), ("횡령", "orange"),
    ("배임", "orange"), ("허위", "orange"), ("공정위", "orange"), ("제재", "orange"), ("등록말소", "orange"),
    ("sanction", "orange"), ("bribery", "orange"), ("corruption", "orange"), ("fraud", "orange"), ("collusion", "orange"),
    ("bid rigging", "orange"), ("korupsi", "orange"), ("tersangka", "orange"), ("suap", "orange"),
    ("의혹", "yellow"), ("고발", "yellow"), ("벌점", "yellow"), ("시정명령", "yellow"), ("중대재해", "yellow"),
    ("부실시공", "yellow"), ("소송", "yellow"), ("재해", "yellow"), ("위반", "yellow"),
]


def build_keywords(docs: list[dict]) -> list[dict]:
    """설정의 추가 키워드(docs) + 예비 등급 기준을 합친 목록. user=True 는 매일 검색어로 쓰는 추가 키워드."""
    rule = {w: lv for w, lv in RULE_KEYWORDS}
    out, seen = [], set()
    for d in docs or []:
        w = (d.get("word") or "").strip()
        if not w or w in seen:
            continue
        seen.add(w)
        lang = d.get("lang") or ("ko" if any("\uac00" <= ch <= "\ud7a3" for ch in w) else "en")
        out.append({"word": w, "level": rule.get(w, "yellow"), "lang": lang, "user": True})
    out += [{"word": w, "level": lv, "lang": "ko" if any("\uac00" <= ch <= "\ud7a3" for ch in w) else "en", "user": False}
            for w, lv in RULE_KEYWORDS if w not in seen]
    return out


def kw_hits(text: str, keywords: list[dict]) -> list[dict]:
    t = _FALSE_COMPOUNDS.sub(" ", text.lower())
    return [k for k in keywords if k["word"].lower() in t]


def _rule_based(company: dict, articles: list[dict], keywords: list[dict]) -> list[dict]:
    out = []
    for i, a in enumerate(articles):
        text = f"{a['title']} {a.get('snippet','')}"
        hits = kw_hits(text, keywords)
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


def _claude(company: dict, engagements: list[dict], articles: list[dict], keywords: list[dict], feedback: dict | None = None) -> list[dict]:
    import anthropic

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    profile = {
        "업체명": company["name"],
        "영문명": company.get("name_en") or "",
        "별칭": company.get("aliases") or "",
        "보조키워드(업종·대표자 등)": company.get("context_keywords") or "",
        "대표자": company.get("ceo") or "",
        "국가": company.get("country") or "",
        "참여사업": [f"{e.get('project_name') or '-'} / {e.get('role') or '-'} / {e.get('stage') or '계약'}" for e in engagements],
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
    recent = (feedback or {}).get("recent") or []
    recent_txt = ("[이미 수집된 이 업체 이슈 — 같은 사건이면 same_event_as 에 E번호]\n" + "\n".join(
        f"- E{n + 1}: {r.get('date') or ''} {(r.get('title') or '')[:120]}" + (f" — {r['summary'][:80]}" if r.get("summary") else "")
        for n, r in enumerate(recent)) + "\n\n") if recent else ""
    user = (
        f"오늘 날짜: {date.today().isoformat()}\n\n"
        f"[업체 프로필]\n{json.dumps(profile, ensure_ascii=False, indent=1)}\n\n"
        f"[담당자 관심 키워드]\n{', '.join(k['word'] for k in keywords)}\n\n"
        + _feedback_text(feedback) + recent_txt +
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
        # 같은 사건: 이미 수집된 이슈(E번호) → 그 기록 id, 이번 목록의 다른 기사(숫자) → "idx:N"
        same, same_as = (j.same_event_as or "").strip().upper(), None
        m = re.fullmatch(r"E(\d+)", same)
        if m and 1 <= int(m.group(1)) <= len(recent):
            same_as = recent[int(m.group(1)) - 1]["id"]
        elif same.isdigit() and int(same) != j.idx and 0 <= int(same) < len(articles):
            same_as = f"idx:{int(same)}"
        out.append(
            {
                "idx": j.idx,
                "relevant": 1 if relevant else 0,
                "level": j.risk_level if j.is_about_company else "none",
                "category": j.category,
                "summary": j.summary_ko,
                "rationale": j.rationale + (f" (사건일: {j.event_date})" if j.event_date else ""),
                "analyzer": "claude",
                "same_as": same_as,
            }
        )
    return out


def _feedback_text(feedback: dict | None) -> str:
    """담당자가 대시보드에서 '관련 없음' / '확인했음'으로 처리한 기사를 판정 예시로 제공 (사용할수록 정확해지도록)"""
    if not feedback:
        return ""
    parts = []
    if feedback.get("dismissed"):
        parts.append("[담당자가 '관련 없음'으로 표시한 기사 — 이와 같은 유형(동명이인·다른 회사·단순 언급·무관한 문맥)은 관련 없음으로 판정]\n"
                     + "\n".join(f"- {t}" for t in feedback["dismissed"]))
    if feedback.get("confirmed"):
        parts.append("[담당자가 '확인했음'(실제 이 업체의 리스크)으로 표시한 기사 — 이와 같은 유형은 관련 있음]\n"
                     + "\n".join(f"- {t}" for t in feedback["confirmed"]))
    return "\n\n".join(parts) + "\n\n"


def check() -> None:
    """스캔 시작 때 Claude 키·크레딧을 아주 짧은 호출로 한 번 확인 (새 기사가 없어도 상태가 정확히 표시되도록)"""
    global CLAUDE_ERROR
    if not config.ANTHROPIC_API_KEY:
        return
    try:
        import anthropic
        anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY).messages.create(
            model=config.CLAUDE_MODEL, max_tokens=16, output_config={"effort": "low"}, messages=[{"role": "user", "content": "ping"}])
    except Exception as e:
        log.warning("Claude 연결 확인 실패: %r", e)
        CLAUDE_ERROR = str(e)


def analyze(company: dict, engagements: list[dict], articles: list[dict], keywords: list[dict], feedback: dict | None = None) -> tuple[list[dict], str]:
    """returns (judgements, analyzer_used)"""
    if not articles:
        return [], "-"
    global CLAUDE_ERROR
    # 크레딧 부족·키 오류는 업체마다 다시 시도해도 같으므로 바로 규칙 판정
    if config.ANTHROPIC_API_KEY and not (CLAUDE_ERROR and any(w in CLAUDE_ERROR for w in ("credit", "authentication", "invalid x-api-key", "permission"))):
        try:
            results = []
            for start in range(0, len(articles), 25):  # 25건씩 나눠 판정
                chunk = articles[start : start + 25]
                for r in _claude(company, engagements, chunk, keywords, feedback):
                    r["idx"] += start
                    if str(r.get("same_as") or "").startswith("idx:"):
                        r["same_as"] = f"idx:{int(r['same_as'][4:]) + start}"
                    results.append(r)
            return results, "claude"
        except Exception as e:
            log.warning("Claude 분석 실패 → 규칙 기반으로 대체: %r", e)
            CLAUDE_ERROR = str(e)
    return _rule_based(company, articles, keywords), "rule"
