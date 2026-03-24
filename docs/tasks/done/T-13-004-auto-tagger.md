# T-13-004 Auto-tagger

## Goal
Implement a pure function `generateTags(journal)` in `packages/core/journal/tagger.ts` that produces an array of deterministic string tags from a `TradeJournal` object. Tags classify the trade by market state (trending direction, volatility level, volume level, trend alignment, funding level) and by trade result (hold duration, MFE behavior). The tagger is the final enrichment step before journal persistence.

## Why
EP13 M4 requires automatic tagging for every trade journal. Tags enable filtering and aggregation — traders can answer questions like "What is my winrate in high-volatility, against-trend trades?" or "How do quick losses differ from slow losses?" Without deterministic tags, journal search and analytics (M5) have no structured dimensions to query. By implementing tagging as a pure function over a `TradeJournal`, the tagger is testable without database or event infrastructure, and tag definitions are auditable in a single file.

## Inputs
- EP13 M4 spec — auto-tagging rules (market state tags + trade result tags)
- T-13-003 `packages/core/journal/assembler.ts` — `TradeJournal` type
- T-13-002 `packages/core/journal/market-context.ts` — `MarketContext`, `TrendContext`, `TrendDirection`
- T-13-001 `packages/core/journal/entry-snapshot.ts` — `EntrySnapshot`, `SnapshotDecision`
- Architecture guardrail: `packages/core/journal/` must not import Elysia, CCXT, Drizzle, or Slack

## Dependencies
- T-13-003 (journal assembler) — provides `TradeJournal` type that the tagger consumes

## Expected Outputs
- `packages/core/journal/tagger.ts`
  - `TaggerConfig` interface:
    ```ts
    interface TaggerConfig {
      volatilityHighThreshold: string;    // e.g. "1.5" — ratio above this = high_volatility
      volatilityLowThreshold: string;     // e.g. "0.7" — ratio below this = low_volatility
      volumeHighThreshold: string;        // e.g. "1.5" — ratio above this = high_volume
      volumeLowThreshold: string;         // e.g. "0.7" — ratio below this = low_volume
      quickHoldRatio: number;             // e.g. 0.25 — holdBars < maxHold * this = quick
      mfeHighRatio: number;               // e.g. 0.5 — MFE > TP% * this on a LOSS = mfe_high
      fundingHighThreshold: string;       // e.g. "0.0005" — absolute funding above this = high_funding
    }
    ```
  - `DEFAULT_TAGGER_CONFIG: TaggerConfig` — sensible defaults matching EP13 M4 spec thresholds
  - `generateTags(journal: TradeJournal, maxHoldBars: number, tpPct: number, config?: TaggerConfig): string[]` — returns sorted, deduplicated tag array
  - Tag categories and rules:
    - **Trend tags** (from highest timeframe in `exitMarketContext.trends`):
      - `"trending_up"` — highest TF trend is `"up"`
      - `"trending_down"` — highest TF trend is `"down"`
      - `"ranging"` — highest TF trend is `"neutral"` or no trends available
    - **Volatility tags** (from `exitMarketContext.volatilityRatio`):
      - `"high_volatility"` — ratio > `volatilityHighThreshold`
      - `"low_volatility"` — ratio < `volatilityLowThreshold`
    - **Volume tags** (from `exitMarketContext.volumeRatio`):
      - `"high_volume"` — ratio > `volumeHighThreshold`
      - `"low_volume"` — ratio < `volumeLowThreshold`
    - **Trend alignment** (direction vs highest TF trend):
      - `"with_trend"` — LONG + up trend, or SHORT + down trend
      - `"against_trend"` — LONG + down trend, or SHORT + up trend
    - **Funding tags** (from `exitMarketContext.fundingRate`):
      - `"high_funding"` — absolute funding > `fundingHighThreshold`
      - `"low_funding"` — absolute funding <= `fundingHighThreshold` (and not null)
      - No tag if `fundingRate` is null
    - **Trade result tags**:
      - `"quick_win"` — WIN and `holdBars < maxHoldBars * quickHoldRatio`
      - `"slow_win"` — WIN and not quick
      - `"quick_loss"` — LOSS and `holdBars < maxHoldBars * quickHoldRatio`
      - `"slow_loss"` — LOSS and not quick
      - `"mfe_high"` — LOSS and `mfePct > tpPct * mfeHighRatio` (gave back gains)
      - `"clean_win"` — WIN and `maePct < 0.5` (minimal adverse excursion)
- `packages/core/journal/__tests__/tagger.test.ts`

## Deliverables
- `packages/core/journal/tagger.ts`
- `packages/core/journal/__tests__/tagger.test.ts`

