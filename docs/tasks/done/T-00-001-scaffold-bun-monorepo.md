# T-00-001 Scaffold Bun monorepo with workspace packages

## Goal
Create the Bun monorepo directory structure with working toolchain so that `bun install`, `bun run typecheck`, and `bun run lint` all pass.

## Why
Every subsequent task depends on a valid monorepo structure with workspace resolution. This is the foundation for all packages, apps, and workers.

## Inputs
- `docs/ARCHITECTURE.md` § "Proposed repository layout"
- `docs/TECH_STACK.md` § "Runtime" and § "Biome"
- `docs/ARCHITECTURE.md` § "Error taxonomy"

## Dependencies
None — this is the first task.

## Expected Outputs
- Root `package.json` with `workspaces: ["apps/*", "packages/*", "workers/*"]`
- `tsconfig.json` with strict mode and project references
- `biome.json` with strict linting rules
- `packages/shared/` with `package.json`, `tsconfig.json`, `index.ts`
- `packages/shared/errors/` with base error classes (RetryableError, FatalError, UserError, SystemError) following error taxonomy code prefixes
- `packages/shared/types/` with placeholder index
- `packages/core/` with subdirectory stubs (strategy/, vector/, decision/, label/, indicator/, journal/, risk/)
- `packages/candle/` with `package.json`, `tsconfig.json`
- `packages/exchange/` with `package.json`, `tsconfig.json`
- `packages/backtest/` with `package.json`, `tsconfig.json`
- `packages/alert/` with `package.json`, `tsconfig.json`
- `packages/execution/` with `package.json`, `tsconfig.json`
- `apps/api/` with `package.json`, `tsconfig.json`, placeholder `src/index.ts`
- `workers/` with directory stubs for all 7 workers
- `.env.example` with documented environment variables
- `packages/shared/logger/` with pino-based structured JSON logger

## Deliverables
- Complete monorepo directory structure matching ARCHITECTURE.md layout
- All workspace packages resolvable via `bun install`
- TypeScript strict compilation passing across all packages
- Biome lint passing with zero errors

## Constraints
- Bun workspace (not npm/yarn/pnpm)
- TypeScript `strict: true` everywhere
- Biome (not ESLint/Prettier)
- Error classes must use code prefixes: `ERR_RETRY_`, `ERR_FATAL_`, `ERR_USER_`, `ERR_SYS_`
- Logger must output structured JSON via pino
- No `any` types
- Package names use `@combine/` scope (e.g., `@combine/shared`, `@combine/core`)

## Steps
1. Create root `package.json` with workspace config and scripts (dev, test, lint, typecheck, build)
2. Create root `tsconfig.json` with `strict: true` and project references
3. Create `biome.json` with strict lint + format rules
4. Create `packages/shared/` — package.json, tsconfig.json, index.ts, errors/, types/, logger/
5. Implement base error classes in `packages/shared/errors/` with code prefix pattern
6. Implement pino logger wrapper in `packages/shared/logger/`
7. Create `packages/core/` with all subdirectory stubs
8. Create `packages/candle/`, `packages/exchange/`, `packages/backtest/`, `packages/alert/`, `packages/execution/`
9. Create `apps/api/` with placeholder
10. Create `workers/` directory stubs (candle-collector, strategy-worker, vector-worker, label-worker, alert-worker, execution-worker, journal-worker)
11. Create `.env.example`
12. Run `bun install` and fix any workspace resolution issues
13. Run `bun run typecheck` and fix type errors
14. Run `bun run lint` and fix lint errors

## Acceptance Criteria
- `bun install` completes without errors
- `bun run typecheck` passes (tsc --noEmit)
- `bun run lint` passes (biome lint)
- All workspace packages listed in root package.json
- Error classes exist with correct code prefixes
- Logger produces structured JSON output
- Directory structure matches ARCHITECTURE.md § "Proposed repository layout"

## Validation
```bash
bun install && bun run typecheck && bun run lint
```

## Out of Scope
- Database schema or DrizzleORM setup (T-00-003)
- Docker compose (T-00-002)
- Elysia API routes (T-00-008)
- IoC container implementation (T-00-006)
- AOP decorators (T-00-007)
- UI packages (apps/web, apps/desktop, packages/ui) — deferred to EP08

