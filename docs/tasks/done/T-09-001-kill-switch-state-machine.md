# T-09-001 Kill switch state machine

## Goal
Implement a pure kill switch state machine with scope hierarchy (per-strategy, per-exchange, global). Manages `KillSwitchState` records through immutable state transitions and exposes an `isBlocked` predicate that checks whether a given strategy/exchange context is currently blocked by any active kill switch.

## Why
EP09 requires a kill switch that can halt all trading within 1 second. The kill switch must be scope-aware — a global activation must block every strategy and exchange, a per-exchange activation must block only that exchange, and a per-strategy activation must block only that strategy. Implementing this as a pure state machine with injected persistence means the logic is exhaustively testable in isolation, and the persistence adapter can be swapped without touching the business rules.

## Inputs
- EP09 M1 spec — kill switch scope hierarchy, acknowledge requirement, trigger source
- Architecture guardrail: `packages/core` must not import CCXT, Drizzle, Elysia, or Slack
- DI pattern reference: `packages/shared/di/` (existing container and interface patterns)
- Decimal.js is already available in the monorepo

## Dependencies
None.

## Expected Outputs
- `packages/core/risk/types.ts`
  - `KillSwitchScope`: `"global" | "exchange" | "strategy"`
  - `KillSwitchTrigger`: `"manual" | "loss_limit" | "api_error" | "system"`
  - `KillSwitchState` interface:
    ```ts
    interface KillSwitchState {
      id: string;
      scope: KillSwitchScope;
      scopeTarget: string | null; // exchangeId or strategyId; null for global
      active: boolean;
      triggeredBy: KillSwitchTrigger;
      triggeredAt: Date;
      requiresAcknowledgment: boolean;
      acknowledgedAt: Date | null;
    }
    ```
- `packages/core/risk/kill-switch.ts`
  - `KillSwitchDeps` interface:
    ```ts
    interface KillSwitchDeps {
      loadActiveStates(): Promise<KillSwitchState[]>;
      saveState(state: KillSwitchState): Promise<void>;
    }
    ```
  - `activate(scope: KillSwitchScope, scopeTarget: string | null, trigger: KillSwitchTrigger, deps: KillSwitchDeps): Promise<KillSwitchState>` — creates and persists a new active state; always sets `requiresAcknowledgment: true` for `"manual"` trigger, `false` otherwise
  - `deactivate(id: string, deps: KillSwitchDeps): Promise<KillSwitchState>` — loads all states, finds by `id`, returns new state with `active: false`; throws `KillSwitchNotFoundError` if id not found; persists the updated state
  - `isBlocked(strategyId: string, exchangeId: string, states: KillSwitchState[]): boolean` — returns `true` if any active state has scope `"global"`, or scope `"exchange"` with `scopeTarget === exchangeId`, or scope `"strategy"` with `scopeTarget === strategyId`
  - `KillSwitchNotFoundError` class extending `Error`
- `packages/core/risk/__tests__/kill-switch.test.ts`

## Deliverables
- `packages/core/risk/types.ts`
- `packages/core/risk/kill-switch.ts`
- `packages/core/risk/__tests__/kill-switch.test.ts`

## Constraints
- Pure state transitions — `activate` and `deactivate` produce new state objects; they never mutate
- `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack
- No direct DB or network access — all persistence goes through `KillSwitchDeps`
- `isBlocked` is a synchronous pure function receiving a pre-loaded `KillSwitchState[]` slice
- Scope hierarchy: global beats exchange beats strategy — if a global kill switch is active, `isBlocked` returns `true` regardless of the `strategyId`/`exchangeId` arguments
- `id` is a UUID string generated inside `activate` using `crypto.randomUUID()`
- `triggeredAt` is `new Date()` inside `activate`; callers cannot override it (keeps the machine deterministic from the outside)
- All tests use `bun:test`; mock deps are plain inline objects with closure-based state

## Steps
1. Create `packages/core/risk/types.ts` with all shared type definitions
2. Write failing tests in `packages/core/risk/__tests__/kill-switch.test.ts` (RED):
   - `isBlocked` with no active states → `false`
   - `isBlocked` with one active global state → `true` for any strategy/exchange combination
   - `isBlocked` with an active exchange state for `"binance"` → `true` for `"binance"`, `false` for `"okx"`
   - `isBlocked` with an active strategy state for `"strat-1"` → `true` for `"strat-1"`, `false` for `"strat-2"`
   - `isBlocked` with inactive state (`active: false`) → `false`
   - `activate` with `trigger: "manual"` → returns state with `requiresAcknowledgment: true`
   - `activate` with `trigger: "loss_limit"` → returns state with `requiresAcknowledgment: false`
   - `activate` persists the state via `deps.saveState` (call count === 1)
   - `activate` returns state with `active: true`, correct `scope`, correct `scopeTarget`
   - `deactivate` returns state with `active: false`
   - `deactivate` persists the updated state via `deps.saveState`
   - `deactivate` with unknown id → throws `KillSwitchNotFoundError`
   - Multiple active states of different scopes — `isBlocked` correctly evaluates each
3. Implement `packages/core/risk/kill-switch.ts` (GREEN)
4. Refactor: add JSDoc to `activate`, `deactivate`, `isBlocked`, `KillSwitchDeps`

## Acceptance Criteria
- `isBlocked` returns `true` for any active global state, regardless of strategy/exchange arguments
- `isBlocked` returns `true` only for the matching `scopeTarget` for exchange and strategy scopes
- `isBlocked` treats `active: false` states as transparent (never blocks)
- `activate` with `"manual"` trigger sets `requiresAcknowledgment: true`
- `activate` calls `deps.saveState` exactly once with the new state
- `deactivate` with an unknown id throws `KillSwitchNotFoundError`
- `deactivate` calls `deps.saveState` exactly once with `active: false`
- All 13 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/core/risk/__tests__/kill-switch.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Drizzle persistence adapter (worker or API layer concern)
- Kill switch UI or operator dashboard
- Acknowledgment workflow beyond the `requiresAcknowledgment` flag
- Automatic reactivation or time-bounded kill switches
- Audit log emission (separate concern)
