# T-05-011 pgvector HNSW KNN 검색 엔진

## Goal
`src/knn/engine.ts`에 pgvector HNSW 인덱스를 활용한 KNN 유사도 검색 엔진을 구현한다.

## Why
KNN 의사결정의 핵심 인프라. 현재 시그널의 벡터와 유사한 과거 벡터를 검색하여, 유사한 과거 패턴의 결과(WIN/LOSS)를 기반으로 의사결정한다. pgvector의 HNSW 인덱스로 100K+ 벡터에서 100ms 이내 검색을 보장한다.

## Inputs
- `docs/DATA_MODEL.md` — Vector 엔티티, pgvector 설정
- `docs/ARCHITECTURE.md` — knn 모듈 (L4), vectors 모듈 의존 가능
- `src/db/schema.ts` — vectorTable (T-05-003에서 생성)
- `src/core/types.ts` — Vector, KnnDecision, VectorTimeframe, CommonCodeGroup

## Dependencies
- T-05-003 (Vector 테이블 + HNSW 인덱스)

## Expected Outputs
- `src/knn/engine.ts` exports:
  - `KnnNeighbor` 타입: { vectorId, distance, label, grade, createdAt }
  - `searchKnn(db, queryVector: Float32Array, options: KnnSearchOptions) → KnnNeighbor[]`
  - `KnnSearchOptions`: { symbol, exchange, timeframe, topK, distanceMetric: 'cosine' | 'l2', minLabeledOnly?: boolean }
- `src/knn/index.ts` — barrel export

## Deliverables
- `src/knn/engine.ts`

## Constraints
- pgvector 유사도 검색 SQL:
  - cosine: `ORDER BY embedding <=> $1 LIMIT $2`
  - L2: `ORDER BY embedding <-> $1 LIMIT $2`
- topK는 CommonCode.KNN.top_k에서 조회 (기본값: 50)
- distanceMetric은 CommonCode.KNN.distance_metric에서 조회 (기본값: 'cosine')
- 검색 대상: 같은 symbol+exchange+timeframe의 labeled 벡터만 (label IS NOT NULL)
- ef_search 파라미터: SET LOCAL hnsw.ef_search = 100 (트랜잭션 내 설정)
- 검색 성능: 100K 벡터에서 < 100ms
- DB 통합 테스트: 실제 벡터 INSERT 후 KNN 검색 검증

## Steps
1. DATA_MODEL.md, ARCHITECTURE.md에서 KNN 검색 요구사항 확인
2. src/knn/engine.ts 작성
   - searchKnn: pgvector SQL 쿼리 구성 + 실행
   - CommonCode에서 topK, distanceMetric 조회 (기본값 fallback)
3. ef_search 파라미터 설정 로직
4. src/knn/index.ts barrel export 생성
5. DB 통합 테스트: 벡터 다수 INSERT → KNN 검색 → 정렬 검증

## Acceptance Criteria
- searchKnn() with cosine → 거리순 정렬된 결과 반환
- searchKnn() with l2 → 거리순 정렬된 결과 반환
- labeled 벡터만 검색 (label IS NOT NULL)
- topK 제한 준수
- CommonCode 파라미터 조회 + 기본값 fallback
- DB 통합 테스트 통과

## Test Scenarios
- searchKnn() with cosine distance → 가장 유사한 벡터가 첫 번째
- searchKnn() with l2 distance → 가장 가까운 벡터가 첫 번째
- searchKnn() with topK=5 → 최대 5개 결과
- searchKnn() with unlabeled 벡터만 존재 → 빈 배열
- searchKnn() with minLabeledOnly=true → label IS NOT NULL 벡터만
- [DB] 벡터 10개 INSERT (5개 labeled, 5개 unlabeled) → searchKnn → labeled 5개만 반환
- [DB] cosine distance 정렬 확인: 동일 벡터 검색 → distance ≈ 0
- [DB] 다른 symbol/exchange/timeframe 벡터 → 검색 결과에 미포함

## Validation
```bash
bun test -- --grep "knn-engine"
bun run typecheck
bun run lint
```

## Out of Scope
- 시간 감쇠 가중치 (T-05-012)
- PASS/FAIL/SKIP 결정 (T-05-013)
- 벡터 생성/정규화 (T-05-009, T-05-010)
