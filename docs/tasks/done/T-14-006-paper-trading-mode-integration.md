# T-14-006 Paper trading mode integration

## Goal
Add `'paper'` to the `ExecutionMode` enum and route order execution through the paper order matcher when `mode === 'paper'`, ensuring no real exchange calls are made and Slack alerts carry a `[PAPER]` tag prefix.

## Why
Paper trading requires a completely separate execution path from live trading. Without explicit mode routing, the system has no safe way to simulate trades. The `[PAPER]` Slack tag prevents traders from confusing simulated alerts with real position changes.

## Inputs
- `packages/core/src/execution/` or `packages/execution/` — `ExecutionMode` enum location
- `packages/core/src/paper/` — paper order matcher types
- `docs/ARCHITECTURE.md` — execution pipeline rules, dependency direction
- Critical invariant: order execution must always go through the decision engine

## Dependencies
- None (pure logic in execution/paper packages)

## Expected Outputs
- Updated `ExecutionMode` enum with `'paper'` value
- `packages/execution/src/paper-router.ts` — routes execution to paper matcher when mode=paper
- `packages/execution/src/paper-router.test.ts` — tests for mode routing
- Updated Slack alert formatter — `[PAPER]` prefix for paper mode alerts

## Deliverables

### 1. ExecutionMode enum update
```typescript
// wherever ExecutionMode is defined
export type ExecutionMode = 'live' | 'paper' | 'backtest';
// or as enum:
export enum ExecutionMode {
  Live = 'live',
  Paper = 'paper',
  Backtest = 'backtest',
}
```

### 2. Paper order router
```typescript
// packages/execution/src/paper-router.ts

export interface PaperOrderMatcher {
  matchOrder(order: OrderRequest): Promise<PaperOrderResult>;
}

export interface RealOrderExecutor {
  executeOrder(order: OrderRequest): Promise<OrderResult>;
}

export interface ExecutionRouter {
  execute(order: OrderRequest, mode: ExecutionMode): Promise<OrderResult | PaperOrderResult>;
}

export class PaperRouter implements ExecutionRouter {
  constructor(
    private real: RealOrderExecutor,
    private paper: PaperOrderMatcher,
  ) {}

  async execute(order: OrderRequest, mode: ExecutionMode): Promise<OrderResult | PaperOrderResult> {
    if (mode === ExecutionMode.Paper) {
      return this.paper.matchOrder(order);
    }
    return this.real.executeOrder(order);
  }
}
```

### 3. Paper order result
```typescript
export interface PaperOrderResult {
  type: 'paper';
  paperId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  size: string;
  filledPrice: string;
  filledAt: number;
}
```

### 4. Slack alert tagging
- Alert formatter checks execution mode
- Paper mode: prepend `[PAPER] ` to alert message title
- Live mode: no prefix (existing behavior)
- Backtest mode: no Slack alert sent (existing behavior)

### 5. Tests
- `PaperRouter.execute()` with `mode=paper` calls `paper.matchOrder()`, not `real.executeOrder()`
- `PaperRouter.execute()` with `mode=live` calls `real.executeOrder()`, not `paper.matchOrder()`
- Paper mode alert message starts with `[PAPER] `
- Live mode alert has no `[PAPER] ` prefix
- Paper result has `type: 'paper'` discriminator

## Constraints
- `ExecutionMode.Paper` must never call `real.executeOrder()` — verified by test
- `packages/core` domain isolation still applies — no Elysia or CCXT in router
- `PaperRouter` accepts interfaces, not concrete implementations
- Backtest mode does not trigger Slack alerts (existing behavior preserved)
- All monetary values in order requests are Decimal strings

## Steps
1. Write failing tests (RED):
   - Paper mode routes to paper matcher
   - Live mode routes to real executor
   - Paper result has correct type discriminator
   - Paper alert carries [PAPER] prefix
2. Add `'paper'` to `ExecutionMode` enum (GREEN)
3. Implement `PaperRouter` class with mode switch (GREEN)
4. Update Slack alert formatter with `[PAPER]` prefix logic (GREEN)
5. Run validation (REFACTOR)

## Acceptance Criteria
- `ExecutionMode` type/enum includes `'paper'` value
- `PaperRouter.execute()` with `mode=ExecutionMode.Paper` never calls `real.executeOrder()`
- `PaperRouter.execute()` with `mode=ExecutionMode.Live` never calls `paper.matchOrder()`
- Paper mode Slack alerts have `[PAPER] ` prefix
- `bun run typecheck` passes

## Validation
```bash
bun test packages/execution
bun run typecheck
```

## Out of Scope
- Paper order matching logic (price simulation)
- Paper trading API routes
- Paper trading balance management
- Kill switch integration with paper mode

## Implementation Plan
- Create `packages/execution/paper-router.ts` with `PaperRouter` class and `formatAlertMessage()` helper
- ExecutionMode already exists as string union in `packages/execution/types.ts`
- 6 test cases: paper routing, live routing, type discriminator, alert prefix for paper/live/analysis

## Implementation Notes
- Date: 2026-03-23
- Files changed: `packages/execution/paper-router.ts`, `packages/execution/__tests__/paper-router.test.ts`
- Tests: 6 pass (paper routing, live routing, paper discriminator, paper alert prefix, live alert no prefix, analysis alert no prefix)
- Approach: PaperRouter class accepts interfaces (RealOrderExecutor, PaperOrderMatcher). Mode check dispatches to correct path. formatAlertMessage prepends [PAPER] for paper mode only.
- Validation: `bun test packages/execution` pass, `bun run typecheck` clean

## Outputs
- `PaperRouter` class — mode-based order routing
- `formatAlertMessage()` — [PAPER] prefix for paper mode alerts
- `OrderRequest`, `PaperOrderResult`, `OrderResult`, `PaperOrderMatcher`, `RealOrderExecutor` interfaces
