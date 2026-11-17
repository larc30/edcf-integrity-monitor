"""일일 리포트 (HTML 메일) 생성 및 발송 · Firestore 기반"""
import datetime
import html
import logging
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid

from . import config, grouping, store
from .analyzer import LEVEL_ORDER

log = logging.getLogger("report")

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


def _meta(*names: str) -> dict:
    """meta 문서 몇 개 (없거나 읽기 실패면 빈 값: 메일이 이것 때문에 멈추지 않게)"""
    try:
        got = store.get_many("meta", list(names))
        return {k: (v or {}) for k, v in got.items()}
    except Exception as e:
        log.warning("meta 읽기 실패: %s", type(e).__name__)
        return {n: {} for n in names}


def _src(f: dict) -> str:
    """출처 한 줄: 공식 명단은 명단 이름, 뉴스는 매체명"""
    name = re.sub(r"\s*\((Google News|Naver|네이버|네이버 뉴스)\)\s*$", "", str(f.get("source_name") or "")).strip()
    return name or ("공식 명단" if f.get("source_type") != "news" else "뉴스")


GEO_KO = {"quake": "지진", "storm": "태풍", "flood": "홍수", "volcano": "화산", "fire": "산불", "disease": "감염병", "war": "분쟁", "terror": "테러", "unrest": "시위"}


