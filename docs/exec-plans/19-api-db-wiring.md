# 19-api-db-wiring

## Objective

Replace all stub dependencies in `apps/api/src/index.ts` with Drizzle-backed implementations.
Completes the DB connection layer, auth wiring, and full repository wiring so that login and all API endpoints operate against real data.

## Scope

- `db/index.ts` — Drizzle + postgres-js connection singleton
- better-auth tables migration (user/session/account/verification)
- `apps/api/src/index.ts` — wire real auth + all 12 dep groups
- `apps/api/src/db/` — new Drizzle query function implementations (Group B + C)
- Admin seed fix and first login verification
- Integration test: login → authenticated API → logout → 401

### Implementation groups (pre-audited)

**Group A — implementations exist, wiring + glue functions only:**

| Dep | Existing implementation |
|-----|------------------------|
| `strategyRepository` | `DrizzleStrategyRepository` in `packages/core/strategy/drizzle-repository.ts` |
| `executionModeDeps` | `ExecutionModeDbService` in `packages/execution/mode-db.ts` |
| `killSwitchDeps` | `KillSwitchDbService` in `packages/core/risk/kill-switch-db.ts` |

Note: These services accept injected `*DbDeps` interfaces (not `db` directly). Glue functions mapping `db` → the expected dep interface must be written in `apps/api/src/db/`.

**Group B — new read-only Drizzle query functions needed:**

| Dep | Methods |
|-----|---------|
| `eventDeps` | findEventById, findEventsByStrategy, getStrategyStatistics, strategyExists |
| `orderDeps` | findOrders |
| `candleDeps` | findCandles |
| `alertDeps` | findAlerts |

**Group C — new write-capable implementations needed:**

| Dep | Methods |
|-----|---------|
| `credentialDeps` | findByUserId, findById, create (AES-256-GCM encrypt), update, remove |
| `journalDeps` | listJournals, getJournal, searchJournals, getJournalAnalytics |
| `paperDeps` | getPaperStatus, listPaperOrders, getPaperPerformance, getPaperComparison, resetPaper |
| `backtestDeps` | runBacktest (wire BacktestEngine), strategyExists |

**Other:**

| Dep | Notes |
|-----|-------|
| `sseSubscribe` | PostgreSQL LISTEN/NOTIFY in-process bridge; no DB queries, event bus wiring |

## Non-goals

- New auth features (OAuth, 2FA, RBAC)
- Worker process DB wiring (separate epic scope)
- Desktop (Tauri) auth client (EP18 M5 scope)
- PostgreSQL connection pool tuning (use sensible defaults)
- SSE client-side reconnection and session re-validation
- Migration rollback strategy (forward-only new table migration)
- Seed data beyond admin user (test fixtures, demo strategies)
- Environment variable provisioning (`.env` pre-configured)

## Prerequisites

- EP18 T-18-001~T-18-008 all in `docs/tasks/done/` ✅
- `docker compose up -d` — PostgreSQL running ✅
- `.env` with `DATABASE_URL` and `MASTER_ENCRYPTION_KEY` configured ✅

## Milestones

### M1 — DB Connection + Schema Migration

- Deliverables:
  - `db/index.ts`: exports `db` (DrizzleORM instance) using `DATABASE_URL` from env
  - `bun run db:generate` produces migration including `user`, `session`, `account`, `verification` tables
  - `bun run db:migrate` applies migration successfully
  - `db/index.ts` validates `DATABASE_URL` at startup and throws a clear error if missing
- Acceptance criteria:
  - `import { db } from "../../../db/index.js"` resolves in `apps/api/`
  - `bun run db:migrate` exits 0
  - `user`, `session`, `account`, `verification` tables exist in DB
  - `bun run typecheck` passes
- Validation:
  ```bash
  bun run db:generate && bun run db:migrate
  psql $DATABASE_URL -c "\dt" | grep -E "user|session|account|verification"
  bun run typecheck
  ```

### M2 — Auth Wiring + Admin Seed

- Deliverables:
  - `apps/api/src/index.ts`: `stubAuth` replaced with `createAuth(drizzleAdapter(db, { provider: "pg" }))`
  - `db/seed/admin.ts` dynamic import `"../index.js"` resolves correctly
  - `bun run db:seed:admin` creates admin user (idempotent)
- Acceptance criteria:
  - `POST /api/auth/sign-in/email` with admin credentials → 200 + session cookie (not 503)
  - `GET /api/v1/health` → 200 without credentials
  - `GET /api/v1/strategies` with valid session → 200 (empty array acceptable)
  - `GET /api/v1/strategies` without session → 401
