# T-09-015 Infrastructure auto-triggers for kill switch

## Goal
Implement the infrastructure category of auto-triggers: exchange API unreachability, DB connection loss, and worker health degradation. Apply a configurable grace period before activating the kill switch, and skip activation when no positions are open (block new entries only).

## Why
EP09 M1 — exchange API failures, DB connection loss, and worker health degradation must trigger the kill switch with a grace period. Acting immediately on transient blips would cause unnecessary trading halts, so a grace period (default 60s) is required before escalating to a full kill. If no positions are open, the safer response is to block new entries rather than activating a full kill.

## Inputs
- `docs/exec-plans/09-risk-management.md` M1 — infrastructure trigger conditions and grace period rules
- `packages/core/risk/kill-switch-triggers.ts` (existing TriggerResult type from T-09-011)
- `packages/core/risk/kill-switch.ts` (activate function)
- Architecture guardrail: `packages/core` must not import CCXT, Drizzle, Elysia

## Dependencies
- T-09-001 (kill switch state machine)
- T-09-011 (kill switch auto-trigger evaluator — provides TriggerResult type and evaluation pattern)

## Expected Outputs
- `packages/core/risk/infrastructure-trigger-monitor.ts`
  - `InfrastructureHealthState` interface:
    ```ts
    interface InfrastructureHealthState {
      exchangeApiUnreachableSince: Date | null;    // per-exchange
      dbConnectionLostSince: Date | null;          // global
      executionWorkerUnresponsiveSince: Date | null; // global
      strategyWorkerUnresponsiveSince: Map<string, Date>; // per-strategy
      hasOpenPositions: boolean;
      gracePeriodMs: number; // default 60_000
    }
    ```
  - `evaluateInfrastructureTriggers(state: InfrastructureHealthState, now: Date): InfrastructureTriggerResult[]`
    - Pure function — no side effects
    - Exchange API: unreachable > 30s → per-exchange trigger (if positions open: full kill; else block-entry only)
    - DB connection: lost > 15s → global trigger (if positions open: full kill; else block-entry only)
    - Execution worker: unresponsive > 60s → global trigger (same position check)
    - Strategy worker: unresponsive > 60s per strategy → per-strategy trigger (same position check)
  - `InfrastructureTriggerResult` interface:
    ```ts
    interface InfrastructureTriggerResult {
      shouldActivate: boolean;
      blockEntryOnly: boolean; // true when no positions — use block-entry mode instead of full kill
      scope: KillSwitchScope;
      scopeTarget: string | null;
      reason: string;
    }
    ```
  - `InfrastructureTriggerMonitor` class:
    - Constructor takes `{ activate: typeof activate, gracePeriodMs?: number }`
    - `evaluate(state: InfrastructureHealthState): InfrastructureTriggerResult[]`
    - `applyResults(results: InfrastructureTriggerResult[], deps: KillSwitchDeps): Promise<void>` — calls activate() for each result where `shouldActivate` is true
- `packages/core/risk/__tests__/infrastructure-trigger.test.ts`

## Deliverables
- `packages/core/risk/infrastructure-trigger-monitor.ts`
- `packages/core/risk/__tests__/infrastructure-trigger.test.ts`

## Constraints
- `packages/core/risk/infrastructure-trigger-monitor.ts` must not import CCXT, Drizzle, Elysia, or Slack
- `evaluateInfrastructureTriggers` is a pure function — takes state and now, returns results, no side effects
- Grace period durations: exchange API 30s, DB 15s, worker 60s (these are threshold values, not the grace period)
- `gracePeriodMs` in `InfrastructureHealthState` is the configurable delay before a trigger fires (default 60_000ms)
- When `hasOpenPositions` is false: set `blockEntryOnly: true`, `shouldActivate: false` — do not fire a kill switch
- All tests use `bun:test`; time is injected via the `now` parameter (no `Date.now()` calls inside pure functions)

## Steps
1. Write failing tests (RED):
   - Exchange API unreachable for 31s with positions → `shouldActivate: true, blockEntryOnly: false, scope: "exchange"`
   - Exchange API unreachable for 31s without positions → `shouldActivate: false, blockEntryOnly: true`
   - Exchange API unreachable for 29s → `shouldActivate: false` (threshold not met)
   - DB lost for 16s with positions → `shouldActivate: true, scope: "global"`
   - DB lost for 16s without positions → `shouldActivate: false, blockEntryOnly: true`
   - Execution worker unresponsive 61s with positions → `shouldActivate: true, scope: "global"`
   - Strategy worker unresponsive 61s for "strat-1" → `shouldActivate: true, scope: "strategy", scopeTarget: "strat-1"`
   - All healthy → empty results array
   - `applyResults` calls `activate()` once per shouldActivate result
   - `applyResults` skips results where `shouldActivate: false`
2. Implement `infrastructure-trigger-monitor.ts` (GREEN)
3. Refactor: add JSDoc to all exports

## Acceptance Criteria
- Exchange API, DB, and worker thresholds correctly gate on time elapsed since failure
- No kill switch fired when `hasOpenPositions` is false — block-entry only
- `evaluateInfrastructureTriggers` is a pure function (given same inputs, same outputs)
- `applyResults` calls activate exactly once per qualifying result
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test --filter "infra-trigger" && bun run typecheck
```

## Out of Scope
- Polling exchange APIs or DB connections directly (worker/adapter concern)
- Wiring the monitor into the worker event loop
- Slack notification on trigger (T-09-014)
- Grace period countdown UI
