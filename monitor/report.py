"""일일 리포트 (HTML 메일) 생성 및 발송 — Firestore 기반"""
import html
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from . import config, grouping, store
from .analyzer import LEVEL_ORDER

# 대시보드(밝은 화면)와 같은 색·글꼴
FONT = "Pretendard,'Pretendard Variable',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Segoe UI',sans-serif"
COLORS = {  # (글자색, 옅은 배경, 이름)
    "red": ("#E11D48", "#FDE8EE", "위험"),
    "orange": ("#EA580C", "#FDEDE3", "경고"),
    "yellow": ("#A16207", "#FBF3DC", "주의"),
    "none": ("#0D9488", "#E2F4F2", "정상"),
}
TEXT, TEXT2, MUTED, LINE, SOFT, BG, PANEL = "#0B1220", "#3D4A63", "#6B7690", "#E3E7EF", "#EEF1F6", "#F3F5FA", "#FFFFFF"
ACCENT, ACCENT2, NAVY, LINK = "#5B5BF0", "#0891B2", "#0A0F1E", "#5B5BF0"
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
    return (f'<span style="display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;line-height:18px;'
            f'font-weight:700;color:{fg};background:{bg};white-space:nowrap;"><span style="font-size:8px;vertical-align:1px;">●</span> {label}</span>')


def _pill(text: str, fg: str = TEXT2, bg: str = SOFT) -> str:
    return (f'<span style="display:inline-block;padding:1px 8px;border-radius:6px;font-size:12px;line-height:18px;'
            f'font-weight:600;color:{fg};background:{bg};white-space:nowrap;">{E(text)}</span>')


