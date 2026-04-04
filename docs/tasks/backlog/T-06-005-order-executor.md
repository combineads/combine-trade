# T-06-005 주문 실행기

## Goal
진입 주문 실행 → SL 등록 → 실패 복구 → 모드 가드를 포함하는 주문 실행기를 구현한다.

## Why
포지션 진입의 안전성을 보장하는 핵심 모듈이다. SL 등록은 진입 후 최우선 동작(AGENTS.md 핵심 규칙)이며, SL 없는 포지션은 절대 허용되지 않는다. analysis 모드에서의 실수 방지를 위해 모드 가드도 필수다.

## Inputs
- `src/db/schema.ts` — orderTable (T-06-001 산출물)
- `src/positions/ticket-manager.ts` — createTicket (T-06-003 산���물)
- `src/orders/slippage.ts` — checkSlippage (T-06-006 산출물)
- `src/core/ports.ts` — ExchangeAdapter (createOrder, cancelOrder, fetchOrder, setLeverage)
- `src/core/types.ts` — ExecutionMode, OrderType, OrderStatus, OrderSide

## Dependencies
- T-06-001 (Order 스키���)
- T-06-003 (Ticket Manager — createTicket 호��)
- T-06-006 (슬리피지 체크)

## Expected Outputs
- `src/orders/executor.ts` — executeEntry() 함수
- Order 레코드 DB 기록
- 모드 가드, SL 등록, 실패 복구, 슬리피지 체크 통��

## Deliverables
- `src/orders/executor.ts`
- `tests/orders/executor.test.ts`
- `src/orders/index.ts` barrel export 업데이트

## Constraints
- analysis 모드에서 주문 실행 시도 시 하드 에러 (alert/live만 허용)
- SL 등록은 진입 체결 후 즉시 (다른 어떤 동작보다 선행)
- SL 등록 실패 시 3회 재시도 → 모두 실패 시 즉시 전량 청산 (fail-closed)
- 슬리피지 초과 시 즉시 ABORT + 전량 청산
- bracket order 지원: ExchangeAdapter.createOrder의 stopLoss 파라미터 사용. 미지원 거래소는 2-step fallback
- 2-step fallback: 진입 체결 확인 후 SL 등록까지 최대 3초, 초과 시 강제 청산
- 모든 Order INSERT는 idempotency_key 포함 (멱등성)
- intent_id로 동일 의도의 주문 그룹핑

## Steps
1. ExecuteEntryParams, ExecuteEntryResult 타입 정의
2. `assertNotAnalysisMode(mode) → void` — analysis 모드 가드 (하드 에러)
3. `executeEntry(db, adapter, params) → ExecuteEntryResult` 구현
   a. 모드 가드 확인
   b. 레버리지 설정 (adapter.setLeverage)
   c. intent_id 생성 (uuid)
   d. 진입 주문 생성 (adapter.createOrder with stopLoss for bracket)
   e. Order DB 기록 (ENTRY, PENDING → FILLED)
   f. 슬리피지 체크 (checkSlippage) → 초과 시 ABORT 플로우
   g. bracket 미지원 시 2-step SL 등록:
      - adapter.createOrder(stop_market, reduceOnly)
      - 3회 재시도, 전부 실패 시 강제 청산 (emergencyClose)
      - 3초 타임아웃 가드
   h. SL Order DB 기록
4. `emergencyClose(db, adapter, params) → void` — 강제 전량 청산
5. `recordOrder(db, params) → OrderRow` — Order DB INSERT (idempotency_key 기반 ON CONFLICT)
6. 테스트 작성 후 구현 (TDD) — ExchangeAdapter는 mock

## Acceptance Criteria
- analysis 모드에서 executeEntry() 호출 → 즉시 에러 throw
- alert/live 모드에서 정상 실행
- 진입 주문 체결 → SL 즉시 등록 (bracket order 사용 시 동시)
- SL 등록 실패 3회 → emergencyClose 호출
- 슬리피지 초과 → ABORT + emergencyClose
- 2-step SL: 3초 타임아웃 초과 시 emergencyClose
- 모든 주문에 idempotency_key 설정
- Order.exchange === Ticket.exchange 검증
- 모든 Order DB 기록 정확 (status, filled_price, slippage 등)

## Test Scenarios
- executeEntry() in analysis mode → throws ExecutionModeError
- executeEntry() in alert mode → executes successfully
- executeEntry() in live mode → executes successfully
- executeEntry() with bracket order support → entry + SL created in single call
- executeEntry() without bracket support → entry first, then SL separately
- executeEntry() SL registration fails 1st, succeeds 2nd retry → SL registered
- executeEntry() SL registration fails all 3 retries → emergencyClose called
- executeEntry() slippage exceeds threshold → ABORT + emergencyClose
- executeEntry() slippage within threshold → continues normally
- executeEntry() 2-step SL within 3s timeout → SL registered
- emergencyClose() → market close order created with reduceOnly
- recordOrder() with idempotency_key conflict → ON CONFLICT returns existing
- Order record has correct intent_id grouping entry + SL
- All price fields in Order are Decimal (not number)

## Validation
```bash
bun test -- --grep "executor"
bun run typecheck
bun run lint
```

## Out of Scope
- 포지션 사���징 (T-06-004 — 호출자가 미리 계산하여 전달)
- 3단계 청산 주문 (EP-07)
- 대조(reconciliation) (EP-08)
- 실제 거래소 연동 테스트 (sandbox — 향후)
