# T-09-023 Liquidation proximity warning

## Goal
Implement a `LiquidationWarningMonitor` that periodically checks each open position's current mark price against its liquidation price. When the mark price is within a configurable threshold (default: 10%) of the liquidation price, it sends a Slack WARNING alert with a cooldown to prevent spam (default: 1 hour per position).

## Why
EP09 M4 — a position approaching liquidation without early warning can result in a total loss of margin before the trader can react. A threshold-based alert with a cooldown gives traders enough lead time to reduce size or add margin while avoiding alert fatigue from repeated notifications.

## Inputs
- EP09 M4 spec — current price within N% of liquidation price → WARNING alert, configurable threshold
- T-09-022 (liquidation price calculator) — provides `LiquidationPriceCalculator` and `LiquidationInput`
- T-06-007 (slack webhook) — provides Slack notification interface
- Architecture guardrail: `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack directly

## Dependencies
- T-09-022 (liquidation price tracker — provides calculated liquidation prices)
- T-06-007 (slack webhook — provides `SlackNotifier` interface for injected alerting)

## Expected Outputs
- `packages/core/risk/liquidation-warning-monitor.ts`
  - `LiquidationWarningConfig` interface: `{ thresholdPct: number; /* default 0.10 */ cooldownMs: number; /* default 3_600_000 */ }`
  - `PositionWithLiquidation` interface: `{ positionId: string; symbol: string; side: 'LONG' | 'SHORT'; markPrice: string; liquidationPrice: string; }`
  - `SlackNotifier` interface: `{ sendWarning(message: string): Promise<void>; }` — injected, not imported from Slack SDK
  - `LiquidationWarningMonitor` class with:
    - `constructor(config: LiquidationWarningConfig, notifier: SlackNotifier)`
    - `check(positions: PositionWithLiquidation[]): Promise<void>` — evaluates each position and sends alert if within threshold and cooldown has expired
    - `isNearLiquidation(markPrice: string, liquidationPrice: string, side: 'LONG' | 'SHORT', thresholdPct: number): boolean` — pure function; LONG: proximity = `(markPrice - liquidationPrice) / liquidationPrice`; SHORT: proximity = `(liquidationPrice - markPrice) / liquidationPrice`; returns true if proximity ≤ thresholdPct
    - `getCooldownKey(positionId: string): string` — returns a stable key for the per-position cooldown map
- `packages/core/risk/__tests__/liquidation-warning-monitor.test.ts`

## Deliverables
- `packages/core/risk/liquidation-warning-monitor.ts`
- `packages/core/risk/__tests__/liquidation-warning-monitor.test.ts`

## Constraints
- All arithmetic must use Decimal.js — no native float on monetary values
- `packages/core/risk/` must not import CCXT, Drizzle, Elysia, or Slack directly — Slack access via injected `SlackNotifier` interface only
- Cooldown is tracked in-memory per `positionId` (map of last alert timestamp)
- Alert fires at most once per `cooldownMs` window per position
- `isNearLiquidation` must handle the asymmetry between LONG (mark below liq) and SHORT (mark above liq)
- All tests use `bun:test`

## Steps
1. Write failing tests in `packages/core/risk/__tests__/liquidation-warning-monitor.test.ts` (RED):
   - LONG `isNearLiquidation`: `markPrice="46000"`, `liquidationPrice="45000"`, `threshold=0.10` → `(46000-45000)/45000 = 0.022 ≤ 0.10` → `true`
   - LONG `isNearLiquidation`: `markPrice="50000"`, `liquidationPrice="45000"`, `threshold=0.10` → `(50000-45000)/45000 = 0.111 > 0.10` → `false`
   - SHORT `isNearLiquidation`: `markPrice="54000"`, `liquidationPrice="55000"`, `threshold=0.10` → `(55000-54000)/55000 = 0.018 ≤ 0.10` → `true`
   - SHORT `isNearLiquidation`: `markPrice="48000"`, `liquidationPrice="55000"`, `threshold=0.10` → `(55000-48000)/55000 = 0.127 > 0.10` → `false`
   - `check()` with one near-liquidation position → `notifier.sendWarning` called once
   - `check()` called twice quickly (within cooldown) → `notifier.sendWarning` called only once
   - `check()` called after cooldown expires → `notifier.sendWarning` called again
   - `check()` with no near-liquidation positions → `notifier.sendWarning` never called
   - Multiple positions, only one near liquidation → alert sent for that one only
2. Implement `packages/core/risk/liquidation-warning-monitor.ts` (GREEN)
3. Refactor: add JSDoc to `LiquidationWarningMonitor`, `check`, `isNearLiquidation`

## Acceptance Criteria
- `isNearLiquidation` correctly handles LONG (mark approaches from above) and SHORT (mark approaches from below)
- `check()` sends alert only when within threshold
- Cooldown prevents duplicate alerts within `cooldownMs` window per position
- Alert includes symbol, side, mark price, and liquidation price in message
- `SlackNotifier` is injected — no direct Slack SDK import in `packages/core/risk/`
- All arithmetic uses Decimal.js
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test --filter "liquidation-warning" && bun run typecheck
```

## Out of Scope
- Persistent cooldown state across process restarts (in-memory only)
- Escalation levels beyond WARNING (single severity by design)
- Auto-closing positions near liquidation (monitor and alert only, no execution)
- Dashboard rendering of liquidation risk (UI concern)
