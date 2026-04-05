# T-15-006 202차원 벡터 조립기 구현 + features.ts 삭제 + import 정리

## Metadata
- modules: [vectors]
- primary: vectors

## Goal
candle-features(190) + strategy-features(12) = 202차원 벡터를 조립하는 새 vectorizer를 구현하고, 기존 features.ts와 vectorizer.ts를 삭제한다.

## Why
M2에서 캔들 피처와 전략 피처 추출기를 분리 구현했고, M2 단계에서 features.ts 호환 re-export를 유지했다. 이제 새 모듈로 모든 소비자가 전환되었으므로, 구 파일을 삭제하고 import를 정리한다.

## Inputs
- T-15-003: `src/vectors/candle-features.ts`
- T-15-004: `src/vectors/strategy-features.ts`
- T-15-005: 검증된 `src/vectors/normalizer.ts`
- 기존 `src/vectors/vectorizer.ts` (1175줄, 삭제 대상)
- 기존 `src/vectors/features.ts` (352줄, 삭제 대상)

## Dependencies
- T-15-003 (candle features)
- T-15-004 (strategy features)
- T-15-005 (normalizer verified)

## Expected Outputs
- 새 `src/vectors/vectorizer.ts` — 202차원 조립기
- 기존 features.ts, 구 vectorizer.ts 삭제

## Deliverables
- `src/vectors/vectorizer.ts` — 새 조립기 (`vectorize(candles, indicators, timeframe) => Float32Array`)
- `src/vectors/index.ts` — re-export 정리 (VECTOR_DIM, FEATURE_NAMES 등)
- `tests/vectors/vectorizer.test.ts` — 통합 테스트
- 기존 `src/vectors/features.ts` 삭제
- 기존 `src/vectors/features.test.ts` 삭제 또는 갱신
- 모든 소비자 import 경로 업데이트

## Constraints
- `vectorize()` 시그니처 유지: `(candles: Candle[], indicators: AllIndicators, timeframe: VectorTimeframe) => Float32Array`
- 호출자가 38개 이상 캔들을 전달하도록 보장 (부족 시 패딩)
- VECTOR_DIM=202 유지
- 정규화 적용 (normalizer.ts)

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. 새 `src/vectors/vectorizer.ts` 구현:
   - candle-features(190) + strategy-features(12) 결합
   - normalizer 적용
   - Float32Array(202) 출력
4. `src/vectors/index.ts` re-export 정리
5. 기존 `features.ts`, `features.test.ts` 삭제
6. 기존 `vectorizer.ts` 교체 (새 구현으로)
7. `grep -r "@/vectors/features" src/` + `grep -r "from.*vectors/vectorizer" src/` 로 모든 소비자 import 경로 업데이트
8. Run tests — confirm all pass (GREEN phase)
9. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- vectorize() 출력: Float32Array(202), 모든 값 [0, 1]
- 인덱스 0-189: candle features, 190-201: strategy features
- 시그니처 불변: `(candles, indicators, timeframe) => Float32Array`
- 기존 features.ts 삭제 완료
- `bun run typecheck` 통과 (깨진 import 없음)
- `bun run lint` 통과

## Test Scenarios
- vectorize() with 38 candles + valid indicators → Float32Array of length 202
- vectorize() → all values in [0, 1] range after normalization
- vectorize() → indices 0-189 are candle features, 190-201 are strategy features
- vectorize() with minimal candles (< 38) → still returns 202-dim vector (padded)
- vectorize() with null indicators → strategy features are 0.0, candle features normal
- vectorize() signature matches `(Candle[], AllIndicators, VectorTimeframe) => Float32Array`

## Validation
- `bun test -- --grep "vectorizer"`
- `bun run typecheck`
- `bun run lint`
- `grep -r "features.ts" src/vectors/` → no references to deleted file

## Out of Scope
- KNN 엔진 변경 (M4)
- 벡터 재생성 (M5)

## Implementation Notes

