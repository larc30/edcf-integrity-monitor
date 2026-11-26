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


def fetch_actual() -> tuple[str, dict] | None:
    """이번 달 실제 청구액 (Anthropic 사용량·비용 API · 조직 전체 · UTC 기준 1일부터 지금까지).

    관리자 키(ANTHROPIC_ADMIN_KEY)가 있을 때만. 금액은 4~24시간 늦게 반영됨(data_refreshed_at 까지가 확정분).
    돌려주는 값: ("ok", {month, usd, to, at}) / ("err", {msg, at}) / None(키 없음)
    """
    from . import config, store
    if not config.ANTHROPIC_ADMIN_KEY:
        return None
    at = store.now_str()
    try:
        from datetime import datetime, timezone

        import anthropic
        start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # 묶음·시간 단위를 주지 않으면 기간 전체가 한 줄로 옴 (금액 amount 는 센트 단위 문자열: 할인 뒤 · 크레딧 차감 전)
        page = anthropic.Anthropic(api_key=config.ANTHROPIC_ADMIN_KEY).beta.organization.analytics.cost.list(starting_at=start)
        if page.data_refreshed_at is None:  # 아직 이 기간의 자료가 하나도 안 들어옴 (0원이라는 뜻이 아님) → 추정 금액을 그대로 둠
            return ("err", {"msg": "아직 자료 없음", "at": at})
        cents = sum(float(r.cost.amount) for r in page.data)
        to = page.data_refreshed_at.astimezone(store.now_kst().tzinfo).strftime("%Y-%m-%d %H:%M")
        return ("ok", {"month": start.strftime("%Y-%m"), "usd": round(cents / 100, 4), "to": to, "at": at})
    except Exception as e:
        return ("err", {"msg": type(e).__name__, "at": at})


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
        act = fetch_actual()
        if act and act[0] == "ok":
            from google.cloud.firestore_v1 import DELETE_FIELD
            v = act[1]
            data["claude_actual"] = {v["month"]: {"usd": v["usd"], "to": v["to"], "at": v["at"]}}
            data["claude_actual_err"] = DELETE_FIELD
        elif act:
            data["claude_actual_err"] = act[1]
        store.db().collection("meta").document("usage").set(data, merge=True)
        log.info("사용량 기록: 실행 %d초 · Claude 호출 %d회 · 실제 청구액 %s", secs, sum(a[2] for a in _claude.values()),
                 "키 없음" if not act else "받음" if act[0] == "ok" else f"실패({act[1]['msg']})")
    except Exception as e:
        log.warning("사용량 기록 실패: %s", type(e).__name__)
