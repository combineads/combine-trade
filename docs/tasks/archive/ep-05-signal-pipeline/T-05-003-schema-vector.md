# T-05-003 Vector 테이블 + pgvector HNSW 인덱스 Drizzle 스키마 & 마이그레이션

## Goal
`src/db/schema.ts`에 Vector 테이블 Drizzle 스키마를 추가하고, pgvector HNSW 인덱스를 포함한 마이그레이션을 생성한다. Signal.vector_id FK도 이 마이그레이션에서 추가한다.

## Why
벡터라이저(T-05-009)와 KNN 엔진(T-05-011)이 Vector 테이블에 의존한다. HNSW 인덱스는 KNN 검색 성능의 핵심이다. Signal.vector_id FK는 Vector 테이블 생성 후에만 추가 가능하므로 이 태스크에서 처리한다.

## Inputs
- `docs/DATA_MODEL.md` — Vector 엔티티 정의, pgvector 설정 (HNSW, ef_construction=200, m=16, cosine)
- `src/db/schema.ts` — 기존 스키마 + T-05-001/002에서 추가된 테이블
- `src/core/types.ts` — Vector, VectorTimeframe, TradeResult, VectorGrade 타입
- EP-04에서 생성한 candleTable (Vector.candle_id FK 대상)

## Dependencies
- T-05-002 (Signal 테이블 — Signal.vector_id FK 추가를 위해)

## Expected Outputs
- `src/db/schema.ts`에 `vectorTable` export 추가
- `VectorRow`, `NewVectorRow` 타입 export
- Signal.vector_id → Vector FK 추가
- `drizzle/` 폴더에 마이그레이션 SQL (HNSW 인덱스 포함)

## Deliverables
- `src/db/schema.ts` — vectorTable 정의 추가 + signalTable.vector_id FK 연결

## Constraints
- DATA_MODEL.md Vector 엔티티와 정확히 일치
- Vector: FK candle_id → Candle CASCADE UNIQUE, FK signal_id → Signal nullable
- Vector: CHECK timeframe IN ('5M','1M'), CHECK label/grade
- pgvector extension: `CREATE EXTENSION IF NOT EXISTS vector` (이미 test-db에서 처리하지만 마이그레이션에도 포함)
- embedding 컬럼: `vector(202)` 타입
- HNSW 인덱스: `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=200)`
- 필터 인덱스: (symbol, exchange, timeframe)
- Drizzle에서 pgvector 컬럼은 customType으로 정의 필요
- DB 통합 테스트: test-db 헬퍼 사용, pgvector extension 존재 전제

## Steps
1. DATA_MODEL.md에서 Vector 필드/제약/인덱스 확인
2. Drizzle에서 pgvector `vector(202)` 커스텀 타입 정의
3. src/db/schema.ts에 vectorTable pgTable 정의 추가
4. FK, CHECK, UNIQUE 제약조건 반영
5. signalTable에 vector_id FK 추가 (vectorTable 참조)
6. Row/NewRow 타입 export
7. `bunx drizzle-kit generate`로 마이그레이션 SQL 생성
8. 생성된 SQL에 HNSW 인덱스 수동 추가 (drizzle-kit이 pgvector 인덱스를 자동 생성하지 못할 수 있음)
9. 통합 테스트 작성: 벡터 INSERT/조회, HNSW 인덱스 존재 확인, 유사도 검색 기본 동작
10. typecheck 통과 확인

## Acceptance Criteria
- vectorTable이 DATA_MODEL.md Vector와 필드/타입/제약 일치
- embedding 컬럼이 vector(202) 타입
- HNSW 인덱스가 cosine distance로 생성됨
- Vector.candle_id FK → Candle CASCADE UNIQUE 존재
- Signal.vector_id FK → Vector nullable 존재
- 마이그레이션 SQL에 HNSW 인덱스 CREATE문 포함
- pgvector 기본 유사도 검색 동작 확인 (DB 통합 테스트)
- `bun run typecheck` 통과

## Test Scenarios
- vectorTable 스키마가 DATA_MODEL.md의 모든 Vector 필드를 포함 → 누락 없음
- [DB] pgvector extension 존재 확인 → pg_extension에서 vector 발견
- [DB] Vector INSERT with 202-dim embedding → 정상 저장
- [DB] Vector INSERT with 잘못된 차원 (예: 100-dim) → 에러
- [DB] Vector UNIQUE 제약: 같은 candle_id 중복 INSERT → 유니크 위반 에러
- [DB] Vector FK 제약: 존재하지 않는 candle_id INSERT → FK 위반 에러
- [DB] Vector CASCADE: Candle 삭제 시 → Vector도 삭제됨
- [DB] Vector CHECK 제약: timeframe='1H' → CHECK 위반 에러
- [DB] HNSW 인덱스 존재 확인 → pg_indexes에서 hnsw 인덱스 발견
- [DB] 기본 유사도 검색: 벡터 2개 INSERT 후 cosine distance ORDER BY → 올바른 순서
- [DB] Signal.vector_id FK: Vector 삭제 시 Signal.vector_id 영향 확인

## Validation
```bash
bun test -- --grep "schema-vector"
bun run typecheck
bunx drizzle-kit generate 2>&1 | tail -5
```

## Out of Scope
- 벡터 생성 로직 (T-05-009)
- KNN 검색 로직 (T-05-011)
- Median/IQR 정규화 (T-05-010)
