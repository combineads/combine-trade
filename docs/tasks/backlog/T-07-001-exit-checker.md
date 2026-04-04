# T-07-001 청산 조건 검사 순수 함수

## Goal
TP1/TP2/TIME_EXIT 청산 조건과 MFE/MAE를 검사하는 순수 함수를 구현한다.

## Why
청산 조건 판정은 매 캔들마다 실행되는 핫패스이다. 순수 함수로 구현하면 백테스트에서 DB 없이 동일 로직을 재사용할 수 있고, 단위 테스트가 빠르다.

## Inputs
- `src/core/types.ts` — TicketState, Direction, CloseReason, Timeframe
- `src/core/decimal.ts` — Decimal.js 래퍼
- `docs/DATA_MODEL.md` — Ticket 컬럼 (tp1_price, tp2_price, state, opened_at, remaining_size)
- `docs/PRODUCT.md` — 3단계 청산 규칙, TIME_EXIT 60시간

## Dependencies
- 없음 (순수 함수, EP-01 core만 사용)

## Expected Outputs
- `src/exits/checker.ts` — `checkExit()`, `calcMfeMae()`, ExitAction 타입
- exit manager(T-07-003)가 이 함수를 호출하여 청산 실행

## Deliverables
- `src/exits/checker.ts`
- `tests/exits/checker.test.ts`
- `src/exits/index.ts` barrel export 업데이트

## Constraints
- **순수 함수 — DB import 절대 금지** (백테스트 재사용)
- 모든 가격 비교 Decimal.js
- ExitAction은 어떤 청산을 수행할지 기술: { type: 'TP1'|'TP2'|'TIME_EXIT'|'NONE', closeSize, closeReason }
- LONG: close >= tp_price → 조건 충족, SHORT: close <= tp_price
- TP1 size = total_size × 0.50, TP2 size = remaining × (25/75) ≈ 0.333
- TIME_EXIT: hold_duration > 60 × 3600 × 1000 ms

## Steps
1. ExitAction, MfeMaeResult 타입 정의
2. `checkExit(ticket, currentPrice, now) → ExitAction` 구현
   - state=INITIAL: TP1 체크 (close >= tp1 for LONG, close <= tp1 for SHORT)
   - state=TP1_HIT: TP2 체크
   - state=TP2_HIT: trailing/TIME_EXIT만 가능 (TP는 exit manager의 trailing에서 처리)
   - TIME_EXIT: opened_at + 60h < now → 전량 청산
   - CLOSED: NONE 반환
3. `calcCloseSize(ticket, actionType) → Decimal` — TP1=size×0.50, TP2=remaining×(1/3), TIME_EXIT=remaining
4. `calcMfeMae(entryPrice, currentPrice, direction, prevMfe, prevMae) → MfeMaeResult` 구현
   - LONG: favorable = max(prevMfe, current - entry), adverse = max(prevMae, entry - current)
   - SHORT: favorable = max(prevMfe, entry - current), adverse = max(prevMae, current - entry)
5. 테스트 작성 후 구현 (TDD)

## Acceptance Criteria
- LONG TP1: close >= tp1_price → type=TP1, closeSize=size×0.50
- SHORT TP1: close <= tp1_price → type=TP1
- TP2: state=TP1_HIT에서만 체크
- TIME_EXIT: 60시간 초과 → type=TIME_EXIT, closeSize=remaining
- CLOSED 상태 → NONE
- MFE/MAE는 유리/불리 방향 최대값만 기록 (감소 안 함)
- 모든 계산 Decimal.js

## Test Scenarios
- checkExit() LONG INITIAL, close >= tp1_price → TP1 action with size×0.50
- checkExit() LONG INITIAL, close < tp1_price → NONE
- checkExit() SHORT INITIAL, close <= tp1_price → TP1 action
- checkExit() TP1_HIT, close >= tp2_price → TP2 action with remaining×(1/3)
- checkExit() TP1_HIT, close < tp2_price → NONE
- checkExit() any state, hold > 60h → TIME_EXIT with full remaining
- checkExit() TIME_EXIT takes priority over TP check when both conditions met
- checkExit() CLOSED state → NONE regardless of price
- calcCloseSize() TP1 → exactly half of total size (Decimal precision)
- calcMfeMae() LONG price above entry → favorable increases
- calcMfeMae() LONG price below entry → adverse increases
- calcMfeMae() favorable never decreases (ratchet)
- calcMfeMae() SHORT direction reversed logic

## Validation
```bash
bun test -- --grep "exit-checker"
bun run typecheck
bun run lint
```

## Out of Scope
- 실제 주문 실행 (T-07-003 manager)
- 트레일링 스탑 계산 (T-07-002)
- DB 갱신 (manager)
- SL 이동 (manager)
