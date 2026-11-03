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
from ..textutil import norm

_master: dict | None = None
_master_lock = __import__("threading").Lock()


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


def load_master() -> dict:
    """기업목록 색인 {정규화된 이름: [[고유번호, 이름, 영문명, 종목코드], ...]}
    저장소의 data/corp_master.json을 쓰고, 없으면 DART에서 내려받는다."""
    global _master
    with _master_lock:  # 여러 업체를 동시에 처리하므로 한 번만 내려받도록
        if _master is None:
            if not config.CORP_MASTER_PATH.exists():
                sync_corp_master()
            idx: dict = {}
            for r in json.loads(config.CORP_MASTER_PATH.read_text(encoding="utf-8")):
                idx.setdefault(norm(r[1]), []).append(r)
            _master = idx
    return _master


def match_by_name(name: str) -> tuple[list, list]:
    """업체명 정확 일치(법인표기·공백 무시) 후보. (후보 목록, 상장사 후보)"""
    target = norm(name)
    if len(target) < 2:
        return [], []
    cands = load_master().get(target, [])
    return cands, [r for r in cands if r[3]]
