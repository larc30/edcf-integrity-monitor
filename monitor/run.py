"""실행 진입점 (GitHub Actions에서 호출)

python -m monitor.run daily                 # 스캔 → 리포트 메일 발송 (매일 자동)
python -m monitor.run queue                 # 대시보드에서 남긴 실행 요청 처리 (10분마다 자동)
python -m monitor.run scan [--companies 업체1,업체2]
python -m monitor.run preview               # 리포트 미리보기만 갱신
python -m monitor.run report-test --test-to me@example.com
python -m monitor.run report                # 수신자 전체 발송
python -m monitor.run dart                  # DART 기업목록 → data/corp_master.json
"""
import argparse
import json
import logging
import os
import sys

from . import report, scanner, store
from .sources import dart

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("monitor")


def sync_dart() -> int:
    n = dart.sync_corp_master()
    store.update("meta", "status", {"dart_synced_at": store.now_str(), "corp_master": n})
    store.log_run("dart", True, {"count": n})
    return n


def log_counts() -> None:
    """데이터 건수만 기록 (Actions 로그는 공개라 업체 이름은 남기지 않음)"""
    try:
        from .textutil import norm
        cs = store.all_docs("companies")
        linked = sum(1 for c in cs if c.get("engagements"))
        dup = len(cs) - len({norm(c.get("name") or "") for c in cs})
        log.info("데이터: 업체 %d곳 (사업 연결 %d · 미연결 %d · 이름 중복 %d) · 사업 %d개 · EDCF 명단 %d건 · 이슈 %d건",
                 len(cs), linked, len(cs) - linked, dup, len(store.all_docs("projects")),
                 len(store.all_docs("edcf_sanctions")), len(store.all_docs("findings")))
    except Exception as e:
        log.warning("건수 확인 실패: %s", e)


