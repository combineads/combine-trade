# T-01-001 Project initialization (Bun, tsconfig, Biome, scripts)

## Goal
Bootstrap the combine-trade project with Bun runtime, TypeScript strict config, Biome linter/formatter, package.json scripts, and environment variable template.

## Why
Every subsequent task depends on a working project skeleton — TypeScript compilation, dependency installation, lint/format tooling, and runnable scripts must exist before any code can be written.

## Inputs
- `docs/TECH_STACK.md` — canonical library versions and install commands
- `docs/ARCHITECTURE.md` — repository layout (src/ directory structure)
- `docs/QUALITY.md` — validation commands (bun test, bun run lint, bun run typecheck, bun run build)

## Dependencies
None — this is the first task.

## Expected Outputs
- `package.json` with all production and dev dependencies from TECH_STACK.md
- `tsconfig.json` with strict mode, path aliases (`@/` → `src/`)
- `biome.json` with lint + format rules for TS/JS/JSX/TSX/JSON/CSS
- `.env.example` with required environment variables
- `src/` directory skeleton (각 모듈 디렉토리에 `index.ts` 생성, 내용: `export {}` 한 줄)
- All `package.json` scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `migrate`, `seed`

## Deliverables
- `package.json`
- `tsconfig.json`
- `biome.json`
- `.env.example`
- `src/` directory structure with `index.ts` per module (`export {}` placeholder)

## Constraints
- Use exact versions from `docs/TECH_STACK.md` (Bun 1.3.11, TypeScript 6.0.2, etc.)
- `tsconfig.json` must use `strict: true` and `noImplicitAny: true`
- Path alias `@/` must resolve to `src/`
- Biome must be configured as the linter (NOT ESLint — see TECH_STACK.md)
- Do not install ESLint — Biome is the sole linter/formatter

## Steps
1. Run `bun init` to create project skeleton
2. Install production dependencies: `bun add typescript react react-dom react-router zustand @tanstack/react-query @ixjb94/indicators ccxt decimal.js drizzle-orm postgres pgvector hono zod jsonwebtoken @slack/webhook`
3. Install dev dependencies: `bun add -d vite @vitejs/plugin-react tailwindcss drizzle-kit @biomejs/biome @types/jsonwebtoken`
4. Create `tsconfig.json` with strict mode, path aliases, target ES2022+, module resolution bundler
5. Create `biome.json` with recommended lint rules, format on save, organized imports
6. Create `.env.example` with DATABASE_URL, BINANCE_API_KEY, BINANCE_API_SECRET, JWT_SECRET, SLACK_WEBHOOK_URL
7. Create `src/` directory structure matching ARCHITECTURE.md layout (core/, db/, config/, etc.) — 각 디렉토리에 `index.ts` (`export {}`) 생성
8. Add package.json scripts: dev, build, test, lint, typecheck, format, migrate, seed
9. Verify `bun run typecheck` passes on empty project
10. Verify `bun run lint` passes

## Acceptance Criteria
- `bun install` completes without errors
- `bun run typecheck` passes
- `bun run lint` passes
- `tsconfig.json` has `strict: true`
- Path alias `@/core/types` resolves to `src/core/types`
- `.env.example` contains all required variables
- All directories from ARCHITECTURE.md exist under `src/`

## Test Scenarios
N/A — configuration/infrastructure task. Validation is via CLI commands.

## Validation
```bash
bun install
bun run typecheck
bun run lint
```

## Out of Scope
- Actual source code implementation (types, constants, etc.)
- Database setup or migrations
- CI/CD pipeline configuration
- Docker/container setup
