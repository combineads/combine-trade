# T-16-006 Macro auto-tagger

## Goal
Generate macro-based tags from a MacroContext, identifying trading conditions like FOMC week, CPI day, or pre-high-impact events.

## Why
EP16 M4 — automatic macro tags enable performance analytics by macro condition (e.g., "winrate during FOMC week" vs "normal day").

## Inputs
- `packages/core/macro/types.ts` (T-16-001 outputs: MacroContext, EconomicEvent, NewsItem)

## Dependencies
T-16-001

## Expected Outputs
- `generateMacroTags(context, entryTime)` function returning `string[]`

## Deliverables
- `packages/core/macro/macro-tagger.ts`
- `packages/core/macro/__tests__/macro-tagger.test.ts`

## Constraints
- Tags to generate:
  - `fomc_week` — entry within FOMC event D-7 to D+1
  - `cpi_day` — entry day has CPI event
  - `nfp_day` — entry day has Non-Farm Payrolls event
  - `pmi_day` — entry day has PMI event
  - `pre_high_impact_event` — HIGH impact event within 24h after entry
  - `major_news_at_entry` — 2+ news items within ±1 hour of entry
  - `geopolitical_risk` — news contains geopolitical keywords
- Must not import Drizzle/Elysia/CCXT (pure domain logic)
- Keyword matching is case-insensitive

## Steps
1. Implement tag generation functions for each tag type
2. Implement `generateMacroTags` that runs all tag generators and returns unique tags
3. Define geopolitical keyword list (war, sanction, tariff, conflict, etc.)
4. Write tests for each tag condition

## Acceptance Criteria
- FOMC event within D-7 to D+1 produces `fomc_week` tag
- CPI/NFP/PMI events on entry day produce respective tags
- HIGH impact event within 24h after entry produces `pre_high_impact_event`
- 2+ news within ±1h produces `major_news_at_entry`
- Geopolitical keywords in news headlines produce `geopolitical_risk`
- No events/news = empty array
- No duplicate tags

## Validation
```bash
bun test packages/core/macro/__tests__/macro-tagger.test.ts
bun run typecheck
```

## Out of Scope
- Journal-worker integration
- Custom user-defined tags
- News sentiment analysis