def process_queue() -> int:
    """대시보드 [지금 스캔] 등이 Firestore 'requests'에 남긴 요청을 처리한다.
    회사망에서 api.github.com이 막혀도 Firebase만 되면 실행할 수 있게 하기 위함."""
    reqs = sorted(store.where("requests", "status", "==", "pending"), key=lambda r: r.get("requested_ms", 0))
    if not reqs:
        log.info("대기 중인 요청 없음")
        return 0
    log.info("요청 %d건 처리", len(reqs))
    for r in reqs:
        store.update("requests", r["id"], {"status": "running", "started_at": store.now_str()})

    def finish(r, ok, result):
        store.update("requests", r["id"], {"status": "done" if ok else "error", "finished_at": store.now_str(), "result": result})

    # 스캔 요청은 한 번에 묶어서: 전체 스캔이 하나라도 있으면 전체, 아니면 요청된 업체만
    scans = [r for r in reqs if r.get("task") in ("scan", "daily")]
    if scans:
        full = any(not (r.get("companies") or "").strip() for r in scans)
        names = None if full else sorted({n.strip() for r in scans for n in r["companies"].split(",") if n.strip()})
        def progress(done, total, current):
            data = {"progress": {"done": done, "total": total, "current": current, "at": store.now_str()}}
            store.update_many("requests", {r["id"]: data for r in scans})
            store.update("meta", "progress", {**data["progress"], "running": done < total})

        def should_stop():
            for r in scans:
                d = store.db().collection("requests").document(r["id"]).get()
                if d.exists and d.to_dict().get("status") == "cancel_requested":
                    return True
            return False

        try:
            res = scanner.run_scan(names, progress=progress, should_stop=should_stop)
            report.save_preview()
            summary = {k: res.get(k) for k in ("companies", "fetched", "new_findings", "official", "cleaned", "seconds")}
            summary["errors"] = len(res.get("errors") or [])
            for r in scans:
                if res.get("stopped"):
                    store.update("requests", r["id"], {"status": "cancelled", "finished_at": store.now_str(), "result": {**summary, "stopped": True}})
                else:
                    finish(r, True, summary)
        except Exception as e:
            log.exception("스캔 실패")
            for r in scans:
                finish(r, False, {"error": str(e)[:300]})

    for r in reqs:
        task = r.get("task")
        if task in ("scan", "daily"):
            if task == "daily":
                try:
                    report.send()
                except Exception as e:
                    log.warning("리포트 발송 실패: %s", e)
            continue
        try:
            if task == "report-test":
                to = (r.get("test_to") or "").strip()
                if not to:
                    raise RuntimeError("받을 이메일 주소가 없습니다")
                res = report.send(to)
            elif task == "report":
                res = report.send()
            elif task == "dart":
                res = {"count": sync_dart()}
            elif task == "preview":
                res = report.save_preview()
            else:
                raise RuntimeError(f"알 수 없는 작업: {task}")
            finish(r, True, {k: v for k, v in res.items() if k in ("items", "subject", "count", "test")})
        except Exception as e:
            log.exception("요청 처리 실패: %s", task)
            finish(r, False, {"error": str(e)[:300]})
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("task", choices=["daily", "queue", "scan", "preview", "report", "report-test", "dart"])
    p.add_argument("--companies", default="")
    p.add_argument("--test-to", default="")
    a = p.parse_args()

    if a.task == "queue":
        return process_queue()

    if a.task == "dart":
        log.info("DART 기업목록 %d개 저장", sync_dart())
        return 0

    if a.task in ("daily", "scan", "preview"):
        log_counts()

    if a.task == "daily":
        # 자동 매일 실행(Apps Script 'daily' 트리거 또는 GitHub 예약)은 하루 한 번만 — 둘 다 돌아도 메일이 두 번 가지 않게
        auto = a.test_to.strip() == "auto" or os.getenv("GITHUB_EVENT_NAME") == "schedule"
        snap = store.db().collection("meta").document("status").get()
        last = ((snap.to_dict() or {}) if snap.exists else {}).get("last_daily_at") or ""
        if auto and last[:10] == store.now_kst().strftime("%Y-%m-%d"):
            log.info("오늘 아침 자동 실행은 이미 끝났습니다 (%s) → 건너뜀", last)
            return 0

    if a.task in ("daily", "scan"):
        only = [x for x in a.companies.split(",") if x.strip()] or None
        res = scanner.run_scan(only, progress=lambda d, t, c: store.update("meta", "progress", {"done": d, "total": t, "current": c, "running": d < t, "at": store.now_str()}))
        log.info("스캔 결과: %s", json.dumps(res, ensure_ascii=False))
        if a.task == "daily":  # 예약(매일) 실행이 실제로 돌았는지 대시보드에서 확인하기 위함
            store.update("meta", "status", {"last_daily_at": store.now_str()})
        # 전체 스캔이면 대시보드에서 기다리던 스캔 요청도 함께 완료 처리 (Actions에서 직접 실행한 경우 포함)
        try:
            summary = {k: res.get(k) for k in ("companies", "fetched", "new_findings", "official")}
            for r in store.where("requests", "status", "==", "pending"):
                if r.get("task") == "scan" and (not only or (r.get("companies") or "").strip() in only):
                    store.update("requests", r["id"], {"status": "done", "finished_at": store.now_str(), "result": summary})
        except Exception as e:
            log.warning("요청 상태 갱신 실패: %s", e)

    if a.task in ("daily", "scan", "preview"):
        log.info("리포트 미리보기: %s", report.save_preview())

    if a.task == "report-test":
        if not a.test_to.strip():
            log.error("report-test 에는 test_to(받을 이메일)가 필요합니다.")
            return 1
        log.info("테스트 발송: %s", report.send(a.test_to.strip()))

    if a.task in ("daily", "report"):
        try:
            log.info("리포트 발송: %s", report.send())
        except Exception as e:
            store.log_run("report", False, {"error": str(e)})
            log.error("리포트 발송 실패: %s", e)
            return 1 if a.task == "report" else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
