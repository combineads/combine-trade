# T-09-017 Sandbox auto-triggers for kill switch

## Goal
Implement the sandbox category of auto-triggers: sandbox OOM, sandbox timeout, and sandbox crash counter. All three fire immediately and are scoped per-strategy.

## Why
EP09 M1 — strategy sandbox OOM, timeout, and repeated crashes indicate strategy malfunction. Unlike infrastructure issues, sandbox failures are clearly attributable to a specific strategy, so the kill switch scope is per-strategy rather than global. Immediate activation (no grace period) is required because a malfunctioning sandbox poses a direct risk to trade decision quality.

## Inputs
- `docs/exec-plans/09-risk-management.md` M1 — sandbox trigger conditions (OOM >128MB, timeout >500ms, 3× consecutive crash)
- `packages/core/risk/kill-switch-triggers.ts` (TriggerResult type from T-09-011)
- `packages/core/risk/kill-switch.ts` (activate function)
- T-02-006 — sandbox runtime (source of ERR_FATAL_SANDBOX_OOM and ERR_FATAL_SANDBOX_TIMEOUT error codes)

## Dependencies
- T-09-001 (kill switch state machine)
- T-09-011 (kill switch auto-trigger evaluator — provides TriggerResult type and evaluation pattern)
- T-02-006 (sandbox runtime — defines ERR_FATAL_SANDBOX_OOM and ERR_FATAL_SANDBOX_TIMEOUT)

## Expected Outputs
- `packages/core/risk/sandbox-trigger-monitor.ts`
  - `SandboxErrorEvent` interface:
    ```ts
    interface SandboxErrorEvent {
      strategyId: string;
      errorCode: "ERR_FATAL_SANDBOX_OOM" | "ERR_FATAL_SANDBOX_TIMEOUT" | "ERR_FATAL_SANDBOX_CRASH";
      memoryUsageBytes?: number;   // present for OOM events
      executionTimeMs?: number;    // present for timeout events
    }
    ```
  - `SandboxTriggerState` interface:
    ```ts
    interface SandboxTriggerState {
      consecutiveCrashesByStrategy: Map<string, number>; // strategyId → consecutive crash count
      crashThreshold: number;  // default 3
      oomThresholdBytes: number;     // default 134_217_728 (128MB)
      timeoutThresholdMs: number;    // default 500
    }
    ```
  - `SandboxTriggerResult` interface:
    ```ts
    interface SandboxTriggerResult {
      shouldActivate: boolean;
      scope: "strategy";
      scopeTarget: string; // strategyId
      reason: string;
      errorCode: SandboxErrorEvent["errorCode"];
    }
    ```
  - `evaluateSandboxEvent(event: SandboxErrorEvent, state: SandboxTriggerState): SandboxTriggerResult`
    - Pure function
    - OOM event where `memoryUsageBytes >= oomThresholdBytes` → `shouldActivate: true`
    - Timeout event where `executionTimeMs >= timeoutThresholdMs` → `shouldActivate: true`
    - Crash event where consecutive count for this strategy reaches `crashThreshold` → `shouldActivate: true`
    - OOM/timeout below threshold → `shouldActivate: false`
    - Crash below threshold → `shouldActivate: false`
  - `SandboxTriggerMonitor` class:
    - Constructor takes `{ activate: typeof activate, state: SandboxTriggerState }`
    - `onSandboxError(event: SandboxErrorEvent, deps: KillSwitchDeps): Promise<SandboxTriggerResult>`
    - Maintains internal crash counter per strategy (increments on crash, resets on success)
    - `resetCrashCounter(strategyId: string): void` — call when strategy executes successfully
- `packages/core/risk/__tests__/sandbox-trigger.test.ts`

## Deliverables
- `packages/core/risk/sandbox-trigger-monitor.ts`
- `packages/core/risk/__tests__/sandbox-trigger.test.ts`

## Constraints
- `packages/core/risk/sandbox-trigger-monitor.ts` must not import CCXT, Drizzle, Elysia, or Slack
- All triggers are per-strategy scoped — never global, never per-exchange
- `evaluateSandboxEvent` is a pure function receiving event + state; no internal state mutation
- Crash counter management is in `SandboxTriggerMonitor` (stateful class), not in the pure function
- OOM threshold: 128MB (134_217_728 bytes). Timeout threshold: 500ms. Both are configurable via state
- All tests use `bun:test`; mock deps are plain inline objects

## Steps
1. Write failing tests (RED):
   - OOM event at 128MB → `shouldActivate: true, scope: "strategy", scopeTarget: strategyId`
   - OOM event at 127MB → `shouldActivate: false` (below threshold)
   - Timeout event at 500ms → `shouldActivate: true`
   - Timeout event at 499ms → `shouldActivate: false`
   - Crash event: 1st crash → `shouldActivate: false`
   - Crash event: 2nd crash → `shouldActivate: false`
   - Crash event: 3rd crash → `shouldActivate: true`
   - `resetCrashCounter` resets counter for strategy — 4th crash after reset starts count from 1
   - Two strategies crashing independently: each has its own counter
   - `onSandboxError` calls `activate()` once when `shouldActivate: true`
   - `onSandboxError` does not call `activate()` when `shouldActivate: false`
2. Implement `sandbox-trigger-monitor.ts` (GREEN)
3. Refactor: add JSDoc to all exports

## Acceptance Criteria
- OOM and timeout triggers fire immediately at configured thresholds
- Crash trigger fires on the Nth consecutive crash for a given strategy (default N=3)
- Crash counter is per-strategy and independent between strategies
- `resetCrashCounter` correctly resets the count so subsequent crashes start from 1
- All triggers are scoped to "strategy" — never global
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test --filter "sandbox-trigger" && bun run typecheck
```

## Out of Scope
- Detecting sandbox errors directly (sandbox runtime / worker concern)
- Restarting the sandbox after kill switch activation
- Grace period or cooldown between triggers
- Slack notification (T-09-014)
- Wiring into the worker event loop
