"""유료로 바뀔 수 있는 서비스 사용량 기록 (설정 > 고급 > 사용량·요금)

- Claude: 호출마다 응답의 토큰 수를 모아 두었다가 실행이 끝날 때 meta/usage 에 더함 (월별·모델별)
- GitHub Actions: 실행 1번 = 시간(초)·횟수 (공개 저장소는 무료, 비공개 전환 시 월 2,000분까지 무료)
화면에서 읽는 문서는 meta/usage 하나뿐 (대시보드 읽기 1회).
"""
import logging
import time

log = logging.getLogger(__name__)

# 100만 토큰당 달러 (입력, 출력). 모르는 모델은 금액 없이 토큰만 보여 줌
PRICE = {"claude-haiku-5-5": (0.10, 0.50), "claude-sonnet-5-5": (2.0, 10.0)}

_t0 = time.time()
_claude: dict[str, list[int]] = {}  # model → [입력, 출력, 호출 수]
_reads = [0]  # 이번 실행에서 검사 프로그램이 읽은 Firestore 문서 수 (store 의 질의 함수가 셈)


def reads(n: int) -> None:
    _reads[0] += n


def track(resp, model: str) -> None:
    """anthropic 응답(resp.usage)의 토큰 수를 더함. 실패해도 판정에는 영향 없음"""
    try:
        u = resp.usage
        n_in = (u.input_tokens or 0) + (getattr(u, "cache_read_input_tokens", 0) or 0) + (getattr(u, "cache_creation_input_tokens", 0) or 0)
        a = _claude.setdefault(model, [0, 0, 0])
        a[0] += n_in
        a[1] += u.output_tokens or 0
        a[2] += 1
    except Exception:
        pass


def cost_usd(model: str, n_in: int, n_out: int) -> float | None:
    p = PRICE.get(model)
    return None if not p else (n_in * p[0] + n_out * p[1]) / 1e6


def flush(kind: str = "") -> None:
    """실행이 끝날 때 한 번: meta/usage 에 이번 실행분을 더함"""
    try:
        from google.cloud.firestore_v1 import Increment

        from . import store
        now = store.now_kst()
        month, day = now.strftime("%Y-%m"), now.strftime("%Y-%m-%d")
        secs = int(time.time() - _t0)
        data: dict = {"actions": {month: {"runs": Increment(1), "seconds": Increment(secs), "minutes": Increment(max(1, -(-secs // 60)))}},
                      "updated_at": store.now_str()}
        if _reads[0]:
            data["batch"] = {month: {"reads": Increment(_reads[0])}}
            data["batch_days"] = {day: {"reads": Increment(_reads[0])}}
        if _claude:
            data["claude"] = {month: {m.replace(".", "_"): {"in": Increment(a[0]), "out": Increment(a[1]), "calls": Increment(a[2])} for m, a in _claude.items()}}
            data["claude_days"] = {day: {"in": Increment(sum(a[0] for a in _claude.values())), "out": Increment(sum(a[1] for a in _claude.values()))}}
        store.db().collection("meta").document("usage").set(data, merge=True)
        log.info("사용량 기록: 실행 %d초 · Claude 호출 %d회", secs, sum(a[2] for a in _claude.values()))
    except Exception as e:
        log.warning("사용량 기록 실패: %s", type(e).__name__)
