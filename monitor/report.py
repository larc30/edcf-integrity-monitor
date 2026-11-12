"""일일 리포트 (HTML 메일) 생성 및 발송 — Firestore 기반"""
import datetime
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
    "red": ("#D92D20", "#FDE8E6", "위험"),
    "orange": ("#E2660A", "#FEEFE0", "경고"),
    "yellow": ("#64748B", "#EEF1F5", "참고"),  # 등급 3단계(위험·경고·정상) — yellow 는 참고 이력
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
        c["risk"] = top if top in ("red", "orange") else "none"  # 3단계: 참고(yellow)는 정상
    companies.sort(key=lambda c: (-LEVEL_ORDER.get(c["risk"], 0), -c["unreviewed"], c["name"]))
    return companies, finds, engs


BADGE = {"red": ("#D92D20", "#FFFFFF"), "orange": ("#F57C00", "#2B1400"), "yellow": ("#E2E8F0", "#475569"), "none": ("#E2F4F2", "#0D9488")}  # (배경, 글자) — 대시보드와 같은 꽉 찬 배지


def _badge(level: str) -> str:
    bg, fg = BADGE.get(level or "none", BADGE["none"])
    label = COLORS.get(level or "none", COLORS["none"])[2]
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
    """returns (subject, html, finding_ids_included)
    간단한 메일 (v37, 팀 리뷰): 오늘 새로 확인할 위험·경고만 한 줄씩, 참고 이력·오래된 기사는 건수만, 나머지는 대시보드에서."""
    now = store.now_kst()
    today = now.strftime("%Y-%m-%d")
    overview, finds, engs = load_overview()
    save_history(overview)  # 스캔 뒤 미리보기를 만들 때마다 오늘 숫자를 갱신
    new = [f for f in finds if not f.get("reported_at") and f.get("level") in ("red", "orange", "yellow")]
    # 같은 기사·같은 사건은 한 묶음으로 (대표 1건), 묶음 안 기록은 모두 '보고됨' 처리
    groups = grouping.group(new)
    cutoff = (now.date() - datetime.timedelta(days=30)).isoformat()
    is_recent = lambda f: f.get("source_type") != "news" or not f.get("published_at") or f["published_at"] >= cutoff
    hot = [g for g in groups if g[0].get("level") in ("red", "orange") and any(is_recent(f) for f in g)]
    old_hot = [g for g in groups if g[0].get("level") in ("red", "orange") and g not in hot]
    mild = [g for g in groups if g[0].get("level") not in ("red", "orange")]
    hot.sort(key=lambda g: str(g[0].get("published_at") or ""), reverse=True)  # 최신 먼저
    hot.sort(key=lambda g: (-LEVEL_ORDER.get(g[0].get("level"), 0), g[0].get("source_type") == "news"))  # 위험 → 공식 명단 먼저

    n_red = sum(1 for c in overview if c["risk"] == "red")
    n_org = sum(1 for c in overview if c["risk"] == "orange")
    new_red = sum(1 for g in hot if g[0]["level"] == "red")
    new_org = len(hot) - new_red
    head = " · ".join(t for t in (f"위험 {new_red}" if new_red else "", f"경고 {new_org}" if new_org else "") if t) or "새 위험·경고 없음"
    subject = f"[EDCF RADAR] {now:%m/%d} {head}"

    def eng_line(g):
        ids = list(dict.fromkeys(f["company_id"] for f in g))
        parts = []
        for i in ids[:2]:
            for e in sorted(engs.get(i, []), key=lambda e: ROLE_ORDER.get(e.get("role"), 9))[:2]:
                parts.append(f"{e.get('project_name') or '-'} {e.get('role') or ''}" + (f" {e['rank']}순위" if e.get("rank") else ""))
        return E(" · ".join(parts)) if parts else "사업 미연결"

    MAX = 15
    td = f"border-bottom:1px solid {SOFT};vertical-align:top;"
    lines = []
    for g in hot[:MAX]:
        f = g[0]
        link = f' <a href="{E(f["url"])}" style="color:{LINK};text-decoration:none;">원문</a>' if f.get("url") else ""
        off = " " + _pill("공식 명단", COLORS["red"][0], COLORS["red"][1]) if f.get("source_type") != "news" else ""
        more = f' <span style="color:{MUTED};">· 같은 내용 {len(g) - 1}건</span>' if len(g) > 1 else ""
        lines.append(
            f'<tr><td style="{td}padding:12px 0;width:60px;">{_badge(f["level"])}</td>'
            f'<td style="{td}padding:12px 0 12px 8px;font-size:14px;line-height:1.55;color:{TEXT};">'
            f'<b>{E(" · ".join(grouping.companies_of(g)))}</b>{off}'
            f'<div style="color:{TEXT2};">{E((f.get("summary") or f.get("title") or "")[:110])}{link}{more}</div>'
            f'<div style="font-size:12px;color:{MUTED};">{eng_line(g)} · {E(f.get("published_at") or "날짜 미상")}</div></td></tr>')
    dash = f'<a href="{E(config.DASHBOARD_URL)}" style="color:{LINK};text-decoration:none;font-weight:700;">대시보드</a>'
    if len(hot) > MAX:
        lines.append(f'<tr><td colspan="2" style="padding:10px 0;font-size:13px;color:{TEXT2};">위험·경고 {len(hot) - MAX}건 더 → {dash}</td></tr>')
    if not hot:
        lines.append(f'<tr><td colspan="2" style="padding:18px 0;text-align:center;font-size:14px;color:{COLORS["none"][0]};">오늘 새로 확인할 위험·경고 이슈가 없습니다</td></tr>')
    skipped = " · ".join(t for t in (f"참고 이력 {len(mild)}건" if mild else "", f"30일 지난 기사 {len(old_hot)}건" if old_hot else "") if t)
    skipped_html = (f'<div style="margin-top:14px;background:{BG};border-radius:10px;padding:10px 14px;font-size:13px;color:{TEXT2};">'
                    f'{skipped}은 참고용이라 메일에서 생략했습니다 → {dash}</div>') if skipped else ""
    weekday = "월화수목금토일"[now.weekday()]

    body = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:{BG};font-family:{FONT};color:{TEXT};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:{BG};"><tr><td align="center" style="padding:20px 12px;">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:{PANEL};border:1px solid {LINE};border-radius:14px;">
