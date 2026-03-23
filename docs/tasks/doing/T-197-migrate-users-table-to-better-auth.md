# T-197 Migrate legacy `users` table to Better Auth `user` table

## Goal
레거시 `users` 테이블을 제거하고, `exchange_credentials` · `paper_balances` · `paper_orders` · `paper_positions` · `trade_journals` 의 `user_id` FK를 Better Auth의 `user` 테이블로 변경한다.

## Why
EP18/EP19에서 Better Auth로 인증이 전환됐지만 일부 비즈니스 테이블이 레거시 `users` 테이블을 여전히 참조하고 있다. 두 개의 유저 테이블이 공존하면 유저 ID 불일치, 보안 취약점, 혼란이 발생한다. `users` 테이블 데이터는 현재 비어있어 데이터 손실 없이 마이그레이션 가능하다.

## Inputs
- `db/schema/users.ts` — 레거시 스키마
- `db/schema/better-auth.ts` — `authUser` (`user` 테이블)
- `db/schema/exchange-credentials.ts`
- `db/schema/paper-balances.ts`
- `db/schema/paper-orders.ts`
- `db/schema/paper-positions.ts`
- `db/schema/trade-journals.ts`
- `db/schema/index.ts`

## Dependencies
없음 (T-196 완료 이후 독립 태스크)

## Expected Outputs
- 변경된 스키마 파일 5개 (`exchange-credentials`, `paper-balances`, `paper-orders`, `paper-positions`, `trade-journals`)
- 삭제된 `db/schema/users.ts`
- 업데이트된 `db/schema/index.ts`
- Drizzle 마이그레이션 파일 (`db/migrations/`)
- 적용 완료된 DB 상태 (`users` 테이블 drop)

## Deliverables
Drizzle 마이그레이션 파일 1개 (FK 변경 + `users` 테이블 drop 포함)

## Constraints
- `users.id`는 `uuid` 타입, `user.id`는 `text` 타입 — FK 컬럼 타입을 `text`로 변경해야 함
- `users` 테이블은 현재 비어있음을 확인 후 drop (`SELECT COUNT(*) FROM users` = 0)
- `bun run typecheck` 통과 후에만 마이그레이션 생성
- 마이그레이션 적용 전 DB 백업 불필요 (dev 환경, 데이터 없음)

## Steps
1. `db/schema/users.ts`를 참조하는 5개 스키마 파일 수정:
   - `import { users } from "./users.js"` → `import { authUser } from "./better-auth.js"` 로 교체
   - `user_id` 컬럼 FK를 `authUser.id` 참조로 변경
   - `user_id` 컬럼 타입을 `uuid` → `text`로 변경
2. `db/schema/users.ts` 삭제
3. `db/schema/index.ts`에서 `export { users } from "./users.js"` 제거
4. `bun run typecheck` 통과 확인
5. `bun run db:generate` — 마이그레이션 파일 생성
6. 생성된 마이그레이션 내용 검토 (FK drop → 컬럼 타입 변경 → FK 재생성 → `users` 테이블 drop 순서 확인)
7. `bun run db:migrate` — 마이그레이션 적용
8. `bun run lint && bun test` 통과 확인

## Acceptance Criteria
- `db/schema/users.ts` 파일이 존재하지 않음
- `db/schema/index.ts`에 `users` export 없음
- `exchange_credentials`, `paper_balances`, `paper_orders`, `paper_positions`, `trade_journals` 테이블의 `user_id`가 `user.id` (text)를 참조
- DB에 `users` 테이블이 존재하지 않음
- `bun run typecheck` 통과
- `bun run lint` 통과
- `bun test` 통과

## Validation
```bash
# users 테이블 없음 확인
docker exec combine-trade-db psql -U combine -d combine_trade -c "\dt users" 2>&1 | grep "Did not find"

# FK 참조 확인
docker exec combine-trade-db psql -U combine -d combine_trade -c "
SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'user'
ORDER BY tc.table_name;
"

# 코드 검증
grep -r "from.*schema/users" /Users/combine/projects/combine/combine-trade/db /Users/combine/projects/combine/combine-trade/apps /Users/combine/projects/combine/combine-trade/packages --include="*.ts" | wc -l  # should be 0

bun run typecheck
bun run lint
bun test
```

## Out of Scope
- `user` 테이블에 `role`, `is_active` 컬럼 추가 (Better Auth 확장은 별도 태스크)
- 기존 `users` 데이터 마이그레이션 (현재 비어있음)
- seed 스크립트 수정 (T-196 범위)

## Implementation Notes

- **Date:** 2026-03-24
- **Files changed:**
  - `db/schema/exchange-credentials.ts`
  - `db/schema/paper-balances.ts`
  - `db/schema/paper-orders.ts`
  - `db/schema/paper-positions.ts`
  - `db/schema/trade-journals.ts`
  - `db/schema/index.ts`
  - `db/schema/users.ts` (삭제)
  - `db/migrations/0005_migrate_users_to_better_auth.sql` (신규)
  - `db/migrations/meta/_journal.json`
- **Tests written:** 없음 (스키마 변경 — 기존 1677개 테스트로 커버)
- **Approach:** 5개 스키마 파일의 import를 `users` → `authUser`, `uuid` → `text`로 변경. drizzle-kit generate가 TTY 필요하여 마이그레이션 SQL 수동 작성 (프로젝트의 기존 방식 0002–0004와 동일). FK drop → 타입 변경 → FK 재생성 → users 테이블 drop 순서.
- **Validation results:**
  - `bun run typecheck` ✅
  - `bun run db:migrate` ✅ (0005 적용)
  - DB: `users` 테이블 없음 ✅
  - DB: 5개 테이블 FK가 `user` 테이블 참조 ✅
  - 코드 내 `schema/users` 참조 0건 ✅
  - `bun test` ✅ 1673 pass, 0 fail
  - 수정 파일 lint ✅ (전체 lint 266 warnings/13 errors는 pre-existing, 수정 파일과 무관)
- **Discovered work:** 없음
- **Blockers:** 없음

## Outputs
- `db/schema/` — 5개 스키마 파일 (userId: text, FK → authUser.id)
- `db/migrations/0005_migrate_users_to_better_auth.sql`
- DB 상태: `users` 테이블 없음, 5개 테이블의 `user_id`가 `user.id` (text) 참조
