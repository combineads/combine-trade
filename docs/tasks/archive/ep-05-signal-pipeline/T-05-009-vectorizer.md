# T-05-009 202차원 벡터 생성기

## Goal
`src/vectors/vectorizer.ts`에 캔들과 지표 데이터로부터 202차원 특징 벡터(Float32Array)를 생성하는 벡터라이저를 구현한다.

## Why
KNN 의사결정의 입력 데이터. 캔들 OHLCV + 기술적 지표를 202개의 수치 피처로 변환하여 유사 패턴 검색에 사용한다. features.ts 상수와 VECTOR_SPEC.md를 기반으로 정확히 202차원을 보장한다.

## Inputs
- `docs/VECTOR_SPEC.md` — 202개 피처 명세 (T-05-000에서 생성)
- `src/vectors/features.ts` — FEATURE_NAMES, VECTOR_DIM (T-05-000에서 생성)
- `src/indicators/` — calcAllIndicators, AllIndicators
- `src/core/types.ts` — Candle, VectorTimeframe

## Dependencies
- T-05-000 (features.ts — 피처 명세/상수)

## Expected Outputs
- `src/vectors/vectorizer.ts` exports:
  - `vectorize(candles: Candle[], indicators: AllIndicators, timeframe: VectorTimeframe) → Float32Array`
  - 반환 배열 길이 = VECTOR_DIM (202)
- `src/vectors/index.ts` — barrel export

## Deliverables
- `src/vectors/vectorizer.ts`

## Constraints
- 출력 벡터 차원 = VECTOR_DIM (202) — 불일치 시 런타임 에러
- features.ts의 FEATURE_NAMES 순서대로 피처 추출
- 각 피처 계산은 VECTOR_SPEC.md에 정의된 수식/로직 따름
- 입력 candles 배열은 최근 N봉 (피처에 따라 필요 봉수가 다름, 최소 120봉)
- NaN/Infinity 발생 시 → 0.0으로 대체 (안전한 기본값)
- Candle OHLCV에서 파생: returns, ranges, ratios 등은 Decimal.js로 계산 후 toNumber()로 Float32Array에 삽입
- 벡터라이저는 정규화를 수행하지 않음 — raw 피처만 추출 (정규화는 T-05-010)
- 5M, 1M 타임프레임에서만 호출됨
- 지표 데이터(indicators)가 null인 항목은 0.0으로 처리

## Steps
1. VECTOR_SPEC.md에서 202개 피처 계산 수식 확인
2. src/vectors/vectorizer.ts 작성
   - 카테고리별 피처 추출 함수: extractPricePosition, extractMomentum, extractVolatility, extractTrend, extractTimeSeries, extractSession
   - vectorize 통합 함수: 모든 카테고리 → Float32Array(202)
3. NaN/Infinity 방어 코드
4. src/vectors/index.ts barrel export 생성
5. 단위 테스트: 차원 검증, 각 카테고리 피처 정확성, 엣지 케이스
6. typecheck + lint 통과

## Acceptance Criteria
- vectorize() 반환값 길이 = 202
- features.ts FEATURE_NAMES 순서와 벡터 인덱스 일치
- NaN/Infinity → 0.0 대체
- 지표 null 항목 → 0.0
- Decimal.js → toNumber() 변환 정확
- `bun run typecheck && bun run lint` 통과

## Test Scenarios
- vectorize() with 유효한 candles + indicators → Float32Array(202)
- vectorize() with 부족한 candles (< 120봉) → 계산 불가 피처는 0.0
- vectorize() with indicators에 null 항목 → 해당 피처 0.0
- vectorize() with extreme values → NaN/Infinity 없음 (0.0으로 대체)
- vectorize() 반환값의 특정 인덱스가 FEATURE_NAMES 순서와 일치하는지 검증
- vectorize() with 5M timeframe → 정상 동작
- vectorize() with 1M timeframe → 정상 동작

## Validation
```bash
bun test -- --grep "vectorizer"
bun run typecheck
bun run lint
```

## Out of Scope
- Median/IQR 정규화 (T-05-010)
- Vector DB 저장 (T-05-010)
- KNN 검색 (T-05-011)