- Validation:
  ```bash
  bun run db:seed:admin
  curl -c /tmp/cookies.txt -s -X POST http://localhost:3000/api/auth/sign-in/email \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@combine.trade","password":"changeme-on-first-login"}' | jq .
  curl -b /tmp/cookies.txt -s http://localhost:3000/api/v1/strategies | jq .
  curl -s http://localhost:3000/api/v1/strategies | jq .status  # expect 401
  ```

### M3 — Group A Wiring

- Deliverables:
  - `apps/api/src/db/strategy-glue.ts` — glue functions mapping `db` → `StrategyDbDeps`
  - `apps/api/src/db/execution-glue.ts` — glue functions mapping `db` → `ExecutionModeDbDeps`
  - `apps/api/src/db/kill-switch-glue.ts` — glue functions mapping `db` → `KillSwitchDbDeps`
  - `apps/api/src/index.ts`: stubs replaced for `strategyRepository`, `executionModeDeps`, `killSwitchDeps`
  - userId correctly threaded — all repository calls pass `userId` from session context
- Acceptance criteria:
  - `GET /api/v1/strategies` returns real rows from `strategies` table
  - `POST /api/v1/strategies` persists to DB and returns created record
  - `GET /api/v1/kill-switch/status` returns real state from `kill_switch_state` table
  - No "Not wired to DB" errors
  - `bun run typecheck` passes
- Validation:
  ```bash
  bun run typecheck
  bun test apps/api/__tests__/routes-wiring.test.ts
  bun test apps/api/__tests__/route-user-isolation.test.ts
  ```

### M4 — Group B + C Implementations

- Deliverables:
  - `apps/api/src/db/events-queries.ts` — findEventById, findEventsByStrategy, getStrategyStatistics, strategyExists
  - `apps/api/src/db/orders-queries.ts` — findOrders (with filter/pagination)
  - `apps/api/src/db/candles-queries.ts` — findCandles (with filter/pagination)
  - `apps/api/src/db/alerts-queries.ts` — findAlerts (with filter/pagination)
  - `apps/api/src/db/credentials-queries.ts` — CRUD with AES-256-GCM encrypt/decrypt via `packages/shared/auth/encryption.ts`
  - `apps/api/src/db/journals-queries.ts` — listJournals, getJournal, searchJournals, getJournalAnalytics
  - `apps/api/src/db/paper-queries.ts` — getPaperStatus (paper_balances+positions), listPaperOrders, getPaperPerformance, getPaperComparison, resetPaper
  - `apps/api/src/db/backtest-queries.ts` — wire BacktestEngine, strategyExists
  - `apps/api/src/db/sse-bridge.ts` — PostgreSQL LISTEN/NOTIFY → in-process listener bridge (with LISTEN connection health check)
  - `apps/api/src/index.ts`: all remaining stubs replaced
- Acceptance criteria:
  - All 12 dep groups in `index.ts` are non-stub
  - `GET /api/v1/orders` returns real data (or empty array)
  - `POST /api/v1/credentials` persists encrypted credential to DB
  - `GET /api/v1/credentials` returns masked keys only
  - `bun run typecheck` passes
- Validation:
  ```bash
  bun run typecheck
  bun test apps/api
  ```

### M5 — Integration Test + Docs

- Deliverables:
  - `tests/integration/auth-api-wiring.test.ts` — full flow using `DATABASE_URL_TEST`:
    - Login → get session → create strategy → list strategies → logout → verify 401
    - User isolation: User A data not accessible by User B token
  - `README.md` quick-start: add `bun run db:seed:admin` step after `bun run db:migrate`
- Acceptance criteria:
  - Integration test passes against real test DB
  - `bun run typecheck && bun run lint` passes
  - README quick-start is accurate end-to-end
- Validation:
  ```bash
  bun test tests/integration/auth-api-wiring.test.ts
  bun run typecheck && bun run lint
  ```

## Task candidates

