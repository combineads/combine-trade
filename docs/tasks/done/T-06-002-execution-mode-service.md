# T-06-002 Execution mode service

## Goal
Implement a per-strategy execution mode service that manages the four operating modes (`analysis`, `alert`, `paper`, `live`) and enforces safety gates: live mode is programmatically rejected unless a kill switch and daily loss limit are both confirmed active.

## Why
The same decision pipeline must behave differently depending on the strategy's configured mode — pure analysis, Slack-only alert, paper trading simulation, or live order execution. Centralising mode logic in one service keeps all callers (alert worker, execution worker) free of scattered `if` chains and ensures safety invariants are enforced in one place rather than at each call site.

## Inputs
- EP06 M5 spec (execution mode management)
- Architecture guardrail: live mode requires kill switch + daily loss limit (CLAUDE.md critical invariants)
- `ExecutionMode` type: `"analysis" | "alert" | "paper" | "live"`
- DI interface for persistence (no direct DB access in this package)

## Dependencies
None.

## Expected Outputs
- `packages/execution/types.ts`
  - `ExecutionMode` type: `"analysis" | "alert" | "paper" | "live"`
  - `ModeRecord` interface: `{ strategyId: string; mode: ExecutionMode; updatedAt: Date }`
  - `SafetyState` interface: `{ killSwitchEnabled: boolean; dailyLossLimitConfigured: boolean }`
  - `ExecutionModeDeps` interface (DI): `{ loadMode(strategyId: string): Promise<ExecutionMode>; saveMode(strategyId: string, mode: ExecutionMode): Promise<void>; loadSafetyState(strategyId: string): Promise<SafetyState> }`
- `packages/execution/mode.ts`
  - `getExecutionMode(strategyId: string, deps: ExecutionModeDeps): Promise<ExecutionMode>`
  - `setExecutionMode(strategyId: string, mode: ExecutionMode, deps: ExecutionModeDeps): Promise<void>` — rejects with `ModeTransitionError` if mode is `"live"` and safety gates are not satisfied
  - `isActionable(mode: ExecutionMode): boolean` — returns `true` for `"alert" | "paper" | "live"`
  - `requiresOrder(mode: ExecutionMode): boolean` — returns `true` for `"live"` only
  - `ModeTransitionError` class extending `Error`
- `packages/execution/__tests__/mode.test.ts`

## Deliverables
- `packages/execution/types.ts`
- `packages/execution/mode.ts`
- `packages/execution/__tests__/mode.test.ts`
- `packages/execution/index.ts` barrel export

## Constraints
- No DB access, no network calls in `packages/execution/mode.ts` — all external access via `ExecutionModeDeps`
- `packages/execution` must not import Elysia, CCXT, or Drizzle
- Live mode transition must be rejected (throw `ModeTransitionError`) if `killSwitchEnabled === false` OR `dailyLossLimitConfigured === false` — both must be true
- `paper` mode is allowed without safety gates (paper trading has no real risk); only `live` is gated
- Mode ordering for comparison: `analysis < alert < paper < live` — callers can use `isActionable` and `requiresOrder` helpers instead of string comparison
- `setExecutionMode` must call `loadSafetyState` before calling `saveMode` when the target mode is `"live"`
- Functions are async to support future persistence; the DI interface must remain async throughout

## Steps
1. Create `packages/execution/types.ts` with all types and interfaces
2. Write failing tests in `packages/execution/__tests__/mode.test.ts` (RED):
   - `getExecutionMode` returns the mode from deps
   - `setExecutionMode` to `"analysis"` / `"alert"` / `"paper"` calls `saveMode` without consulting safety state
   - `setExecutionMode` to `"live"` with both gates enabled → calls `saveMode` with `"live"`
   - `setExecutionMode` to `"live"` with kill switch disabled → throws `ModeTransitionError`
   - `setExecutionMode` to `"live"` with daily loss limit not configured → throws `ModeTransitionError`
   - `setExecutionMode` to `"live"` with both gates disabled → throws `ModeTransitionError`
   - `isActionable("analysis")` → `false`; `isActionable("alert")` → `true`; `isActionable("paper")` → `true`; `isActionable("live")` → `true`
   - `requiresOrder("alert")` → `false`; `requiresOrder("live")` → `true`
   - `ModeTransitionError` is an instance of `Error`
3. Implement `packages/execution/mode.ts` (GREEN)
4. Create `packages/execution/index.ts` barrel export
5. Refactor: add JSDoc to all exported functions

## Acceptance Criteria
- All 9 tests pass
- `setExecutionMode("live", deps)` with either safety gate false throws `ModeTransitionError` — never calls `saveMode`
- `setExecutionMode("live", deps)` with both gates true resolves and calls `saveMode` exactly once with `"live"`
- `setExecutionMode` to non-live modes never calls `loadSafetyState`
- `isActionable` and `requiresOrder` are pure synchronous functions
- Zero TypeScript errors, zero lint warnings

## Validation
```bash
bun test packages/execution/__tests__/mode.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- DB schema for mode persistence (T-06-012)
- Mode transition API endpoint (EP08)
- Paper trading simulation engine (EP14)
- Kill switch implementation (EP09)
- Daily loss limit enforcement (EP09)
