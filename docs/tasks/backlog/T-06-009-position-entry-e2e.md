# T-06-009 포지션 진입 E2E 통합 테스트

## Goal
Signal → Sizer → Executor → Ticket → Loss Limit 전체 진입 플로우를 E2E 통합 테스트로 검증한다.

## Why
개별 모듈 단위 테스트로는 모듈 간 통합 정합성을 보장할 수 없다. EP-05의 pipeline-e2e.test.ts 패턴을 따라 실제 DB + mock exchange adapter로 전체 흐름을 검증한다.

## Inputs
- `src/positions/ticket-manager.ts` (T-06-003)
- `src/positions/sizer.ts` (T-06-004)
- `src/orders/executor.ts` (T-06-005)
- `src/limits/loss-limit.ts` (T-06-007, T-06-008)
- `src/signals/` — EP-05 Signal 생성 함수들
- `tests/helpers/test-db.ts` — EP-04 DB 테스트 인프라

## Dependencies
- T-06-003 (ticket-manager)
- T-06-004 (sizer)
- T-06-005 (executor)
- T-06-007 (loss-limit)
- T-06-008 (loss-counter-reset)

## Expected Outputs
- `tests/positions/position-entry-e2e.test.ts` — 5+ E2E 시나리오
- 전체 파이프라인 정합성 증명

## Deliverables
- `tests/positions/position-entry-e2e.test.ts`

## Constraints
- 실제 PostgreSQL DB 사용 (mock DB 금지)
- ExchangeAdapter는 mock (실제 거래소 호출 금지)
- EP-05 pipeline-e2e.test.ts 패턴 따르기 (seedTestData → 실행 → 검증)
- 각 시나리오는 독립적 (테스트 간 상태 공유 없음)

## Steps
1. Mock ExchangeAdapter 생성 (createOrder → 성공/실패 시뮬레이션)
2. 테스트 데이터 시드: Symbol, SymbolState(WATCHING), CommonCode(POSITION, LOSS_LIMIT, SLIPPAGE), Signal, WatchSession
3. 시나리오별 테스트 작성:
   a. 정상 LONG 진입 플로우
   b. 정상 SHORT 진입 플로우
   c. 손실 제한 초과 시 진입 차단
   d. SL 등록 실패 → 강제 청산
   e. 슬리피지 초과 → ABORT
   f. analysis 모드 → 실행 차단
4. 각 시나리오에서 DB 상태 검증 (Ticket, Order, SymbolState)

## Acceptance Criteria
- 5개 이상 E2E 시나리오 통과
- 실제 DB에서 Ticket, Order 레코드 정확 생성/검증
- SymbolState.fsm_state 전이 검증 (WATCHING → HAS_POSITION)
- 손실 제한 차단 시 Ticket/Order 미생성 확인
- SL 실패/슬리피지 시 emergencyClose 호출 및 상태 정리 확인
- analysis 모드 차단 확인
- 모든 금액이 Decimal.js (DB에서 읽어서 비교)

## Test Scenarios
- LONG 전체 플로우: Signal(LONG) → calculateSize → executeEntry → createTicket → fsm_state=HAS_POSITION, Ticket INITIAL, Order(ENTRY+SL) FILLED
- SHORT 전체 플로우: Signal(SHORT) → 동일 검증, direction=SHORT
- 손실 제한 초과: losses_today=10% → checkLossLimit → allowed=false → 진입 시도 없음, Ticket/Order 미생성
- SL 등록 전부 실패: mock adapter SL 3회 실패 → emergencyClose → PANIC_CLOSE Order 생성, Ticket 미생성 또는 CLOSED
- 슬리피지 초과: mock adapter 높은 체결가 반환 → checkSlippage failed → emergencyClose → ABORT Order 기록
- analysis 모드: execution_mode='analysis' → ExecutionModeError throw, DB 변경 없음
- 레버리지 캡: SL이 매우 타이트하여 38x 초과 → 포지션 축소 후 정상 진입

## Validation
```bash
bun test -- --grep "position-entry-e2e"
bun run typecheck
bun run lint
```

## Out of Scope
- 3단계 청산 테스트 (EP-07)
- 피라미딩 테스트 (EP-07)
- 실제 거래소 연동 (sandbox)
- 데몬 오케스트레이션 (EP-09)
