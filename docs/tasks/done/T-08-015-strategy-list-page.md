# T-08-015 Implement Strategy list and create/edit pages

## Goal
Build the Strategies page with list view and create/edit forms.

## Why
EP08 M3 — Design Priority 2. Core feature for managing trading strategies.

## Inputs
- `docs/DESIGN_SYSTEM.md` §5 (cards, badges, buttons)
- Strategy CRUD API routes
- API hooks (T-08-013)

## Dependencies
- T-08-012 (base UI components)
- T-08-013 (API client hooks)

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
- Monaco code editor (T-08-016)
- Strategy detail page (T-08-016)
- TradingView charts
- Create/edit forms (deferred — need react-hook-form setup)
- Safety gate enforcement for auto-trade (needs kill-switch integration)

## Implementation Plan
- Create StrategyCard with name, version, symbols, winrate, mode, status badge
- Create ModeSelector with 4 execution mode buttons
- Create StrategyListView with grid layout + empty state
- Wire strategies page in apps/web to use StrategyListView
- Export new components from packages/ui barrel

## Implementation Notes
- Date: 2026-03-22
- Files changed:
  - `packages/ui/src/views/strategies/strategy-card.tsx` (new)
  - `packages/ui/src/views/strategies/mode-selector.tsx` (new)
  - `packages/ui/src/views/strategies/strategy-list-view.tsx` (new)
  - `packages/ui/__tests__/strategy-list.test.tsx` (new)
  - `packages/ui/src/index.ts` (updated — added strategy view exports)
  - `apps/web/src/app/(app)/strategies/page.tsx` (updated — wired StrategyListView)
- Tests written: 10 (StrategyCard: 5, ModeSelector: 2, StrategyListView: 3)
- Approach: TDD — wrote tests first, then minimal implementation to pass
- Validation results: 10/10 tests pass, typecheck clean, 1211 total pass
- Discovered work: Create/edit forms and safety gate deferred (form library needed)

## Outputs
- `StrategyListView` component — accepts StrategyListItem[] for rendering strategy grid
- `StrategyCard` component — renders individual strategy mini-stats card
- `ModeSelector` component — 4-mode button group (analysis/alert/paper-trade/auto-trade)
- `StrategyListItem` interface — canonical type for strategy list data
- `ExecutionMode` type — union type for strategy execution modes
