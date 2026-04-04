# Pattern: DB Test Parallelism

**Discovered**: 2026-04-04, EP-04 Wave 3 merge
**Category**: reliability
**Status**: active

## Problem

When multiple test files share a DB connection pool and the test runner executes files in parallel, individual files calling `closeTestDb()` (or `closePool()`) in `afterAll` will close the shared pool while other files are still running queries. This causes:

- Connection pool deadlocks
- "Cannot use a pool after calling end on the pool" errors
- Tests that pass individually but fail when run together

## Context

Observed during EP-04 when T-04-003 (candle-repository.test.ts) and T-04-005 (candle-cleanup.test.ts) both used `test-db.ts` helpers. Each file had:

```typescript
afterAll(async () => {
  await closeTestDb(); // Closes the shared singleton pool
});
```

File A's `afterAll` ran before File B finished, destroying the pool mid-query.

## Solution

1. **Never close the pool in individual test files.** Remove `closeTestDb()` from all `afterAll` hooks.

2. **Use global-teardown.ts** for a single pool close at process exit:

```typescript
// tests/helpers/global-teardown.ts
import { closePool } from "../../src/db/pool";

export default async function globalTeardown() {
  await closePool();
}
```

Configure in `bunfig.toml`:
```toml
[test]
preload = ["./tests/helpers/global-teardown.ts"]
```

3. **Individual test files only TRUNCATE** in `beforeEach`:

```typescript
const isDbReady = await isTestDbAvailable();

describe.skipIf(!isDbReady)("repository integration", () => {
  beforeAll(() => initTestDb());
  beforeEach(() => cleanupTables()); // TRUNCATE, not close
  // No afterAll closeTestDb!

  it("should upsert candles", async () => { /* ... */ });
});
```

4. **Exception**: Test files that test the pool itself (e.g., `pool.test.ts`) may call `closePool()` in `beforeEach` to reset state, but must reinitialize before each test.

## Anti-pattern

```typescript
// DO NOT do this in test files
afterAll(async () => {
  await closeTestDb(); // Destroys shared pool for other parallel test files
});
```

## Verification

```bash
bun test  # All 865 tests pass with parallel execution
```

## Related

- `tests/helpers/global-teardown.ts` — implementation
- `tests/helpers/test-db.ts` — shared DB helper
- `docs/anti-patterns.md` — "DB 연동 로직을 mock 테스트로 검증하지 말 것"
