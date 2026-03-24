# T-16-001 Macro domain types + impact parser

## Goal
Create EP16 foundation: macro domain types and impact star parser.

## Deliverables
- `packages/core/macro/types.ts`
- `packages/core/macro/impact-parser.ts`
- `packages/core/macro/__tests__/impact-parser.test.ts`
- `db/schema/macro.ts` (economic_events + news_items tables)

## Validation
```bash
bun test packages/core/macro/__tests__/impact-parser.test.ts
bun run typecheck
```

## Implementation Notes
- Date: 2026-03-22
- Files created: `packages/core/macro/types.ts`, `packages/core/macro/impact-parser.ts`, `packages/core/macro/__tests__/impact-parser.test.ts`, `db/schema/macro.ts`
- Updated: `db/schema/index.ts` (added macro exports)
- 17 tests passing, typecheck clean
- ImpactLevel parsed from star chars (★/⭐): 3+→HIGH, 2→MEDIUM, 1/0→LOW
- DB schema: economic_events (with externalId unique), news_items (FK to economic_events)

## Outputs
- `ImpactLevel`, `EconomicEvent`, `NewsItem`, `MacroContext`, `CreateEconomicEventInput`, `CreateNewsItemInput` types from `packages/core/macro/types.ts`
- `parseImpactFromTitle`, `extractEventName`, `shouldCollect` from `packages/core/macro/impact-parser.ts`
- `economicEvents`, `newsItems` Drizzle tables from `db/schema/macro.ts`
