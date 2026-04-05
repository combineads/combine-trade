# T-18-004 캔들 피처 분모 PRD 정렬 (body/upperWick/lowerWick/range)

## Metadata
- modules: [vectors]
- primary: vectors

## Goal
캔들 피처 4개의 분모를 PRD §7.8(L275) 수식에 맞게 수정한다: body→O, upperWick→H, lowerWick→H, range→L.

## Why
현재 4개 피처 모두 `close`로 나누지만, PRD는 각각 다른 분모를 지정. 벡터 공간 자체가 달라지므로 KNN 결과에 직접 영향. 김직선 선생님 확정 수식.

## Inputs
- PRD §7.8 L275:
  - body = (C-O)/O
  - upperWick = (H-max(O,C))/H, 가중치 1.5
  - lowerWick = (min(O,C)-L)/H, 가중치 1.5
  - range = (H-L)/L
- `src/vectors/candle-features.ts:64-78`

## Dependencies
- 없음

## Expected Outputs
- 수정된 `src/vectors/candle-features.ts`
- 신규/갱신 테스트

## Deliverables
- L65: `dividedBy(close)` → `dividedBy(open)` + open=0 가드
- L69: `dividedBy(close)` → `dividedBy(high)` + high=0 가드
- L74: `dividedBy(close)` → `dividedBy(high)` (이미 high=0 가드 공유)
- L78: `dividedBy(close)` → `dividedBy(low)` + low=0 가드
- 주석에 PRD §7.8 수식 명시
- close=0 가드 제거 (더 이상 공통 분모가 아님) → 각 분모별 가드로 대체
- 테스트: 알려진 OHLC → 정확한 피처 값 검증

## Constraints
- 가중치(upperWick×1.5, lowerWick×1.5)는 변경하지 않음
- ret = (C-prev_C)/prev_C는 변경하지 않음 (이미 정확)
- 190차원 총합은 유지 (38×5)
- Decimal.js 사용 유지

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `candle-features.ts:60-62`: close=0 가드를 open=0/high=0/low=0 개별 가드로 교체
4. `candle-features.ts:65`: body 분모 `close` → `open`
5. `candle-features.ts:69`: upperWick 분모 `close` → `high`
6. `candle-features.ts:74`: lowerWick 분모 `close` → `high`
7. `candle-features.ts:78`: range 분모 `close` → `low`
8. 주석 갱신: 각 피처 옆에 PRD 수식 기재
9. Run tests — confirm all pass (GREEN phase)
10. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] O=100, C=105, H=110, L=95 → body = |105-100|/100 = 0.05
- [x] 동일 캔들 → upperWick = (110-105)/110 ≈ 0.0455 × 1.5 ≈ 0.0682
- [x] 동일 캔들 → lowerWick = (100-95)/110 ≈ 0.0455 × 1.5 ≈ 0.0682
- [x] 동일 캔들 → range = (110-95)/95 ≈ 0.1579
- [x] O=0 → body=0 (safe guard)
- [x] H=0 → upperWick=0, lowerWick=0 (safe guard)
- [x] L=0 → range=0 (safe guard)
- [x] ret 변경 없음
- [x] 202차원 벡터 정상 생성

## Test Scenarios
- extractBarFeatures() with O=100,H=110,L=95,C=105 → body=(105-100)/100=0.05
- extractBarFeatures() same candle → upperWick=(110-105)/110 * 1.5
- extractBarFeatures() same candle → lowerWick=(100-95)/110 * 1.5
- extractBarFeatures() same candle → range=(110-95)/95
- extractBarFeatures() same candle → ret=(105-prevClose)/prevClose unchanged
- extractBarFeatures() with open=0 → body=0, other features still computed from high/low
- extractBarFeatures() with high=0 → upperWick=0, lowerWick=0
- extractBarFeatures() with low=0 → range=0
- extractCandleFeatures() with 38 candles → produces 190-dim vector
- extractCandleFeatures() with < 38 candles → zero-padded to 190

## Validation
```bash
bun test src/vectors/candle-features.test.ts
bun test src/vectors/vectorizer.test.ts
bun run typecheck
```

## Out of Scope
- 전략 피처 12차원 수정 (ma20_slope, rsi_extreme_count는 P1)
- 기존 벡터 DB 재구축 (별도 에픽)
- 정규화(normalizer) 변경 없음
