# T-134 Implement Strategy editor with Monaco and detail page

## Goal
Build the Strategy detail page with Monaco code editor, configuration panels, and statistics display.

## Why
EP08 M3/M5 — Design Priority 2. Monaco editor is the core UX for writing strategies.

## Inputs
- `docs/DESIGN_SYSTEM.md` §8 (strategy editor layout)
- `docs/TECH_STACK.md` (@monaco-editor/react)
- Strategy API routes
- API hooks (T-131)

## Dependencies
- T-133 (strategy list page)

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
