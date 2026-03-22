# 00-project-bootstrap

## Objective
Bootstrap the Combine Trade monorepo so that coding agents can begin implementing the pipeline modules with a reliable harness, working toolchain, and clear boundaries.

## Scope
- Harness documentation (complete)
- Bun monorepo scaffold with packages/apps/workers structure
- DrizzleORM schema for core tables
- PostgreSQL + pgvector setup
- Working validation commands (test, lint, typecheck, build)
- First vertical slice proof (candle table + basic indicator test)
- Event bus infrastructure (LISTEN/NOTIFY abstraction — all workers depend on this)
- Shared test infrastructure (exchange mocks, test data, DB lifecycle)

## Non-goals
- Full feature implementation
- UI design or implementation
- Exchange connectivity
- Strategy sandbox runtime

## Milestones

### Phase grouping
- **Phase A — Foundation** (M1–M2): Monorepo setup and toolchain
- **Phase B — Data Layer** (M3): Database schema and migration infrastructure
- **Phase C — Domain Basics** (M4–M5): Domain primitives — indicators, candle model, IoC/AOP
- **Phase D — Infrastructure** (M6–M7): Event bus and shared test infrastructure

### M1 — Harness docs ✅
- Deliverables: CLAUDE.md, docs/*
- Acceptance: all required files exist with project-specific content
- Validation: `node .agents/skills/harness-project-bootstrap/scripts/validate_harness_docs.js --root .`

### M2 — Monorepo scaffold
- Deliverables:
  - Root `package.json` with Bun workspace config
  - `packages/shared/`, `packages/core/`, `packages/candle/`, `packages/exchange/`
  - `apps/api/` (Elysia skeleton)
  - `workers/` directory structure
  - `tsconfig.json` with project references
  - `biome.json` for linting
  - `.env.example`
  - Shared error types in `packages/shared/errors/` — base error classes for retryable, fatal, user, and system error categories with code prefixes (`ERR_RETRY_`, `ERR_FATAL_`, `ERR_USER_`, `ERR_SYS_`)
- Acceptance:
  - `bun install` succeeds
  - `bun run typecheck` passes
  - `bun run lint` passes
- Validation:
  ```bash
  bun install && bun run typecheck && bun run lint
  ```

### M3 — Database schema
- Deliverables:
  - DrizzleORM schema files for: candles, strategies, strategy_events, event_labels, decisions, alerts, orders, vector_table_registry
  - `drizzle.config.ts`
  - Docker compose for PostgreSQL + pgvector
  - Migration generation working
- Acceptance:
  - `bun run db:generate` produces migration files
  - Schema matches ARCHITECTURE.md definitions
- Validation:
  ```bash
  docker compose up -d && bun run db:generate && bun run db:migrate
  ```

### M4 — First vertical slice
- Deliverables:
  - Technical indicator library (SMA, EMA, BB at minimum) with tests
  - Candle model + repository with continuity validation
  - First passing unit tests
- Acceptance:
  - `bun test` passes with > 0 tests
  - Indicator calculations are numerically correct
  - Candle continuity check detects gaps
- Validation:
  ```bash
  bun test
  ```

### M5 — IoC + AOP foundation
- Deliverables:
  - IoC container setup in `packages/shared/di/`
  - AOP decorators for @Transactional and @Log in `packages/shared/aop/`
  - Service registration pattern documented
- Acceptance:
  - Services resolve from container
  - @Transactional wraps DB operations
  - @Log produces structured output
- Validation:
  ```bash
  bun test -- --filter "di|aop"
  ```

### M6 — Event bus infrastructure
- Deliverables:
  - `packages/shared/event-bus/` — PostgreSQL LISTEN/NOTIFY 추상화 레이어
  - 채널 정의: candle_closed, strategy_event_created, decision_completed, label_ready
  - Payload 직렬화/역직렬화
  - LISTEN 전용 연결 풀 + 자동 재연결
  - Publisher/Subscriber 인터페이스
- Acceptance:
  - NOTIFY 발행 → LISTEN 수신 작동
  - 연결 끊김 후 자동 복구
  - 모든 후속 워커가 이 추상화를 사용
- Validation:
  ```bash
  bun test -- --filter "event-bus"
  ```

### M7 — Shared test infrastructure
- Deliverables:
  - `packages/exchange/testing/` — CCXT 모의 어댑터 (fetchOHLCV, watchOHLCV, createOrder 등)
  - 테스트 캔들 데이터 생성기 (현실적 합성 OHLCV)
  - 테스트 DB 라이프사이클 (setup/teardown per suite)
  - 샘플 전략 코드 fixture
- Acceptance:
  - 모의 어댑터가 실제 어댑터와 동일 인터페이스
  - 테스트 캔들 데이터가 연속성 검증 통과
  - 테스트 DB가 각 스위트 독립 실행 가능
- Validation:
  ```bash
  bun test -- --filter "test-infra|fixture"
  ```

### M8 — Backup infrastructure
- Deliverables:
  - pg_dump automated daily backup script (UTC 02:00)
  - WAL archiving configuration for PostgreSQL
  - Backup retention policy enforcement (30 days daily, 7 days WAL)
  - Weekly automated restore verification script
  - Backup monitoring: alert on missed backup or verification failure
- Acceptance criteria:
  - pg_dump completes successfully on schedule
  - WAL archiving is continuous with < 5 minute lag
  - Restore verification passes weekly
- Validation:
  ```bash
  bun run backup:verify
  ```

## Risks
- Bun monorepo workspace configuration may need iteration
- pgvector dynamic table creation (per strategy version) requires careful migration strategy
- AOP in TypeScript/Bun may need decorator or proxy-based approach
- Strategy sandbox isolation model is deferred but will constrain runtime architecture

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Bun monorepo with workspace packages | Matches stack constraint, enables shared types |
| 2026-03-21 | DrizzleORM for all DB access | Type-safe, migration-friendly, pgvector support |
| 2026-03-21 | Physical vector table separation per strategy+version | Required by isolation principle |
| 2026-03-21 | Biome for lint+format | Fast, Bun-native compatible |
| 2026-03-21 | Elysia for API | Bun-native, type-safe, plugin ecosystem |
| 2026-03-21 | Event bus를 00에 배치 (07 아님) | 모든 워커가 LISTEN/NOTIFY 사용 — 공유 인프라로 선행 필요 |
| 2026-03-21 | 로깅: stdout + structured JSON (초기). EP07에서 파일 로테이션 또는 외부 서비스로 확장 결정 | 초기에는 stdout으로 충분. 24/7 운영 시 디스크 소진 방지 위해 EP07 전에 결정 필요 |

## Task candidates → Generated tasks mapping

| Candidate | Generated task | Notes |
|-----------|---------------|-------|
| T-001: Scaffold monorepo | T-001 | Merged with T-002 (Biome/TS config) |
| T-002: Biome + TS config | T-001 | Merged into scaffold task |
| T-004: Docker compose | T-002 | Renumbered |
| T-003: DrizzleORM schemas | T-003 | Kept |
| T-005: Indicator library | T-004 | Renumbered |
| T-006: Candle model | T-005 | Renumbered |
| T-007: IoC container | T-006 | Renumbered |
| T-008: AOP decorators | T-007 | Renumbered |
| T-009: Elysia skeleton | T-008 | Renumbered |
| T-010a/b/c: Event bus | T-009 | Merged into single task |
| T-010d/e/f: Test infra | T-010 | Merged into single task |
| T-010: Integration test | T-011 | Renumbered |
| T-010g/h/i: Backup | **Deferred** | M8 backup infra — not needed for dev pipeline |

## Dependency graph

```
T-001 (scaffold) ──┬── T-002 (Docker) ──┬── T-003 (schemas) ──┬── T-005 (candle)
                   │                    │                     │
                   │                    ├── T-009 (event bus) │
                   │                    │                     │
                   │                    └── T-010 (test infra)┤
                   │                                          │
                   ├── T-004 (indicators)                     ├── T-011 (integration)
                   │                                          │
                   ├── T-006 (IoC) ── T-007 (AOP)            │
                   │                                          │
                   └── T-008 (Elysia)                         │
```

## Progress notes
- 2026-03-21: M1 complete — harness docs generated and tailored to project
- 2026-03-22: Tasks generated — 11 tasks (T-001 through T-011) covering M2–M7. M8 (backup) deferred.
