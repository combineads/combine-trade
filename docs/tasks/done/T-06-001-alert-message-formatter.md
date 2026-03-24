# T-06-001 Alert message formatter

## Goal
Implement a pure function that formats a `DecisionResult` into a Slack Block Kit message payload. No I/O, no side effects — input in, JSON out.

## Why
Alert delivery and message structure must be decoupled. The formatter is the single source of truth for what a Slack alert looks like. Keeping it pure makes it trivially testable and reusable across any delivery channel (webhook, socket mode, future channels).

## Inputs
- `DecisionResult` from `@combine/core/decision`:
  - `decision: "LONG" | "SHORT" | "PASS"`
  - `reason: string`
  - `statistics: DecisionInput` — `{ winrate, avgWin, avgLoss, expectancy, sampleCount, status }`
  - `ciLower: number`, `ciUpper: number`, `confidenceTier: string`
- Alert context supplied by the caller at format time:
  - `strategyName: string`
  - `symbol: string`
  - `timeframe: string`
  - `entryPrice: string` (Decimal.js string)
  - `tp: string` (Decimal.js string)
  - `sl: string` (Decimal.js string)
  - `topSimilarity: number` (top-1 cosine similarity score)
- Slack Block Kit specification (https://api.slack.com/block-kit)

## Dependencies
None.

## Expected Outputs
- `packages/alert/formatter.ts`
  - `formatAlertMessage(result: DecisionResult, ctx: AlertContext): SlackMessage`
  - `AlertContext` interface containing all caller-supplied fields above
- `packages/alert/types.ts`
  - `AlertContext` interface
  - `SlackMessage` interface — `{ blocks: SlackBlock[] }`
  - `SlackBlock` — union of `SectionBlock`, `DividerBlock`, `HeaderBlock` (only the subset used)
- `packages/alert/__tests__/formatter.test.ts`

## Deliverables
- `packages/alert/formatter.ts`
- `packages/alert/types.ts`
- `packages/alert/__tests__/formatter.test.ts`
- `packages/alert/index.ts` barrel export

## Constraints
- Pure functions only — no I/O, no imports from Elysia, Drizzle, CCXT, or Slack SDK
- `decision === "PASS"` must throw (callers must guard before calling; formatting a PASS is a logic error)
- All numeric fields formatted to fixed decimal places: winrate 1 d.p. as percentage, prices 2 d.p., expectancy 4 d.p.
- Block Kit structure: Header block (direction + symbol), Section block (strategy/timeframe/prices), Section block (statistics), Divider — in that order
- Output must be serialisable with `JSON.stringify` — no circular refs, no class instances
- `packages/alert` may import from `@combine/core` only (no `@combine/candle`, no `@combine/backtest`)
- No native float arithmetic on monetary values — format strings directly; use `parseFloat` only for display formatting of already-validated strings

## Steps
1. Create `packages/alert/types.ts` with `AlertContext`, `SlackMessage`, and block types (RED: type errors will guide test writing)
2. Write failing tests in `packages/alert/__tests__/formatter.test.ts` (RED):
   - LONG result → header block text contains "LONG" and symbol
   - SHORT result → header block text contains "SHORT"
   - PASS result → throws an error
   - statistics section contains winrate formatted as percentage (e.g. `"57.3%"`)
   - entry price, TP, SL appear in correct section block
   - `topSimilarity` appears in statistics section
   - output is valid JSON (no circular refs)
   - `blocks` array has exactly 4 elements in the defined order
3. Implement `packages/alert/formatter.ts` (GREEN):
   - Guard `decision === "PASS"` → throw
   - Build Header block: `` `${result.decision} ${ctx.symbol}` ``
   - Build prices Section block: strategy, timeframe, entry, TP, SL
   - Build statistics Section block: winrate %, expectancy, sampleCount, ciLower–ciUpper, confidenceTier, topSimilarity
   - Build Divider block
   - Return `{ blocks: [header, prices, stats, divider] }`
4. Create `packages/alert/index.ts` barrel exporting `formatAlertMessage`, `AlertContext`, `SlackMessage`
5. Refactor: add JSDoc to `formatAlertMessage` and `AlertContext`

## Acceptance Criteria
- `formatAlertMessage` with a LONG decision returns a `SlackMessage` whose first block is a Header block containing `"LONG"` and the symbol string
- `formatAlertMessage` with a SHORT decision returns a `SlackMessage` whose first block contains `"SHORT"`
- Calling `formatAlertMessage` with `decision === "PASS"` throws
- Winrate `0.573` is rendered as `"57.3%"` in the statistics block
- `blocks.length === 4` in the exact order: header, prices section, stats section, divider
- Output passes `JSON.parse(JSON.stringify(output))` round-trip without error
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/alert/__tests__/formatter.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- Slack webhook delivery (T-06-007)
- Alert persistence / delivery state tracking
- PASS-direction alerts
- Internationalisation / locale formatting
- Interactive Block Kit elements (buttons, modals)
