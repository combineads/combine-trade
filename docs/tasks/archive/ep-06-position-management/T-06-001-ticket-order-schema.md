# T-06-001 Ticket, Order 테이블 Drizzle 스키마 & 마이그레이션

## Goal
DATA_MODEL.md의 Ticket, Order 엔티티를 Drizzle ORM 스키마로 정의하고 마이그레이션(0005)을 생성한다.

## Why
EP-06 전체(FSM, 주문 실행, 손실 제한)가 Ticket과 Order 테이블에 의존한다. 스키마가 없으면 후속 태스크가 시작할 수 없다.

## Inputs
- `docs/DATA_MODEL.md` — Ticket, Order 엔티티 상세, CHECK 제약, 인덱스 전략
- `src/db/schema.ts` — 기존 테이블 정의 (Symbol, SymbolState, CommonCode, Candle, TradeBlock, WatchSession, Signal, SignalDetail, Vector)
- `src/core/types.ts` — TicketState, CloseReason, TradeResult, OrderType, OrderStatus, OrderSide 타입 정의 완료

## Dependencies
- 없음 (EP-01~05 완료)

## Expected Outputs
- `src/db/schema.ts`에 `ticketTable`, `orderTable` 추가 + 타입 export
- `drizzle/0005_*.sql` 마이그레이션 파일
- Ticket → Signal FK (RESTRICT), Ticket → Symbol FK (RESTRICT), Ticket → Ticket FK (SET NULL)
- Order → Ticket FK (SET NULL), Order UNIQUE(exchange, idempotency_key)

## Deliverables
- `src/db/schema.ts` 확장 (ticketTable, orderTable 정의)
- `drizzle/0005_*.sql` 마이그레이션 생성 (`bunx drizzle-kit generate`)

## Constraints
- 모든 금액/가격 컬럼은 `numeric` (절대 float 금지)
- DATA_MODEL.md의 CHECK 제약조건, FK 정책, 인덱스를 정확히 반영
- 기존 테이블 정의를 수정하지 않음
- Ticket.signal_id는 UNIQUE (시그널 1개당 티켓 0~1개)

## Steps
1. DATA_MODEL.md의 Ticket, Order 엔티티 상세를 읽고 모든 컬럼, CHECK, FK, 인덱스를 파악
2. `src/db/schema.ts`에 ticketTable 정의 추가
   - 모든 컬럼, FK (Signal RESTRICT, Symbol RESTRICT, Ticket self-ref SET NULL), CHECK 제약
   - Partial index: (symbol, exchange, state) WHERE state != 'CLOSED'
3. `src/db/schema.ts`에 orderTable 정의 추가
   - 모든 컬럼, FK (Ticket SET NULL), CHECK 제약
   - UNIQUE(exchange, idempotency_key), index(ticket_id, created_at), index(intent_id)
4. 타입 export (TicketRow, NewTicketRow, OrderRow, NewOrderRow)
5. `bunx drizzle-kit generate`로 마이그레이션 SQL 생성
6. 생성된 SQL 검토 — CHECK 제약, 인덱스가 누락되었으면 수동 추가
7. 테스트 작성 및 실행

## Acceptance Criteria
- ticketTable, orderTable이 schema.ts에 정의됨
- Ticket: 26개 컬럼, FK 3개 (Symbol RESTRICT, Signal RESTRICT, self SET NULL)
- Order: 17개 컬럼, FK 1개 (Ticket SET NULL)
- CHECK 제약: Ticket.state, Ticket.direction, Ticket.timeframe, Ticket.close_reason, Ticket.result, Order.exchange, Order.order_type, Order.status, Order.side
- Partial index: 활성 티켓 (state != 'CLOSED')
- UNIQUE: Ticket.signal_id, Order(exchange, idempotency_key)
- 마이그레이션 SQL 생성 완료
- `bun run typecheck` 통과

## Test Scenarios
- ticketTable INSERT with all required fields → row created with defaults (state='INITIAL', trailing_active=false, pyramid_count=0)
- ticketTable INSERT with duplicate signal_id → unique constraint violation
- ticketTable INSERT with invalid state value → CHECK constraint violation
- ticketTable INSERT with invalid direction → CHECK constraint violation
- ticketTable FK: signal_id referencing non-existent signal → FK violation
- ticketTable FK: delete signal with existing ticket → RESTRICT prevents deletion
- ticketTable self-ref: parent_ticket_id referencing existing ticket → success
- ticketTable self-ref: delete parent ticket → child's parent_ticket_id SET NULL
- orderTable INSERT with all required fields → row created
- orderTable INSERT with duplicate (exchange, idempotency_key) → unique constraint violation
- orderTable INSERT with invalid order_type → CHECK constraint violation
- orderTable INSERT with ticket_id=NULL (panic close) → success
- orderTable FK: delete ticket with existing orders → orders.ticket_id SET NULL
- Partial index: active tickets query uses index (WHERE state != 'CLOSED')
- All price/size columns accept numeric with high precision (e.g., '85432.12345678')

## Validation
```bash
bun test -- --grep "schema-ticket|schema-order"
bun run typecheck
bun run lint
```

## Out of Scope
- Ticket FSM 로직 (T-06-002)
- Order 실행 로직 (T-06-005)
- 시드 데이터 삽입
