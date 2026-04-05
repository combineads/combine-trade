# T-18-001 Safety Gate Rule 1: wick_ratio 비교 반전 수정

## Metadata
- modules: [signals]
- primary: signals

## Goal
Safety Gate Rule 1의 wick_ratio 비교 연산자를 PRD §7.6(L262)에 맞게 `gt` → `lt`로 수정한다.

## Why
현재 코드는 `gt(wick, threshold)` — 꼬리가 큰(안전한) 캔들을 차단하고, 꼬리가 작은(위험한) 캔들을 통과시킨다. PRD는 `wick_ratio < threshold AND 역추세 → PASS(차단)`으로, 꼬리 없는 역추세 캔들을 차단해야 한다. 정반대로 동작 중이며 실거래 시 손실 직결.

## Inputs
- PRD §7.6 L262: `금지 1: wick_ratio < threshold(5m:0.1, 1m:1.0) AND 역추세 → PASS`
- `src/signals/safety-gate.ts:97` — 현재 `gt(wick, threshold)`

## Dependencies
- 없음 (독립 수정)

## Expected Outputs
- 수정된 `src/signals/safety-gate.ts` — `lt(wick, threshold)`
- 갱신된 `src/signals/safety-gate.test.ts`

## Deliverables
- `src/signals/safety-gate.ts`: `checkWickRatio()` 내 비교 연산자 `gt` → `lt` 변경
- 테스트: wick < threshold AND 역추세 → 차단, wick > threshold → 통과, 순추세 → bypass

## Constraints
- 순추세(trend-following) bypass 로직은 변경하지 않음
- WICK_RATIO_THRESHOLD 값(5M=0.1, 1M=1.0)은 변경하지 않음
- Doji(range=0) 처리는 기존대로 null 반환 유지

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/signals/safety-gate.ts:97` — `gt(wick, threshold)` → `lt(wick, threshold)` 변경
4. Run tests — confirm all pass (GREEN phase)
5. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] `checkWickRatio()`: wick=0.05, threshold=0.1, 역추세 → 차단됨 (0.05 < 0.1)
- [x] `checkWickRatio()`: wick=0.3, threshold=0.1, 역추세 → 통과됨 (0.3 >= 0.1)
- [x] `checkWickRatio()`: 순추세 → 항상 통과 (bypass)
- [x] `checkWickRatio()`: Doji(range=0) → 통과 (기존 동작)
- [x] 1M wick=0.5, threshold=1.0, 역추세 → 차단됨

## Test Scenarios
- checkWickRatio() with wick=0.05 < threshold=0.1 AND counter-trend → returns failure string "wick_ratio_exceeded"
- checkWickRatio() with wick=0.3 > threshold=0.1 AND counter-trend → returns null (passes)
- checkWickRatio() with wick=0.1 = threshold=0.1 AND counter-trend → returns null (not strictly less)
- checkWickRatio() with trend-following direction (LONG+LONG_ONLY) → returns null regardless of wick
- checkWickRatio() with Doji candle (range=0) → returns null
- checkWickRatio() with 1M timeframe, wick=0.5 < threshold=1.0 AND counter-trend → returns failure
- checkSafety() integration: wick filter failure included in SafetyResult.reasons

## Validation
```bash
bun test src/signals/safety-gate.test.ts
bun run typecheck
```

## Out of Scope
- Safety Gate Rule 2 (박스권) 수정 → T-18-002
- Safety Gate Rule 3 (큰캔들) — 현재 정상

## Implementation Notes
- Date: 2026-04-05
- Changed `gt(wick, threshold)` → `lt(wick, threshold)` at `src/signals/safety-gate.ts:97`
- Created `src/signals/safety-gate.test.ts` (16 tests, 22 assertions)
- TDD: RED (10 failures) → fix → GREEN (16 pass)
- `bun run typecheck`: PASS (fixed `"5m"` → `"5M"` in test helpers)
- `bun run lint`: PASS (biome, no fixes needed)
- No threshold values, no bypass logic, no Doji handling were touched — constraints respected