## Constraints
- All ratio comparisons use the T-11-001 Decimal.js wrapper — no native float for string-typed values
- `packages/core/journal/` must not import Elysia, CCXT, Drizzle, or Slack
- Output tags are always sorted alphabetically and deduplicated
- Deterministic: same input always produces same tags (no randomness, no time-dependency)
- `config` parameter is optional — uses `DEFAULT_TAGGER_CONFIG` when omitted
- When `exitMarketContext.trends` is empty, emit `"ranging"` (no trend data = no clear trend)
- When volatility/volume ratio falls between high and low thresholds, emit no volatility/volume tag
- All functions are synchronous and pure — no IO, no side effects
- All tests use `bun:test`

## Steps
1. Create type definitions in `packages/core/journal/tagger.ts`: `TaggerConfig`, `DEFAULT_TAGGER_CONFIG`
2. Write failing tests in `packages/core/journal/__tests__/tagger.test.ts` (RED):

   **Test A — Trending up, high volatility, LONG win with trend**
   - Journal: LONG, WIN, trends=[{timeframe:"1d", direction:"up"}], volatilityRatio="1.8", volumeRatio="1.0", holdBars=5, maxHold=100, tpPct=2.0, mfePct=1.9, maePct=0.3
   - Expected tags include: `"clean_win"`, `"high_volatility"`, `"quick_win"`, `"trending_up"`, `"with_trend"`

   **Test B — Trending down, SHORT win with trend**
   - Journal: SHORT, WIN, trends=[{timeframe:"1d", direction:"down"}], volatilityRatio="0.5"
   - Expected tags include: `"low_volatility"`, `"trending_down"`, `"with_trend"`

   **Test C — Against trend LONG loss**
   - Journal: LONG, LOSS, trends=[{timeframe:"1d", direction:"down"}], holdBars=80, maxHold=100
   - Expected tags include: `"against_trend"`, `"slow_loss"`, `"trending_down"`

   **Test D — MFE high loss (gave back gains)**
   - Journal: LOSS, mfePct=1.5, tpPct=2.0, mfeHighRatio=0.5 → mfePct(1.5) > tpPct*ratio(1.0)
   - Expected tags include: `"mfe_high"`

   **Test E — No trends available → ranging**
   - Journal: trends=[]
   - Expected tags include: `"ranging"`

   **Test F — Null funding rate → no funding tag**
   - Journal: fundingRate=null
   - Expected: no `"high_funding"` or `"low_funding"` in tags

   **Test G — High funding**
   - Journal: fundingRate="0.001"
   - Expected tags include: `"high_funding"`

   **Test H — Low funding**
   - Journal: fundingRate="0.0001"
   - Expected tags include: `"low_funding"`

   **Test I — High volume**
   - Journal: volumeRatio="2.0"
   - Expected tags include: `"high_volume"`

   **Test J — Tags are sorted alphabetically**
   - Verify output array is in alphabetical order

   **Test K — Deterministic output**
   - Call `generateTags` twice with identical input → identical output

   **Test L — TIME_EXIT result**
   - Journal: TIME_EXIT, positive pnlPct → treated as win for tag purposes
   - Expected: no `"quick_loss"` or `"slow_loss"` tags

   **Test M — Custom config overrides defaults**
   - Provide custom config with `volatilityHighThreshold: "2.0"` → volatilityRatio "1.8" no longer triggers `"high_volatility"`

3. Implement `generateTags` (GREEN):
   - Determine highest timeframe trend (last element if sorted by timeframe hierarchy, or first element)
   - Generate trend tag from highest TF direction
   - Generate volatility tag by comparing ratio against thresholds using Decimal.js
   - Generate volume tag similarly
   - Generate trend alignment tag from direction vs highest TF trend
   - Generate funding tag if fundingRate is not null
   - Generate result tags based on resultType, holdBars, mfePct, maePct
   - Collect all tags, sort alphabetically, deduplicate, return
4. Refactor: add JSDoc to all exported types and functions; extract helper functions for each tag category

## Acceptance Criteria
- Market state tags correctly classify trend, volatility, volume, trend alignment, and funding level
- Trade result tags correctly classify hold duration and MFE behavior
- `mfe_high` tag fires only when LOSS and MFE exceeded the threshold (gave back gains)
- `clean_win` tag fires only when WIN and MAE was minimal
- Empty trends produce `"ranging"` tag
- Null funding rate produces no funding tag
- Tags are always sorted alphabetically and deterministic
- Custom config overrides default thresholds
- All 13 tests pass, zero TypeScript errors

## Validation
```bash
bun test packages/core/journal/__tests__/tagger.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- `pattern_drift` detection (requires historical sample aggregation — separate task)
- User-defined custom tags (M5 API concern)
- Tag persistence in database (journal-worker concern)
- Tag-based analytics aggregation (M5 API concern)
- Adaptive threshold tuning based on historical data
- Tags for funding rate impact on PnL (requires EP11 integration)
