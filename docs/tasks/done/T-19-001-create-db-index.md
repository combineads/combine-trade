# T-19-001 create-db-index

## Goal
`db/index.ts`에 postgres-js 풀 + DrizzleORM 싱글턴을 구현하고, `DATABASE_URL` 누락 시 명확한 에러를 던진다.

## Why
`apps/api/src/index.ts`의 모든 stub 의존성이 Drizzle `db` 인스턴스를 필요로 한다. 이 파일 없이는 어떤 실제 DB 연결도 불가능하다.

## Inputs
- `db/schema/` 디렉터리 (기존 스키마 파일)
- `ARCHITECTURE.md` — `apps/` → `db/` import 허용 규칙 확인
- `TECH_STACK.md` — postgres-js, drizzle-orm 버전 확인

## Dependencies
없음 (first task)

## Expected Outputs
- `db/index.ts` — `export const db` (DrizzleORM instance, `drizzle(pool, { schema })`)
- 스타트업 시 `DATABASE_URL` 검증 로직
- `bun run typecheck` 통과

## Deliverables
- `db/index.ts`

## Constraints
- `DATABASE_URL` 환경변수가 없으면 `Error: DATABASE_URL is required` 던져야 함
- `db` export는 싱글턴 (모듈 수준)
- `postgres` (postgres-js) 드라이버 사용 (`pg` 아님)
- `ARCHITECTURE.md` guardrail: `packages/core`는 Drizzle import 금지 — 이 파일은 `db/`에 위치

## Steps
1. `db/schema/index.ts` 또는 스키마 진입점 확인
2. `db/index.ts` 작성:
   ```ts
   import { drizzle } from "drizzle-orm/postgres-js";
   import postgres from "postgres";
   import * as schema from "./schema/index.js";

   const url = process.env.DATABASE_URL;
   if (!url) throw new Error("DATABASE_URL is required");

   const pool = postgres(url);
   export const db = drizzle(pool, { schema });
   ```
3. `bun run typecheck` 실행하여 타입 에러 확인 및 수정

## Acceptance Criteria
- `import { db } from "../../../db/index.js"` 가 `apps/api/` 내에서 타입 에러 없이 resolve됨
- `DATABASE_URL` 미설정 시 명확한 에러 메시지 던짐
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
node -e "process.env.DATABASE_URL=''; require('./db/index.ts')" 2>&1 | grep "DATABASE_URL is required"
```

## Out of Scope
- Connection pool 튜닝 (max connections, timeout 등)
- Read-replica 설정
- Migration 실행 (T-19-002 범위)
