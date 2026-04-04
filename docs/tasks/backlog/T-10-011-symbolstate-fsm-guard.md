# T-10-011 SymbolState FSM 전이 가드 추가

## Goal
SymbolState FSM(IDLE/WATCHING/HAS_POSITION)에 Ticket FSM과 동일한 패턴의 전이 가드를 추가한다. SYMBOL_STATE_TRANSITION_MAP을 정의하고, validateSymbolStateTransition() 순수 함수로 허용되지 않는 전이(예: IDLE → HAS_POSITION 직접 전이)를 앱 레벨에서 차단한다.

## Why
현재 SymbolState의 fsm_state 변경이 아무런 검증 없이 이루어지고 있어, 논리적으로 불가능한 상태 전이(IDLE에서 WATCHING을 거치지 않고 곧바로 HAS_POSITION으로 전이)가 발생할 수 있다. Ticket FSM에는 이미 TRANSITION_MAP + validateTransition() 패턴이 구현되어 있으므로, SymbolState에도 동일한 패턴을 적용하여 상태 무결성을 보장해야 한다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M3 SymbolState FSM 전이 가드 요구사항
- `src/positions/fsm.ts` — Ticket FSM 구현 (TRANSITION_MAP, validateTransition 패턴 참고)
- `src/core/types.ts` — `FsmState = "IDLE" | "WATCHING" | "HAS_POSITION"` 타입 정의

## Dependencies
- 없음 (독립 태스크)

## Expected Outputs
- `src/positions/fsm.ts` — SYMBOL_STATE_TRANSITION_MAP 추가, validateSymbolStateTransition() 순수 함수 추가, canSymbolStateTransition() 함수 추가, InvalidSymbolStateTransitionError 에러 클래스 추가
- `tests/positions/symbol-state-fsm.test.ts` — SymbolState FSM 전이 가드 테스트

## Deliverables
- `src/positions/fsm.ts`
- `tests/positions/symbol-state-fsm.test.ts`

## Constraints
- 기존 Ticket FSM 코드(TRANSITION_MAP, validateTransition, canTransition 등)를 수정하지 않음
- SymbolState FSM은 Ticket FSM과 동일한 패턴(TRANSITION_MAP + 순수 함수)으로 구현하되 별도 이름 사용 (SYMBOL_STATE_TRANSITION_MAP, validateSymbolStateTransition)
- FsmState 타입(`"IDLE" | "WATCHING" | "HAS_POSITION"`)은 `src/core/types.ts`에 이미 정의됨 — 변경 불필요
- 순수 함수로 구현 — DB 접근, side effect 없음
- 허용되는 전이: IDLE → WATCHING, WATCHING → HAS_POSITION, HAS_POSITION → IDLE, WATCHING → IDLE
- 차단되는 전이: IDLE → HAS_POSITION (반드시 WATCHING 경유), 동일 상태 → 동일 상태, HAS_POSITION → WATCHING

## Steps
1. `src/positions/fsm.ts`에 InvalidSymbolStateTransitionError 에러 클래스 추가 (InvalidTransitionError와 유사한 패턴)
2. SYMBOL_STATE_TRANSITION_MAP 정의: `{ IDLE: ["WATCHING"], WATCHING: ["HAS_POSITION", "IDLE"], HAS_POSITION: ["IDLE"] }`
3. canSymbolStateTransition(from: FsmState, to: FsmState): boolean 순수 함수 추가
4. validateSymbolStateTransition(from: FsmState, to: FsmState): void 순수 함수 추가 (실패 시 InvalidSymbolStateTransitionError throw)
5. getAllowedSymbolStateTransitions(current: FsmState): readonly FsmState[] 헬퍼 추가
6. 테스트 파일 작성: 모든 유효/무효 전이 검증
7. typecheck + lint 통과 확인

## Acceptance Criteria
- SYMBOL_STATE_TRANSITION_MAP이 IDLE/WATCHING/HAS_POSITION 전이를 정확히 정의
- IDLE → HAS_POSITION 직접 전이 시 InvalidSymbolStateTransitionError throw
- IDLE → WATCHING → HAS_POSITION 순차 전이는 모두 통과
- HAS_POSITION → IDLE 전이 통과 (포지션 청산 후 복귀)
- WATCHING → IDLE 전이 통과 (감시 취소)
- 동일 상태 → 동일 상태 전이는 차단
- 기존 Ticket FSM 테스트 전부 통과 (회귀 없음)

## Test Scenarios
- IDLE → WATCHING → canSymbolStateTransition returns true, validateSymbolStateTransition 통과
- WATCHING → HAS_POSITION → 유효, validateSymbolStateTransition 통과
- IDLE → HAS_POSITION → 무효, InvalidSymbolStateTransitionError throw
- HAS_POSITION → IDLE → 유효 (포지션 청산 후 복귀)
- WATCHING → IDLE → 유효 (감시 취소)
- HAS_POSITION → WATCHING → 무효, throw
- 동일 상태(IDLE → IDLE, WATCHING → WATCHING, HAS_POSITION → HAS_POSITION) → 모두 무효, throw

## Validation
```bash
bun test -- --grep "symbol-state-fsm"
bun test -- --grep "fsm"
bun run typecheck
bun run lint
```

## Out of Scope
- Ticket FSM 변경 (기존 TRANSITION_MAP, validateTransition 등)
- SymbolState DB 업데이트 로직 (호출부에서 validateSymbolStateTransition 사용)
- 다른 M3 안전장치 (spread 사전 체크, 계좌 일일 손실 등)
