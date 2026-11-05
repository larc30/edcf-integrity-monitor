"""데모 화면용 메일 미리보기: 데모의 가상 업체 데이터로 실제 메일 템플릿(monitor/report.py)을 그대로 만들어
# 사용법 (저장소 맨 위에서): node tools/demo/dump_demo.js /tmp/demo_db.json && python3 tools/demo/make_demo_mail.py /tmp/demo_db.json
demo/mail.js 로 저장. 날짜는 {{D0}}·{{D1}}… / 요일은 {{WD}} 자리표시로 바꿔 두고, 데모가 열릴 때 그날 날짜로 채움."""
import datetime, json, re, sys
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
from monitor import store, report

data = json.load(open(sys.argv[1], encoding="utf-8"))
db, now_ms = data["db"], data["now"]
KST = datetime.timezone(datetime.timedelta(hours=9))
now = datetime.datetime.fromtimestamp(now_ms / 1000, KST)


def coll(name):
    return [{"id": k, **v} for k, v in (db.get(name) or {}).items()]


store.all_docs = lambda n: coll(n)
store.where = lambda n, f, op, v: [x for x in coll(n) if x.get(f) == v]
store.now_kst = lambda: now
subject, body, ids = report.build()

# 날짜 자리표시: 오늘~60일 전 (긴 것부터 바꿔 겹침 방지는 필요 없음 — 날짜 형식이 고정)
for k in range(0, 4000):
    d = (now.date() - datetime.timedelta(days=k)).isoformat()
    if d in body or d in subject:
        body, subject = body.replace(d, "{{D%d}}" % k), subject.replace(d, "{{D%d}}" % k)
wd = "월화수목금토일"[now.weekday()]
body = body.replace(f"({wd})", "({{WD}})")
body = re.sub(r">\s+<", "><", body)
out = ("// 데모용 메일 미리보기 — make_demo_mail.py 로 만든 파일 (가상 업체, 실제 메일 템플릿 그대로)\n"
       "export const MAIL_SUBJECT = " + json.dumps(subject, ensure_ascii=False) + ";\n"
       "export const MAIL_HTML = " + json.dumps(body, ensure_ascii=False) + ";\n")
open(os.path.join(ROOT, "demo", "mail.js"), "w", encoding="utf-8").write(out)
print(subject, "| items", len(ids), "| bytes", len(out))
print("leftover real dates:", re.findall(r"20\d\d-\d\d-\d\d", body)[:5])
