# T-133 Implement Strategy list and create/edit pages

## Goal
Build the Strategies page with list view and create/edit forms.

## Why
EP08 M3 — Design Priority 2. Core feature for managing trading strategies.

## Inputs
- `docs/DESIGN_SYSTEM.md` §5 (cards, badges, buttons)
- Strategy CRUD API routes
- API hooks (T-131)

## Dependencies
- T-130 (base UI components)
- T-131 (API client hooks)

## Expected Outputs
- Strategy list page with card grid
- Per-strategy mini stats (winrate, event count, mode)
- Strategy status badges (active, paused, draft)
- Create strategy form (name, direction, symbols, timeframe)
- Edit strategy dialog/page
- Mode change controls (analysis → alert → paper → auto-trade)

## Deliverables
- `packages/ui/src/views/strategies/strategy-list-view.tsx`
- `packages/ui/src/views/strategies/strategy-card.tsx`
- `packages/ui/src/views/strategies/strategy-form.tsx`
- `packages/ui/src/views/strategies/mode-selector.tsx`
- `apps/web/src/app/strategies/page.tsx`
- `apps/web/src/app/strategies/new/page.tsx`
- `apps/web/src/app/strategies/[id]/page.tsx` (detail stub)
- `packages/ui/__tests__/strategy-list.test.tsx`

## Constraints
- Card grid with status indicators per DESIGN_SYSTEM.md §5.4
- Status badges per §5.2
- Mode selector: step progression (Analysis → Alert → Paper → Auto-Trade)
- Safety gate for auto-trade mode (kill switch + loss limit check)
- Empty state per §7.2 ("No strategies yet" + Create CTA)
- react-hook-form for form state management

## Steps
1. Write tests for strategy components
2. Implement strategy card with mini stats
3. Implement strategy list view with grid
4. Implement create/edit form
5. Implement mode selector
6. Wire API hooks

## Acceptance Criteria
- Strategy list renders from API data
- Create form validates and submits
- Mode selector enforces safety gates
- Empty state shown when no strategies

## Validation
```bash
bun test packages/ui/__tests__/strategy-list.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- Monaco code editor (T-134)
- Strategy detail page (T-134)
- TradingView charts
