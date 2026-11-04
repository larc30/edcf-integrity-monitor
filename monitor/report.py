"""일일 리포트 (HTML 메일) 생성 및 발송 — Firestore 기반"""
import html
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from . import config, grouping, store
from .analyzer import LEVEL_ORDER

# GitHub(Primer) 색상 — 대시보드와 같은 톤
COLORS = {
    "red": ("#d1242f", "#ffebe9", "위험"),
    "orange": ("#bc4c00", "#fff1e5", "경고"),
    "yellow": ("#9a6700", "#fff8c5", "주의"),
    "none": ("#1a7f37", "#dafbe1", "정상"),
}
TEXT, MUTED, LINE, SOFT, BG2, LINK = "#1f2328", "#59636e", "#d1d9e0", "#eaeef2", "#f6f8fa", "#0969da"
E = html.escape
ROLE_ORDER = {"F/S": 0, "컨설턴트": 1, "본구매": 2}  # 사업 진행 순서


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
        c["unreviewed"] = len(grouping.group([f for f in fs if f.get("status") == "new"]))  # 같은 이슈는 1건으로
        top = max((f.get("level") for f in fs), key=lambda l: LEVEL_ORDER.get(l, 0), default="none")
        c["risk"] = top if LEVEL_ORDER.get(top, 0) > 0 else "none"
    companies.sort(key=lambda c: (-LEVEL_ORDER.get(c["risk"], 0), -c["unreviewed"], c["name"]))
    return companies, finds, engs


def _badge(level: str) -> str:
    fg, bg, label = COLORS.get(level or "none", COLORS["none"])
    return (
        f'<span style="display:inline-block;padding:0 8px;border-radius:999px;font-size:12px;line-height:20px;'
        f'font-weight:600;color:{fg};background:{bg};border:1px solid {fg}33;">{label}</span>'
    )


def _eng_text(engs: list[dict]) -> str:
    return "<br>".join(
        f"{E(e['project_name'])} · {E(e['role'])} · {E(e['stage'])}{' ' + str(e['rank']) + '순위' if e.get('rank') else ''}"
        for e in sorted(engs, key=lambda e: ROLE_ORDER.get(e.get("role"), 9))
    ) or "EDCF 주요 업체 (사업 미연결)"