## Implementation Plan

### Files to create
1. Root: `package.json`, `tsconfig.json`, `biome.json`, `.env.example`
2. `packages/shared/` — package.json, tsconfig.json, index.ts
3. `packages/shared/errors/` — base.ts (BaseError), retryable.ts, fatal.ts, user.ts, system.ts, index.ts
4. `packages/shared/types/` — index.ts (placeholder)
5. `packages/shared/logger/` — index.ts (pino wrapper)
6. `packages/core/` — package.json, tsconfig.json, index.ts + subdirectory stubs
7. `packages/candle/` — package.json, tsconfig.json, index.ts
8. `packages/exchange/` — package.json, tsconfig.json, index.ts
9. `packages/backtest/` — package.json, tsconfig.json, index.ts
10. `packages/alert/` — package.json, tsconfig.json, index.ts
11. `packages/execution/` — package.json, tsconfig.json, index.ts
12. `apps/api/` — package.json, tsconfig.json, src/index.ts
13. `workers/` — 7 worker directory stubs (candle-collector, strategy-worker, vector-worker, label-worker, alert-worker, execution-worker, journal-worker) each with package.json, tsconfig.json, src/index.ts

### Approach
- Bun workspaces with `@combine/` scope for all packages
- Root tsconfig with project references to each package/app/worker
- Each sub-package has its own tsconfig extending a shared base
- Biome strict config at root (shared across all packages)
- Error classes follow ARCHITECTURE.md error taxonomy
- Pino logger with JSON output, dev-pretty option via pino-pretty

### Test strategy
- Error classes: unit tests for code prefix pattern and inheritance
- Logger: unit test for JSON output structure
- Tests located alongside source in `__tests__/` or `*.test.ts`

### Risks
- Bun workspace path resolution may need iteration
- TypeScript project references + Bun can have edge cases

## Implementation Notes

- **Date**: 2026-03-22
- **Files created**: 64 files across root config, 7 packages, 1 app, 7 workers
- **Tests written**: 14 tests (11 error taxonomy + 3 logger) in 2 test files
- **Approach**:
  - Root package.json with Bun workspaces: `["apps/*", "packages/*", "workers/*"]`
  - Root tsconfig with strict mode, project references to all packages/apps/workers
  - Biome configured with tab indentation, strict linting (noExplicitAny: error, noUnusedImports: error)
  - `@combine/` scope for all workspace packages
  - packages/shared: errors (4 classes with code prefix validation), types (domain enums), logger (pino wrapper)
  - packages/core: 7 subdirectory stubs (strategy, vector, decision, label, indicator, journal, risk)
  - 5 domain packages: candle, exchange, backtest, alert, execution
  - apps/api: placeholder with package.json and tsconfig
  - 7 worker stubs: candle-collector, strategy-worker, vector-worker, label-worker, alert-worker, execution-worker, journal-worker
  - Used `@types/bun` (not `bun-types`) for Bun type definitions
- **Validation results**:
  - `bun install`: PASS (50 packages)
  - `bun run typecheck`: PASS
  - `bun run lint`: PASS (66 files checked, 0 errors)
  - `bun test --recursive`: PASS (14 tests, 0 failures)
- **Discovered work**: None
- **Blockers**: None

## Outputs

- Root `package.json` with workspace config and scripts (dev, test, lint, typecheck, build, db:generate, db:migrate)
- Root `tsconfig.json` with strict: true, project references, @types/bun
- `biome.json` with strict linting rules
- `packages/shared/errors/` — BaseError, RetryableError, FatalError, UserError, SystemError with code prefix validation
- `packages/shared/types/` — Exchange, Symbol, Timeframe, Direction, DecisionResult, ResultType, ExecutionMode, DeliveryState, OrderStatus, ConfidenceTier, DecisionReason types
- `packages/shared/logger/` — pino-based logger with createLogger(name) factory
- `packages/core/` — directory structure with 7 subdirectory stubs
- `packages/{candle,exchange,backtest,alert,execution}/` — workspace packages with tsconfig
- `apps/api/` — placeholder with package.json and tsconfig
- `workers/{candle-collector,strategy-worker,vector-worker,label-worker,alert-worker,execution-worker,journal-worker}/` — 7 worker stubs
- `.env.example` — documented environment variables
