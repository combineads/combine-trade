# T-18-008 TP/트레일링 타임프레임 가드

## Metadata
- modules: [daemon]
- primary: daemon

## Goal
TP1/TP2 체크를 5M close에서만, 트레일링 SL 갱신을 1H close에서만 실행하도록 타임프레임 가드를 추가한다. TIME_EXIT(60h)와 SL 체크는 모든 TF에서 유지.

## Why
김직선 선생님 원칙: "TP는 5M이 메인. 1M은 노이즈에 반응, 1H은 느림. 트레일링은 큰 그림에서 봐야 한다." 현재 코드는 모든 TF(1D/1H/5M/1M) candle close에서 TP와 ��레일링을 체크하여 PRD §7.13과 불일치.

## Inputs
- PRD §7.13 L326: TP1 `매 5M close`
- PRD §7.13 L327: TP2 `매 5M close`
- PRD §7.13 L328: 트레일링 `매 1H close`
- `src/daemon/pipeline.ts:435-438` — 현재 모든 TF에서 processExits 호출

## Dependencies
- 없음

## Expected Outputs
- 수정된 `src/daemon/pipeline.ts`
- 테스트

## Deliverables
- `processExits()` 호출을 세분화:
  - TIME_EXIT 체크: 모든 TF (안전장치 — 가능한 한 자주)
  - SL 체크 (거래소에서 처리하지만 데몬도 확인): 모든 TF
  - TP1/TP2 체크: `timeframe === "5M"` 일 때만
  - 트레일링 SL 갱신: `timeframe === "1H"` 일 때만
- 기존 `processExits` 단일 호출을 분기하거나, `checkExit()`에 timeframe 인자 전달하여 내부 분기

## Constraints
- `checkExit()` 순수 함수 시그니처 — timeframe 파라미터 추가 가능
- `processTrailing()` — 1H close에서만 호출
- TIME_EXIT는 PRD에서 TF 제한 없음 → 모든 TF 유지
- SL은 거래소에 등록되어 있지만 데몬도 확인 → 모든 TF 유지

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `pipeline.ts:435-438` 영역을 리팩터:
   - 모든 TF: TIME_EXIT 체크 + SL 모니터링
   - `timeframe === "5M"`: TP1/TP2 체크 추가
   - `timeframe === "1H"`: 트레일링 갱신 추가
4. `checkExit()` 또는 `processExits()`에 timeframe 인자 추가
5. `checkExit()` 내부에서 TP1/TP2 로직을 timeframe !== "5M"이면 스킵
6. 트레일링 호출을 1H 분기 안에서만 실행
7. Run tests — confirm all pass (GREEN phase)
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] 1M candle close → TIME_EXIT 체크 ✅, TP1/TP2 ❌, 트레일링 ❌
- [x] 5M candle close → TIME_EXIT 체크 ✅, TP1/TP2 ✅, 트레일링 ❌
- [x] 1H candle close → TIME_EXIT 체크 ✅, TP1/TP2 ❌, 트레일링 ✅
- [x] 1D candle close → TIME_EXIT 체크 ✅, TP1/TP2 ❌, 트레일링 ❌
- [x] TP1 도달 시 5M close에서만 50% 청산 + 본절 이동
- [x] 트레일링 SL = entry + max_profit × 0.50, 1H close에서만 갱신

## Test Scenarios
- processExits() with timeframe="1M" and TP1 price hit → no TP action (skipped)
- processExits() with timeframe="5M" and TP1 price hit → TP1 action triggered
- processExits() with timeframe="1H" and trailing active → trailing SL updated
- processExits() with timeframe="5M" and trailing active → trailing NOT updated
- processExits() with timeframe="1M" and hold > 60h → TIME_EXIT triggered (all TF)
- processExits() with timeframe="1D" → only TIME_EXIT check, no TP/trailing

## Validation
```bash
bun test src/daemon/pipeline.test.ts
bun test src/exits/checker.test.ts
bun run typecheck
```

## Out of Scope
- exit manager 내부 로직 변경 (TP 가격 계산, 트레일링 수식)
- SL 모니터링 로직 변경 없음

## Implementation Notes (2026-04-05)

### Approach chosen: Option A — pass `timeframe` through the call chain

1. `checkExit()` in `src/exits/checker.ts`: added optional `timeframe?: Timeframe` 4th parameter.
   - TIME_EXIT guard runs before the timeframe check (all TF safety)
   - When `timeframe !== undefined && timeframe !== "5M"`, returns NONE immediately (skips TP1/TP2)
   - When `timeframe` is `undefined` (backtest, legacy callers), all checks run as before

2. `processExits()` in `src/daemon/pipeline.ts`: added `timeframe: Timeframe` parameter.
   - Passes `timeframe` to `deps.checkExit()` so checker filters TP1/TP2 on non-5M
   - `processTrailing()` call guarded by `timeframe === "1H"` — only executes on 1H closes

3. `PipelineDeps.checkExit` type updated to accept optional 4th `timeframe?: Timeframe` arg.

4. `processSymbol()` call site updated to pass `timeframe` to `processExits()`.

### Tests added
- `src/exits/checker.test.ts` (new file): 14 tests covering TIME_EXIT on all TF, TP1/TP2 on 5M only, CLOSED ticket, priority order
- `src/daemon/pipeline.test.ts` (extended): 7 new integration tests for the full guard via handleCandleClose

### Validation result: PASS
- 28/28 tests pass
- typecheck: clean
- lint: clean (pre-existing ticket-manager.test.ts issues not introduced by this task)
