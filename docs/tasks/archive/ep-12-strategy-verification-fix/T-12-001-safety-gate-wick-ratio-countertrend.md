# T-12-001 Safety Gate 금지1 — wick ratio 역추세 조건 추가

## Goal
`checkWickRatio()`에 역추세(counter-trend) 조건을 추가하여, 순추세(trend-following) 캔들은 wick ratio와 무관하게 통과시킨다.

## Why
PRD는 금지1(wick ratio)을 "역추세 진입일 때만 차단"으로 명세하지만, 현재 코드는 방향 무관 일괄 차단. 순추세 진입까지 불필요하게 걸러낸다.

## Inputs
- `src/signals/safety-gate.ts` — 현재 `checkWickRatio()` 구현 (라인 61-88)
- `src/daemon/pipeline.ts` — `checkSafety()` 호출 시 전달하는 `signal.direction` + `symbolState.daily_bias`

## Dependencies
없음 (독립 태���크)

## Expected Outputs
- `checkWickRatio()` 함수가 daily_bias 파라���터를 받아 순추세/역추세 판별
- `checkSafety()` 시그니처에 daily_bias가 이미 `symbolState.daily_bias`로 전달됨 — 내부 배선만 추가

## Deliverables
- `src/signals/safety-gate.ts` — `checkWickRatio()` 수정

## Constraints
- `checkSafety()` 외부 시그니처 변경 최소화 (symbolState.daily_bias 활용)
- 순추세 판별 로직: LONG 진입 + LONG_ONLY bias = 순추세 → bypass, LONG 진입 + SHORT_ONLY bias = 역추세 → 기존 필터 적용
- NEUTRAL bias → 역추세로 취급 (보수적)
- Decimal.js 사용 유지

## Steps
1. `checkWickRatio()` 시그니처에 `dailyBias: DailyBias | null` 파라미터 추가
2. 순추세 판별: `(direction === "LONG" && dailyBias === "LONG_ONLY") || (direction === "SHORT" && dailyBias === "SHORT_ONLY")` → return null (bypass)
3. 역추세/NEUTRAL → 기존 wick ratio 로직 적용
4. `checkSafety()` 내부에서 `checkWickRatio()` 호출 시 `symbolState.daily_bias` 전달
5. 테스트 작성 후 검증

## Acceptance Criteria
- 순추세 캔들(방향 = bias)은 wick ratio 무관 통과
- 역추세 캔들(방향 ≠ bias)은 기존 임계값(5M=0.1, 1M=1.0) 적용
- NEUTRAL bias → 역추세로 취급 (기존 필터 적용)
- null bias → 역추세로 취급
- **호출자 확인**: `checkSafety()` 내부에서 dailyBias가 `checkWickRatio()`에 전달됨

## Test Scenarios
- checkWickRatio() LONG + LONG_ONLY + wick=0.5 → null (순추세 bypass)
- checkWickRatio() LONG + SHORT_ONLY + wick=0.5 → "wick_ratio_exceeded" (역추세 차단)
- checkWickRatio() SHORT + SHORT_ONLY + wick=0.5 → null (순추세 bypass)
- checkWickRatio() SHORT + LONG_ONLY + wick=0.5 → "wick_ratio_exceeded" (역추세 차단)
- checkWickRatio() LONG + NEUTRAL + wick=0.5 → "wick_ratio_exceeded" (보수적 차단)
- checkWickRatio() any direction + null bias + wick=0.5 → "wick_ratio_exceeded"
- checkSafety() 통합: 순추세 + 높은 wick → passed=true (다른 필터 통과 가정)

## Validation
```bash
bun test -- tests/signals/safety-gate
bun run typecheck && bun run lint
```

## Out of Scope
- 금지3 (abnormal candle) 수정 → T-12-002
- Box range / Noise 1M 필터 변경

## Implementation Notes
- `checkWickRatio()` 에 `dailyBias: DailyBias | null` 파라미터 추가 (4번째 인자)
- 순추세 판별: `(direction === "LONG" && dailyBias === "LONG_ONLY") || (direction === "SHORT" && dailyBias === "SHORT_ONLY")` → return null
- `checkSafety()` 내부 호출: `checkWickRatio(candle, signal.direction, signal.timeframe, symbolState.daily_bias)` — 외부 시그니처 변경 없음
- 테스트 7개 추가 (모두 `checkSafety()` 경유, `checkWickRatio` 미공개 유지):
  - LONG+LONG_ONLY → bypass, SHORT+SHORT_ONLY → bypass
  - LONG+SHORT_ONLY → 차단, SHORT+LONG_ONLY → 차단
  - LONG+NEUTRAL → 차단, any+null → 차단
  - 순추세 + 전체 필터 통과 통합 시나리오
- 기존 44개 테스트 전원 통과
- `evidence-gate.ts` 포맷 에러: 본 태스크 범위 외 파일 (pre-existing, T-12-001 소유권 밖)
- Validation: `bun test -- tests/signals/safety-gate` → 44 pass / 0 fail; `bunx biome check src/signals/safety-gate.ts` → clean
