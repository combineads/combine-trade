# T-12-006 Vectorizer — 전략 피처 Part 2 (atr_separation/pivot/rsi_normalized/rsi_extreme_count)

## Goal
extractStrategy()의 indices 194-197에 해당하는 4개 전략 피처를 구현한다.

## Why
T-12-005에서 extractStrategy() 뼈대를 만들고 첫 4개 피처를 구현했으나, 인덱스 194-197은 아직 0.5 placeholder. PRD 전략 피처 12개 중 중간 4개를 채운다.

## Inputs
- `src/vectors/vectorizer.ts` — T-12-005에서 생성된 extractStrategy() 함수
- `src/vectors/features.ts` — STRATEGY[4..7]: atr_separation, pivot_distance, rsi_normalized, rsi_extreme_count
- `src/indicators/types.ts` — AllIndicators (atr14, rsi14, sma20, bb4)

## Dependencies
- T-12-005 (extractStrategy 뼈대 + vectorize 호출 변경)

## Expected Outputs
- extractStrategy()의 indices 194-197이 실제 값으로 채워짐

## Deliverables
- `src/vectors/vectorizer.ts` — extractStrategy() 내 인덱스 194-197 구현

## Constraints
- atr_separation: abs(close - MA20) / ATR14, weight 1.0. ATR14=0 또는 null → 0.5
- pivot_distance: (close - nearest_pivot_20bar) / ATR14, weight 1.5. pivot = 최근 20봉 중 최고점 또는 최저점. ATR14=0/null → 0.5
- rsi_normalized: (RSI14 - 50) / 50 → [-1, 1], weight 1.0. RSI null → 0.5
- rsi_extreme_count: 최근 20봉 중 RSI < 30 or > 70인 봉 수 / 20 → [0, 1], weight 1.0. RSI 이력 필요 → candles 배열에서 직접 계산
- NaN/Infinity → 0.5

## Steps
1. atr_separation 구현: `abs(close - sma20) / atr14`
2. pivot_distance 구현: candles[-20..]에서 highest high, lowest low 찾기 → 가까운 쪽 선택 → `(close - pivot) / atr14`
3. rsi_normalized 구현: `(rsi14 - 50) / 50`
4. rsi_extreme_count 구현: candles 배열에서 최근 20봉의 RSI 계산 또는 indicators에서 이력 참조
5. 기존 placeholder 0.5를 실제 로직으로 교체
6. 테스트 추가

## Acceptance Criteria
- indices 194-197이 유의미한 값 (placeholder 0.5가 아님)
- atr_separation: close=MA20일 때 0, 멀수록 큰 값
- pivot_distance: pivot 위에 있으면 양수(LONG), 아래면 음수
- rsi_normalized: RSI=50 → 0, RSI=70 → 0.4, RSI=30 → -0.4
- rsi_extreme_count: 20봉 중 극단 RSI 없으면 0, 전부 극단이면 1.0
- NaN/Infinity → 0.5

## Test Scenarios
- atr_separation close=MA20 → 0.0
- atr_separation close far from MA20, ATR14=10 → abs(diff)/10
- atr_separation ATR14=null → 0.5
- pivot_distance close > highest_20 → 양수
- pivot_distance close < lowest_20 → 음수
- rsi_normalized RSI=50 → 0.0, RSI=70 → 0.4
- rsi_extreme_count 20봉 중 5봉 극단 → 0.25

## Validation
```bash
bun test -- tests/vectors/
bun run typecheck && bun run lint
```

## Out of Scope
- indices 190-193 (Part 1) → T-12-005
- indices 198-201 (Part 3) → T-12-007
