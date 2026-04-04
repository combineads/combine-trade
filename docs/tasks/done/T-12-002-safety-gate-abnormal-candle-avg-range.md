# T-12-002 Safety Gate 금��3 — avg_range_5 교정 + 역추세 조건

## Goal
`checkAbnormalCandle()`의 기준을 ATR14에서 최근 5봉 평균 range(`avg_range_5`)로 변경하고, 역추세 진입일 때만 차단한다.

## Why
PRD는 금지3을 "최근 5봉 평균 range × 2.0, 역추세만 차단"으로 명세하지만, 현재 코드는 ATR14 기반 + 방향 무관 차단. ATR14는 14봉 지수이동평균이라 최근 변동을 둔감하게 반영하고, 순추세 진입까지 차단한다.

## Inputs
- `src/signals/safety-gate.ts` — 현재 `checkAbnormalCandle()` (라인 127-142)
- `src/core/types.ts` — `Candle` 타입 (high, low 필드)

## Dependencies
없음 (독립 태스크, T-12-001과 같은 파일이지만 다른 함수)

## Expected Outputs
- `checkAbnormalCandle()` 함수가 최근 캔들 배열을 받아 avg_range_5를 직접 계산
- 역추세 조건 로직 추가

## Deliverables
- `src/signals/safety-gate.ts` — `checkAbnormalCandle()` 수정, `checkSafety()` 시그니처에 `recentCandles` 추가

## Constraints
- avg_range_5 = 최근 5봉의 (high - low) 평균. 5봉 미만이면 bypass (null 반환)
- 기준: avg_range_5 × 2.0 (ABNORMAL_CANDLE_MULTIPLE 유지)
- 순추세 bypass 로직은 T-12-001과 동일 패턴 (direction + daily_bias)
- `checkSafety()` 시그니처에 `recentCandles: Candle[]` 추가 필요 — pipeline.ts에서 전달

## Steps
1. `checkAbnormalCandle()` 시그니처 변경: `(candle, recentCandles, dailyBias, direction)` → ATR14 대신 recentCandles 사용
2. avg_range_5 계산: `recentCandles.slice(-5).map(c => c.high.minus(c.low))` → Decimal 평균
3. 순추세 판별 → bypass (T-12-001과 동일 로직)
4. 역추세/NEUTRAL → `range > avg_range_5 × 2.0` 시 차단
5. `checkSafety()` 시그니처에 recentCandles 추가, pipeline.ts 호출부 갱신
6. 테스트 작성

## Acceptance Criteria
- 기준이 ATR14가 아닌 최근 5봉 평균 range × 2.0
- 순추세 진입 → bypass
- 역추세/NEUTRAL → avg_range_5 × 2.0 초과 시 "abnormal_candle"
- 5봉 미만 → bypass
- **호출자 확인**: pipeline.ts에서 `checkSafety()` 호출 시 recentCandles 전달

## Test Scenarios
- checkAbnormalCandle() 역추세 + range > avg_range_5 × 2.0 → "abnormal_candle"
- checkAbnormalCandle() 역추세 + range < avg_range_5 × 2.0 ��� null
- checkAbnormalCandle() 순추세 + range > avg_range_5 × 2.0 → null (bypass)
- checkAbnormalCandle() 5봉 미만 recentCandles → null (bypass)
- checkAbnormalCandle() NEUTRAL bias + 큰 캔들 → "abnormal_candle"
- checkSafety() 통합: pipeline에서 recentCandles 전달 → 정상 동작

## Validation
```bash
bun test -- tests/signals/safety-gate
bun run typecheck && bun run lint
```

## Out of Scope
- wick ratio 수정 → T-12-001
- Box range / Noise 1M 필터 변경