def build() -> tuple[str, str, list[str]]:
    """returns (subject, html, finding_ids_included)
    일일 메일 (v2, 2026-11-18): 사실만 짧게. 맨 위 요약 한 줄 → 업체 등급(전날 대비) → 오늘 새 이슈(공식 명단 / 뉴스 나눠서, 출처·관련 사업)
    → 수원국 새 공식 경보(GDACS·WHO·USGS) → 수신 안내. 참고 이력·30일 지난 기사는 건수만."""
    now = store.now_kst()
    today = now.strftime("%Y-%m-%d")
    overview, finds, engs = load_overview()
    save_history(overview)  # 스캔 뒤 미리보기를 만들 때마다 오늘 숫자를 갱신
    new = [f for f in finds if not f.get("reported_at") and not f.get("auto_same") and f.get("level") in ("red", "orange", "yellow")]
    groups = grouping.group(new)  # 같은 기사·같은 사건은 한 묶음 (대표 1건), 묶음 안 기록은 모두 '보고됨' 처리
    cutoff = (now.date() - datetime.timedelta(days=30)).isoformat()
    is_recent = lambda f: f.get("source_type") != "news" or not f.get("published_at") or f["published_at"] >= cutoff
    hot = [g for g in groups if g[0].get("level") in ("red", "orange") and any(is_recent(f) for f in g)]
    old_hot = [g for g in groups if g[0].get("level") in ("red", "orange") and g not in hot]
    mild = [g for g in groups if g[0].get("level") not in ("red", "orange")]
    hot.sort(key=lambda g: str(g[0].get("published_at") or ""), reverse=True)
    hot.sort(key=lambda g: -LEVEL_ORDER.get(g[0].get("level"), 0))
    official = [g for g in hot if g[0].get("source_type") != "news"]
    news_g = [g for g in hot if g[0].get("source_type") == "news"]

    n_red = sum(1 for c in overview if c["risk"] == "red")
    n_org = sum(1 for c in overview if c["risk"] == "orange")
    n_ok = len(overview) - n_red - n_org
    new_red = sum(1 for g in hot if g[0]["level"] == "red")
    new_org = len(hot) - new_red
    head = " · ".join(t for t in (f"위험 {new_red}" if new_red else "", f"경고 {new_org}" if new_org else "") if t) or "새 위험·경고 없음"
    subject = f"[EDCF RADAR] {now:%m/%d} {head}"

    meta = _meta("history", "geo", "status")
    # 전날 대비: meta/history 에서 오늘보다 앞선 가장 최근 날
    days = (meta["history"].get("days") or {})
    prev = next((days[d] for d in sorted(days, reverse=True) if d < today), None)
    def delta(lv, n):
        if not prev or lv not in prev:
            return ""
        d = n - int(prev.get(lv) or 0)
        return "" if d == 0 else f' <span style="font-size:12px;font-weight:600;color:{MUTED};">전일 {"+" if d > 0 else "−"}{abs(d)}</span>'
    # 수원국: 지난 24시간 안에 새로 들어온 공식 경보 (GDACS·WHO·USGS)
    since = int((now - datetime.timedelta(hours=24)).timestamp() * 1000)
    geo_new = [e for e in (meta["geo"].get("events") or []) if (e.get("at_ms") or 0) >= since and str(e.get("source") or "").split(" ")[0] in ("GDACS", "WHO", "USGS")]

    def eng_line(g):
        ids = list(dict.fromkeys(f["company_id"] for f in g))
        parts = []
        for i in ids[:2]:
            for e in sorted(engs.get(i, []), key=lambda e: ROLE_ORDER.get(e.get("role"), 9))[:2]:
                parts.append(f"{e.get('project_name') or '-'} ({e.get('role') or '-'}" + (f", {e['rank']}순위" if e.get("rank") else "") + ")")
        return " · ".join(parts) if parts else "사업 미연결"

    MAX = 15
    td = f"border-bottom:1px solid {SOFT};vertical-align:top;"
    lvl = lambda lv: f'<span style="font-weight:800;color:{COLORS[lv][0]};">{COLORS[lv][2]}</span>'

    def rows(gs):
        out = []
        for g in gs:
            f = g[0]
            more = f" · 같은 내용 {len(g) - 1}건" if len(g) > 1 else ""
            link = f' · <a href="{E(f["url"])}" style="color:{LINK};text-decoration:none;">원문</a>' if f.get("url") else ""
            out.append(
                f'<tr><td style="{td}padding:11px 0;width:42px;font-size:13px;">{lvl(f["level"])}</td>'
                f'<td style="{td}padding:11px 0 11px 6px;font-size:14px;line-height:1.55;color:{TEXT};">'
                f'<b>{E(" · ".join(grouping.companies_of(g)))}</b>'
                f'<div style="color:{TEXT2};">{E((f.get("summary") or f.get("title") or "")[:140])}</div>'
                f'<div style="font-size:12px;color:{MUTED};">출처 {E(_src(f))} · {E(f.get("published_at") or "날짜 미상")}{more}{link}</div>'
                f'<div style="font-size:12px;color:{MUTED};">관련 사업 {E(eng_line(g))}</div></td></tr>')
        return "".join(out)

    def section(title, note, gs):
        if not gs:
            return ""
        return (f'<tr><td style="padding:16px 24px 0;font-size:14px;font-weight:800;color:{TEXT};">{title} '
                f'<span style="font-weight:500;font-size:12px;color:{MUTED};">{note}</span></td></tr>'
                f'<tr><td style="padding:2px 24px 0;"><table width="100%" cellpadding="0" cellspacing="0">{rows(gs)}</table></td></tr>')

    shown_off = official[:MAX]
    shown_news = news_g[:max(0, MAX - len(shown_off))]
    rest = len(hot) - len(shown_off) - len(shown_news)
    dash_url = E(config.DASHBOARD_URL)
    dash = f'<a href="{dash_url}" style="color:{LINK};">대시보드</a>'
    issues = (section("공식 제재 명단", f"EXIMIIS·조달청·MDB 등재 {len(official)}건 · 확정 정보", shown_off)
              + section("뉴스", f"{len(news_g)}건 · 제재 확정이 아닌 검토 신호, 원문 확인 필요", shown_news))
    if not hot:
        issues = f'<tr><td style="padding:18px 24px 4px;font-size:14px;color:{TEXT2};">오늘 새로 나온 위험·경고 이슈는 없습니다.</td></tr>'
    extra = [t for t in (f"위험·경고 {rest}건 더" if rest > 0 else "", f"참고 이력 {len(mild)}건" if mild else "", f"30일 지난 기사 {len(old_hot)}건" if old_hot else "") if t]
    extra_html = (f'<tr><td style="padding:12px 24px 0;font-size:13px;color:{TEXT2};">메일에서 생략: {" · ".join(extra)} ({dash}에서 확인)</td></tr>') if extra else ""
    geo_html = ""
    if geo_new:
        items = "".join(
            f'<li style="margin:2px 0;">{E(GEO_KO.get(e.get("type"), e.get("type") or ""))} · {E(str(e.get("title") or "")[:90])} '
            f'<span style="color:{MUTED};">({E(str(e.get("source") or "").split(" ")[0])})</span></li>' for e in geo_new[:5])
        geo_html = (f'<tr><td style="padding:16px 24px 0;font-size:14px;font-weight:800;color:{TEXT};">수원국 새 공식 경보 '
                    f'<span style="font-weight:500;font-size:12px;color:{MUTED};">지난 24시간 · 사업지·수원국 600km 안</span></td></tr>'
                    f'<tr><td style="padding:4px 24px 0;font-size:13px;color:{TEXT2};line-height:1.6;"><ul style="margin:0;padding-left:18px;">{items}</ul></td></tr>')
    weekday = "월화수목금토일"[now.weekday()]
    scan_at = str(meta["status"].get("last_scan_at") or "")[:16]
    summary = (f"오늘 새 이슈 위험 {new_red} · 경고 {new_org}건. 모니터링 업체 {len(overview)} 가운데 위험 {n_red} · 경고 {n_org} · 정상 {n_ok}."
               if hot else f"오늘 새 위험·경고 이슈 없음. 모니터링 업체 {len(overview)} 가운데 위험 {n_red} · 경고 {n_org} · 정상 {n_ok}.")
    grade_boxes = "".join(
        f'<td width="33%" style="padding:0 {4 if i < 2 else 0}px 0 {4 if i else 0}px;"><div style="border:1px solid {LINE};border-top:3px solid {COLORS[lv][0]};border-radius:8px;padding:8px 12px;">'
        f'<div style="font-size:12px;font-weight:700;color:{MUTED};">{COLORS[lv][2]}</div><div style="font-size:20px;font-weight:800;color:{COLORS[lv][0]};line-height:1.35;">{n}{delta(lv, n)}</div></div></td>'
        for i, (lv, n) in enumerate((("red", n_red), ("orange", n_org), ("none", n_ok))))

    body = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{E(subject)}</title></head>
