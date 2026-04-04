# T-07-003 청산 실행 매니저

## Goal
청산 조건 결과를 받아 부분 청산 주문 실행, SL 본절/트레일링 이동, Ticket 상태 전이, TP 가격 갱신, MFE/MAE 갱신을 수행하는 매니저를 구현한다.

## Why
checker(순수)와 trailing(순수)이 "무엇을 해야 하는지" 판단하면, manager가 "실제로 수행"한다. DB 트랜잭션과 거래소 주문을 조율하는 허브 역할이다.

## Inputs
- `src/exits/checker.ts` — checkExit(), calcMfeMae() (T-07-001 산출물)
- `src/exits/trailing.ts` — calculateTrailingSl(), shouldUpdateTrailingSl() (T-07-002 산출물)
- `src/positions/ticket-manager.ts` — transitionTicket(), closeTicket() (EP-06)
- `src/orders/executor.ts` — emergencyClose(), recordOrder() (EP-06)
- `src/core/ports.ts` — ExchangeAdapter (createOrder, editOrder, cancelOrder)
- `src/db/schema.ts` — ticketTable, orderTable

## Dependencies
- T-07-001 (exit checker)
- T-07-002 (trailing stop)

## Expected Outputs
- `src/exits/manager.ts` — `processExit()`, `updateTpPrices()`, `updateMfeMae()`
- E2E 테스트(T-07-006)에서 통합 검증

## Deliverables
- `src/exits/manager.ts`
- `tests/exits/manager.test.ts`
- `src/exits/index.ts` barrel export 업데이트

## Constraints
- ExchangeAdapter는 파라미터 주입 (import 아닌)
- 부분 청산은 reduceOnly 주문 (createOrder with reduceOnly=true)
- SL 이동: adapter.editOrder(). 미지원 시 cancel + create
- TP1 처리 후 SL 본절 이동 + trailing_active=true 설정 (단일 트랜잭션)
- Ticket 상태 전이는 EP-06 transitionTicket() 호출
- TP 가격 갱신: tp1=MA20_1H, tp2=반대편BB20_1H — 지표값은 파라미터로 받음
- 모든 금액 Decimal.js
- Order DB 기록: EP-06 recordOrder 패턴 활용

## Steps
1. ProcessExitParams, ExitResult, TpUpdateParams 타입 정의
2. `processExit(db, adapter, ticket, action) → ExitResult` 구현
   - TP1: 부분 청산 주문(size×0.50, reduceOnly) → SL 본절 이동(editOrder) → transitionTicket(TP1_HIT) → trailing_active=true, remaining_size 갱신
   - TP2: 부분 청산 주문(remaining×1/3, reduceOnly) → transitionTicket(TP2_HIT) → remaining_size 갱신
   - TIME_EXIT: 전량 청산(remaining, reduceOnly) → closeTicket(TIME_EXIT)
   - 모든 주문 DB 기록 (Order INSERT)
3. `processTrailing(db, adapter, ticket, currentPrice) → void` 구현
   - calcMaxProfit → calculateTrailingSl → shouldUpdateTrailingSl → 거래소 SL 이동 → DB trailing_price/max_profit 갱신
4. `updateTpPrices(db, ticketId, tp1, tp2) → void` — TP 가격 DB 갱신
5. `updateMfeMae(db, ticketId, mfeMae) → void` — MFE/MAE DB 갱신
6. 테스트 작성 후 구현 (TDD) — ExchangeAdapter mock

## Acceptance Criteria
- TP1 처리: 50% 부분 청산 + SL 본절 + trailing 시작 + TP1_HIT 전이
- TP2 처리: remaining의 1/3 부분 청산 + TP2_HIT 전이
- TIME_EXIT: 전량 청산 + CLOSED 전이 + close_reason=TIME_EXIT
- SL 본절: LONG → sl=entry_price, SHORT → sl=entry_price
- 트레일링: LONG SL 상향만, SHORT SL 하향만
- TP 가격 갱신: DB에 tp1_price, tp2_price 업데이트
- MFE/MAE: DB에 max_favorable, max_adverse 업데이트
- 모든 주문 reduceOnly
- Order DB 기록 정확 (order_type=TP1/TP2/TIME_EXIT/TRAILING)

## Test Scenarios
- processExit() TP1 LONG → partial close 50%, SL→entry, trailing_active=true, state=TP1_HIT
- processExit() TP1 SHORT → partial close 50%, SL→entry (SHORT 방향)
- processExit() TP2 → partial close remaining×1/3, state=TP2_HIT
- processExit() TIME_EXIT → full close remaining, state=CLOSED
- processExit() creates correct Order records (type, size, reduceOnly)
- processTrailing() price moved favorably → SL updated on exchange + DB
- processTrailing() price moved unfavorably → SL NOT updated (ratchet)
- processTrailing() SL edit fails → falls back to cancel+create
- updateTpPrices() → DB tp1_price, tp2_price updated
- updateMfeMae() → DB max_favorable, max_adverse updated
- All Decimal.js fields preserved in DB roundtrip

## Validation
```bash
bun test -- --grep "exit-manager"
bun run typecheck
bun run lint
```

## Out of Scope
- 청산 조건 판단 (T-07-001 checker)
- 트레일링 SL 계산 (T-07-002 trailing)
- 라벨링 (T-07-005)
- 피라미딩 (T-07-004)
