# T-18-003 일봉 방향 필터 slope=0 등호 허용

## Metadata
- modules: [filters]
- primary: filters

## Goal
일봉 방향 필터에서 MA20 slope=0(횡보)을 NEUTRAL이 아닌 기존 방향 유지로 처리한다. PRD §7.2(L217-218) `>=` / `<=` 사양 준수.

## Why
PRD: `LONG_ONLY = daily_MA20 >= 전일_MA20`. 현재 코드는 `slope.isPositive() && !slope.isZero()` — slope=0이면 NEUTRAL로 강제 전환. 횡보 구간에서 불필요하게 매매 금지됨.

## Inputs
- PRD §7.2 L217: `LONG_ONLY = daily_MA20 >= 전일_MA20 AND price > daily_open`
- PRD §7.2 L218: `SHORT_ONLY = daily_MA20 <= 전일_MA20 AND price < daily_open`
- `src/filters/daily-direction.ts:34-38`

## Dependencies
- 없음

## Expected Outputs
- 수정된 `src/filters/daily-direction.ts`
- 갱신된 테스트

## Deliverables
- slope 비교 변경:
  - LONG_ONLY: `slope >= 0` (즉, `!slope.isNegative()`) AND `close > dailyOpen` (strict `>`)
  - SHORT_ONLY: `slope <= 0` (즉, `!slope.isPositive()`) AND `close < dailyOpen` (strict `<`)
- slope=0이면서 close=open인 경우 → 둘 다 매칭 가능하므로 LONG_ONLY 우선 (또는 NEUTRAL)
- 테스트 갱신

## Constraints
- PRD의 price 비교는 strict (>, <) — close 비교에서 `greaterThanOrEqualTo`를 `greaterThan`으로 변경
- slope=0, close=dailyOpen인 경우 어느 쪽도 충족 안 됨 → NEUTRAL (양쪽 strict 비교이므로)

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `daily-direction.ts:34`: `slope.isPositive() && !slope.isZero()` → `!slope.isNegative()` (>=0)
4. `daily-direction.ts:35`: `slope.isNegative()` → `!slope.isPositive()` (<=0)
5. `daily-direction.ts:37`: `greaterThanOrEqualTo` → `greaterThan` (strict >)
6. `daily-direction.ts:38`: `lessThanOrEqualTo` → `lessThan` (strict <)
7. Run tests — confirm all pass (GREEN phase)
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] slope=0, close > open → LONG_ONLY
- [x] slope=0, close < open → SHORT_ONLY
- [x] slope=0, close = open → NEUTRAL
- [x] slope > 0, close > open → LONG_ONLY (기존 동작 유지)
- [x] slope < 0, close < open → SHORT_ONLY (기존 동작 유지)
- [x] slope > 0, close < open → NEUTRAL
- [x] slope > 0, close = open → NEUTRAL (strict >)

## Test Scenarios
- determineDailyBias() with slope=0, close > open → LONG_ONLY
- determineDailyBias() with slope=0, close < open → SHORT_ONLY
- determineDailyBias() with slope=0, close = open → NEUTRAL
- determineDailyBias() with slope > 0, close > open → LONG_ONLY
- determineDailyBias() with slope < 0, close < open → SHORT_ONLY
- determineDailyBias() with slope > 0, close = open → NEUTRAL (strict > fails)
- determineDailyBias() with slope > 0, close < open → NEUTRAL (direction disagree)

## Validation
```bash
bun test src/filters/daily-direction.test.ts
bun run typecheck
```

## Out of Scope
- 일봉 방향의 1H/5M 전파 로직 — pipeline 변경 없음

## Implementation Notes
- Decimal.js `isPositive()` returns `true` for zero (treats 0 as non-negative), so `slope >= 0` is correctly expressed as `slope.isPositive()` alone.
- `slope <= 0` requires explicit `slope.isNegative() || slope.isZero()` because `isNegative()` returns `false` for zero.
- The task spec's suggested `!slope.isNegative()` (line 39) is incorrect for the SHORT case due to this Decimal.js behavior — using `!slope.isPositive()` would also fail since `isPositive()` is true for zero. Correct expression used instead.
- All 4 changes implemented: slope comparison semantics fixed, price comparison made strict.
- 9/9 tests pass. Lint clean. Typecheck errors in `src/signals/safety-gate.test.ts` are pre-existing (confirmed by stash test).
- Implemented: 2026-04-05
