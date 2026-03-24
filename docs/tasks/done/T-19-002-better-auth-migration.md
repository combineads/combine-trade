# T-19-002 better-auth-migration

## Goal
better-auth의 `user`, `session`, `account`, `verification` 테이블 migration을 생성하고 적용한다.

## Why
`stubAuth`를 실제 better-auth로 교체하려면 DB에 해당 테이블이 존재해야 한다. 이 테이블 없이는 M2(auth wiring)가 불가능하다.

## Inputs
- T-19-001 완료 (`db/index.ts` 존재)
- `db/schema/better-auth.ts` (EP18에서 작성된 스키마 파일)
- `db/drizzle.config.ts` 또는 `drizzle.config.ts` (migration 설정)
- 실행 중인 PostgreSQL (`docker compose up -d`)

## Dependencies
T-19-001

## Expected Outputs
- `db/migrations/` 에 better-auth 테이블 migration SQL 파일
- 적용된 migration (`bun run db:migrate` 성공)
- DB에 `user`, `session`, `account`, `verification` 테이블 존재

## Deliverables
- Migration SQL 파일 (자동 생성)
- 필요 시 `db/schema/better-auth.ts` 수정 (casing 불일치 수정)

## Constraints
- better-auth Drizzle 어댑터는 `camelCase` → `snake_case` 변환을 자동으로 하지 않을 수 있음 → 생성된 SQL 검증 필수
- 기존 `users` 테이블이 있다면 충돌 여부 확인 후 처리
- `bun run db:generate` → SQL diff 검토 → `bun run db:migrate` 순서로 진행
- forward-only migration (rollback 스크립트 불필요)

## Steps
1. 현재 DB 상태 확인: `psql $DATABASE_URL -c "\dt"`
2. `bun run db:generate` 실행, 생성된 SQL 확인
3. better-auth 테이블 SQL이 포함됐는지 검증 (`user`, `session`, `account`, `verification`)
4. column casing 불일치 시 `db/schema/better-auth.ts` 수정 후 재생성
5. `bun run db:migrate` 실행
6. `psql $DATABASE_URL -c "\dt"` 로 테이블 존재 확인

## Acceptance Criteria
- `bun run db:migrate` exits 0
- `user`, `session`, `account`, `verification` 테이블이 DB에 존재
- `bun run typecheck` 통과

## Validation
```bash
bun run db:generate && bun run db:migrate
psql $DATABASE_URL -c "\dt" | grep -E "user|session|account|verification"
bun run typecheck
```

## Out of Scope
- Migration rollback 전략
- 기존 `users` 테이블 데이터 마이그레이션
- 다른 테이블의 migration (strategy, orders 등은 이미 존재)