def _eng_text(engs: list[dict]) -> str:
    return "<br>".join(
        f"{E(e.get('project_name') or '-')} · {E(e.get('role') or '-')} · {E(e.get('stage') or '계약')}{' ' + str(e['rank']) + '순위' if e.get('rank') else ''}"
        for e in sorted(engs, key=lambda e: ROLE_ORDER.get(e.get("role"), 9))
    ) or "사업 미연결"


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
    new_org = sum(1 for g in groups if g[0]["level"] == "orange")
    lv_txt = " · ".join(t for t in (f"위험 {new_red}" if new_red else "", f"경고 {new_org}" if new_org else "") if t)
    subject = f"[EDCF 부정당업자 자동감지] {today} 신규 {len(groups)}건" + (f" ({lv_txt})" if lv_txt else "")

    def kpi(label, value, color, unit):
        return (f'<td width="25%" style="padding:0 4px;vertical-align:top;"><div style="border:1px solid {LINE};border-radius:12px;padding:12px 14px;">'
                f'<div style="font-size:12px;color:{MUTED};font-weight:700;">{label}</div>'
                f'<div style="font-size:26px;font-weight:800;color:{color};line-height:1.3;">{value}<span style="font-size:13px;color:{MUTED};font-weight:600;"> {unit}</span></div></div></td>')

    def section(title, note=""):
        note_html = f' <span style="font-size:13px;font-weight:600;color:{MUTED};">{note}</span>' if note else ""
        return f'<tr><td style="padding:24px 28px 10px;background:{PANEL};"><div style="font-size:16px;font-weight:800;color:{TEXT};">{title}{note_html}</div></td></tr>'

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
        return (f'<div style="font-size:12px;color:{MUTED};margin-top:8px;padding-top:8px;border-top:1px dashed {LINE};">'
                f'<b style="color:{ACCENT2};">같은 내용 {len(g) - 1}건 더</b> · {links}' + (f" 외 {len(g) - 6}건" if len(g) > 6 else "") + "</div>")

    # 메일은 핵심만 (메일이 너무 크면 회사 메일에서 뒷부분이 잘려 코드로 보임): 위험·경고만 카드로, 주의는 한 줄 목록, 과거 이력은 건수만
    MAX_HOT, MAX_MILD = 10, 10
    hot = [g for g in recent if g[0].get("level") in ("red", "orange")]
    mild = [g for g in recent if g[0].get("level") not in ("red", "orange")]
    dash = f'<a href="{E(config.DASHBOARD_URL)}" style="color:{LINK};text-decoration:none;font-weight:700;">대시보드</a>'
    note = lambda txt: f'<tr><td style="padding:2px 28px 10px;background:{PANEL};"><div style="background:{BG};border-radius:12px;padding:11px 16px;font-size:13px;color:{TEXT2};">{txt}</div></td></tr>'
    items = []
    for g in hot[:MAX_HOT]:
        f = g[0]
        fg = COLORS.get(f.get("level"), COLORS["none"])[0]
        official = f.get("source_type") != "news"
        src_link = f' · <a href="{E(f["url"])}" style="color:{LINK};text-decoration:none;">원문</a>' if f.get("url") else ""
        tags = (" " + _pill("공식 제재 명단", COLORS["red"][0], COLORS["red"][1]) if official else "") + (" " + _pill(f["category"]) if f.get("category") and f.get("category") != "기타" else "")
        items.append(f"""<tr><td style="padding:0 28px 10px;background:{PANEL};">
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid {LINE};border-left:4px solid {fg};border-radius:12px;"><tr><td style="padding:12px 16px;">
<div>{_badge(f['level'])} <b style="font-size:15px;color:{TEXT};">{E(' · '.join(grouping.companies_of(g)))}</b>{tags}</div>
<div style="font-size:14px;line-height:1.55;color:{TEXT};margin:6px 0 4px;">{E(f.get('summary') or f.get('title') or '')}</div>
<div style="font-size:12px;color:{MUTED};line-height:1.6;">{eng_lines(g)} · {E(f.get('source_name') or '-')} · {E(f.get('published_at') or '날짜 미상')}{src_link}</div>
{dup_html(g)}</td></tr></table></td></tr>""")
    if len(hot) > MAX_HOT:
        items.append(note(f"위험·경고 이슈 <b>{len(hot) - MAX_HOT}건</b>이 더 있습니다 → {dash}에서 확인"))
    if not hot:
        items.append(f'<tr><td style="padding:0 28px 10px;background:{PANEL};"><div style="border:1px dashed {LINE};border-radius:12px;padding:16px;text-align:center;color:{COLORS["none"][0]};font-size:14px;">새로 확인된 위험·경고 이슈가 없습니다</div></td></tr>')
    if mild:
        items.append(f'<tr><td style="padding:6px 28px 0;background:{PANEL};"><div style="background:{BG};border-radius:12px;padding:12px 16px;">'
                     f'<div style="font-size:13px;font-weight:700;color:{TEXT2};">주의 {len(mild)}건</div>'
                     f'<ul style="margin:6px 0 0;padding-left:18px;font-size:13px;color:{MUTED};line-height:1.8;">'
                     + "".join(f'<li><b style="color:{TEXT};">{E(" · ".join(grouping.companies_of(g)))}</b> · '
                               + (f'<a href="{E(g[0]["url"])}" style="color:{LINK};text-decoration:none;">{E((g[0].get("summary") or g[0].get("title") or "")[:70])}</a>' if g[0].get("url") else E((g[0].get("summary") or g[0].get("title") or "")[:70]))
                               + "</li>" for g in mild[:MAX_MILD])
                     + (f"<li>외 {len(mild) - MAX_MILD}건 → {dash}</li>" if len(mild) > MAX_MILD else "") + "</ul></div></td></tr>")
    older_html = note(f"30일 이전 기사(과거 이력) <b>{len(older)}건</b>은 메일에서 생략했습니다 → {dash} '과거 이력'에서 확인") if older else ""

    # 리스크 업체 표는 위험·경고만 (주의는 건수만)
    risky = [c for c in overview if c["risk"] in ("red", "orange")]
    MAX_RISKY = 15
    th = f'padding:9px 12px;text-align:left;font-weight:700;color:{MUTED};font-size:12px;border-bottom:1px solid {LINE};background:{BG};'
    td = f'padding:9px 12px;border-bottom:1px solid {SOFT};vertical-align:top;font-size:13px;color:{TEXT2};'
    rows = "".join(f"""<tr>
<td style="{td}">{_badge(c['risk'])}</td>
<td style="{td}font-weight:700;color:{TEXT};">{E(c['name'])}</td>
<td style="{td}color:{MUTED};">{_eng_text(c['engagements']) if c['engagements'] else '사업 미연결'}</td>
<td style="{td}text-align:center;">{c['unreviewed']}</td></tr>""" for c in risky[:MAX_RISKY]) + (
        f'<tr><td colspan="4" style="padding:10px 12px;font-size:13px;color:{TEXT2};">외 {len(risky) - MAX_RISKY}곳 → {dash}</td></tr>' if len(risky) > MAX_RISKY else "") or (
        f'<tr><td colspan="4" style="padding:16px;text-align:center;color:{COLORS["none"][0]};">위험·경고 업체가 없습니다</td></tr>')
    # 사업별 현황: 사업마다 참여 업체(역할 순 → 사업 안 순서, 맨 위 = 대표사)와 리스크 수
    ROLE_C = {"F/S": "#0E7490", "컨설턴트": "#1D4ED8", "본구매": "#A21CAF"}
    by_p: dict = {}
    for c in overview:
        for e in c["engagements"]:
            by_p.setdefault(e.get("project_id"), {"name": e.get("project_name"), "rows": []})["rows"].append((c, e))
    prow = []
    for pid, pv in sorted(by_p.items(), key=lambda x: x[1]["name"] or ""):
        prs = sorted(pv["rows"], key=lambda r: (ROLE_ORDER.get(r[1].get("role"), 9), r[1].get("order", 1e9), r[0]["name"]))  # (주의: 'rows'는 리스크 업체 표 — 덮어쓰지 말 것)
        k = {lv: len({r[0]["id"] for r in prs if r[0]["risk"] == lv}) for lv in ("red", "orange", "yellow")}
        who = "".join(f'<div><b style="color:{ROLE_C.get(e.get("role"), TEXT2)};font-size:12px;">{E(e.get("role") or "")}</b> {E(c["name"])}'
                      + (f' <span style="color:{MUTED};">({E(e.get("stage"))})</span>' if e.get("stage") and e.get("stage") != "계약" else "")
                      + (f" {_badge(c['risk'])}" if c["risk"] != "none" else "") + "</div>" for c, e in prs)
        risk = " · ".join(f'<b style="color:{COLORS[lv][0]};">{COLORS[lv][2]} {k[lv]}</b>' for lv in ("red", "orange", "yellow") if k[lv]) or f'<span style="color:{COLORS["none"][0]};">이상 없음</span>'
        prow.append(f'<tr><td style="{td}font-weight:700;color:{TEXT};">{E(pv["name"] or "")}</td><td style="{td}">{who}</td><td style="{td}text-align:center;white-space:nowrap;">{risk}</td></tr>')
    proj_html = "" if not prow else (section("사업별 현황", f"{len(prow)}개") + f"""<tr><td style="padding:0 28px;background:{PANEL};">
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid {LINE};border-radius:12px;border-collapse:separate;overflow:hidden;">
<tr><th style="{th}">사업</th><th style="{th}">참여 업체 (역할 · 등급)</th><th style="{th}text-align:center;">리스크</th></tr>{''.join(prow)}</table></td></tr>""")
    weekday = "월화수목금토일"[store.now_kst().weekday()]

    body = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:{BG};font-family:{FONT};color:{TEXT};-webkit-font-smoothing:antialiased;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:{BG};"><tr><td align="center" style="padding:24px 12px;">
