# T-18-002 Safety Gate Rule 2: 박스권 중심 극성 반전 수정

## Metadata
- modules: [signals]
- primary: signals

## Goal
Safety Gate Rule 2의 박스권 중심 필터 극성을 PRD §7.6(L263)에 맞게 반전한다. 중심 근접 시 차단, 중심 이탈 시 허용.

## Why
현재 코드는 close가 MA20 중심에서 벗어나면 차단(`"outside_box_range"`). PRD는 `|close - mid_20| < range_20 × 0.15 → PASS(차단)` — 중심에 가까울 때 차단해야 한다. BB4 터치 진입인데 가격이 중앙이면 거짓 신호이므로 차단이 맞다.

## Inputs
- PRD §7.6 L263: `금지 2: |close - mid_20| < range_20 × 0.15 → PASS`
- `src/signals/safety-gate.ts:114-133` — 현재 "outside" 차단

## Dependencies
- 없음 (T-18-001과 독립, 같은 파일이지만 다른 함수)

## Expected Outputs
- 수정된 `src/signals/safety-gate.ts` — `checkBoxRange()` 극성 반전
- 갱신된 테스트

## Deliverables
- `src/signals/safety-gate.ts`: `checkBoxRange()` — 조건 반전. close가 [sma20-margin, sma20+margin] 범위 **안**이면 차단, 밖이면 허용
- 반환 문자열을 `"inside_box_center"`로 변경 (의미 명확화)
- 테스트 갱신

## Constraints
- BOX_MA20_MARGIN_RATIO (0.15) 값 변경 없음
- sma20/bb20 null 시 통과(기존) 유지
- range_20 = bb20.upper - bb20.lower 계산 방식 유지

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/signals/safety-gate.ts:128` — 조건 반전: `lt`/`gt` 로 중심 범위 **내** 시 failure 반환
4. 반환 문자열 `"outside_box_range"` → `"inside_box_center"` 변경
5. Run tests — confirm all pass (GREEN phase)
6. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] close = sma20 (정중앙) → 차단됨
- [x] close = sma20 ± range_20*0.10 (중심 근처) → 차단됨
- [x] close = sma20 + range_20*0.20 (중심 이탈) → 통과됨
- [x] close = bb20.upper (상단 터치) → 통과됨
- [x] sma20 null → 통과 (기존 동작)

## Test Scenarios
- checkBoxRange() with close exactly at sma20 → returns "inside_box_center"
- checkBoxRange() with |close-sma20| = range_20 * 0.10 (< 0.15) → returns failure
- checkBoxRange() with |close-sma20| = range_20 * 0.15 (boundary) → returns null (not strictly less)
- checkBoxRange() with |close-sma20| = range_20 * 0.30 (outside) → returns null (passes)
- checkBoxRange() with sma20=null → returns null
- checkBoxRange() with bb20=null → returns null
- checkSafety() integration: box range failure appears in SafetyResult.reasons

## Validation
```bash
bun test src/signals/safety-gate.test.ts
bun run typecheck
```

## Out of Scope
- Safety Gate Rule 1 (wick) → T-18-001
- Safety Gate Rule 3 (큰캔들) — 현재 정상

## Implementation Notes
- `checkBoxRange()` condition inverted: `lt(e, lower) || gt(e, upper)` → `gt(e, lower) && lt(e, upper)`
- Failure string changed: `"outside_box_range"` → `"inside_box_center"`
- JSDoc updated to reflect new semantics (block near center, pass outside)
- BOX_MA20_MARGIN_RATIO (0.15) unchanged
- 12 new test cases added to `src/signals/safety-gate.test.ts` covering all acceptance criteria
- All 28 tests pass (GREEN); 5 pre-implementation tests confirmed RED before fix
- Pre-existing lint/typecheck errors in `src/vectors/candle-features.test.ts` are out of scope and existed before this task
- Status: DONE — 2026-04-05
