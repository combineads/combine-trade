# T-06-003 티켓 CRUD + SymbolState FSM 연동

## Goal
Ticket CRUD 함수와 SymbolState.fsm_state 연동을 단일 트랜잭션으로 구현한다.

## Why
티켓 생성/상태 전이/조회는 포지션 관리의 기반이다. SymbolState.fsm_state 연동이 티켓 생성/종료와 원자적으로 이루어져야 시스템 상태 일관성이 보장된다.

## Inputs
- `src/db/schema.ts` — ticketTable, orderTable, symbolStateTable (T-06-001 산출물)
- `src/positions/fsm.ts` — validateTransition, canTransition (T-06-002 산출물)
- `docs/DATA_MODEL.md` — Ticket CRUD 규칙, SymbolState 동시 접근 규칙
- `docs/ARCHITECTURE.md` — positions L5, 잠금 순서: SymbolState → Ticket → Order

## Dependencies
- T-06-001 (Ticket, Order 스키마)
- T-06-002 (FSM 전이 로직)

## Expected Outputs
- `src/positions/ticket-manager.ts` — createTicket(), closeTicket(), transitionTicket(), getActiveTicket(), getTicketById()
- 모든 상태 변경은 단일 DB 트랜잭션
- SymbolState.fsm_state가 티켓 생성/종료와 동기화

## Deliverables
- `src/positions/ticket-manager.ts`
- `tests/positions/ticket-manager.test.ts`
- `src/positions/index.ts` barrel export 업데이트

## Constraints
- 모든 상태 변경 함수는 단일 SQL 트랜잭션
- SymbolState FOR UPDATE 잠금 사용 (잠금 순서: SymbolState → Ticket)
- 심볼×거래소당 활성 티켓 1개 제약 (state != 'CLOSED')
- 모든 금액 필드 Decimal.js (string으로 DB 저장)
- fsm.ts의 validateTransition()을 반드시 호출하여 전이 검증

## Steps
1. `createTicket(db, params) → Ticket` 구현
   - 트랜잭션 내: SymbolState FOR UPDATE 잠금 → fsm_state가 WATCHING인지 확인 → Ticket INSERT → SymbolState.fsm_state = 'HAS_POSITION' 갱신
   - 이미 활성 티켓이 있으면 에러
2. `transitionTicket(db, ticketId, newState) → Ticket` 구현
   - 트랜잭션 내: Ticket FOR UPDATE → validateTransition() → UPDATE state
3. `closeTicket(db, ticketId, closeReason, result, pnl) → Ticket` 구현
   - 트랜잭션 내: SymbolState FOR UPDATE → Ticket FOR UPDATE → validateTransition(current, CLOSED) → UPDATE ticket (state, closed_at, close_reason, result, pnl, pnl_pct, hold_duration_sec) → SymbolState.fsm_state = 'IDLE'
4. `getActiveTicket(db, symbol, exchange) → Ticket | null`
5. `getTicketById(db, ticketId) → Ticket | null`
6. 테스트 작성 후 구현 (TDD)

## Acceptance Criteria
- createTicket: WATCHING 상태에서만 생성 허용, 생성 후 fsm_state = HAS_POSITION
- createTicket: 이미 활성 티켓 존재 시 에러
- transitionTicket: FSM 규칙을 위반하는 전이 시 에러
- closeTicket: 티켓 종료 후 fsm_state = IDLE
- closeTicket: pnl, pnl_pct, hold_duration_sec 정확 계산
- 모든 상태 변경은 단일 트랜잭션 (중간 실패 시 전체 롤백)
- FOR UPDATE 잠금으로 동시 접근 보호
- Order 생성 시 Order.exchange === Ticket.exchange 검증

## Test Scenarios
- createTicket() with WATCHING state → ticket created, fsm_state = HAS_POSITION
- createTicket() with IDLE state → throws InvalidStateError
- createTicket() with existing active ticket → throws DuplicateTicketError
- createTicket() verify all Decimal.js fields stored as numeric strings
- transitionTicket(INITIAL, TP1_HIT) → state updated to TP1_HIT
- transitionTicket(INITIAL, TP2_HIT) → throws InvalidTransitionError (skip not allowed)
- closeTicket() → state = CLOSED, fsm_state = IDLE, closed_at set, hold_duration_sec calculated
- closeTicket() with pnl > 0 → result = WIN
- closeTicket() with pnl < 0 → result = LOSS
- getActiveTicket() with active ticket → returns ticket
- getActiveTicket() with no active ticket → returns null
- getActiveTicket() with CLOSED ticket only → returns null
- Transaction rollback: createTicket fails mid-transaction → SymbolState unchanged
- Concurrent createTicket for same symbol → one succeeds, one fails (FOR UPDATE)

## Validation
```bash
bun test -- --grep "ticket-manager"
bun run typecheck
bun run lint
```

## Out of Scope
- 주문 실행 (T-06-005)
- 포지션 사이징 (T-06-004)
- 피라미딩 (EP-07)
- 3단계 청산 (EP-07)
