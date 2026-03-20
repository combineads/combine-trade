# QUALITY.md

## Definition of done
A change is done only when:
- **Tests written first** (Red-Green-Refactor cycle — see TDD workflow below)
- All relevant tests pass (`bun test`)
- Implementation matches the documented intent
- Lint passes (`bun run lint`)
- Typecheck passes (`bun run typecheck`)
- Build succeeds (`bun run build`)
- Docs are updated if behavior or architecture changed
- Vector isolation invariant is not violated
- Latency budget is not breached (see RELIABILITY.md latency budget section)

## Validation commands

> Note: These commands require project scaffolding (EP00) to be complete. Before EP00 completion, validation is limited to document review and architecture compliance checks.

```bash
bun install                     # install dependencies
bun test                        # run all tests
bun run lint                    # biome lint
bun run typecheck               # tsc --noEmit
bun run build                   # production build
bun run test:unit               # unit tests only
bun run test:integration        # integration tests only
bun run test:e2e                # all E2E tests
bun run test:e2e:api            # API E2E (Eden treaty + real DB)
bun run test:e2e:pipeline       # pipeline E2E (full data flow)
bun run test:e2e:web            # web UI E2E (Playwright)
bun run test:e2e:desktop        # desktop E2E (tauri-driver + WebDriverIO)
bun test --filter "sandbox-escape"  # strategy sandbox escape tests (SECURITY.md requirement)
bun test --filter "auth"            # authentication and JWT tests
bun test --filter "encryption"      # AES-256-GCM encryption tests
bun test --filter "kill-switch"     # kill switch activation and propagation tests
bun test --filter "input-validation" # input validation boundary tests
```

### Setup commands (not part of validation cycle)
```bash
bun run db:generate             # drizzle-kit generate
bun run db:migrate              # drizzle-kit migrate
```

## TDD Workflow (Red-Green-Refactor)

**All implementation must follow this cycle:**