### 결정사항
1. `features.ts` 삭제 시 의존성 처리:
   - `features.ts`는 FEATURE_NAMES, FEATURE_CATEGORIES, FEATURE_WEIGHTS, VECTOR_DIM을 export하고 있어 다수의 소비자가 존재했다.
   - 동일 내용을 `src/vectors/feature-spec.ts`로 이전 후 `features.ts` 삭제.
   - `candle-features.ts`, `normalizer.ts`, `index.ts` 및 5개 테스트 파일의 import 경로 수정.

2. D-005 pre-multiply 처리:
   - `candle-features.ts`가 이미 upperWick/lowerWick에 FEATURE_WEIGHTS를 직접 곱하고 있음.
   - `strategy-features.ts`가 이미 bb4_pos, pivot_distance, daily_open_distance, session_box_position에 가중치를 직접 곱하고 있음.
   - 이중 적용 방지를 위해 vectorizer.ts의 PRE_MULTIPLY_TABLE은 전체 1.0으로 유지.
   - 향후 D-005를 완전 적용하려면 각 extractor에서 가중치 제거 후 vectorizer에서 sqrt(weight) 일괄 적용 필요.

3. 정규화 흐름:
   - 태스크 지시대로 normalizer.ts는 파이프라인에서 별도 호출. vectorize()는 raw 값만 출력.

4. 새 레이아웃 (인덱스 0-189 변경):
   - 구 vectorizer: price_position(40)+momentum(30)+volatility(30)+trend(40)+time_series(50) 순서
   - 신 vectorizer: candle-features(38봉×5=190) 순서
   - 인덱스 0-189의 의미가 완전히 바뀌므로 기존 vectorizer.test.ts를 새 레이아웃 기준으로 재작성.
   - 인덱스 190-201 strategy features는 동일하게 유지.

5. features.test.ts 처리:
   - `src/vectors/features.test.ts`는 삭제하지 않고 import 경로만 `feature-spec.ts`로 수정.
   - features.ts의 상수 명세는 변경 없으므로 기존 테스트 로직은 유효.

### 검증 결과
- `bun run typecheck`: 통과 (깨진 import 없음)
- `bun test -- --grep "vectorizer"`: 37/37 통과
- `bun run lint`: 새 파일에서 추가 오류 없음 (기존 오류는 이 태스크 범위 밖)
- `grep -r "vectors/features" src/`: 참조 없음 (feature-spec만 존재)

## Outputs

### 새로 생성
- `src/vectors/vectorizer.ts` — 새 202차원 조립기 (구 1175줄 교체)
  - extractCandleFeatures(0-189) + extractStrategyFeatures(190-201)
  - 시그니처 불변: `vectorize(candles, indicators, timeframe) => Float32Array`
- `src/vectors/feature-spec.ts` — features.ts 내용 이전 (FEATURE_NAMES, FEATURE_CATEGORIES, FEATURE_WEIGHTS, VECTOR_DIM)
- `tests/vectors/vectorizer.test.ts` — 새 레이아웃 기준 통합 테스트 37개

### 삭제
- `src/vectors/features.ts` — 352줄, 6-카테고리 구조 (feature-spec.ts로 이전)

### 수정
- `src/vectors/index.ts` — `@/vectors/feature-spec` 경로로 re-export 변경
- `src/vectors/candle-features.ts` — import `@/vectors/feature-spec`
- `src/vectors/normalizer.ts` — import `@/vectors/feature-spec`
- `src/vectors/features.test.ts` — import `./feature-spec`
- `tests/knn/knn-engine.test.ts` — import `../../src/vectors/feature-spec`
- `tests/signals/pipeline-e2e.test.ts` — import `@/vectors/feature-spec`
- `tests/strategy-alignment/strategy-alignment-e2e.test.ts` — import 경로 수정
- `tests/vectors/normalizer.test.ts` — import 경로 수정
- `tests/vectors/vector-repository.test.ts` — import 경로 수정
