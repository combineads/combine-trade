# T-01-011 config/loader.ts — Config loader, memory cache, and public API

## Goal
Create the configuration loading system at `src/config/loader.ts` and `src/config/index.ts` that reads CommonCode from the database, validates with Zod schemas, caches in memory, and provides a typed API for accessing configuration values. Also implements ANCHOR group immutability protection.

## Why
All system settings live in the CommonCode table. The config loader bridges the database and application code by providing fast, typed, validated access to configuration. Memory caching avoids repeated DB queries on every candle event. ANCHOR group protection prevents accidental modification of structural constants that must remain fixed.

## Inputs
- `src/config/schema.ts` (T-01-010) — Zod validation schemas
- `src/db/pool.ts` (T-01-007) — database connection
- `src/db/schema.ts` (T-01-008) — CommonCode table definition
- `docs/DATA_MODEL.md` — CommonCode projection contract (load once, cache, refresh on change)

## Dependencies
T-01-007 (db/pool.ts — database connection for reading config)
T-01-009 (db/migrate.ts — CommonCode table must exist)
T-01-010 (config/schema.ts — validation schemas)

## Expected Outputs
- `src/config/loader.ts` — internal loading/caching logic
- `src/config/index.ts` — public API: `loadConfig()`, `getConfig()`, `watchConfig()`
- All modules access config via `getConfig(group, code)`

## Deliverables
- `src/config/loader.ts` — 내부 로딩/캐싱 로직
- `src/config/index.ts` — public API 파사드 (loader.ts의 re-export 및 공개 인터페이스)

## Constraints
- L1 module: may import from `core/` and `db/`
- Config must be loaded once at startup, then served from memory cache
- ANCHOR group modifications must throw an error at application level
- `getConfig()` must be synchronous (reads from cache, not DB)
- `loadConfig()` is async (initial DB load)
- Cache must support refresh: `refreshConfig()` reloads from DB
- All values must be validated against Zod schemas on load
- Invalid config values must fail loudly at startup (not silently ignored)

## Steps
1. Create `src/config/loader.ts`:
   - Internal cache: `Map<string, Map<string, unknown>>` keyed by (group_code, code)
   - `loadAllConfig(): Promise<void>` — SELECT all from common_code, validate each, populate cache
   - `loadGroupConfig(group: string): Promise<void>` — load single group
   - `getCachedValue<T>(group: string, code: string): T` — get from cache, throw if not found
   - `setCachedValue(group: string, code: string, value: unknown): void` — internal cache update
2. Create `src/config/index.ts` public API:
   - `loadConfig(): Promise<void>` — initial load, validates all values
   - `getConfig<T>(group: string, code: string): T` — synchronous typed getter
   - `getGroupConfig(group: string): Map<string, unknown>` — get all codes in a group
   - `refreshConfig(): Promise<void>` — reload from DB
   - `updateConfig(group: string, code: string, value: unknown): Promise<void>` — update DB + cache
   - `watchConfig(callback: ConfigChangeCallback): Unsubscribe` — notify on changes
3. Implement ANCHOR protection in `updateConfig()`:
   - If group is in ANCHOR_GROUPS, throw `AnchorModificationError`
   - Error message: "ANCHOR group '{group}' cannot be modified"
4. Implement change notification:
   - `watchConfig` registers callbacks
   - `updateConfig` and `refreshConfig` trigger callbacks with changed entries
5. Export types: `ConfigChangeCallback`, `AnchorModificationError`
6. Write tests with mock database
7. Verify `bun run typecheck` passes

## Acceptance Criteria
- `loadConfig()` loads all CommonCode rows from DB into memory cache
- `getConfig('EXCHANGE', 'binance')` returns validated config synchronously
- `getConfig()` for non-existent key throws descriptive error
- `updateConfig('ANCHOR', 'bb20', ...)` throws AnchorModificationError
- `updateConfig('KNN', 'top_k', 60)` succeeds and updates both DB and cache
- `refreshConfig()` reloads all values from DB
- `watchConfig` callback fires on config change
- Invalid Zod validation on load throws at startup
- `bun run typecheck` passes

## Test Scenarios
- loadConfig() with valid DB data → all values accessible via getConfig()
- getConfig('EXCHANGE', 'binance') → returns validated exchange config object
- getConfig('NONEXISTENT', 'key') → throws ConfigNotFoundError
- updateConfig('ANCHOR', 'bb20', newValue) → throws AnchorModificationError
- updateConfig('KNN', 'top_k', 60) → DB updated and cache refreshed
- watchConfig callback fires when updateConfig is called → callback receives change details
- loadConfig() with invalid value in DB → throws validation error at startup
- refreshConfig() after external DB change → cache updated with new values

## Validation
```bash
bun run typecheck
bun test --grep "config/loader"
```

## Out of Scope
- Seed data insertion (T-01-012)
- Web UI config editor (web module epic)
- Database polling for external changes (future enhancement)
- Config versioning/history
