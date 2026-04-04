# T-07-004 피라미딩 조건 검사 & 2차 진입

## Goal
피라미딩 조건 검사(순수) + 2차 진입 실행(DB)을 구현한다.

## Why
피라미딩은 이미 수익 중인 포지션에 추가 진입하여 수익을 확대하는 전략이다. TP1 달성 + SL 본절(무위험 확정) 상태에서만 허용하여 리스크를 통제한다.

## Inputs
- `src/positions/ticket-manager.ts` — createTicket() (EP-06)
- `src/positions/sizer.ts` — calculateSize() (EP-06)
- `src/orders/executor.ts` — executeEntry() (EP-06)
- `src/db/schema.ts` — ticketTable (parent_ticket_id, pyramid_count)
- `src/core/types.ts` — TicketState, Direction

## Dependencies
- 없음 (EP-06 완료 — ticket-manager, sizer, executor 모두 사용 가능)

## Expected Outputs
- `src/positions/pyramid.ts` — `canPyramid()` 순수 함수, `executePyramid()` DB 함수
- exit manager(T-07-003) 또는 daemon이 새 시그널 시 호출

## Deliverables
- `src/positions/pyramid.ts`
- `tests/positions/pyramid.test.ts`
- `src/positions/index.ts` barrel export 업데이트

## Constraints
- `canPyramid()` 는 순수 함수 — DB import 금지
- `executePyramid()` 는 EP-06의 sizer + executor + createTicket 재사용
- 최대 pyramid_count 2 하드캡 (CommonCode POSITION.max_pyramid_count, 기본 2)
- 2차 티켓의 parent_ticket_id = 1차 티켓 ID
- 2차 진입도 동일 risk_pct 적용 (현재 잔고 기준 재계산)
- LONG: SL 본절 = current_sl_price >= entry_price
- SHORT: SL 본절 = current_sl_price <= entry_price

## Steps
1. PyramidConfig, PyramidCheckResult 타입 정의
2. `canPyramid(ticket, config) → PyramidCheckResult` (순수)
   - state === TP1_HIT (또는 이후 상태)
   - SL이 본절 이상/이하 (방향별)
   - pyramid_count < max_pyramid_count
   - 결과: { allowed, reason? }
3. `executePyramid(db, adapter, parentTicket, signal, balance, config) → TicketRow` (DB)
   - calculateSize() → executeEntry() → createTicket(with parent_ticket_id)
   - parent ticket의 pyramid_count 증가
4. `loadPyramidConfig(db) → PyramidConfig` — CommonCode에서 설정 로드
5. 테스트 작성 후 구현 (TDD)

## Acceptance Criteria
- canPyramid: state=TP1_HIT + SL 본절 + count < max → allowed=true
- canPyramid: state=INITIAL → allowed=false (TP1 미달성)
- canPyramid: SL이 본절 미만 → allowed=false
- canPyramid: pyramid_count=2 → allowed=false (하드캡)
- executePyramid: 2차 티켓 생성, parent_ticket_id 설정
- executePyramid: 1차 티켓의 pyramid_count 증가
- 2차 진입도 동일 risk_pct (현재 잔고 기준)

## Test Scenarios
- canPyramid() state=TP1_HIT, SL at breakeven, count=0 → allowed=true
- canPyramid() state=INITIAL → allowed=false, reason="TP1 not reached"
- canPyramid() state=TP1_HIT, SL below entry (LONG) → allowed=false, reason="SL not at breakeven"
- canPyramid() state=TP1_HIT, SL above entry (SHORT) → allowed=false
- canPyramid() pyramid_count=2 → allowed=false, reason="max pyramid reached"
- canPyramid() state=TP2_HIT, SL at breakeven → allowed=true (TP1 이후 상태)
- executePyramid() → creates child ticket with parent_ticket_id set
- executePyramid() → parent ticket pyramid_count incremented
- executePyramid() uses current balance for sizing (not original)
- loadPyramidConfig() reads CommonCode.POSITION.max_pyramid_count (default 2)

## Validation
```bash
bun test -- --grep "pyramid"
bun run typecheck
bun run lint
```

## Out of Scope
- TP1 달성 처리 (T-07-003 exit manager)
- SL 본절 이동 (T-07-003)
- 시그널 생성 (EP-05)
- 2차 진입 시그널 판단 (EP-09 daemon 오케스트레이션)
