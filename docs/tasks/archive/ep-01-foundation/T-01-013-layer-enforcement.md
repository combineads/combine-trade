# T-01-013 Layer dependency enforcement script

## Goal
Create a custom import validation script at `scripts/check-layers.ts` that enforces the architectural layer rules defined in ARCHITECTURE.md. Biome에 boundaries 플러그인이 없으므로 정적 import 분석으로 동일한 보장을 제공한다.

## Why
The pipeline module monolith architecture depends on strict layer ordering (L0→L9). Without enforcement, developers (and agents) can inadvertently introduce upward dependencies that create circular imports and violate module boundaries. An automated check in CI prevents architectural decay.

## Inputs
- `docs/ARCHITECTURE.md` — layer rules (L0-L9), dependency direction rule, module map
- Project `src/` directory structure

## Dependencies
T-01-001 (project initialization — src/ directory must exist)

## Expected Outputs
- `scripts/check-layers.ts` — standalone layer enforcement script
- `package.json` script: `"check-layers": "bun scripts/check-layers.ts"`
- Integrated into `bun run lint` or run separately in CI

## Deliverables
- `scripts/check-layers.ts`

## Constraints
- Must parse TypeScript/JavaScript import statements (both `import` and dynamic `import()`)
- Must handle path aliases (`@/core/types` → `src/core/types`)
- Must map each `src/` subdirectory to its layer number per ARCHITECTURE.md
- Must report violations with: source file, imported module, source layer, target layer
- Must exit with non-zero code if any violations found
- Must not require external dependencies (use Bun built-in file I/O and regex)

## Steps
1. Define layer mapping from ARCHITECTURE.md:
   ```typescript
   const LAYER_MAP: Record<string, number> = {
     'core': 0,
     'db': 1, 'config': 1,
     'indicators': 2, 'exchanges': 2,
     'candles': 3, 'vectors': 3,
     'filters': 4, 'knn': 4,
     'signals': 5, 'positions': 5, 'limits': 5,
     'orders': 6, 'exits': 6, 'labeling': 6,
     'reconciliation': 7, 'notifications': 7,
     'api': 8, 'backtest': 8,
     'daemon': 9,
   }
   ```
2. Scan all `.ts` files under `src/`
3. For each file, determine its layer from its directory path
4. Parse all import statements (static and dynamic)
5. Resolve import paths (handle `@/` alias and relative paths)
6. For each import, determine the target module's layer
7. Check rule: source layer must be >= target layer (can only import from lower layers)
8. Collect all violations
9. Report violations with clear error messages
10. Exit 0 if clean, exit 1 if violations found
11. Add to package.json scripts
12. Write tests with fixture files

## Acceptance Criteria
- Script correctly identifies layer for each `src/` module
- Script detects upward dependency violations (e.g., core importing from db)
- Script allows valid downward imports (e.g., db importing from core)
- Script allows same-layer imports within the same module
- Script handles `@/` path alias resolution
- Script handles relative imports (`../core/types`)
- Clean codebase produces exit code 0
- Violation produces exit code 1 with descriptive error message
- `bun run typecheck` passes on the script itself

## Test Scenarios
- File in `src/db/` importing from `@/core/types` → allowed (L1 → L0)
- File in `src/core/` importing from `@/db/pool` → violation (L0 → L1)
- File in `src/signals/` importing from `@/indicators/bb` → allowed (L5 → L2)
- File in `src/indicators/` importing from `@/signals/gate` → violation (L2 → L5)
- File in `src/core/types.ts` with no project imports → no violations
- Script with path alias `@/config/loader` resolves to `src/config/loader` layer 1
- Relative import `../../core/types` from `src/db/queries.ts` → resolves correctly

## Validation
```bash
bun run typecheck
bun scripts/check-layers.ts
bun test --grep "check-layers"
```

## Out of Scope
- Biome plugin development
- ESLint integration (project uses Biome)
- Dynamic dependency analysis (only static imports)
- Circular dependency detection (separate concern)
