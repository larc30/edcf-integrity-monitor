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
    "red": ("#D92D20", "#FDE8E6", "경고"),
    "orange": ("#E2660A", "#FEEFE0", "주의"),
    "yellow": ("#64748B", "#EEF1F5", "참고"),  # 등급 3단계(경고·주의·정상) — yellow 는 참고 이력
    "none": ("#0D9488", "#E2F4F2", "정상"),
}
TEXT, TEXT2, MUTED, LINE, SOFT, BG, PANEL = "#0B1220", "#3D4A63", "#6B7690", "#E3E7EF", "#EEF1F6", "#F3F5FA", "#FFFFFF"
BG2 = "#F7F8FC"  # 메일 안쪽 바탕 (카드가 떠 보이게)
ACCENT, ACCENT2, NAVY, LINK = "#5B5BF0", "#0891B2", "#0A0F1E", "#5B5BF0"
E = html.escape
ROLE_ORDER = {"F/S": 0, "컨설턴트": 1, "본구매": 2}  # 사업 진행 순서



def _sum(f: dict) -> str:
    """요약 글 (예전 기록 앞에 붙어 저장된 안내문 '※ … 확인.'은 뗌: app.js sumText 와 같게)"""
    return re.sub(r"^※[^.]*확인\.\s*", "", f.get("summary") or f.get("title") or "")

def norm_role(r) -> str:
    """역할 이름 통일 (app.js normRole 과 같게): '본공사'·'시공' → 본구매, '감리' → 컨설턴트"""
    t = re.sub(r"\s", "", str(r or ""))
    if re.match(r"(?i)^(f/?s|타당성)", t):
        return "F/S"
    if re.search(r"(?i)컨설|감리|자문|설계|pmc?$", t):
        return "컨설턴트"
    if re.search(r"본구매|본공사|본사업|시공|공사|구매|공급|건설", t):
        return "본구매"
    return str(r or "").strip()


