"""Firestore 저장소 (firebase-admin)

컬렉션
  projects   : {name, country}
  companies  : {name, name_en, aliases, context_keywords, country, search_langs, corp_code, biz_no, ceo, note,
                engagements: [{project_id, role, stage, rank}]}
  findings   : 문서ID = {company_id}_{dedup_key}
  keywords, recipients, runs
  meta/status, meta/report_preview
"""
import json
from datetime import datetime
from zoneinfo import ZoneInfo

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from . import config

_db = None


def db():
    global _db
    if _db is None:
        if not firebase_admin._apps:
            if config.FIREBASE_SERVICE_ACCOUNT:
                cred = credentials.Certificate(json.loads(config.FIREBASE_SERVICE_ACCOUNT))
            else:
                cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
        _db = firestore.client()
    return _db


def now_kst() -> datetime:
    return datetime.now(ZoneInfo(config.TIMEZONE))


def now_str() -> str:
    return now_kst().strftime("%Y-%m-%d %H:%M:%S")


def all_docs(name: str) -> list[dict]:
    return [{"id": d.id, **d.to_dict()} for d in db().collection(name).stream()]


def where(name: str, field: str, op: str, value) -> list[dict]:
    q = db().collection(name).where(filter=FieldFilter(field, op, value))
    return [{"id": d.id, **d.to_dict()} for d in q.stream()]


def known_keys(company_id: str) -> set[str]:
    q = db().collection("findings").where(filter=FieldFilter("company_id", "==", company_id)).select(["dedup_key"])
    return {d.get("dedup_key") for d in q.stream()}


def _finding_doc(company: dict, f: dict) -> tuple[str, dict]:
    doc_id = f"{company['id']}_{f['dedup_key']}".replace("/", "_")[:1400]
    now = now_kst()
    return doc_id, {
        **f,
        "company_id": company["id"],
        "company_name": company["name"],
        "relevant": bool(f.get("relevant", 1)),
        "status": "new",
        "first_seen": now.strftime("%Y-%m-%d %H:%M:%S"),
        "first_seen_ms": int(now.timestamp() * 1000),
        "reported_at": None,
    }


def add_finding(company: dict, f: dict) -> None:
    doc_id, data = _finding_doc(company, f)
    db().collection("findings").document(doc_id).set(data)


def add_findings(company: dict, items: list[dict]) -> None:
    """여러 건을 한 번에 저장 (건별 저장보다 훨씬 빠름)"""
    col = db().collection("findings")
    for i in range(0, len(items), 400):
        batch = db().batch()
        for f in items[i : i + 400]:
            doc_id, data = _finding_doc(company, f)
            batch.set(col.document(doc_id), data)
        batch.commit()


def update_many(name: str, patches: dict[str, dict]) -> None:
    col = db().collection(name)
    ids = list(patches)
    for i in range(0, len(ids), 400):
        batch = db().batch()
        for doc_id in ids[i : i + 400]:
            batch.set(col.document(doc_id), patches[doc_id], merge=True)
        batch.commit()


def delete_many(name: str, ids: list[str]) -> None:
    col = db().collection(name)
    for i in range(0, len(ids), 400):
        batch = db().batch()
        for doc_id in ids[i : i + 400]:
            batch.delete(col.document(doc_id))
        batch.commit()


def update(name: str, doc_id: str, data: dict) -> None:
    db().collection(name).document(doc_id).set(data, merge=True)


def log_run(kind: str, ok: bool, detail: dict) -> None:
    db().collection("runs").add(
        {"kind": kind, "at": now_str(), "at_ms": int(now_kst().timestamp() * 1000), "ok": ok, "detail": detail}
    )
