# T-19-002 전략 피처 3건 수정 (ma20_slope 3봉, rsi_extreme_count 14봉, BB width=0)

## Metadata
- modules: [vectors]
- primary: vectors
- epic: EP-19
- milestone: M1
- prd-refs: §7.8 L276-277, §7.8 D-002, §7.8 D-003

## Goal
`strategy-features.ts`의 피처 3개를 PRD §7.8에 맞게 수정한다.
1. `[3] ma20_slope`: `sma20History[0]`과 `sma20History[3]`을 사용한 진짜 3봉 기울기
2. `[7] rsi_extreme_count`: `rsiHistory` 14봉 전체를 카운트
3. `[8] breakout_intensity`: BB width=0일 때 0.0이 아니라 0.5 반환

## Why
현재 `ma20_slope`(L108-116)은 주석으로 "1봉 근사"임을 인정하며 `prevSma20`만
사용한다. `rsi_extreme_count`(L167-176)는 현재 봉 1개만 보고 0 또는 1/14를
반환한다. `breakout_intensity`(L178-196)는 `bandWidth.isZero()`이면 `output[8]`을
0.0으로 두는데, PRD §7.8 D-003은 이 경우 0.5를 지정한다. 세 가지 모두 KNN
벡터 품질에 직접 영향을 주는 P1/P2 불일치다.

## Inputs
- `src/vectors/strategy-features.ts` L107-196 (현재 구현)
- `src/indicators/types.ts` — `AllIndicators.sma20History: Decimal[]`, `AllIndicators.rsiHistory: number[]` (T-19-001 완료 후 존재)
- PRD §7.8 L276: `ma20_slope = (sma20[0] − sma20[3]) / sma20[3]`
- PRD §7.8 L277 / D-002: `rsi_extreme_count = count(RSI>70 or RSI<30) in rsiHistory / 14`
- PRD §7.8 D-003: `breakout_intensity = 0.5 when BB width = 0`

## Dependencies
- T-19-001 (sma20History, rsiHistory 필드가 AllIndicators에 존재해야 함)

## Expected Outputs
- 수정된 `src/vectors/strategy-features.ts`
- 신규/갱신 테스트: `src/vectors/features.test.ts` 또는 `src/vectors/strategy-features.test.ts`

## Deliverables
- `[3] ma20_slope` (L107-117 교체):
  - `sma20History.length >= 4` → `(sma20History[3] − sma20History[0]) / sma20History[0]`
  - `sma20History.length < 4` → `prevSma20` 폴백 유지 (하위 호환)
  - 분모 0 가드 유지
- `[7] rsi_extreme_count` (L166-176 교체):
  - `rsiHistory` 전체를 순회하여 `v > 70 || v < 30` 카운트
  - `rsiHistory.length > 0` → `count / rsiHistory.length` (분모를 14 고정에서 실제 크기로)
  - `rsiHistory` 비어있으면 0.0
- `[8] breakout_intensity` (L183-196 수정):
  - `bandWidth.isZero()` → `output[8] = 0.5` (기존 0.0 제거)
- 주석 갱신: 각 수정 지점에 `// PRD §7.8 L276`, `// PRD §7.8 D-002`, `// PRD §7.8 D-003` 기재

## Constraints
- `extractStrategyFeatures()` 시그니처 변경 없음
- `sma20History` / `rsiHistory` 미존재 시 기존 동작 유지 (graceful degradation)
- 가중치 상수(`WEIGHT_BB4_POS` 등) 변경 없음
- 피처 인덱스 순서(0-11) 변경 없음
- Decimal.js 사용 유지 (ma20_slope 계산에서 Decimal 연산)

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm behavioral tests fail
3. `strategy-features.ts` L107-117: `ma20_slope` → `sma20History` 기반 3봉 기울기로 교체
4. `strategy-features.ts` L166-176: `rsi_extreme_count` → `rsiHistory` 루프 카운트로 교체
5. `strategy-features.ts` L183-196: `bandWidth.isZero()` 분기에 `output[8] = 0.5` 추가
6. 주석 갱신
7. Run tests — confirm all pass (GREEN phase)
8. `bun run typecheck && bun run lint`
9. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [ ] `ma20_slope`: `sma20History = [100, 101, 102, 103]` → slope = (103 − 100) / 100 = 0.03
- [ ] `ma20_slope`: `sma20History.length < 4` → `prevSma20` 폴백 사용 (기존 동작 유지)
- [ ] `ma20_slope`: `sma20History[0]` = 0 → output[3] = 0.0 (분모 0 가드)
- [ ] `rsi_extreme_count`: `rsiHistory = [80, 25, 50, 55, 72, ...]` (14개 중 3개 극값) → 3/14
- [ ] `rsi_extreme_count`: `rsiHistory` 비어있음 → output[7] = 0.0
- [ ] `rsi_extreme_count`: 14개 중 0개 극값 → output[7] = 0.0
- [ ] `breakout_intensity`: BB width=0 → output[8] = 0.5
- [ ] `breakout_intensity`: close 밴드 내부 (width>0) → output[8] = 0.0 (기존 동작)
- [ ] `breakout_intensity`: close 상단 돌파 (width>0) → output[8] > 0.0 (기존 동작)
- [ ] 피처 배열 길이 항상 12

## Test Scenarios
- extractStrategyFeatures() with sma20History=[100,101,102,103] → output[3] = (103-100)/100 = 0.03
- extractStrategyFeatures() with sma20History=[101,102] (length<4) → output[3] uses prevSma20 fallback
- extractStrategyFeatures() with sma20History[0]=0 → output[3] = 0.0
- extractStrategyFeatures() with rsiHistory=[80,25,50,55,70.1,45,60,35,50,65,28,55,72,40] (4 extremes out of 14) → output[7] = 4/14
- extractStrategyFeatures() with rsiHistory=[] → output[7] = 0.0
- extractStrategyFeatures() with rsiHistory=[50,55,60] (no extremes) → output[7] = 0.0
- extractStrategyFeatures() with BB width=0 (upper=lower) → output[8] = 0.5
- extractStrategyFeatures() with close inside BB band and width>0 → output[8] = 0.0
- extractStrategyFeatures() with close above BB upper → output[8] > 0.0
- extractStrategyFeatures() returns array of length 12

## Validation
```bash
bun test src/vectors/
bun run typecheck
bun run lint
```

## Out of Scope
- AllIndicators 타입 변경 → T-19-001
- 전략 피처 인덱스 재배치
- 기존 벡터 DB 재구축
- `sma20History` 크기를 4 이상으로 늘리는 것