def build() -> tuple[str, str, list[str]]:
    """returns (subject, html, finding_ids_included)"""
    today = store.now_kst().strftime("%Y-%m-%d")
    overview, finds, engs = load_overview()
    new = [f for f in finds if not f.get("reported_at") and f.get("level") in ("red", "orange", "yellow")]
    # 같은 기사·같은 사건은 한 묶음으로 (대표 1건 + '같은 내용 N건'), 묶음 안 기록은 모두 '보고됨' 처리
    groups = grouping.group(new)

    n_red = sum(1 for c in overview if c["risk"] == "red")
    n_org = sum(1 for c in overview if c["risk"] == "orange")
    n_yel = sum(1 for c in overview if c["risk"] == "yellow")
    new_red = sum(1 for g in groups if g[0]["level"] == "red")
    subject = f"[EDCF 부정당업자 자동감지] {today} 신규 {len(groups)}건" + (f" (위험 {new_red}건)" if new_red else "")

    def kpi(label, value, color=TEXT, last=False):
        return (
            f'<td width="20%" style="padding:12px 14px;{"" if last else f"border-right:1px solid {LINE};"}vertical-align:top;">'
            f'<div style="font-size:12px;color:{MUTED};">{label}</div>'
            f'<div style="font-size:24px;font-weight:600;color:{color};line-height:1.3;">{value}</div></td>'
        )

    def section(title, note=""):
        note_html = f' <span style="font-size:12px;font-weight:400;color:{MUTED};">{note}</span>' if note else ""
        return f'<tr><td style="padding:20px 24px 8px;"><div style="font-size:16px;font-weight:600;color:{TEXT};">{title}{note_html}</div></td></tr>'

    # 최근 30일 기사·공식 기록은 자세히, 그보다 오래된 과거 이력은 짧게
    cutoff = (store.now_kst().date() - __import__("datetime").timedelta(days=30)).isoformat()
    is_recent = lambda f: f.get("source_type") != "news" or not f.get("published_at") or f["published_at"] >= cutoff
    recent = [g for g in groups if any(is_recent(f) for f in g)]
    older = [g for g in groups if g not in recent]

    def eng_lines(g):
        names = grouping.companies_of(g)
        if len(names) == 1:
            return _eng_text(engs.get(g[0]["company_id"], []))
        ids = list(dict.fromkeys(f["company_id"] for f in g))
        return " / ".join(f"{E(n)}: {_eng_text(engs.get(i, []))}" for n, i in zip(names, ids))

    def dup_html(g):
        if len(g) < 2:
            return ""
        links = " · ".join(
            (f'<a href="{E(x["url"])}" style="color:{LINK};text-decoration:none;">{E(x.get("source_name") or "원문")}</a>' if x.get("url") else E(x.get("source_name") or "-"))
            + (f' {E(x.get("published_at") or "")}' if x.get("published_at") else "") for x in g[1:6])
        return (f'<div style="font-size:12px;color:{MUTED};margin-top:4px;">같은 내용 {len(g) - 1}건 더: {links}'
                + (f" 외 {len(g) - 6}건" if len(g) > 6 else "") + "</div>")

    items = []
    for g in recent:
        f = g[0]
        fg = COLORS.get(f.get("level"), COLORS["none"])[0]
        official = f.get("source_type") != "news"
        src_link = f' · <a href="{E(f["url"])}" style="color:{LINK};text-decoration:none;">원문 보기</a>' if f.get("url") else ""
        items.append(f"""
<tr><td style="padding:14px 16px;border-top:1px solid {SOFT};border-left:3px solid {fg};">
  <div>{_badge(f['level'])} <b style="font-size:14px;color:{TEXT};">{E(' · '.join(grouping.companies_of(g)))}</b>
    {f'<span style="font-size:12px;color:{COLORS["red"][0]};border:1px solid {COLORS["red"][0]}55;border-radius:999px;padding:0 7px;">공식 제재 명단</span>' if official else ''}
    <span style="color:{MUTED};font-size:12px;"> {E(f.get('category') or '')}</span></div>
  <div style="font-size:14px;margin:6px 0 4px;color:{TEXT};">{E(f.get('summary') or f.get('title') or '')}</div>
  <div style="font-size:12px;color:{MUTED};">관련 사업: {eng_lines(g)}</div>
  <div style="font-size:12px;color:{MUTED};margin-top:4px;">출처: <b>{E(f.get('source_name') or '-')}</b> · {E(f.get('published_at') or '날짜 미상')}{src_link}<br>「{E(f.get('title') or '')}」</div>
  {dup_html(g)}
</td></tr>""")
    if not items:
        items.append(f'<tr><td style="padding:16px;color:{COLORS["none"][0]};text-align:center;">새로 확인된 리스크 신호가 없습니다</td></tr>')
    older_html = "" if not older else (
        f'<tr><td style="padding:12px 24px 0;"><div style="font-size:13px;font-weight:600;color:{MUTED};">과거 이력 (30일 이전 기사) {len(older)}건</div>'
        f'<ul style="margin:6px 0 0;padding-left:18px;font-size:12px;color:{MUTED};line-height:1.8;">'
        + "".join(f'<li>{_badge(g[0]["level"])} <b style="color:{TEXT};">{E(" · ".join(grouping.companies_of(g)))}</b> · {E(g[0].get("published_at") or "")} · '
                  f'<a href="{E(g[0].get("url") or "")}" style="color:{LINK};text-decoration:none;">{E((g[0].get("title") or "")[:60])}</a>'
                  + (f' <span style="color:{MUTED};">(같은 내용 {len(g) - 1}건 더)</span>' if len(g) > 1 else "") + "</li>" for g in older[:10])
        + (f'<li>외 {len(older) - 10}건은 대시보드에서 확인</li>' if len(older) > 10 else "") + "</ul></td></tr>")

    risky = [c for c in overview if c["risk"] != "none"]
    th = f'padding:8px 10px;text-align:left;font-weight:600;color:{MUTED};font-size:12px;border-bottom:1px solid {LINE};background:{BG2};'
    td = f'padding:8px 10px;border-bottom:1px solid {SOFT};vertical-align:top;'
    rows = "".join(f"""<tr>
<td style="{td}">{_badge(c['risk'])}</td>
<td style="{td}font-weight:600;color:{TEXT};">{E(c['name'])}</td>
<td style="{td}font-size:12px;color:{MUTED};">{_eng_text(c['engagements']) if c['engagements'] else 'EDCF 주요 업체'}</td>
<td style="{td}text-align:center;font-size:12px;">{c['counts']['red']} / {c['counts']['orange']} / {c['counts']['yellow']}</td>
<td style="{td}text-align:center;font-size:12px;">{c['unreviewed']}</td></tr>""" for c in risky) or (
        f'<tr><td colspan="5" style="padding:14px;text-align:center;color:{COLORS["none"][0]};">리스크 업체가 없습니다</td></tr>')
    weekday = "월화수목금토일"[store.now_kst().weekday()]

    body = f"""<!doctype html><html><body style="margin:0;background:{BG2};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:{TEXT};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:{BG2};"><tr><td align="center" style="padding:24px 12px;">
<table width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#ffffff;border:1px solid {LINE};border-radius:6px;">
<tr><td style="padding:16px 24px;border-bottom:1px solid {LINE};background:{BG2};border-radius:6px 6px 0 0;">
  <table cellpadding="0" cellspacing="0"><tr>
    <td style="width:32px;height:32px;background:{TEXT};border-radius:8px;color:#fff;text-align:center;font-size:16px;font-weight:700;">✓</td>
    <td style="padding-left:10px;font-size:16px;font-weight:600;color:{TEXT};">EDCF 부정당업자 자동감지 시스템</td>
  </tr></table>
</td></tr>
<tr><td style="padding:20px 24px 4px;">
  <div style="font-size:22px;font-weight:600;color:{TEXT};">오늘의 EDCF 업체 리스크</div>
  <div style="font-size:13px;color:{MUTED};margin-top:2px;">{today} ({weekday}) 일일 리포트</div>
</td></tr>
<tr><td style="padding:12px 24px 0;">
  <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid {LINE};border-radius:6px;"><tr>
    {kpi('모니터링 업체', len(overview))}
    {kpi('위험', n_red, COLORS['red'][0])}
    {kpi('경고', n_org, COLORS['orange'][0])}
    {kpi('주의', n_yel, COLORS['yellow'][0])}
    {kpi('신규 이슈', len(groups), TEXT, True)}
  </tr></table>
</td></tr>
{section('새로 발견된 리스크 신호', f'{len(recent)}건')}
<tr><td style="padding:0 24px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid {LINE};border-radius:6px;border-top:0;">{''.join(items)}</table></td></tr>
{older_html}
{section('리스크 업체 현황', f'정상 {len(overview) - len(risky)}곳은 생략')}
<tr><td style="padding:0 24px;">
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border:1px solid {LINE};border-radius:6px;">
<tr><th style="{th}">등급</th><th style="{th}">업체</th><th style="{th}">사업 · 역할 · 단계</th><th style="{th}text-align:center;">위험/경고/주의</th><th style="{th}text-align:center;">미확인</th></tr>
{rows}
</table></td></tr>
<tr><td style="padding:20px 24px;">
  <a href="{E(config.DASHBOARD_URL)}" style="display:inline-block;background:#1f883d;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:6px 16px;border-radius:6px;">대시보드에서 보기</a>
</td></tr>
<tr><td style="padding:12px 24px 20px;border-top:1px solid {LINE};font-size:12px;color:{MUTED};line-height:1.7;">
  뉴스 기반 항목은 '제재 확정'이 아니라 '검토가 필요한 신호'입니다. 원문과 공식 자료(EXIMIIS, 나라장터, 각 MDB 제재 리스트)로 확인하시기 바랍니다.<br>
  데이터: EDCF 부정당업자(EXIMIIS) · 조달청 나라장터 부정당제재 · OpenSanctions(World Bank·ADB·AfDB·IDB·EBRD) · Google 뉴스 · 네이버 뉴스
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
