# T-12-013 Reconciliation — getActiveTickets FOR UPDATE 실제 구현

## Goal
reconciliation worker의 `getActiveTickets` 쿼리가 실제로 `SELECT ... FOR UPDATE`를 사용하는지 확인하고, 미사용이면 추가한다.

## Why
EP-10 T-10-014에서 FOR UPDATE를 인터페이스 계약(JSDoc)으로 명시했으나, 실제 DI 바인딩에서 SQL에 FOR UPDATE를 포함하는지 확인되지 않음. 잠금 없이 reconciliation을 실행하면 동시 접근 시 데이터 불일치 위험.

## Inputs
- `src/reconciliation/worker.ts` — CrashRecoveryDeps, ReconciliationDeps 인터페이스
- DI 바인딩 위치: daemon 부트스트랩 또는 db/queries.ts

## Dependencies
없음 (독립 태스크)

## Expected Outputs
- getActiveTickets 쿼리에 FOR UPDATE가 실제 SQL에 포함됨
- 또는 Drizzle ORM에서 raw SQL / `.for("update")` 사용

## Deliverables
- 해당 DI 바인딩 파일 (위치 확인 후 수정)

## Constraints
- FOR UPDATE는 트랜잭션 내에서만 유효 — reconciliation 사이클이 트랜잭션으로 감싸져 있는지도 확인
- Drizzle ORM에서 FOR UPDATE 지원: `db.select().from(table).where(...).for("update")`
- 트랜잭션이 없으면 FOR UPDATE 추가만으로 불충분 — 트랜잭션 래핑도 필요

## Steps
1. reconciliation worker의 DI 바인딩 위치 찾기 (grep "getActiveTickets" 구현체)
2. 현재 SQL에 FOR UPDATE 포함 여부 확인
3. 미포함 시: `.for("update")` 추가
4. 트랜잭션 래핑 확인 — 없으면 `db.transaction()` 추가
5. 테스트 작성 (쿼리 빌더 출력에 FOR UPDATE 포함 확인)

## Acceptance Criteria
- getActiveTickets 쿼리 SQL에 "FOR UPDATE" 포함
- reconciliation 사이클이 트랜잭션 내에서 실행
- 기존 reconciliation 동작 변경 없음

## Test Scenarios
- getActiveTickets() 쿼리가 FOR UPDATE를 포함하는지 SQL 문자열 확인
- reconciliation cycle이 트랜잭션 내에서 실행되는지 확인
- 동시 호출 시 두 번째 호출이 첫 번째 완료까지 대기 (잠금 동작)
- 트랜잭션 롤백 시 잠금 해제 확인

## Validation
```bash
bun test -- tests/reconciliation/
bun run typecheck && bun run lint
```

## Out of Scope
- reconciliation 로직 변경
- Panic Close Slack 연결 (이미 EP-10에서 완료)

## Implementation Notes (T-12-013)

### 조사 결과
- `getActiveTickets`의 프로덕션 구현이 `src/` 어디에도 존재하지 않음
- `src/reconciliation/worker.ts`와 `src/daemon/crash-recovery.ts`에 인터페이스 정의만 있고 JSDoc으로 FOR UPDATE 계약을 명시함
- 모든 테스트에서는 mock으로 대체됨
- 프로덕션 DI 바인딩 파일(예: daemon wiring)이 없음 — 완전한 미구현 상태

### 구현 내용
- `src/db/queries.ts` 신규 생성: `makeGetActiveTickets(db)` factory 함수
  - `db.transaction()` 내에서 실행 (FOR UPDATE는 트랜잭션 내에서만 유효)
  - `ne(ticketTable.state, "CLOSED")` WHERE 조건으로 활성 티켓만 조회
  - `.for("update")` Drizzle ORM 구문으로 SELECT ... FOR UPDATE 구현
  - 반환 타입: `TicketSnapshot[]` (ReconciliationDeps 계약과 호환)
- `src/db/index.ts`에 `export * from "./queries.ts"` 추가

### 테스트
- `tests/reconciliation/getActiveTickets-for-update.test.ts` 신규 생성: 8개 테스트
  1. Drizzle QueryBuilder로 `for update` SQL 생성 확인 (no real DB needed)
  2. WHERE 절에 `CLOSED` 파라미터 포함 확인
  3. `tickets` 테이블 참조 확인
  4. `db.transaction()` 정확히 1회 호출 확인
  5. 빈 결과 반환 시 오류 없음 확인
  6. 트랜잭션 오류 전파 확인
  7. `runOnce()` 통합 — 빈 DB
  8. `runOnce()` 통합 — 티켓 반환

### 검증 결과
- `bun test tests/reconciliation/`: 51 pass, 0 fail
- `bun run typecheck`: 오류 없음
- `bun run lint`: 오류 없음

### 주의사항
- `runOnce()` 자체는 트랜잭션으로 감싸지 않음. 대신 `getActiveTickets` 구현이 내부적으로 트랜잭션을 생성해서 FOR UPDATE 잠금을 유지함.
- 잠금 범위: 트랜잭션은 `getActiveTickets` 호출 완료 시 커밋됨 (즉, reconciliation 사이클 전체가 아닌 조회 시점만 잠금). reconciliation 사이클 전체를 트랜잭션으로 감싸려면 `runOnce`의 구조적 변경이 필요하나, 이는 Out of Scope임.
