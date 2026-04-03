# T-01-014 CI/build integration verification

## Goal
Verify that all EP-01 deliverables work together: typecheck, lint, build, test, migrate, seed, and layer enforcement all pass in a single clean run. Fix any integration issues discovered.

## Why
Individual tasks verify their own deliverables, but integration issues (import cycles, missing exports, incompatible types across modules) only surface when everything runs together. This task is the final gate before EP-01 can be marked complete.

## Inputs
- All EP-01 task outputs (T-01-001 through T-01-013)
- `docs/QUALITY.md` — validation commands
- `package.json` — all defined scripts

## Dependencies
T-01-012 (config/seed.ts — last content task)
T-01-013 (layer enforcement — must pass)

## Expected Outputs
- All validation commands pass
- Any integration fixes applied
- EP-01 foundation is ready for dependent epics

## Deliverables
- Passing CI validation (no new files — this task fixes integration issues)

## Constraints
- Do not add new features — only fix integration issues
- Do not modify individual module behavior — only fix wiring
- All fixes must maintain the architectural layer rules
- Test database must be available for migrate/seed verification

## Steps
1. Run full validation sequence:
   ```bash
   bun install
   bun run typecheck
   bun run lint
   bun run build
   bun test
   bun run migrate
   bun run seed
   bun scripts/check-layers.ts
   ```
2. For each failure:
   - Diagnose root cause
   - Apply minimal fix
   - Re-run affected validation
3. Verify all core module exports are accessible:
   - `import { ... } from '@/core/types'`
   - `import { ... } from '@/core/constants'`
   - `import { ... } from '@/core/decimal'`
   - `import { ... } from '@/core/ports'`
   - `import { ... } from '@/core/logger'`
4. Verify all db module exports are accessible:
   - `import { ... } from '@/db/pool'`
   - `import { ... } from '@/db/schema'`
5. Verify all config module exports are accessible:
   - `import { ... } from '@/config'`
   - `import { ... } from '@/config/schema'`
6. Run layer check and verify zero violations
7. Run all tests and verify all pass
8. Document any integration decisions made

## Acceptance Criteria
- `bun install` completes without errors
- `bun run typecheck` passes with zero errors
- `bun run lint` passes with zero errors
- `bun test` passes all tests
- `bun run migrate` succeeds on test database
- `bun run seed` succeeds on test database
- `bun scripts/check-layers.ts` reports zero violations
- All module exports are accessible via path aliases

## Test Scenarios
- 모든 core/ 모듈의 public export가 `@/core/*` alias로 import 가능 → 컴파일 성공
- 모든 db/ 모듈의 public export가 `@/db/*` alias로 import 가능 → 컴파일 성공
- 모든 config/ 모듈의 public export가 `@/config/*` alias로 import 가능 → 컴파일 성공
- `bun run migrate` → `bun run seed` 순서로 실행 시 config 전체 로드 성공
- `bun scripts/check-layers.ts` 실행 시 레이어 위반 0건

## Validation
```bash
bun install && bun run typecheck && bun run lint && bun test && bun run migrate && bun run seed && bun scripts/check-layers.ts
```

## Out of Scope
- New feature development
- Performance optimization
- CI/CD pipeline setup (GitHub Actions, etc.)
- Docker/container configuration
- Production deployment configuration