def load_overview() -> tuple[list[dict], list[dict], dict]:
    """(companies with risk, active findings, engagements_by_company)"""
    projects = {p["id"]: p for p in store.all_docs("projects")}
    companies = store.all_docs("companies")
    finds = [f for f in store.where("findings", "relevant", "==", True) if f.get("status") != "dismissed"]
    today = store.now_kst().strftime("%Y-%m-%d")
    for f in finds:  # 기사에 적힌 처분 기간이 끝났으면 경고(red) → 주의(orange) (app.js loadAll 과 같은 기준)
        if f.get("level") == "red" and f.get("valid_until") and str(f["valid_until"])[:10] < today:
            f["level"] = "orange"
    engs = {}
    for c in companies:
        c["engagements"] = [
            {**e, "role": norm_role(e.get("role")), "project_name": projects.get(e.get("project_id"), {}).get("name", "(삭제된 사업)")}
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
            f'font-weight:700;color:{fg};background:{bg};white-space:nowrap;">{label}</span>')


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
    name = re.sub(r"\s*\([^)]*(Google|Naver|네이버|키워드|뉴스)[^)]*\)\s*$", "", str(f.get("source_name") or "")).strip()
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
    # 같은 업체·같은 분류 뉴스를 최근 7일 안에 이미 보냈으면 생략 (등급이 더 높아졌으면 보냄) · 대시보드에는 그대로 남음
    week = (now - datetime.timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
    sent = {}
    for f in finds:
        if f.get("source_type") == "news" and str(f.get("reported_at") or "") >= week:
            k = (f["company_id"], f.get("category") or "")
            sent[k] = max(sent.get(k, 0), LEVEL_ORDER.get(f.get("level"), 0))
    repeat = 0
    news_g, seen_key = [], {}
    for g in (g for g in hot if g[0].get("source_type") == "news"):
        lv = LEVEL_ORDER.get(g[0].get("level"), 0)
        if all(sent.get((cid, g[0].get("category") or ""), -1) >= lv for cid in dict.fromkeys(f["company_id"] for f in g)):
            repeat += 1
            continue
        k = (tuple(sorted(grouping.companies_of(g))), g[0].get("category") or g[0].get("title"))
        if k in seen_key:
            seen_key[k].extend(g)  # 앞(최신·높은 등급) 묶음에 붙임
        else:
            seen_key[k] = list(g)
            news_g.append(seen_key[k])

    n_red = sum(1 for c in overview if c["risk"] == "red")
    n_org = sum(1 for c in overview if c["risk"] == "orange")
    n_ok = len(overview) - n_red - n_org
    sendable = official + news_g
    new_red = sum(1 for g in sendable if g[0]["level"] == "red")
    new_org = len(sendable) - new_red
    head = " · ".join(t for t in (f"경고 {new_red}" if new_red else "", f"주의 {new_org}" if new_org else "") if t) or "새 경고·주의 없음"
    subject = f"[EDCF RADAR] {now:%m/%d} {head}"

    meta = _meta("history", "geo", "status")
    # 전날 대비: meta/history 에서 오늘보다 앞선 가장 최근 날
    days = (meta["history"].get("days") or {})
    prev = next((days[d] for d in sorted(days, reverse=True) if d < today), None)
    def delta(lv, n):
        if not prev or lv not in prev:
            return ""
        d = n - int(prev.get(lv) or 0)
        return "" if d == 0 else f' <span style="font-size:12px;font-weight:700;color:{MUTED};white-space:nowrap;">전일 {"+" if d > 0 else "−"}{abs(d)}</span>'
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
    ROLE_C = {"F/S": ("#0E7490", "#E0F4F8"), "컨설턴트": ("#1D4ED8", "#E6EEFE"), "본구매": ("#A21CAF", "#F8E8FB")}
    tag = lambda t, fg=TEXT2, bg=SOFT: (f'<span style="display:inline-block;padding:1px 7px;border-radius:5px;font-size:11px;line-height:17px;'
                                         f'font-weight:700;color:{fg};background:{bg};white-space:nowrap;">{E(t)}</span>')

    def eng_tags(g):
        out = []
        for i in list(dict.fromkeys(f["company_id"] for f in g))[:2]:
            for e in sorted(engs.get(i, []), key=lambda e: ROLE_ORDER.get(e.get("role"), 9))[:2]:
                fg, bg = ROLE_C.get(e.get("role"), (TEXT2, SOFT))
                out.append(f'{tag(e.get("role") or "-", fg, bg)} <span style="color:{TEXT2};">{E(e.get("project_name") or "-")}'
                           + (f' · {e["rank"]}순위' if e.get("rank") else "") + "</span>")
        return "<br>".join(out)

    def item(n, g):
        f = g[0]
        fg = COLORS[f["level"]][0]
        more = f" · 같은 사건 {len(g) - 1}건 더" if len(g) > 1 else ""
        link = f' · <a href="{E(f["url"])}" style="color:{LINK};text-decoration:none;font-weight:700;">원문</a>' if f.get("url") else ""
        cat = tag(f["category"]) if f.get("category") and f["category"] != "기타" else ""
        et = eng_tags(g)
        return (f'<tr><td style="padding:14px 0;border-bottom:1px solid {LINE};">'
                f'<table width="100%" cellpadding="0" cellspacing="0"><tr>'
                f'<td width="34" style="vertical-align:top;padding-top:1px;"><span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:{fg};color:#FFFFFF;font-size:12px;font-weight:800;line-height:24px;text-align:center;">{n}</span></td>'
                f'<td style="vertical-align:top;">'
                f'<div style="font-size:16px;font-weight:800;color:{TEXT};line-height:1.4;">{E(" · ".join(grouping.companies_of(g)))} {_badge(f["level"])} {cat}</div>'
                f'<div style="margin-top:3px;font-size:12px;color:{MUTED};">{E(_src(f))} · {E(f.get("published_at") or "날짜 미상")}{more}{link}</div>'
                f'<div style="margin-top:6px;font-size:14px;line-height:1.6;color:{TEXT};">{E(_sum(f)[:180])}</div>'
                + (f'<div style="margin-top:8px;padding:7px 12px;border-left:3px solid {ACCENT};background:#F2F3FE;font-size:12.5px;line-height:1.7;">'
                   f'<b style="color:{ACCENT};">관련 사업</b>&nbsp; {et}</div>' if et else "")
                + '</td></tr></table></td></tr>')

    def section(no, title, cnt, gs, start=1):
        if not gs:
            return ""
        return (f'<tr><td style="padding:26px 28px 0;">'
                f'<div style="font-size:18px;font-weight:800;color:{TEXT};padding-bottom:8px;border-bottom:2px solid {NAVY};">'
                f'<span style="color:{ACCENT};">{no}</span>&nbsp; {title} <span style="font-size:13px;font-weight:700;color:{MUTED};">{cnt}</span></div>'
                f'<table width="100%" cellpadding="0" cellspacing="0">{"".join(item(start + k, g) for k, g in enumerate(gs))}</table></td></tr>')

    shown_off = official[:MAX]
    shown_news = news_g[:max(0, MAX - len(shown_off))]
    rest = len(sendable) - len(shown_off) - len(shown_news)
    dash_url = E(config.DASHBOARD_URL)
    # 오늘 핵심: 새 경고·주의 가운데 위쪽 3건 (공식 명단 → 뉴스, 등급 높은 순)
    top3 = sorted(shown_off + shown_news, key=lambda g: -LEVEL_ORDER.get(g[0].get("level"), 0))[:3]
    top_html = ""
    if top3:
        top_rows = "".join(
            f'<tr><td style="padding:9px 0;border-top:1px solid #F3E2B8;font-size:14px;line-height:1.55;color:{TEXT};">'
            f'{_badge(g[0]["level"])} <b>{E(" · ".join(grouping.companies_of(g)))}</b> '
            f'<span style="color:{TEXT2};">{E(_sum(g[0])[:70])}</span></td></tr>' for g in top3)
        top_html = (f'<tr><td style="padding:18px 28px 0;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E6;border:1px solid #F3D58A;border-radius:12px;">'
                    f'<tr><td style="padding:14px 18px 6px;font-size:16px;font-weight:800;color:{TEXT};">오늘 먼저 볼 이슈</td></tr>'
                    f'<tr><td style="padding:0 18px 8px;"><table width="100%" cellpadding="0" cellspacing="0">{top_rows}</table></td></tr></table></td></tr>')
    secs, no = [], 1
    circ = "①②③④⑤"
    grade_sec = (f'<tr><td style="padding:26px 28px 0;"><div style="font-size:18px;font-weight:800;color:{TEXT};padding-bottom:8px;border-bottom:2px solid {NAVY};">'
                 f'<span style="color:{ACCENT};">{circ[0]}</span>&nbsp; 업체 등급 <span style="font-size:13px;font-weight:700;color:{MUTED};">업체 {len(overview)}</span></div>'
                 f'<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;"><tr></tr></table></td></tr>')
    no = 1
    if shown_off:
        secs.append(section(circ[no], "공식 제재 명단", f"{len(official)}건", shown_off)); no += 1
    if shown_news:
        secs.append(section(circ[no], "뉴스 · 검토 신호", f"{len(news_g)}건", shown_news, len(shown_off) + 1)); no += 1
    issues = "".join(secs) if sendable else (f'<tr><td style="padding:22px 28px 0;font-size:14px;color:{TEXT2};">오늘 새로 나온 경고·주의 이슈는 없습니다.</td></tr>')
    skipped = [t for t in (f"경고·주의 {rest}건" if rest > 0 else "", f"7일 안에 알린 업체·분류 {repeat}건" if repeat else "") if t]
    geo_html = ""
    if geo_new:
        items = "".join(
            f'<tr><td style="padding:10px 0;border-bottom:1px solid {LINE};font-size:14px;line-height:1.55;color:{TEXT};">'
            f'{tag(GEO_KO.get(e.get("type"), e.get("type") or ""), "#0E7490", "#E0F4F8")} {E(str(e.get("title") or "")[:100])} '
            f'<span style="font-size:12px;color:{MUTED};">{E(str(e.get("source") or "").split(" ")[0])}</span></td></tr>' for e in geo_new[:5])
        geo_html = (f'<tr><td style="padding:26px 28px 0;"><div style="font-size:18px;font-weight:800;color:{TEXT};padding-bottom:8px;border-bottom:2px solid {NAVY};">'
                    f'<span style="color:{ACCENT};">{circ[no]}</span>&nbsp; 수원국 새 공식 경보 <span style="font-size:13px;font-weight:700;color:{MUTED};">지난 24시간</span></div>'
                    f'<table width="100%" cellpadding="0" cellspacing="0">{items}</table></td></tr>')
    weekday = "월화수목금토일"[now.weekday()]
    scan_at = str(meta["status"].get("last_scan_at") or "")[:16]
    summary = (f"새 이슈 경고 {new_red} · 주의 {new_org}건 · 모니터링 업체 {len(overview)} 가운데 경고 {n_red} · 주의 {n_org}"
               if sendable else f"새 경고·주의 이슈 없음 · 모니터링 업체 {len(overview)} 가운데 경고 {n_red} · 주의 {n_org}")
    def who(lv):
        l = [c["name"] for c in overview if c["risk"] == lv]
        return (E(", ".join(l[:2])) + (f" 외 {len(l) - 2}" if len(l) > 2 else "")) if l else "해당 없음"
    grade_boxes = "".join(
        f'<td width="33%" style="padding:0 {4 if i < 2 else 0}px 0 {4 if i else 0}px;vertical-align:top;">'
        f'<div style="border:1px solid {LINE};border-top:4px solid {COLORS[lv][0]};border-radius:10px;padding:10px 14px;background:#FFFFFF;">'
        f'<div style="font-size:13px;font-weight:800;color:{COLORS[lv][0]};">{COLORS[lv][2]}</div>'
        f'<div style="font-size:28px;font-weight:800;color:{COLORS[lv][0]};line-height:1.2;">{n}{delta(lv, n)}</div>'
        f'<div style="font-size:11.5px;color:{MUTED};line-height:1.45;">{who(lv) if lv != "none" else "경고·주의 없음"}</div></div></td>'
        for i, (lv, n) in enumerate((("red", n_red), ("orange", n_org), ("none", n_ok))))
    grade_sec = grade_sec.replace("<tr></tr>", f"<tr>{grade_boxes}</tr>")

    body = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{E(subject)}</title></head>
<body style="margin:0;background:{BG};font-family:{FONT};color:{TEXT};word-break:keep-all;">
<div style="display:none;max-height:0;overflow:hidden;">{E(summary)}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:{BG};"><tr><td align="center" style="padding:20px 12px;">
<table width="660" cellpadding="0" cellspacing="0" style="max-width:660px;width:100%;background:#FFFFFF;border:1px solid {LINE};border-radius:14px;">
<tr><td style="background:{NAVY};background-image:linear-gradient(120deg,#0A0F1E 0%,#141B3A 60%,#0B2A3A 100%);padding:22px 28px 20px;border-radius:13px 13px 0 0;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-size:14px;font-weight:800;color:#FFFFFF;"><span style="display:inline-block;width:22px;height:22px;border-radius:7px;background:#5B5BF0;background-image:linear-gradient(135deg,#7C83FF,#22D3EE);vertical-align:-6px;margin-right:8px;"></span>EDCF RADAR</td>
    <td align="right" style="font-size:12px;font-weight:700;color:#9FB0C8;">{today} ({weekday})</td></tr></table>
  <div style="margin-top:14px;font-size:24px;font-weight:800;color:#FFFFFF;line-height:1.3;">오늘의 <span style="color:#9AA3FF;">EDCF</span> <span style="color:#7DD3FC;">업체 리스크</span></div>
  <div style="margin-top:6px;font-size:13px;color:#C9D4E5;">{E(summary)}</div>
</td></tr>
{top_html}{grade_sec}{issues}{geo_html}
<tr><td style="padding:24px 28px 26px;">
  <a href="{dash_url}" style="display:inline-block;padding:10px 18px;border-radius:9px;background:{ACCENT};color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;">대시보드에서 확인·처리</a>
  {f'<span style="margin-left:10px;font-size:12px;color:{MUTED};">메일에서 생략: {" · ".join(skipped)}</span>' if skipped else ""}
</td></tr>
</table></td></tr></table></body></html>"""
    body = re.sub(r">\s*\n\s*<", "><", body)  # 줄바꿈만 지움 (메일 크기 줄이기). 태그 사이 띄어쓰기는 남김
    # 텍스트 본문 (HTML 을 못 보는 메일·스팸 필터용): 같은 사실을 줄글로
    def tline(g):
        f = g[0]
        return (f"- [{COLORS[f['level']][2]}] {' · '.join(grouping.companies_of(g))}: {_sum(f)[:140]}"
                f" (출처 {_src(f)}, {f.get('published_at') or '날짜 미상'})" + (f" {f['url']}" if f.get("url") else ""))
    text = "\n".join([f"EDCF RADAR 일일 보고 {today} ({weekday})", summary, ""]
                     + ([f"공식 제재 명단 {len(official)}건"] + [tline(g) for g in shown_off] + [""] if shown_off else [])
                     + ([f"뉴스 {len(news_g)}건 (검토 신호)"] + [tline(g) for g in shown_news] + [""] if shown_news else [])
                     + ([f"메일에서 생략: {' · '.join(skipped)}"] if skipped else [])
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
