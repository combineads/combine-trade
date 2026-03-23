# T-188 wire-group-a-deps

## Goal
`strategyRepository`, `executionModeDeps`, `killSwitchDeps`에 대한 Drizzle glue 함수를 작성하고 `apps/api/src/index.ts`에 wiring한다. userId가 모든 repository call에 올바르게 전달된다.

## Why
Group A 서비스(`DrizzleStrategyRepository`, `ExecutionModeDbService`, `KillSwitchDbService`)는 이미 구현돼 있지만 `db` → 각 서비스의 `*DbDeps` 인터페이스 사이에 glue 레이어가 없어서 `index.ts`에서 직접 연결할 수 없다.

## Inputs
- T-187 완료 (auth + seed 동작 확인)
- `packages/core/strategy/drizzle-repository.ts` — `DrizzleStrategyRepository` 생성자/인터페이스
- `packages/execution/mode-db.ts` — `ExecutionModeDbService` + `ExecutionModeDbDeps` 인터페이스
- `packages/core/risk/kill-switch-db.ts` — `KillSwitchDbService` + `KillSwitchDbDeps` 인터페이스
- `apps/api/src/index.ts` — 현재 stub 위치 + `userId` derive 패턴
- `db/index.ts` (T-184 산출물)

## Dependencies
T-187

## Expected Outputs
- `apps/api/src/db/strategy-glue.ts` — `db` → `StrategyDbDeps` 매핑 함수
- `apps/api/src/db/execution-glue.ts` — `db` → `ExecutionModeDbDeps` 매핑 함수
- `apps/api/src/db/kill-switch-glue.ts` — `db` → `KillSwitchDbDeps` 매핑 함수
- `apps/api/src/index.ts` — 3개 stub 교체 완료

## Deliverables
- `apps/api/src/db/strategy-glue.ts`
- `apps/api/src/db/execution-glue.ts`
- `apps/api/src/db/kill-switch-glue.ts`
- `apps/api/src/index.ts` (수정)

## Constraints
- glue 함수는 `(db: DrizzleDb) => ServiceDbDeps` 형태
- `userId`는 Elysia `derive`에서 주입된 session context에서 가져옴 — 각 repository call에 전달
- `apps/api/src/db/` 파일들은 Drizzle import 허용 (`packages/core`가 아닌 `apps/api`)
- "Not wired to DB" 에러가 남아있으면 안 됨

## Steps
1. 각 서비스 생성자 시그니처 및 `*DbDeps` 인터페이스 읽기
2. `apps/api/src/db/strategy-glue.ts` 작성:
   - `db`를 받아 `StrategyDbDeps`를 반환하는 함수
   - `DrizzleStrategyRepository` 인스턴스화
3. `apps/api/src/db/execution-glue.ts`, `kill-switch-glue.ts` 동일하게 작성
4. `apps/api/src/index.ts`에서 3개 stub → glue 함수 결과로 교체
5. `userId` threading 확인 — derive context에서 올바르게 전달되는지 검증
6. `bun run typecheck` 확인

## Acceptance Criteria
- `GET /api/v1/strategies` — `strategies` 테이블에서 실제 데이터 반환
- `POST /api/v1/strategies` — DB에 persist 후 생성된 record 반환
- `GET /api/v1/kill-switch/status` — `kill_switch_state` 테이블에서 실제 상태 반환
- "Not wired to DB" 문자열이 응답에 없음
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test apps/api/__tests__/routes-wiring.test.ts
bun test apps/api/__tests__/route-user-isolation.test.ts
```

## Out of Scope
- Group B, C dep wiring (T-189~T-194 범위)
- Strategy 실행 로직 수정
- Kill switch 동작 변경
