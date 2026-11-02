"""일일 리포트 (HTML 메일) 생성 및 발송 — Firestore 기반"""
import html
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from . import config, store
from .analyzer import LEVEL_ORDER

COLORS = {
    "red": ("#B42318", "#FEE4E2", "위험"),
    "orange": ("#B54708", "#FEF0C7", "경고"),
    "yellow": ("#854D0E", "#FEF9C3", "주의"),
    "none": ("#067647", "#DCFAE6", "정상"),
}
E = html.escape


def load_overview() -> tuple[list[dict], list[dict], dict]:
    """(companies with risk, active findings, engagements_by_company)"""
    projects = {p["id"]: p for p in store.all_docs("projects")}
    companies = store.all_docs("companies")
    finds = [f for f in store.where("findings", "relevant", "==", True) if f.get("status") != "dismissed"]
    engs = {}
    for c in companies:
        c["engagements"] = [
            {**e, "project_name": projects.get(e.get("project_id"), {}).get("name", "(삭제된 사업)")}
            for e in c.get("engagements") or []
        ]
        engs[c["id"]] = c["engagements"]
        fs = [f for f in finds if f["company_id"] == c["id"]]
        c["counts"] = {lv: sum(1 for f in fs if f.get("level") == lv) for lv in ("red", "orange", "yellow")}
        c["unreviewed"] = sum(1 for f in fs if f.get("status") == "new")
        top = max((f.get("level") for f in fs), key=lambda l: LEVEL_ORDER.get(l, 0), default="none")
        c["risk"] = top if LEVEL_ORDER.get(top, 0) > 0 else "none"
    companies.sort(key=lambda c: (-LEVEL_ORDER.get(c["risk"], 0), -c["unreviewed"], c["name"]))
    return companies, finds, engs


def _badge(level: str) -> str:
    fg, bg, label = COLORS.get(level or "none", COLORS["none"])
    return (
        f'<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;'
        f'font-weight:700;color:{fg};background:{bg};">{label}</span>'
    )


def _eng_text(engs: list[dict]) -> str:
    return "<br>".join(
        f"{E(e['project_name'])} · {E(e['role'])} · {E(e['stage'])}{' ' + str(e['rank']) + '순위' if e.get('rank') else ''}"
        for e in engs
    ) or "-"


