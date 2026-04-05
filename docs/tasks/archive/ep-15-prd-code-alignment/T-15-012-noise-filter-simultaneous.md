# T-15-012 1M 노이즈 필터 수정 + 5M/1M 동시 신호 억제 구현

## Metadata
- modules: [signals, daemon]
- primary: signals

## Goal
1M 노이즈 필터를 PRD §7.7 기준(5M MA20 방향)으로 수정하고, PRD §7.16의 5M/1M 동시 신호 억제 로직을 구현한다.

## Why
현재 safety-gate.ts:207-218의 checkNoise1M()은 1M SMA20로 방향을 판단하나, PRD §7.7은 "5M MA20 방향 ≠ 일봉 방향 → PASS"를 요구한다. 또한 동시 신호 시 1M 우선 실행 로직이 없다.

## Inputs
- `src/signals/safety-gate.ts` (checkNoise1M 함수)
- `src/daemon/pipeline.ts` (진입 파이프라인)
- PRD §7.7, §7.16
- `src/backtest/engine.ts` (TIMEFRAME_PRIORITY 참조)

## Dependencies
- T-15-008 (pipeline.ts makeDecision 호출부 변경 완료 — 같은 파일 수정 충돌 방지)

## Expected Outputs
- 수정된 checkNoise1M() — 5M MA20 방향 사용
- 동시 신호 억제 로직 구현

## Deliverables
- `src/signals/safety-gate.ts` — checkNoise1M() 수정: 5M MA20 기울기/위치 참조
- `src/daemon/pipeline.ts` — 5M/1M 동시 신호 억제 로직 추가
- `tests/signals/safety-gate.test.ts` — 노이즈 필터 테스트 갱신
- `tests/daemon/pipeline.test.ts` — 동시 신호 테스트 추가

## Constraints
- checkNoise1M에 5M 지표 데이터를 전달하는 인터페이스 필요
- backtest/engine.ts의 TIMEFRAME_PRIORITY와 코드 경로 동일성 고려
- evidence-gate의 aGrade 로직 변경 불필요 (이미 정상)

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/signals/safety-gate.ts` checkNoise1M() 수정:
   - 파라미터에 5M MA20 지표 추가 (sma20_5m)
   - 1M SMA20 대신 5M MA20 방향으로 판단
4. pipeline.ts에서 checkNoise1M 호출 시 5M 지표 전달
5. 동시 신호 억제 로직 구현:
   - 동일 심볼에서 5M/1M 신호 동시 발생 감지
   - 1M 우선 실행, 5M 억제
6. Run tests — confirm all pass (GREEN phase)
7. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- checkNoise1M()이 5M MA20 방향을 사용 (1M SMA20 아님)
- 5M MA20 bullish + LONG_ONLY → 통과
- 5M MA20 bearish + LONG_ONLY → 차단
- 5M/1M 동시 신호 시 1M만 실행, 5M 억제됨
- `bun run typecheck` 통과

## Test Scenarios
- checkNoise1M() with 5M MA20 bullish + LONG_ONLY bias → returns null (pass)
- checkNoise1M() with 5M MA20 bearish + LONG_ONLY bias → returns "noise_1m" (fail)
- checkNoise1M() with 5M MA20 bullish + SHORT_ONLY bias → returns "noise_1m" (fail)
- checkNoise1M() with 5M MA20 null → returns null (pass, no data)
- checkNoise1M() with timeframe="5M" → returns null (only applies to 1M)
- Simultaneous 5M+1M signals for same symbol → 1M executes, 5M suppressed
- Simultaneous signals for different symbols → both execute normally

## Validation
- `bun test -- --grep "noise|simultaneous|safety-gate"`
- `bun run typecheck`

## Out of Scope
- Evidence gate 변경
- A-grade 로직 (M4에서 완료)
- Daily direction filter 변경
