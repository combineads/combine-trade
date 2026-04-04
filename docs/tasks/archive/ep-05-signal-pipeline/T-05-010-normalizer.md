# T-05-010 Median/IQR 정규화 + Vector DB 저장

## Goal
`src/vectors/normalizer.ts`에 Median/IQR 정규화를 구현하고, `src/vectors/repository.ts`에 벡터 DB 저장/조회 헬퍼를 구현한다.

## Why
벡터라이저의 raw 피처는 스케일이 다르다 (가격은 수만, RSI는 0~100, 비율은 0~1). Median/IQR 정규화로 스케일을 통일하여 KNN 거리 계산의 정확도를 보장한다. repository는 정규화된 벡터를 pgvector에 저장하고 조회하는 인프라를 제공한다.

## Inputs
- `docs/VECTOR_SPEC.md` — 정규화 방법 (Median/IQR)
- `src/vectors/vectorizer.ts` — vectorize() (T-05-009에서 생성)
- `src/vectors/features.ts` — VECTOR_DIM (T-05-000에서 생성)
- `src/db/schema.ts` — vectorTable (T-05-003에서 생성)

## Dependencies
- T-05-003 (Vector 테이블)
- T-05-009 (vectorizer — raw 벡터 생성)

## Expected Outputs
- `src/vectors/normalizer.ts` exports:
  - `NormParams` 타입: { median: number; iqr: number }[] (피처별 정규화 파라미터)
  - `normalize(raw: Float32Array, params: NormParams) → Float32Array`
  - `computeNormParams(vectors: Float32Array[]) → NormParams` (학습 데이터에서 파라미터 산출)
- `src/vectors/repository.ts` exports:
  - `insertVector(db, vector) → Vector`
  - `getVectorByCandle(db, candleId) → Vector | null`
  - `getVectorsForNormalization(db, symbol, exchange, timeframe, limit) → Float32Array[]`
  - `updateVectorLabel(db, vectorId, label, grade) → void`

## Deliverables
- `src/vectors/normalizer.ts`
- `src/vectors/repository.ts`

## Constraints
- Median/IQR 정규화 수식: normalized[i] = (raw[i] - median[i]) / iqr[i]
  - IQR = Q3 - Q1 (75번째 백분위 - 25번째 백분위)
  - IQR=0인 피처 → 0.0 (상수 피처, 정규화 불가)
- 정규화 파라미터는 학습 데이터(기존 벡터)에서 산출 → 새 벡터에 적용
- 파라미터 산출 시 최소 100개 벡터 필요 (부족 시 정규화 스킵 — raw 그대로 저장)
- repository의 insertVector는 pgvector 형식으로 embedding 저장
- Drizzle에서 pgvector 컬럼 읽기/쓰기 커스텀 처리 필요
- DB 통합 테스트: 벡터 저장/조회/유사도 검색

## Steps
1. VECTOR_SPEC.md에서 정규화 방법 확인
2. src/vectors/normalizer.ts 작성
   - computeNormParams: 벡터 배열에서 각 피처의 median, Q1, Q3, IQR 계산
   - normalize: raw 벡터에 파라미터 적용
3. src/vectors/repository.ts 작성
   - pgvector 형식 변환 헬퍼
   - CRUD 함수
4. vectors/index.ts barrel export 업데이트
5. 단위 테스트 (normalizer 순수 함수)
6. DB 통합 테스트 (repository)

## Acceptance Criteria
- normalize() 출력 벡터 길이 = VECTOR_DIM (202)
- IQR=0인 피처 → 0.0
- computeNormParams() → 각 피처별 median/iqr 배열
- insertVector() → pgvector에 202-dim 벡터 저장 성공
- getVectorByCandle() → 올바른 벡터 조회
- updateVectorLabel() → label/grade 업데이트 성공
- DB 통합 테스트 통과

## Test Scenarios
- normalize() with 알려진 입력/파라미터 → 예상 출력 일치
- normalize() with IQR=0인 피처 → 해당 위치 0.0
- normalize() 입출력 벡터 길이 = 202
- computeNormParams() with 100개 벡터 → median/iqr 정확 계산
- computeNormParams() with 빈 배열 → 에러 또는 기본값
- [DB] insertVector() with 202-dim embedding → 저장 성공
- [DB] getVectorByCandle() → 올바른 벡터 반환
- [DB] getVectorByCandle() with 없는 candle_id → null
- [DB] updateVectorLabel() → label, grade, labeled_at 업데이트됨
- [DB] getVectorsForNormalization() → Float32Array 배열 반환

## Validation
```bash
bun test -- --grep "normalizer|vector-repository"
bun run typecheck
bun run lint
```

## Out of Scope
- raw 피처 추출 (T-05-009)
- KNN 검색 (T-05-011)
- KNN 결정 후 label 확정 (T-05-013)
