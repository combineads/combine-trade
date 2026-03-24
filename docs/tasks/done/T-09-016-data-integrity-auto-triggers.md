# T-09-016 Data integrity auto-triggers for kill switch

## Goal
Implement the data integrity category of auto-triggers: candle continuity gaps and vector search timeout events. Both trigger immediately when conditions are met and only when positions are open.

## Why
EP09 M1 — candle gaps and vector search timeouts indicate data pipeline failure, making trading decisions unreliable. If the system cannot trust its input data, it must not trade. Immediate activation (no grace period) is required because a candle gap or repeated vector search timeout represents an acute data problem, not a transient blip.

## Inputs
- `docs/exec-plans/09-risk-management.md` M1 — data integrity trigger conditions (candle gap ≥ 3 consecutive, vector search timeout 3×)
- `packages/core/risk/kill-switch-triggers.ts` (TriggerResult type from T-09-011)
- `packages/core/risk/kill-switch.ts` (activate function)
- T-01-003 — candle continuity validation (source of candle gap events)

## Dependencies
- T-09-001 (kill switch state machine)
- T-09-011 (kill switch auto-trigger evaluator — provides TriggerResult type and evaluation pattern)

## Expected Outputs
- `packages/core/risk/data-integrity-trigger-monitor.ts`
  - `DataIntegrityState` interface:
    ```ts
    interface DataIntegrityState {
      candleGapsBySymbol: Map<string, number>;        // symbol → consecutive gap count
      vectorSearchTimeoutsByStrategy: Map<string, number>; // strategyId → consecutive timeout count
      hasOpenPositions: boolean;
      candleGapThreshold: number;          // default 3
      vectorTimeoutThreshold: number;      // default 3
    }
    ```
  - `DataIntegrityTriggerResult` interface:
    ```ts
    interface DataIntegrityTriggerResult {
      shouldActivate: boolean;
      scope: KillSwitchScope;
      scopeTarget: string | null;
      reason: string;
      positionSnapshotRequired: boolean; // always true for data integrity triggers
    }
    ```
  - `evaluateDataIntegrityTriggers(state: DataIntegrityState): DataIntegrityTriggerResult[]`
    - Pure function
    - Candle gap ≥ threshold with open positions → `shouldActivate: true, scope: "global"` (candle gaps affect all strategies on that symbol)
    - Vector search timeout ≥ threshold with open positions → `shouldActivate: true, scope: "strategy", scopeTarget: strategyId`
    - Any trigger without open positions → `shouldActivate: false` (no kill, no block-entry)
  - `DataIntegrityTriggerMonitor` class:
    - Constructor takes `{ activate: typeof activate }`
    - `evaluate(state: DataIntegrityState): DataIntegrityTriggerResult[]`
    - `applyResults(results: DataIntegrityTriggerResult[], deps: KillSwitchDeps): Promise<void>`
- `packages/core/risk/__tests__/data-integrity-trigger.test.ts`

## Deliverables
- `packages/core/risk/data-integrity-trigger-monitor.ts`
- `packages/core/risk/__tests__/data-integrity-trigger.test.ts`

## Constraints
- `packages/core/risk/data-integrity-trigger-monitor.ts` must not import CCXT, Drizzle, Elysia, or Slack
- `evaluateDataIntegrityTriggers` is a pure function — no side effects, fully deterministic
- Data integrity triggers: immediate activation, no grace period
- When `hasOpenPositions` is false: no action taken (neither kill nor block-entry)
- Candle gap scope is global (not per-symbol) because a gap in one symbol's data undermines overall data pipeline trust
- All tests use `bun:test`; mock deps are plain inline objects

## Steps
1. Write failing tests (RED):
   - Candle gap = 3 for "BTC/USDT" with positions → `shouldActivate: true, scope: "global"`
   - Candle gap = 2 for "BTC/USDT" with positions → `shouldActivate: false` (threshold not met)
   - Candle gap = 3 for "BTC/USDT" without positions → `shouldActivate: false`
   - Vector timeout = 3 for "strat-1" with positions → `shouldActivate: true, scope: "strategy", scopeTarget: "strat-1"`
   - Vector timeout = 3 for "strat-1" without positions → `shouldActivate: false`
   - Vector timeout = 2 for "strat-1" with positions → `shouldActivate: false`
   - Multiple strategies with timeouts → one result per qualifying strategy
   - All healthy → empty results array
   - `applyResults` calls activate once per shouldActivate result
   - `applyResults` skips results where `shouldActivate: false`
2. Implement `data-integrity-trigger-monitor.ts` (GREEN)
3. Refactor: add JSDoc to all exports

## Acceptance Criteria
- Candle gap threshold (default 3) correctly gates activation
- Vector search timeout threshold (default 3) correctly gates per-strategy activation
- No activation when `hasOpenPositions` is false
- `evaluateDataIntegrityTriggers` returns a result per qualifying trigger condition
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test --filter "data-integrity-trigger" && bun run typecheck
```

## Out of Scope
- Detecting candle gaps directly (T-01-003 concern — events are fed in from outside)
- Vector search timeout detection (vector search layer concern)
- Grace period or cooldown logic
- Slack notification (T-09-014)
- Wiring into the worker event loop
