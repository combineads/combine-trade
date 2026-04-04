# T-08-001 EventLog 테이블 Drizzle 스키마 & 마이그레이션

## Goal
DATA_MODEL.md의 EventLog 엔티티를 Drizzle ORM 스키마로 정의하고 마이그레이션(0006)을 생성한다.

## Why
EP-08 전체(대조 워커, Slack 알림, 이벤트 저장)가 EventLog 테이블에 대조/알림/상태변경 이벤트를 기록한다. 스키마가 없으면 후속 태스크가 시작할 수 없다.

## Inputs
- `docs/DATA_MODEL.md` — EventLog 엔티티 상세 (7컬럼, 3인덱스, FK 없음, append-only)
- `src/db/schema.ts` — 기존 테이블 정의 (0000~0005)
- `src/core/types.ts` — EventType (string alias)

## Dependencies
- 없음 (EP-01~07 완료)

## Expected Outputs
- `src/db/schema.ts`에 `eventLogTable` 추가 + EventLogRow, NewEventLogRow 타입 export
- `drizzle/0006_*.sql` 마이그레이션 파일
- 인덱스 3개: (event_type, created_at DESC), (symbol, exchange, created_at DESC), (ref_type, ref_id)

## Deliverables
- `src/db/schema.ts` 확장
- `drizzle/0006_*.sql` 마이그레이션 생성
- `tests/db/schema-eventlog.test.ts`

## Constraints
- FK 없음 — ref_id는 논리적 참조만 (EventLog는 어떤 엔티티든 참조 가능)
- append-only — DELETE 쿼리 절대 금지
- data 컬럼은 jsonb (자유 구조)
- symbol, exchange는 nullable (시스템 전체 이벤트는 null)

## Steps
1. DATA_MODEL.md EventLog 엔티티 읽기
2. `src/db/schema.ts`에 eventLogTable 정의 추가 (7컬럼, 3인덱스)
3. 타입 export (EventLogRow, NewEventLogRow)
4. `bunx drizzle-kit generate`로 마이그레이션 생성
5. 생성된 SQL 검토
6. 테스트 작성 및 실행

## Acceptance Criteria
- eventLogTable: id(uuid PK), event_type(text NOT NULL), symbol(text nullable), exchange(text nullable), ref_id(uuid nullable), ref_type(text nullable), data(jsonb), created_at(timestamptz NOT NULL)
- 인덱스 3개 정확
- FK 없음 확인
- append-only: DELETE 관련 코드 없음

## Test Scenarios
- eventLogTable INSERT with all fields → row created with defaults
- eventLogTable INSERT with null symbol/exchange (system event) → success
- eventLogTable INSERT with ref_type + ref_id → success
- eventLogTable event_type index existence check
- eventLogTable (symbol, exchange, created_at) index check
- eventLogTable (ref_type, ref_id) index check
- eventLogTable data jsonb accepts nested objects
- eventLogTable created_at defaults to now

## Validation
```bash
bun test -- --grep "schema-eventlog"
bun run typecheck
bun run lint
```

## Out of Scope
- EventLog 저장/조회 헬퍼 (T-08-002)
- event_type 규약 정의 (T-08-002)
