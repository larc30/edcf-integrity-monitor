"""조달청 나라장터 사용자정보 서비스 (공공데이터포털 15129466)

- 부정당제재 조회(getUnptRsttCorpInfo02): 사업자등록번호로 '조회 시점에 유효한' 제재만 반환.
  만료·해제된 과거 제재 이력은 제공하지 않는다.
- 조달업체 기본정보(getPrcrmntCorpBasicInfo02): 영문업체명·대표자명 보강용.
- 업체명으로 사업자번호를 찾는 기능은 이 API에 없다 → 사업자번호는 DART 자동매칭 또는 직접 입력.

인증키는 공공데이터포털의 'Decoding' 키를 쓴다(Encoding 키를 넣어도 자동으로 풀어서 사용).
"""
import hashlib
import re
from urllib.parse import unquote

import httpx

from .. import config

BASE = config.PPS_BASE_URL


def enabled() -> bool:
    return bool(config.DATA_GO_KR_KEY)


def _key() -> str:
    k = config.DATA_GO_KR_KEY
    return unquote(k) if "%" in k else k


def biz_digits(s: str | None) -> str:
    return re.sub(r"\D", "", s or "")


def _call(op: str, params: dict) -> list[dict]:
    r = httpx.get(
        f"{BASE}/{op}",
        params={"serviceKey": _key(), "type": "json", "numOfRows": 100, "pageNo": 1, **params},
        timeout=30,
    )
    r.raise_for_status()
    try:
        data = r.json()
    except ValueError:
        # 인증 오류 등은 XML로 올 때가 있다
        m = re.search(r"<returnAuthMsg>(.*?)</returnAuthMsg>|<resultMsg>(.*?)</resultMsg>", r.text)
        raise RuntimeError(f"조달청 API 오류: {(m and (m.group(1) or m.group(2))) or r.text[:200]}")
    resp = data.get("response", data)
    header = resp.get("header") or {}
    code = str(header.get("resultCode", "00"))
    if code not in ("00", "0", "000"):
        hint = " (공공데이터포털에서 '나라장터 사용자정보 서비스' 활용신청·Decoding 키 확인)" if code == "30" else ""
        raise RuntimeError(f"조달청 API 오류 {code}: {header.get('resultMsg', '')}{hint}")
    items = (resp.get("body") or {}).get("items") or []
    if isinstance(items, dict):
        items = items.get("item") or []
    if isinstance(items, dict):
        items = [items]
    return items


def basic_info(bizno: str) -> dict:
    items = _call("getPrcrmntCorpBasicInfo02", {"inqryDiv": "3", "bizno": biz_digits(bizno)})
    return items[0] if items else {}


_STOP_WORDS = ("정지", "해제", "취소", "집행정지", "효력정지")
_RSTT_NO = re.compile(r"[A-Z]\d{2}[A-Z]{2}\d{6,}")  # 부정당번호 예: R26UF00002196 (/차수 는 뗌)


def _is_stopped(it: dict) -> bool:
    txt = " ".join(str(it.get(k) or "") for k in ("rsttProgrsNm", "rsttDivNm", "rsttSeNm", "rsttRsn", "rmrk"))
    return any(w in txt for w in _STOP_WORDS)


def _group_key(it: dict) -> str:
    for v in it.values():
        m = _RSTT_NO.search(str(v or ""))
        if m:
            return m.group(0)
    return it.get("insttNm") or "-"


def sanctions(company: dict) -> list[dict]:
    """현재 유효한 부정당제재 → findings 형식"""
    bizno = biz_digits(company.get("biz_no"))
    items = _call("getUnptRsttCorpInfo02", {"inqryDiv": "1", "bizno": bizno})
    # 같은 제재가 차수별로 여러 줄일 수 있음 (예: 1차 '제재' → 2차 '제재정지'(법원 집행정지)).
    # 같은 제재 번호(없으면 같은 통보기관) 안에 정지·해제·취소 줄이 하나라도 있으면 그 제재 전체를 '확인 필요'로 봄
    groups_stop = {}
    for it in items:
        g = _group_key(it)
        groups_stop[g] = groups_stop.get(g, False) or _is_stopped(it)
    out = []
    for it in items:
        corp = it.get("corpNm") or company["name"]
        bgn, end = it.get("rsttBgnDate", ""), it.get("rsttEndDate", "")
        instt = it.get("insttNm", "")
        law = " ".join(x for x in [it.get("lawordNm", ""), it.get("lawordArtclClause", "")] if x)
        status = it.get("rsttProgrsNm", "")
        # 매뉴얼: 조회돼도 '제재정지(집행정지)' 상태일 수 있음 → 위험이 아니라 확인 필요
        suspended = groups_stop.get(_group_key(it), False)
        if suspended and not _is_stopped(it):
            status = (status + " → 이후 차수에서 정지·해제" if status else "이후 차수에서 정지·해제")
        out.append(
            {
                "source_type": "official",
                "source_name": "조달청 나라장터 부정당제재",
                "title": f"[조달청 부정당제재] {corp} — {instt} · {bgn} ~ {end}",
                "url": "https://www.g2b.go.kr",
                "published_at": (bgn or "")[:10],
                "snippet": f"사업자번호 {bizno} / 제재기간 {bgn} ~ {end} / 통보기관 {instt} / 근거 {law or '-'} / 상태 {status or '-'}",
                "matched_keywords": "사업자번호 조회",
                "level": "orange" if suspended else "red",
                "category": "부정당업자 제재",
                "summary": (f"나라장터에 부정당업자 제재가 조회되나 상태가 '{status}'입니다(집행정지 등). 상세정보·집행정지 조회로 현황 확인 필요. 기간 {bgn} ~ {end}." if suspended
                            else "※ 법원 집행정지가 나면 나라장터 '부정당제재 이력'에 '제재정지' 줄이 생깁니다 — 계약 전 한 번 확인. " + f"{instt or '수요기관'}이(가) 통보한 부정당업자 제재(입찰참가자격 제한)가 현재 유효합니다. 기간 {bgn} ~ {end}. 근거: {law or '-'}."),
                "rationale": "조달청 나라장터 공식 데이터 (조회 시점 유효 제재)",
                "analyzer": "list-match",
                "rstt_end": end,
                "dedup_key": "pps-" + hashlib.sha1(f"{bizno}|{bgn}|{end}|{instt}".encode()).hexdigest()[:16],
            }
        )
    return out
