# T-12-015 TradingView Ticker Tape and Market Overview widgets

## Goal
Integrate the TradingView Ticker Tape and Market Overview free widgets into the dashboard to provide at-a-glance market context.

## Why
Traders benefit from seeing live price tickers and a market-wide snapshot without switching tabs. The TradingView free widget API provides this out of the box with minimal implementation effort.

## Inputs
- TradingView free widget documentation (https://www.tradingview.com/widget/)
- `packages/ui/components/` — existing component structure
- `docs/DESIGN_SYSTEM.md` — theming tokens for widget color config

## Dependencies
- T-08-014 (dashboard layout / widget placement infrastructure)

## Expected Outputs
- `TickerTapeWidget` component embedding the TradingView Ticker Tape script
- `MarketOverviewWidget` component embedding the TradingView Market Overview script
- Both components accept a `theme` prop (`"dark"` | `"light"`) tied to the design system
- Responsive sizing: widgets fill their container width

## Deliverables
- `packages/ui/components/widgets/TickerTapeWidget.tsx`
- `packages/ui/components/widgets/MarketOverviewWidget.tsx`
- `packages/ui/components/widgets/__tests__/ticker-tape.test.tsx`
- Updated `packages/ui/index.ts` exports

## Constraints
- Use TradingView free widget API only — no paid / Pro embed
- Widget script injected via a `useEffect` to avoid SSR issues
- Script must be cleaned up on unmount to prevent duplicate injection
- Symbols configured for major crypto pairs (BTC, ETH, SOL, BNB at minimum)

## Steps
1. Write failing tests first (RED):
   - Test: `<TickerTapeWidget>` renders a container div with the widget script injected
   - Test: script is removed from DOM on unmount
   - Test: `theme="dark"` passes `colorTheme: "dark"` to widget config
   - Test: `<MarketOverviewWidget>` renders with correct symbol list
2. Implement widgets (GREEN):
   - Create container `<div ref={containerRef}>` in each component
   - In `useEffect`, create `<script>` tag with TradingView widget JSON config and append to container
   - On cleanup, remove the script and clear the container
3. Configure symbol lists for crypto markets
4. Refactor (REFACTOR): extract script-injection logic into a `useTradingViewWidget(config)` hook

## Acceptance Criteria
- Widget container div is present in the rendered output
- Script tag is injected on mount and removed on unmount
- `theme` prop correctly maps to TradingView `colorTheme` config value
- No duplicate scripts injected on re-render
- `bun test -- --filter "ticker-tape"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "ticker-tape"
bun run typecheck
bun run lint
```

## Out of Scope
- TradingView Pro / paid widgets
- Custom symbol list management UI
- Widget persistence / user preferences
