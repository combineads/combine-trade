# T-04-000 DB 테스트 인프라 구축

## Goal
EP-04 이후 모든 DB 연동 태스크가 실제 PostgreSQL에서 통합 테스트를 실행할 수 있도록 테스트 인프라를 구축한다.

## Why
EP-01~03의 테스트는 mock/structural 수준이었다 (스키마 컬럼 이름 확인, 에러 메시지 검증 등). EP-04부터 `ON CONFLICT DO UPDATE WHERE is_closed = false` 같은 조건부 UPSERT, FK/UNIQUE 제약, SQL 기반 갭 감지 등 PostgreSQL의 실제 동작을 검증해야 한다. mock 테스트로는 이런 핵심 로직의 정확성을 보장할 수 없다.

## Inputs
- `src/db/pool.ts` — 기존 DB 연결 모듈 (initDb, getDb, closePool)
- `src/db/migrate.ts` — 기존 마이그레이션 러너 (drizzle-orm/postgres-js/migrator)
- `src/db/schema.ts` — Drizzle 스키마 정의
- `drizzle/` — 마이그레이션 SQL 파일
- `package.json` — 기존 스크립트

## Dependencies
- 없음 (EP-04 인프라 첫 태스크)

## Expected Outputs
- `docker-compose.yml`:
  - PostgreSQL 16 + pgvector 컨테이너 (테스트용 포트 5433)
- `tests/helpers/test-db.ts`:
  - `initTestDb(): Promise<DbInstance>` — 테스트 DB 연결 + 마이그레이션 실행
  - `cleanupTables(): Promise<void>` — 모든 데이터 테이블 TRUNCATE CASCADE
  - `closeTestDb(): Promise<void>` — 연결 종료
  - `isTestDbAvailable(): Promise<boolean>` — DB 연결 가능 여부 확인 (skip 판단용)
- `.env.test` — 테스트 DB 연결 문자열 (커밋 가능 — 로컬 테스트 DB 정보만)

## Deliverables
- `docker-compose.yml`
- `tests/helpers/test-db.ts`
- `.env.test`

## Constraints
- PostgreSQL 16 + pgvector 확장 (`pgvector/pgvector:pg16` Docker 이미지)
- 테스트 DB 포트: 5433 (개발/운영 DB 5432와 충돌 방지)
- 테스트 격리: 각 테스트 suite의 `beforeEach`에서 TRUNCATE CASCADE로 클린 상태 보장
- `bun test`로 단위 테스트와 통합 테스트 모두 실행 가능
- DB 미연결 시 통합 테스트는 skip — `describe.skipIf(!isTestDbAvailable())` 패턴 사용
- `.env.test`는 커밋 대상 (비밀 정보 없음 — 로컬 테스트 전용)
- 기존 `initDb()` 함수 재사용 (URL 파라미터로 테스트 DB 지정)
- pgvector 확장: `CREATE EXTENSION IF NOT EXISTS vector` 마이그레이션 시 실행

## Steps
1. `docker-compose.yml` 작성:
   - 서비스: `db` (pgvector/pgvector:pg16 이미지)
   - 포트: 5433:5432
   - 환경변수: POSTGRES_DB=combine_trade_test, POSTGRES_USER=test, POSTGRES_PASSWORD=test
   - 볼륨: 이름 있는 볼륨 (postgres-test-data)
   - healthcheck: `pg_isready -U test`
2. `.env.test` 작성:
   - `DATABASE_URL=postgresql://test:test@localhost:5433/combine_trade_test`
3. `tests/helpers/test-db.ts` 구현:
   - `isTestDbAvailable()`: .env.test 로드 → SELECT 1 시도 → boolean 반환
   - `initTestDb()`: initDb(.env.test URL) → pgvector 확장 활성화 → Drizzle 마이그레이션 실행 → DbInstance 반환
   - `cleanupTables()`: 모든 데이터 테이블 TRUNCATE CASCADE (마이그레이션 메타 테이블 제외)
   - `closeTestDb()`: closePool()
4. 사용 패턴 예제 작성 (주석 또는 테스트):
   ```typescript
   const isDbReady = await isTestDbAvailable();
   describe.skipIf(!isDbReady)("repository integration", () => {
     beforeAll(() => initTestDb());
     beforeEach(() => cleanupTables());
     afterAll(() => closeTestDb());
     // tests...
   });
   ```
5. 검증 테스트: `tests/helpers/test-db.test.ts` — DB 연결 → SELECT 1 → 테이블 존재 확인 → cleanup 동작 확인
6. typecheck 통과 확인

## Acceptance Criteria
- `docker compose up -d` → PostgreSQL + pgvector 컨테이너 정상 실행 (healthcheck 통과)
- `initTestDb()` → 마이그레이션 실행 → symbol/symbol_state/common_code 테이블 생성됨
- `cleanupTables()` → 모든 데이터 행 삭제, 테이블 구조 유지
- `closeTestDb()` → 연결 정상 종료
- DB 미실행 시 `isTestDbAvailable()` → false, 통합 테스트 skip
- DB 실행 시 `bun test -- --grep "test-db"` 통과

## Test Scenarios
- initTestDb() with running PostgreSQL → DB 연결 성공, 마이그레이션 실행, 기존 3개 테이블 존재
- initTestDb() 중복 호출 → 이미 초기화된 경우 no-op (idempotent)
- cleanupTables() after INSERT → 모든 행 삭제됨, 테이블 구조 유지
- closeTestDb() → pool 종료, 이후 getDb() 호출 시 에러
- isTestDbAvailable() with no Docker → false 반환, 에러 throw 없음
- isTestDbAvailable() with running DB → true 반환

## Validation
```bash
docker compose up -d
sleep 2
bun test -- --grep "test-db"
bun run typecheck
docker compose down
```

## Out of Scope
- CI/CD 파이프라인 Docker 설정
- 프로덕션 DB 마이그레이션 자동화
- 테스트 시드 데이터 (개별 태스크에서 필요 시 생성)
- 개발용 DB 컨테이너 (이 태스크는 테스트 전용)