| # | Title | Description | Milestone |
|---|-------|-------------|-----------|
| T-19-001 | create-db-index | `db/index.ts`: postgres-js pool + Drizzle singleton; validate DATABASE_URL at startup | M1 |
| T-19-002 | better-auth-migration | `db:generate` for better-auth tables; apply migration; verify user/session/account/verification tables in DB | M1 |
| T-19-003 | wire-auth-entry-point | Replace `stubAuth` in `index.ts` with `createAuth(drizzleAdapter(db, { provider: "pg" }))` | M2 |
| T-19-004 | admin-seed-fix-and-verify | Fix `db/seed/admin.ts` import resolution; run seed; verify login via curl | M2 |
| T-19-005 | wire-group-a-deps | Write Drizzle glue functions for strategy/executionMode/killSwitch; wire in `index.ts`; thread userId | M3 |
| T-19-006 | implement-read-query-functions | Drizzle queries for events/orders/candles/alerts in `apps/api/src/db/`; wire in `index.ts` | M4 |
| T-19-007 | implement-credentials-dep | Credential Drizzle queries with AES-GCM encrypt/decrypt; wire in `index.ts` | M4 |
| T-19-008 | implement-journal-dep | Journal Drizzle queries (list/get/search/analytics); wire in `index.ts` | M4 |
| T-19-009 | implement-paper-dep | Paper Drizzle queries (status/orders/perf/comparison/reset); wire in `index.ts` | M4 |
| T-19-010 | implement-backtest-dep | Wire BacktestEngine to `backtestDeps`; wire in `index.ts` | M4 |
| T-19-011 | wire-sse-subscribe | PostgreSQL LISTEN/NOTIFY → in-process bridge; LISTEN connection health check | M4 |
| T-19-012 | auth-e2e-integration-test | Integration test (login → CRUD → logout → 401) + README quick-start update | M5 |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| better-auth Drizzle adapter column casing mismatch (camelCase vs snake_case) | High | Run `db:generate` immediately in T-19-002; diff generated SQL against `db/schema/better-auth.ts`; fix before applying |
| Existing `users` table conflicts with better-auth `user` table in migration | Medium | Verify current DB state before T-19-002; EP18 M1 documented the migration path; may require manual SQL |
| Drizzle glue layer impedance — Group A services accept injected query deps, not `db` directly | Medium | T-19-005 must write glue functions; check each service constructor signature before wiring |
| userId threading — stub methods accept no params; real interfaces require `userId: string` on every method | Medium | Verify all Group A repository interfaces include userId; `server.ts` `derive` already injects `userId` into context |
| LISTEN/NOTIFY connection lifecycle — silent failure if connection drops | Medium | T-19-011 must add connection health check + reconnect loop for the LISTEN connection |
| BacktestEngine complexity — may have its own DB deps beyond simple instantiation | Medium | Audit `packages/backtest/` before T-19-010; if complex, safe-stub with structured error instead of crashing |
| Missing test DB for integration test | Low | Use `DATABASE_URL_TEST` from `.env`; follow existing test DB setup pattern from `db/__tests__/` |

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-23 | `db/index.ts` in `db/` directory | Consistent with `db/schema/`, `db/migrations/`; `apps/` importing from `db/` is explicitly allowed by ARCHITECTURE.md |
| 2026-03-23 | Drizzle query functions in `apps/api/src/db/` | Architecture requires `packages/core` not import Drizzle; query functions belong in `apps/api/` where Drizzle is permitted |
| 2026-03-23 | Admin seed immediately after auth wiring (M2, not M4) | Verifies auth independently from repo wiring; isolates auth bugs from data bugs |
| 2026-03-23 | All 12 dep groups in one epic | Cohesive "get the API working" scope; splitting would leave unusable partial states between epics |
| 2026-03-23 | Glue functions in `apps/api/src/db/` (not inlined in `index.ts`) | Keeps `index.ts` readable as a wiring manifest; each glue file is independently testable |

## Consensus Log

- Round 1: Planner drafted initial plan (9 tasks, M3 too large, missing dep audit)
- Round 2 (Architect): revise — audit missing implementations; add userId threading risk; clarify migration task; split M3
- Round 2 (Critic): revise — Group C massively underscoped; split T-19-005/T-19-007; expand non-goals; add test infra; add glue layer risk
- Round 3: Planner revised — pre-audited all 12 dep groups; split to 5 milestones + 12 tasks; expanded non-goals and risks
- Round 3 (Architect): **approve** — architecturally aligned; correct query function location; milestones independently verifiable
- Round 3 (Critic): **approve** — M4 wide but parallelizable; tasks right-sized; no blocking issues
- Verdict: **consensus reached** (Round 3)

## Progress notes

- 2026-03-23: 에픽 생성. EP18(T-18-001~T-18-008)의 코드 구현은 완료됐으나 `db/index.ts`가 없고 `apps/api/src/index.ts`가 전부 stub 상태. 이 에픽이 실제 서비스 동작의 마지막 연결 단계.
- 2026-03-23: 태스크 생성 완료 (T-19-001~T-19-013, 13개). T-19-001 → T-19-002 → T-19-003 → T-19-004 → T-19-005 → [T-19-006~T-19-011 병렬] → T-19-012 → T-19-013(remove-stubs-and-dead-code)
- 2026-03-25: All tasks complete. T-19-001 through T-19-013 in done/. Epic fully implemented.
