# T-04-001 Implement result labeling engine

## Goal
Build the labeler that scans forward candles from an event's entry point and determines WIN/LOSS/TIME_EXIT based on TP/SL prices and max_hold_bars.

## Why
Labels are the ground truth for the statistics engine. Without labels, the decision engine cannot compute winrate or expectancy. The labeler determines trade outcomes by simulating forward price movement.

## Inputs
- EP04 M1 spec (result labeling engine)
- `db/schema/event-labels.ts` (label schema)
- ARCHITECTURE.md §packages/core/label
- PRODUCT.md label rules

## Dependencies
- T-02-004 (strategy types with result_config: tp_pct, sl_pct, max_hold_bars)

## Expected Outputs
- `packages/core/label/types.ts` — LabelResult, LabelInput types
- `packages/core/label/labeler.ts` — labelEvent() function
- `packages/core/label/index.ts` — barrel exports

## Deliverables
- `packages/core/label/types.ts`
- `packages/core/label/labeler.ts`
- `packages/core/label/__tests__/labeler.test.ts`
- Updated `packages/core/label/index.ts`

## Constraints
- Pure function: receives entry data + forward candles, returns label
- TP price: entryPrice × (1 + tp_pct/100) for LONG, entryPrice × (1 - tp_pct/100) for SHORT
- SL price: entryPrice × (1 - sl_pct/100) for LONG, entryPrice × (1 + sl_pct/100) for SHORT
- Same candle TP+SL hit → LOSS (sl_hit_first=true, conservative)
- pnl_pct normalized by direction (LONG: up=+, SHORT: down=+)
- mfe_pct: max favorable excursion (always positive)
- mae_pct: max adverse excursion (always positive)
- All price/pnl calculations use Decimal.js (ARCHITECTURE.md decimal boundary)
- packages/core/label must not import Elysia, CCXT, Drizzle

## Steps
1. Create `packages/core/label/types.ts` with LabelInput, LabelResult, CandleBar types
2. Write failing tests for each scenario (RED):
   - LONG TP hit → WIN
   - LONG SL hit → LOSS
   - SHORT TP hit → WIN
   - SHORT SL hit → LOSS
   - Same candle TP+SL → LOSS (sl_hit_first=true)
   - Max hold bars reached → TIME_EXIT with close price
   - pnl_pct, mfe_pct, mae_pct, hold_bars correctness
3. Implement labeler.ts (GREEN)
4. Add Decimal.js for price calculations
5. Refactor

## Acceptance Criteria
- LONG TP hit (high >= tp_price) → WIN
- LONG SL hit (low <= sl_price) → LOSS
- Same candle both hit → LOSS with sl_hit_first=true
- max_hold_bars exceeded → TIME_EXIT with last close
- pnl_pct correct: ((exit - entry) / entry) × 100 × direction_sign
- mfe_pct: maximum favorable move from entry (always ≥ 0)
- mae_pct: maximum adverse move from entry (always ≥ 0)
- hold_bars: number of candles from entry to exit
- All monetary calculations use Decimal.js

## Validation
```bash
bun test -- --filter "labeler"
bun run typecheck
bun run lint
```

## Out of Scope
- Label worker (T-04-002)
- Candle gap detection (T-04-002)
- Database persistence