1. **RED**: Write failing test(s) that specify the desired behavior
   - Test should fail initially (assertions fail or code doesn't exist)
   - Commit message: `test: add failing test for [feature]`

2. **GREEN**: Write minimal implementation to make tests pass
   - Do not over-engineer; write the simplest code that makes tests pass
   - Commit message: `feat/fix: implement [feature]` (tests now pass)

3. **REFACTOR**: Improve code quality without changing behavior
   - Extract helpers, simplify logic, improve readability
   - All tests must still pass
   - Commit message: `refactor: [description]`

**Validation checklist before consider task done:**
- ✅ At least one failing test was written first
- ✅ Tests capture acceptance criteria from task description
- ✅ All tests pass (`bun test`)
- ✅ Code is properly refactored (no duplication, clear intent)
- ✅ Coverage targets met (see Coverage targets section)

**Example workflow:**
```typescript
// STEP 1: RED — write failing test
// test/vector-search.test.ts
test("should reject cross-symbol vector search", () => {
  const result = searchVectors(symbol1_vectors, symbol2_query);
  expect(result).toEqual([]);  // fails because no enforcement yet
});

// STEP 2: GREEN — minimal implementation
// src/vector-search.ts
export function searchVectors(vectors, query) {
  if (vectors.symbol !== query.symbol) return [];  // passes test
  // ... rest of implementation
}

// STEP 3: REFACTOR — improve (if needed)
// Extract magic numbers, add helper functions, etc.
```

---

## Test strategy

### Unit tests (packages/core/*)
- Strategy sandbox API: indicator functions, normalization methods
- Vector engine: feature normalization ([0,1] range validation)
- Decision engine: winrate/expectancy calculation, threshold logic
- Label engine: WIN/LOSS/TIME_EXIT judgment correctness
- Candle: continuity validation, gap detection

### Integration tests
- Strategy execution: DB-stored code → sandbox → event output
- Vector pipeline: event → normalize → store → L2 search → results
- Exchange adapter: CCXT mock → order submission → status tracking
- Event bus: NOTIFY → worker handler → DB state change

### E2E tests

E2E tests validate end-to-end behavior across system boundaries, organized by surface area.

#### E2E test layers

| Layer | Tool | Scope | Requires |
|-------|------|-------|----------|
| API | Elysia Eden treaty + `bun test` | Route → handler → DB → response | PostgreSQL + pgvector |
| Pipeline | `bun test` | candle → strategy → vector → decision → alert | PostgreSQL + pgvector, CCXT mock |
| Web UI | Playwright | Dashboard, strategy editor, charts, all UI interaction flows | Next.js dev server + API + DB |
| Desktop | tauri-driver + WebDriverIO | Tauri-native only: keychain, tray, notifications, CSP | Tauri debug build |

#### Shared UI testing strategy

Tauri wraps the Next.js web UI via WebView (codebase shared). Therefore:
- **All UI interaction tests run as Web E2E** (Playwright against Next.js dev server)
- **Desktop E2E covers Tauri-native integration only**: system tray, native notifications, keychain token storage, WebView CSP constraints
- This avoids duplicating UI tests across both environments

#### Layer 1: API E2E (`tests/e2e/api/`)

Test API routes end-to-end against real DB using Eden treaty (type-safe, already in stack).

```typescript
import { treaty } from '@elysiajs/eden';
import { app } from '../../apps/api/src';

const api = treaty(app);

test("POST /api/v1/strategies creates a strategy", async () => {
  const { data, status } = await api.v1.strategies.post({ ... });
  expect(status).toBe(201);
  expect(data).toHaveProperty("id");
});
```

#### Layer 2: Pipeline E2E (`tests/e2e/pipeline/`)

Test the full trading pipeline with real PostgreSQL + pgvector and mock exchange.

```typescript
test("candle close → strategy → vector → decision", async () => {
  // 1. Insert test candle
  // 2. Trigger strategy evaluation (sandbox)
  // 3. Verify vector stored in pgvector
  // 4. Verify decision record (LONG/SHORT/PASS)
  // 5. Verify alert dispatched (if LONG/SHORT)
});

test("backtest 3-year replay produces correct statistics", async () => {
  // Golden test: known candles → expected vectors + labels + decisions
});
```

#### Layer 3: Web UI E2E (`tests/e2e/web/`)

Playwright tests against Next.js dev server. Covers all UI flows shared between web and desktop.

```typescript
import { test, expect } from '@playwright/test';

test("create and deploy a strategy", async ({ page }) => {
  await page.goto('/strategies');
  await page.click('button:has-text("New Strategy")');
  await page.fill('[name="code"]', strategyCode);
  await page.click('button:has-text("Save")');
  await expect(page.locator('.toast-success')).toBeVisible();
});
```

#### Layer 4: Desktop E2E (`tests/e2e/desktop/`)

Tauri-native features only. UI flows are already covered by Web E2E (Layer 3).

**Platform-specific tooling** (Tauri uses system WebView, not Chromium):

| Platform | WebView Engine | E2E Tool | Status |
|----------|---------------|----------|--------|
| macOS | WKWebView (WebKit) | `tauri-webdriver` plugin (community) | Official `tauri-driver` not supported — Apple provides no WKWebView WebDriver |
| Windows | WebView2 (Chromium) | `tauri-driver` + `msedgedriver` | Officially supported |
| Linux | WebKitGTK | `tauri-driver` + `webkit2gtk-driver` | Officially supported |

**Test scope** (desktop-specific only):
```typescript
// WebDriverIO test example
describe('Tauri native features', () => {
  it('stores JWT in platform keychain', async () => { /* ... */ });
  it('shows system tray icon with status', async () => { /* ... */ });
  it('sends native notification on LONG/SHORT decision', async () => { /* ... */ });
  it('respects CSP constraints in WebView', async () => { /* ... */ });
});
```

**Tauri Rust command tests** (no WebView needed, CI-friendly):
```rust
#[cfg(test)]
mod tests {
    use tauri::Manager;

    #[test]
    fn test_keychain_store_command() {
        let app = tauri::test::mock_app();
        app.manage(AppState { /* ... */ });
        let result = store_token(app.state::<AppState>(), "test-jwt");
        assert!(result.is_ok());
    }
}
```

**Frontend IPC mock** (TypeScript-side Tauri command tests without Rust backend):
```typescript
import { mockIPC } from '@tauri-apps/api/mocks';

mockIPC((cmd, args) => {
  if (cmd === "get_stored_token") return "mock-jwt-token";
});
```

#### AI-driven exploratory QA (not CI — developer-triggered)

- **Web**: `agent-browser` or `dogfood` skill against Next.js dev server
- **Desktop**: Manual testing on Tauri app, or `agent-browser` against web version (shared UI)

### Performance tests
- Pipeline latency: candle close → decision < 1s
- Vector search: L2 top_k=50 < 100ms
- Backtest: 3-year single strategy < 5 minutes

### Trading-domain test strategy
- **Property-based testing**: Financial math functions (winrate, expectancy, PnL) tested with random inputs. Normalization functions must always return values in [0,1].
- **Decimal precision boundary tests**: All price/PnL/fee calculations verified with Decimal.js. Boundary cases: very small amounts, very large amounts, rounding edge cases.
- **Vector isolation negative tests**: Verify that cross-strategy and cross-symbol vectors never appear in search results. Mandatory for every vector search code path.
- **Idempotency tests**: All event handlers tested for safe re-execution (duplicate candle, duplicate event, duplicate order). See RELIABILITY.md for the specific idempotency rules that tests must verify.
- **Backtest golden tests**: Known input → expected output for at least 3 reference strategies.

### Coverage targets
- `packages/core/*`: minimum 90% line coverage
- Overall project: minimum 80% line coverage
- Coverage gate enforced in CI (when EP15 CI/CD is implemented)

## Review expectations
- Vector isolation: no cross-strategy or cross-symbol queries
- Strategy sandbox: no escape from sandbox API boundary
- AOP: transactions properly scoped, no orphan connections
- IoC: dependencies resolved from container, no manual instantiation
- New dependencies must be justified

## Performance gates
- Pipeline end-to-end: see RELIABILITY.md latency budget section (target: < 1 second p99 envelope)
- Vector search: < 100ms (p95)
- Backtest 3yr: < 5 minutes
- Strategy sandbox: < 5s timeout enforced
- DB query: < 5s timeout enforced
- Kill switch propagation: < 1 second from activation to all workers halted

### Performance measurement
- Benchmark command: `bun run bench` (to be defined in package.json)
- CI gate: performance benchmarks run on every PR, compared against baseline
- Baseline management: stored in `.harness/benchmarks/baseline.json`, updated on main branch merges
- Regression threshold: >20% degradation from baseline triggers CI failure

## Code quality rules
- Biome for linting and formatting
- Strict TypeScript (`strict: true`)
- No `any` types except in CCXT adapter boundary
- Structured error types (no raw throw strings)
- All async operations must handle errors explicitly
- No native float arithmetic on monetary fields (`price`, `pnl`, `fee`, `balance`, `quantity`, `funding`) — use Decimal.js exclusively. Consider custom lint rule for enforcement.
- Error types must follow the error taxonomy defined in ARCHITECTURE.md (error code prefixes by domain)
