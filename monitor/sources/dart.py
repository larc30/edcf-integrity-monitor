"""DART 기업 목록 / 기업개황

- sync_corp_master(): 전체 기업 고유번호 목록을 data/corp_master.json 으로 저장 (웹페이지 자동완성용, 공개 데이터)
- company_detail(): 대표자·사업자번호·영문명 (스캔 시 업체 정보 자동 보강)
"""
import io
import json
import xml.etree.ElementTree as ET
import zipfile

import httpx

from .. import config


def sync_corp_master() -> int:
    if not config.DART_API_KEY:
        raise RuntimeError("DART_API_KEY 가 설정되지 않았습니다.")
    r = httpx.get(
        "https://opendart.fss.or.kr/api/corpCode.xml",
        params={"crtfc_key": config.DART_API_KEY},
        timeout=180,
    )
    r.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    root = ET.fromstring(zf.read(zf.namelist()[0]))
    rows = []
    for el in root.iter("list"):
        code = (el.findtext("corp_code") or "").strip()
        name = (el.findtext("corp_name") or "").strip()
        if code and name:
            rows.append([code, name, (el.findtext("corp_eng_name") or "").strip(), (el.findtext("stock_code") or "").strip()])
    config.CORP_MASTER_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.CORP_MASTER_PATH.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(rows)


def company_detail(corp_code: str) -> dict:
    if not (config.DART_API_KEY and corp_code):
        return {}
    r = httpx.get(
        "https://opendart.fss.or.kr/api/company.json",
        params={"crtfc_key": config.DART_API_KEY, "corp_code": corp_code},
        timeout=20,
    )
    r.raise_for_status()
    d = r.json()
    if d.get("status") != "000":
        return {}
    return {"name_en": d.get("corp_name_eng") or "", "ceo": d.get("ceo_nm") or "", "biz_no": d.get("bizr_no") or ""}
