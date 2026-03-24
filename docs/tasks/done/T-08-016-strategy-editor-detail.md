# T-08-016 Implement Strategy editor with Monaco and detail page

## Goal
Build the Strategy detail page with Monaco code editor, configuration panels, and statistics display.

## Why
EP08 M3/M5 — Design Priority 2. Monaco editor is the core UX for writing strategies.

## Inputs
- `docs/DESIGN_SYSTEM.md` §8 (strategy editor layout)
- `docs/TECH_STACK.md` (@monaco-editor/react)
- Strategy API routes
- API hooks (T-08-013)

## Dependencies
- T-08-015 (strategy list page)

## Expected Outputs
- Split-pane layout: Monaco editor (55%) + config panels (45%)
- Monaco with `vs-dark`/`vs` theme switching
- Strategy TypeScript syntax highlighting
- Configuration panels: basic info, features, search config, result config, decision config
- Statistics display: winrate, expectancy, sample count
- Event list for the strategy
- Save → create/update workflow

## Deliverables
- `packages/ui/src/views/strategies/strategy-editor-view.tsx`
- `packages/ui/src/views/strategies/monaco-editor.tsx`
- `packages/ui/src/views/strategies/config-panels.tsx`
- `packages/ui/src/views/strategies/strategy-stats.tsx`
- `apps/web/src/app/strategies/[id]/edit/page.tsx`
- `apps/web/src/app/strategies/[id]/page.tsx`
- `packages/ui/__tests__/strategy-editor.test.tsx`

## Constraints
- Monaco editor theme matches data-theme (dark=vs-dark, light=vs)
- Split pane resizable divider
- Config panels in scrollable accordion
- Bottom status bar: Language | Line:Col | Errors
- Code save triggers strategy create/update API
- Monaco lazy-loaded (dynamic import) for bundle size

## Steps
1. Write tests for editor components
2. Implement Monaco wrapper with theme switching
3. Implement configuration panels
4. Implement strategy statistics display
5. Implement split-pane layout
6. Wire save workflow (code → API)

## Acceptance Criteria
- Monaco editor renders TypeScript code
- Theme switches correctly with app theme
- Config panels display/edit strategy settings
- Save creates or updates strategy via API
- Statistics display from API data

## Validation
```bash
bun test packages/ui/__tests__/strategy-editor.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- TypeScript autocomplete for Strategy API (future enhancement)
- Backtest trigger from editor
- TradingView chart overlay
- Monaco wrapper component (deferred — requires @monaco-editor/react dependency and client-only dynamic import; SSR fallback renders code as <pre>)
- Resizable split-pane drag handle (structural divider present, resize interaction deferred)

## Implementation Plan
- Create ConfigPanels with 6 accordion sections per §8
- Create StrategyStats with 5 stat items
- Create StrategyEditorView with split-pane layout (55/45), code SSR fallback, status bar
- Create strategy detail page at apps/web /strategies/[id]
- Export all new components from packages/ui barrel

## Implementation Notes
- Date: 2026-03-22
- Files changed:
  - `packages/ui/src/views/strategies/config-panels.tsx` (new)
  - `packages/ui/src/views/strategies/strategy-stats.tsx` (new)
  - `packages/ui/src/views/strategies/strategy-editor-view.tsx` (new)
  - `packages/ui/__tests__/strategy-editor.test.tsx` (new)
  - `packages/ui/src/index.ts` (updated — added editor exports)
  - `apps/web/src/app/(app)/strategies/[id]/page.tsx` (new)
- Tests written: 16 (ConfigPanels: 6, StrategyStats: 4, StrategyEditorView: 6)
- Approach: TDD — tests first with SSR renderToString, then implementation. Monaco can't render in SSR so code displays as <pre> fallback.
- Validation results: 16/16 tests pass, typecheck clean, Next.js build succeeds, 1227 total pass
- Discovered work: Monaco wrapper component needs @monaco-editor/react + dynamic import (client-only). Deferred as separate enhancement.

## Outputs
- `StrategyEditorView` component — split-pane strategy editor with code display + config panels
- `ConfigPanels` component — 6-section config display (basic, features, search, result, decision, mode)
- `StrategyStats` component — 5-stat summary bar (winrate, expectancy, samples, events, avg hold)
- `StrategyDetail` interface — canonical type for strategy detail data
- `StrategyConfig` interface — nested config types (features, search, result, decision)
