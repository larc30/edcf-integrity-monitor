"""실행 진입점 (GitHub Actions에서 호출)

python -m monitor.run daily                 # 스캔 → 리포트 메일 발송 (매일 자동)
python -m monitor.run scan [--companies 업체1,업체2]
python -m monitor.run preview               # 리포트 미리보기만 갱신
python -m monitor.run report-test --test-to me@example.com
python -m monitor.run report                # 수신자 전체 발송
python -m monitor.run dart                  # DART 기업목록 → data/corp_master.json
"""
import argparse
import json
import logging
import sys

from . import report, scanner, store
from .sources import dart

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("monitor")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("task", choices=["daily", "scan", "preview", "report", "report-test", "dart"])
    p.add_argument("--companies", default="")
    p.add_argument("--test-to", default="")
    a = p.parse_args()

    if a.task == "dart":
        n = dart.sync_corp_master()
        store.update("meta", "status", {"dart_synced_at": store.now_str(), "corp_master": n})
        store.log_run("dart", True, {"count": n})
        log.info("DART 기업목록 %d개 저장", n)
        return 0

    if a.task in ("daily", "scan"):
        only = [x for x in a.companies.split(",") if x.strip()] or None
        res = scanner.run_scan(only)
        log.info("스캔 결과: %s", json.dumps(res, ensure_ascii=False))

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
