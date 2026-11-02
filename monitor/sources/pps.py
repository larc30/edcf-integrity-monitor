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


def sanctions(company: dict) -> list[dict]:
    """현재 유효한 부정당제재 → findings 형식"""
    bizno = biz_digits(company.get("biz_no"))
    out = []
    for it in _call("getUnptRsttCorpInfo02", {"inqryDiv": "1", "bizno": bizno}):
        corp = it.get("corpNm") or company["name"]
        bgn, end = it.get("rsttBgnDate", ""), it.get("rsttEndDate", "")
        instt = it.get("insttNm", "")
        law = " ".join(x for x in [it.get("lawordNm", ""), it.get("lawordArtclClause", "")] if x)
        status = it.get("rsttProgrsNm", "")
        out.append(
            {
                "source_type": "official",
                "source_name": "조달청 나라장터 부정당제재",
                "title": f"[조달청 부정당제재] {corp} — {instt} · {bgn} ~ {end}",
                "url": "https://www.g2b.go.kr",
                "published_at": (bgn or "")[:10],
                "snippet": f"사업자번호 {bizno} / 제재기간 {bgn} ~ {end} / 통보기관 {instt} / 근거 {law or '-'} / 상태 {status or '-'}",
                "matched_keywords": "사업자번호 조회",
                "level": "red",
                "category": "부정당업자 제재",
                "summary": f"{instt or '수요기관'}이(가) 통보한 부정당업자 제재(입찰참가자격 제한)가 현재 유효합니다. 기간 {bgn} ~ {end}. 근거: {law or '-'}.",
                "rationale": "조달청 나라장터 공식 데이터 (조회 시점 유효 제재)",
                "analyzer": "list-match",
                "dedup_key": "pps-" + hashlib.sha1(f"{bizno}|{bgn}|{end}|{instt}".encode()).hexdigest()[:16],
            }
        )
    return out
