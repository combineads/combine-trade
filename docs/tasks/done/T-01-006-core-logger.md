# T-01-006 core/logger.ts — Structured JSON logger

## Goal
Create a structured JSON logger at `src/core/logger.ts` that outputs JSON lines format with standardized fields. The logger is an L0 module usable by every layer in the system.

## Why
A 24/7 trading daemon needs structured, queryable logs for debugging, auditing, and monitoring. JSON lines format enables log aggregation and filtering. Module-level log level control allows verbose debugging of specific modules without flooding the output. The logger must be in L0 (core) so every module can import it without layer violations.

## Inputs
- `docs/ARCHITECTURE.md` — observability section, structured logging requirements, log fields
- `docs/RELIABILITY.md` (if exists) — failure modes, logging requirements
- `docs/PRODUCT.md` — operational requirements

## Dependencies
T-01-001 (project initialization — Bun runtime must be available)

## Expected Outputs
- `src/core/logger.ts` — structured JSON logger with module-scoped instances
- All downstream modules create logger instances: `const log = createLogger('module-name')`

## Deliverables
- `src/core/logger.ts`

## Constraints
- L0 module: zero external dependencies (uses only Bun/Node built-ins)
- Output format: JSON lines (one JSON object per line to stdout/stderr)
- Required fields per log line: `timestamp`, `level`, `module`, `event`, `details`
- Optional fields: `symbol`, `exchange`
- Log levels: `error`, `warn`, `info`, `debug` (severity order)
- Module-level log level override via environment variable or runtime config
- Must be synchronous (no async I/O in hot path)
- Must NOT import from any other project module

## Steps
1. Define log level type: `LogLevel = 'error' | 'warn' | 'info' | 'debug'`
2. Define log entry structure:
   ```typescript
   { timestamp: string, level: LogLevel, module: string, event: string,
     symbol?: string, exchange?: string, details?: Record<string, unknown> }
   ```
3. Implement `createLogger(module: string): Logger` factory:
   - Returns object with `error()`, `warn()`, `info()`, `debug()` methods
   - Each method accepts `(event: string, details?: LogDetails)`
   - LogDetails optionally includes `symbol`, `exchange`, plus arbitrary key-values
4. Implement global log level (default from `LOG_LEVEL` env var, fallback `info`)
5. Implement per-module log level override (e.g., `LOG_LEVEL_DB=debug`)
6. Implement `setLogLevel(module: string, level: LogLevel)` for runtime changes
7. Output: `error`/`warn` → stderr, `info`/`debug` → stdout
8. Implement `getLogLevel(module?: string): LogLevel` for inspection
9. Write tests capturing stdout/stderr output
10. Verify `bun run typecheck` passes

## Acceptance Criteria
- Logger outputs valid JSON lines format
- Each log line contains: timestamp (ISO 8601), level, module, event
- `debug` messages suppressed when LOG_LEVEL=info
- Per-module level override works (e.g., LOG_LEVEL_DB=debug shows db debug, others don't)
- `error` and `warn` go to stderr, `info` and `debug` go to stdout
- Logger is synchronous (no await)
- Zero external dependencies
- `bun run typecheck` passes

## Test Scenarios
- createLogger('test').info('started') → outputs JSON with module='test', level='info', event='started'
- Output includes ISO 8601 timestamp field
- debug() message suppressed when global level is 'info'
- debug() message shown when module-level override is 'debug'
- error() with details object → details serialized in JSON output
- info() with symbol and exchange → fields present in output JSON
- setLogLevel('db', 'debug') → subsequent db logger debug messages shown
- Each output line is valid JSON (parseable by JSON.parse)

## Validation
```bash
bun run typecheck
bun test --grep "core/logger"
```

## Out of Scope
- Log rotation (handled by systemd/external tooling)
- Log file writing (stdout/stderr only — external tooling redirects to files)
- Remote log shipping (future concern)
- Metrics/tracing (separate concern)