<body style="margin:0;background:{BG};font-family:{FONT};color:{TEXT};">
<div style="display:none;max-height:0;overflow:hidden;">{E(summary)}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:{BG};"><tr><td align="center" style="padding:20px 12px;">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:{PANEL};border:1px solid {LINE};border-radius:12px;">
<tr><td style="padding:20px 24px 14px;border-bottom:1px solid {LINE};">
  <div style="font-size:12px;font-weight:700;color:{MUTED};">EDCF RADAR 일일 보고 · {today} ({weekday})</div>
  <div style="margin-top:4px;font-size:20px;font-weight:800;color:{TEXT};line-height:1.35;">EDCF 참여 업체 리스크 현황</div>
  <div style="margin-top:6px;font-size:14px;color:{TEXT2};line-height:1.55;">{E(summary)}</div>
</td></tr>
<tr><td style="padding:14px 24px 0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>{grade_boxes}</tr></table></td></tr>
{issues}{extra_html}{geo_html}
<tr><td style="padding:18px 24px 18px;font-size:13px;color:{TEXT2};">자세한 내용과 처리(확인 완료·관련 없음)는 <a href="{dash_url}" style="color:{LINK};font-weight:700;">EDCF RADAR 대시보드</a>에서 할 수 있습니다.</td></tr>
<tr><td style="padding:12px 24px 16px;border-top:1px solid {LINE};font-size:12px;color:{MUTED};line-height:1.65;">
  기준: 자동 검사 {E(scan_at or today)} · 출처: EXIMIIS 부정당업자, 조달청 나라장터, MDB 제재 리스트(OpenSanctions), Google·네이버 뉴스, AI 판정(Claude)<br>
  뉴스 항목은 제재 확정이 아니라 검토가 필요한 신호입니다. 계약 전에는 원문과 공식 자료로 확인하세요.<br>
  이 메일은 EDCF RADAR 메일 수신자로 등록된 분께 자동으로 보냅니다. 수신을 멈추려면 관리자에게 요청하세요.
</td></tr>
</table></td></tr></table></body></html>"""
    body = re.sub(r">\s+<", "><", body)  # 태그 사이 공백 제거 (메일 크기 줄이기)
    # 텍스트 본문 (HTML 을 못 보는 메일·스팸 필터용): 같은 사실을 줄글로
    def tline(g):
        f = g[0]
        return (f"- [{COLORS[f['level']][2]}] {' · '.join(grouping.companies_of(g))}: {(f.get('summary') or f.get('title') or '')[:140]}"
                f" (출처 {_src(f)}, {f.get('published_at') or '날짜 미상'})" + (f" {f['url']}" if f.get("url") else ""))
    text = "\n".join([f"EDCF RADAR 일일 보고 {today} ({weekday})", summary, ""]
                     + ([f"공식 제재 명단 {len(official)}건"] + [tline(g) for g in shown_off] + [""] if shown_off else [])
                     + ([f"뉴스 {len(news_g)}건 (검토 신호)"] + [tline(g) for g in shown_news] + [""] if shown_news else [])
                     + ([f"메일에서 생략: {' · '.join(extra)}"] if extra else [])
                     + [f"대시보드: {config.DASHBOARD_URL}", "이 메일은 EDCF RADAR 메일 수신자로 등록된 분께 자동으로 보냅니다."])
    build.last_text = text
    return subject, body, [f["id"] for f in new]


def save_history(overview: list[dict]) -> None:
    """오늘 등급별 업체 수를 meta/history.days 에 남김 (최근 60일) · 대시보드의 '어제보다 +N'·30일 추이용"""
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
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=(config.MAIL_FROM or "edcf-radar").split("@")[-1] or None)
    msg.attach(MIMEText(getattr(build, "last_text", "") or subject, "plain", "utf-8"))  # 텍스트 본문 먼저, HTML 나중 (보는 프로그램이 고름)
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