def build() -> tuple[str, str, list[str]]:
    """returns (subject, html, finding_ids_included)"""
    today = store.now_kst().strftime("%Y-%m-%d")
    overview, finds, engs = load_overview()
    new = [f for f in finds if not f.get("reported_at") and f.get("level") in ("red", "orange", "yellow")]
    new.sort(key=lambda f: (-LEVEL_ORDER.get(f.get("level"), 0), f.get("company_name", "")))

    n_red = sum(1 for c in overview if c["risk"] == "red")
    n_org = sum(1 for c in overview if c["risk"] == "orange")
    n_yel = sum(1 for c in overview if c["risk"] == "yellow")
    new_red = sum(1 for f in new if f["level"] == "red")
    subject = f"[EDCF 업체 모니터링] {today} 신규 {len(new)}건" + (f" (위험 {new_red}건)" if new_red else "")

    def kpi(label, value, color="#101828"):
        return (
            f'<td style="padding:12px 16px;border:1px solid #EAECF0;border-radius:8px;background:#fff;">'
            f'<div style="font-size:12px;color:#667085;">{label}</div>'
            f'<div style="font-size:22px;font-weight:700;color:{color};">{value}</div></td>'
        )

    items = []
    for f in new:
        src_link = (
            f'<a href="{E(f["url"])}" style="color:#1D4ED8;">원문 보기</a>' if f.get("url") else ""
        )
        items.append(
            f"""
<tr><td style="padding:14px 16px;border-bottom:1px solid #EAECF0;">
  <div>{_badge(f['level'])} <b style="font-size:15px;">{E(f['company_name'])}</b>
       <span style="color:#667085;font-size:12px;"> · {E(f.get('category') or '')}</span></div>
  <div style="font-size:12px;color:#475467;margin:4px 0;">관련 사업: {_eng_text(engs.get(f['company_id'], []))}</div>
  <div style="font-size:14px;margin:6px 0;color:#101828;">{E(f.get('summary') or f.get('title') or '')}</div>
  <div style="font-size:12px;color:#667085;">판단 근거: {E(f.get('rationale') or '-')}</div>
  <div style="font-size:12px;color:#667085;margin-top:6px;padding:6px 8px;background:#F9FAFB;border-left:3px solid #D0D5DD;">
    출처: {E(f.get('source_name') or '-')} · {E(f.get('published_at') or '날짜 미상')}<br>
    「{E(f.get('title') or '')}」 {src_link}
  </div>
</td></tr>"""
        )
    if not items:
        items.append('<tr><td style="padding:16px;color:#667085;">신규로 확인된 리스크 신호가 없습니다.</td></tr>')

    rows = []
    for c in overview:
        rows.append(
            f"""<tr>
<td style="padding:8px;border-bottom:1px solid #EAECF0;">{_badge(c['risk'])}</td>
<td style="padding:8px;border-bottom:1px solid #EAECF0;font-weight:600;">{E(c['name'])}</td>
<td style="padding:8px;border-bottom:1px solid #EAECF0;font-size:12px;color:#475467;">{_eng_text(c['engagements'])}</td>
<td style="padding:8px;border-bottom:1px solid #EAECF0;text-align:center;">{c['counts']['red']}/{c['counts']['orange']}/{c['counts']['yellow']}</td>
<td style="padding:8px;border-bottom:1px solid #EAECF0;text-align:center;">{c['unreviewed']}</td>
</tr>"""
        )

    body = f"""<!doctype html><html><body style="margin:0;background:#F2F4F7;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#101828;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;">
<tr><td style="background:#0B3B6F;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0;">
  <div style="font-size:12px;opacity:.8;">EDCF 조달 청렴성 사전 모니터링</div>
  <div style="font-size:20px;font-weight:700;margin-top:4px;">부정당업자 모니터링 일일 리포트 · {today}</div>
</td></tr>
<tr><td style="background:#fff;padding:16px 24px;">
  <table cellpadding="0" cellspacing="8" width="100%"><tr>
    {kpi('모니터링 업체', len(overview))}
    {kpi('위험 업체', n_red, COLORS['red'][0])}
    {kpi('경고 업체', n_org, COLORS['orange'][0])}
    {kpi('주의 업체', n_yel, COLORS['yellow'][0])}
    {kpi('신규 이슈', len(new), '#0B3B6F')}
  </tr></table>
</td></tr>
<tr><td style="background:#fff;padding:8px 24px 0;"><h3 style="margin:8px 0;font-size:16px;">1. 신규 리스크 신호</h3></td></tr>
<tr><td style="background:#fff;padding:0 24px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EAECF0;border-radius:8px;">{''.join(items)}</table></td></tr>
<tr><td style="background:#fff;padding:16px 24px 0;"><h3 style="margin:8px 0;font-size:16px;">2. 업체별 현황</h3></td></tr>
<tr><td style="background:#fff;padding:0 24px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border:1px solid #EAECF0;">
<tr style="background:#F9FAFB;color:#475467;font-size:12px;"><th style="padding:8px;text-align:left;">등급</th><th style="padding:8px;text-align:left;">업체</th><th style="padding:8px;text-align:left;">사업 · 역할 · 단계</th><th style="padding:8px;">위험/경고/주의</th><th style="padding:8px;">미검토</th></tr>
{''.join(rows)}
</table></td></tr>
<tr><td style="background:#fff;padding:12px 24px 20px;border-radius:0 0 10px 10px;font-size:12px;color:#667085;">
  <a href="{E(config.DASHBOARD_URL)}" style="color:#1D4ED8;font-weight:600;">대시보드에서 상세 보기 →</a><br><br>
  ※ 본 리포트의 뉴스 기반 항목은 '제재 확정'이 아닌 '검토 필요 신호'입니다. 반드시 원문과 공식 자료(나라장터, 각 MDB 제재 리스트)로 확인하시기 바랍니다.<br>
  데이터: 네이버 뉴스 검색 API, Google News, OpenSanctions(World Bank·ADB·AfDB·IDB·EBRD 제재 리스트), 조달청 부정당제재 정보
</td></tr>
</table></td></tr></table></body></html>"""
    return subject, body, [f["id"] for f in new]


def save_preview() -> dict:
    subject, body, ids = build()
    store.update("meta", "report_preview", {"subject": subject, "html": body, "items": len(ids), "generated_at": store.now_str()})
    return {"subject": subject, "items": len(ids)}


def send(to_override: str | None = None) -> dict:
    subject, body, ids = build()
    if to_override:
        recipients = [to_override]
    else:
        recipients = [r["email"] for r in store.all_docs("recipients") if r.get("active", True)]
    if not recipients:
        raise RuntimeError("수신자가 없습니다. 대시보드 > 관리자 > 메일 수신자에서 추가하세요.")
    if not (config.SMTP_USER and config.SMTP_PASSWORD):
        raise RuntimeError("SMTP_USER / SMTP_PASSWORD Secret이 설정되지 않았습니다.")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = ("[테스트] " if to_override else "") + subject
    msg["From"] = config.MAIL_FROM
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(body, "html", "utf-8"))
    with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=30) as s:
        s.starttls()
        s.login(config.SMTP_USER, config.SMTP_PASSWORD)
        s.sendmail(config.MAIL_FROM, recipients, msg.as_string())

    if not to_override:  # 테스트 발송은 '보고됨' 처리하지 않음
        now = store.now_str()
        batch = store.db().batch()
        for i, fid in enumerate(ids, 1):
            batch.update(store.db().collection("findings").document(fid), {"reported_at": now})
            if i % 400 == 0:
                batch.commit()
                batch = store.db().batch()
        batch.commit()
    result = {"to": recipients, "items": len(ids), "subject": subject, "test": bool(to_override)}
    store.log_run("report", True, result)
    save_preview()
    return result