<tr><td style="background:{NAVY};padding:18px 24px;border-radius:13px 13px 0 0;">
  <div style="font-size:13px;font-weight:800;color:#FFFFFF;">◎ EDCF RADAR <span style="color:#22D3EE;font-weight:700;margin-left:6px;">{today} ({weekday})</span></div>
  <div style="margin-top:8px;font-size:22px;font-weight:800;color:#FFFFFF;line-height:1.3;">오늘 새로 확인할 이슈 <span style="color:#FFB4C2;">{E(head)}</span></div>
  <div style="margin-top:4px;font-size:13px;color:#B3BCCD;">지금 위험 업체 {n_red}곳 · 경고 {n_org}곳 (모니터링 {len(overview)}곳)</div>
</td></tr>
<tr><td style="padding:8px 24px 4px;"><table width="100%" cellpadding="0" cellspacing="0">{''.join(lines)}</table>{skipped_html}</td></tr>
<tr><td style="padding:16px 24px 20px;">
  <a href="{E(config.DASHBOARD_URL)}" style="display:inline-block;background:{ACCENT};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;padding:10px 20px;border-radius:10px;">대시보드에서 보기 →</a>
</td></tr>
<tr><td style="padding:12px 24px 16px;border-top:1px solid {LINE};font-size:12px;color:{MUTED};line-height:1.6;">
  뉴스 항목은 '제재 확정'이 아니라 '검토가 필요한 신호'입니다. 계약 전에는 원문과 공식 자료(EXIMIIS·나라장터·MDB)로 확인하세요.
</td></tr>
</table></td></tr></table></body></html>"""
    body = re.sub(r">\s+<", "><", body)  # 태그 사이 공백 제거 (메일 크기 줄이기)
    return subject, body, [f["id"] for f in new]


def save_history(overview: list[dict]) -> None:
    """오늘 등급별 업체 수를 meta/history.days 에 남김 (최근 60일) — 대시보드의 '어제보다 +N'·30일 추이용"""
    try:
        cnt = {lv: sum(1 for c in overview if c.get("risk") == lv) for lv in ("red", "orange", "none")}
        ref = store.db().collection("meta").document("history")
        snap = ref.get()
        days = (snap.to_dict() or {}).get("days") or {} if snap.exists else {}
        days[store.now_str()[:10]] = cnt
        ref.set({"days": dict(sorted(days.items())[-60:]), "updated_at": store.now_str()})
    except Exception as e:  # 기록 실패가 스캔·메일을 막지 않게
        log.warning("등급 기록 저장 실패: %s", type(e).__name__)


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
