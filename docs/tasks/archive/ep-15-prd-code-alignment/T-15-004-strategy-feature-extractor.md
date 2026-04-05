# T-15-004 12 전략 피처 추출기 구현

## Metadata
- modules: [vectors, indicators]
- primary: vectors

## Goal
PRD §7.8의 12 전략 피처 추출기를 T-15-001에서 감사된 수식 기반으로 신규 구현한다.

## Why
현재 전략 피처는 features.ts STRATEGY 배열에 이름과 주석으로 정의되어 있고, vectorizer.ts에서 계산된다. M2에서 vectorizer.ts를 교체하므로, 전략 피처 추출을 독립 모듈로 분리해야 한다.

## Inputs
- T-15-001의 감사된 VECTOR_SPEC.md (12 전략 피처 확정 수식)
- `src/indicators/types.ts` — AllIndicators 타입
- `src/core/types.ts` — Candle, SymbolState 타입

## Dependencies
- T-15-001 (전략 피처 수식 감사 완료)
- T-15-002 (FEATURE_WEIGHTS 확정)

## Expected Outputs
- `src/vectors/strategy-features.ts` — 12 전략 피처 추출 함수

## Deliverables
- `src/vectors/strategy-features.ts` — `extractStrategyFeatures(candles, indicators, symbolState): number[]`
- `tests/vectors/strategy-features.test.ts`

## Constraints
- 12 피처 순서: bb20_pos, bb4_pos, ma_ordering, ma20_slope, atr_separation, pivot_distance, rsi_normalized, rsi_extreme_count, breakout_intensity, disparity_divergence, daily_open_distance, session_box_position
- 수식은 T-15-001에서 감사된 VECTOR_SPEC.md를 따름
- 가중치 적용: bb4_pos × 2.0, pivot_distance × 1.5, daily_open_distance × 1.5, session_box_position × 1.5
- Decimal.js 사용

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/vectors/strategy-features.ts` 생성:
   - 각 피처를 VECTOR_SPEC.md 수식대로 구현
   - 가중치 적용
   - null/undefined 지표 → 0.0 반환
4. Run tests — confirm all pass (GREEN phase)
5. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- 12 전략 피처 출력, 순서가 VECTOR_SPEC.md와 일치
- 각 수식이 T-15-001 감사 결과와 일치
- 가중치 정확 적용 (2.0×, 1.5×)
- null 지표 시 해당 피처 0.0
- `bun run typecheck` 통과

## Test Scenarios
- extractStrategyFeatures() → returns exactly 12 elements
- extractStrategyFeatures() with bb20 close at upper band → bb20_pos ≈ 1.0
- extractStrategyFeatures() with bb20 close at lower band → bb20_pos ≈ -1.0
- extractStrategyFeatures() with sma20 > sma60 > sma120 → ma_ordering = 1
- extractStrategyFeatures() with sma20 < sma60 < sma120 → ma_ordering = -1
- extractStrategyFeatures() with null indicators → all 12 features return 0.0
- extractStrategyFeatures() → bb4_pos value multiplied by 2.0 weight
- extractStrategyFeatures() → pivot_distance value multiplied by 1.5 weight

## Validation
- `bun test -- --grep "strategy-features"`
- `bun run typecheck`

## Out of Scope
- 캔들 190차원 (T-15-003)
- 정규화 (M3)
- vectorizer 조립 (M3)

## Implementation Notes

### 구현 결정 사항

1. **함수 시그니처 변경**: 태스크 명세의 `(candle, candles, indicators, symbolState?)` 시그니처를 따름. `Candle`을 별도 첫 번째 인자로 분리하여 현재 봉의 `close`를 직접 사용.

2. **rsi_extreme_count (D-002) 근사 구현**: `AllIndicators`는 현재 봉의 `rsi14` 단일 값만 제공하며 과거 14봉 RSI 히스토리를 포함하지 않는다. 현재 아키텍처에서는 현재 봉 1개의 극값 여부만 평가하여 0 또는 1/14 반환. 완전한 14봉 윈도우 구현은 vectorizer 조립 단계(M3)에서 rsi 히스토리를 공급할 때 가능하다.

3. **ma20_slope 근사**: `AllIndicators`에는 `sma20`(현재)와 `prevSma20`(직전 1봉)만 존재. "3-bar slope = (sma20[0] - sma20[3]) / sma20[3]" 명세를 1봉 기울기로 근사하여 구현. 인터페이스 변경 없이 기존 타입을 최대한 활용.

4. **pivot_distance 피봇 계산**: 최근 19개 캔들(candles slice) + 현재 캔들 = 최대 20개 캔들의 highest_high / lowest_low를 피봇으로 사용. `candles` 배열이 부족할 경우 가용 데이터로 처리.

5. **가중치 pre-multiply**: VECTOR_SPEC.md D-005 결정에 따라 가중치를 벡터 값에 직접 곱하여 저장 (bb4_pos×2.0, pivot_distance×1.5, daily_open_distance×1.5, session_box_position×1.5).

### 미사용 import 제거
테스트 파일에서 `Decimal` direct import를 제거하고 `d()` 팩토리만 사용.

## Outputs

- `src/vectors/strategy-features.ts` — `extractStrategyFeatures()` 구현 (STRATEGY_FEATURE_DIM=12)
- `tests/vectors/strategy-features.test.ts` — 30개 테스트, 전부 통과

### Validation Results
```
bun test -- --grep "strategy-features"
→ 30 pass, 0 fail

bun run typecheck
→ strategy-features.ts / strategy-features.test.ts 관련 오류 없음
→ 기존 미해결 오류(scripts/transfer-now.ts, tests/api/) 는 이 태스크 범위 외
```

### Closed: 2026-04-05
