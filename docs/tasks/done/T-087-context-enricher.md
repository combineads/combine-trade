# T-087 Macro context enricher

## Goal
Build the context enricher that gathers economic events and news around a trade's entry and exit times, producing a MacroContext object.

## Why
EP16 M4 — when a trade journal is created, the system needs to automatically attach the macro environment (which events and news were happening around the trade).

## Inputs
- `packages/core/macro/types.ts` (T-083 outputs: MacroContext, EconomicEvent, NewsItem)

## Dependencies
T-083

## Expected Outputs
- `enrichWithMacroContext(entryTime, exitTime, deps)` function returning `MacroContext`
- `MacroContextRepository` interface

## Deliverables
- `packages/core/macro/context-enricher.ts`
- `packages/core/macro/__tests__/context-enricher.test.ts`

## Constraints
- Entry events: ±2 hours of entry time, HIGH/MEDIUM only
- Entry news: ±1 hour of entry time
- Exit events: ±30 minutes of exit time
- Exit news: ±30 minutes of exit time
- No data = empty arrays (never error)
- Must not import Drizzle/Elysia/CCXT (pure domain logic with injected repository)

## Steps
1. Define `MacroContextRepository` interface (findEventsInRange, findNewsInRange)
2. Implement `enrichWithMacroContext` function
3. Calculate time windows for entry and exit
4. Query events and news for each window via repository
5. Return MacroContext with 4 arrays
6. Write tests with mock repository

## Acceptance Criteria
- Entry events queried within ±2 hours of entry time
- Entry news queried within ±1 hour of entry time
- Exit events/news queried within ±30 minutes
- Empty repository returns `{ entryEvents: [], entryNews: [], exitEvents: [], exitNews: [] }`
- No exceptions thrown on empty results

## Validation
```bash
bun test packages/core/macro/__tests__/context-enricher.test.ts
bun run typecheck
```

## Out of Scope
- Journal-worker integration (separate task)
- trade_journals schema extension
- Automatic tag generation (T-088)
