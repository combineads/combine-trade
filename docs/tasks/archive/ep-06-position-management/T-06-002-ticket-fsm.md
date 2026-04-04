# T-06-002 Ticket FSM 상태 전이

## Goal
Ticket의 FSM(INITIAL → TP1_HIT → TP2_HIT → CLOSED) 상태 전이 규칙을 순수 함수로 구현한다.

## Why
Ticket 상태 전이는 포지션 관리의 핵심 로직이다. 유효하지 않은 전이를 방지하여 포지션 무결성을 보장해야 한다. 순수 함수로 구현하여 백테스트에서 DB 없이 재사용 가능하게 한다.

## Inputs
- `src/core/types.ts` — TicketState, CloseReason 타입
- `docs/DATA_MODEL.md` — Ticket FSM: INITIAL → TP1_HIT → TP2_HIT → CLOSED
- `docs/ARCHITECTURE.md` — positions 모듈 L5

## Dependencies
- 없음 (순수 함수, EP-01의 types.ts만 사용)

## Expected Outputs
- `src/positions/fsm.ts` — 순수 함수: `validateTransition()`, `getNextState()`, `canTransition()`
- Ticket FSM 전이 규칙 정의

## Deliverables
- `src/positions/fsm.ts`
- `tests/positions/fsm.test.ts`
- `src/positions/index.ts` barrel export 업데이트

## Constraints
- 순수 함수만 — DB import 금지, 사이드이펙트 금지
- TicketState 타입은 core/types.ts에서 import (이미 정의됨)
- 유효하지 않은 전이 시 에러 throw (fail-closed)

## Steps
1. 허용 전이 맵 정의: INITIAL→TP1_HIT, INITIAL→CLOSED, TP1_HIT→TP2_HIT, TP1_HIT→CLOSED, TP2_HIT→CLOSED
2. `canTransition(from, to) → boolean` — 전이 가능 여부 확인
3. `validateTransition(from, to) → void` — 불가능 시 에러 throw
4. `getNextState(current, event) → TicketState` — 이벤트 기반 전이 (TP1_HIT_EVENT, TP2_HIT_EVENT, CLOSE_EVENT)
5. `getAllowedTransitions(current) → TicketState[]` — 현재 상태에서 가능한 전이 목록
6. 테스트 작성 후 구현 (TDD)

## Acceptance Criteria
- INITIAL → TP1_HIT 허용
- INITIAL → CLOSED 허용 (SL, PANIC_CLOSE 등으로 직접 종료)
- TP1_HIT → TP2_HIT 허용
- TP1_HIT → CLOSED 허용
- TP2_HIT ��� CLOSED 허용
- CLOSED → 어떤 상태로든 전이 불가 (terminal state)
- 역방향 전이 불가 (TP1_HIT → INITIAL 등)
- TP2_HIT → TP1_HIT 불가 (건너뛰기)
- INITIAL → TP2_HIT 불가 (TP1 건너뛰기)

## Test Scenarios
- canTransition(INITIAL, TP1_HIT) → true
- canTransition(INITIAL, CLOSED) → true (SL/패닉으로 직접 종료)
- canTransition(TP1_HIT, TP2_HIT) → true
- canTransition(TP1_HIT, CLOSED) → true
- canTransition(TP2_HIT, CLOSED) → true
- canTransition(CLOSED, INITIAL) → false (terminal state)
- canTransition(TP1_HIT, INITIAL) → false (역방향)
- canTransition(INITIAL, TP2_HIT) → false (TP1 건너뛰기)
- validateTransition(CLOSED, TP1_HIT) → throws InvalidTransitionError
- getNextState(INITIAL, TP1_HIT_EVENT) → TP1_HIT
- getNextState(INITIAL, CLOSE_EVENT) → CLOSED
- getAllowedTransitions(INITIAL) → [TP1_HIT, CLOSED]
- getAllowedTransitions(CLOSED) → [] (빈 배열)

## Validation
```bash
bun test -- --grep "fsm"
bun run typecheck
bun run lint
```

## Out of Scope
- DB 저장 (T-06-003 ticket-manager)
- SymbolState.fsm_state 연동 (T-06-003)
- TP/SL 가격 판단 로직 (EP-07)