<table width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:{PANEL};border:1px solid {LINE};border-radius:16px;">
<tr><td style="background:{NAVY};padding:22px 28px 24px;border-radius:15px 15px 0 0;">
  <table cellpadding="0" cellspacing="0"><tr>
    <td style="width:36px;height:36px;background:{ACCENT};background-image:linear-gradient(135deg,#7C83FF,#22D3EE);border-radius:10px;color:#fff;text-align:center;font-size:17px;font-weight:800;">◎</td>
    <td style="padding-left:12px;font-size:15px;font-weight:800;color:#FFFFFF;">EDCF 부정당업자 자동감지 시스템</td>
  </tr></table>
  <div style="margin-top:18px;font-size:11px;font-weight:800;letter-spacing:.12em;color:#22D3EE;">RISK BRIEFING · {today} ({weekday})</div>
  <div style="margin-top:6px;font-size:26px;font-weight:800;color:#FFFFFF;letter-spacing:-.02em;line-height:1.25;">오늘의 <span style="color:#9AA3FF;">EDCF 업체 리스크</span></div>
  <div style="margin-top:6px;font-size:13px;color:#B3BCCD;">모니터링 업체 {len(overview)}곳 · 새로 확인된 리스크 신호 {len(groups)}건</div>
</td></tr>
<tr><td style="padding:20px 24px 0;background:{PANEL};">
  <table cellpadding="0" cellspacing="0" width="100%"><tr>
    {kpi('위험 업체', n_red, COLORS['red'][0], '곳')}{kpi('경고 업체', n_org, COLORS['orange'][0], '곳')}{kpi('주의 업체', n_yel, COLORS['yellow'][0], '곳')}{kpi('신규 이슈', len(groups), ACCENT, '건')}
  </tr></table>
</td></tr>
{section('새로 발견된 이슈', f'위험·경고 {len(hot)}건 · 주의 {len(mild)}건')}
{''.join(items)}
{older_html}
{section('리스크 업체', f'위험·경고 {len(risky)}곳 · 주의 {n_yel}곳은 대시보드에서')}
<tr><td style="padding:0 28px;background:{PANEL};">
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid {LINE};border-radius:12px;border-collapse:separate;overflow:hidden;">
<tr><th style="{th}">등급</th><th style="{th}">업체</th><th style="{th}">참여 사업 · 역할</th><th style="{th}text-align:center;">미확인</th></tr>
{rows}
</table></td></tr>
{proj_html}
<tr><td style="padding:24px 28px;background:{PANEL};">
  <a href="{E(config.DASHBOARD_URL)}" style="display:inline-block;background:{ACCENT};background-image:linear-gradient(135deg,#5B5BF0,#0891B2);color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;padding:10px 20px;border-radius:10px;">대시보드에서 보기</a>
</td></tr>
<tr><td style="padding:16px 28px 22px;background:{PANEL};border-top:1px solid {LINE};border-radius:0 0 16px 16px;font-size:12px;color:{MUTED};line-height:1.7;">
  뉴스 기반 항목은 '제재 확정'이 아니라 '검토가 필요한 신호'입니다. 원문과 공식 자료(EXIMIIS, 나라장터, 각 MDB 제재 리스트)로 확인하시기 바랍니다.<br>
  데이터: EDCF 부정당업자(EXIMIIS) · 조달청 나라장터 · OpenSanctions(World Bank·ADB·AfDB·IDB·EBRD) · Google 뉴스 · 네이버 뉴스
</td></tr>
</table></td></tr></table></body></html>"""
    body = re.sub(r">\s+<", "><", body)  # 태그 사이 공백 제거 (메일 크기 줄이기)
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
