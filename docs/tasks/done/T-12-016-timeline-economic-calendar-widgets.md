# T-12-016 TradingView Timeline and Economic Calendar widgets

## Goal
Integrate TradingView Timeline (news feed) and Economic Calendar free widgets into the dashboard for macro context visualization.

## Why
Macro events and news directly impact crypto markets. Embedding these widgets on the dashboard gives traders immediate context for price movements without leaving the application.

## Inputs
- TradingView free widget documentation (https://www.tradingview.com/widget/)
- `packages/ui/components/` — existing component structure
- `docs/DESIGN_SYSTEM.md` — theming tokens

## Dependencies
- T-08-014 (dashboard layout / widget placement infrastructure)

## Expected Outputs
- `TimelineWidget` component embedding the TradingView Timeline (news) script
- `EconomicCalendarWidget` component embedding the TradingView Economic Calendar script
- Both accept `theme` prop (`"dark"` | `"light"`)
- Responsive sizing

## Deliverables
- `packages/ui/components/widgets/TimelineWidget.tsx`
- `packages/ui/components/widgets/EconomicCalendarWidget.tsx`
- `packages/ui/components/widgets/__tests__/timeline-widget.test.tsx`
- Updated `packages/ui/index.ts` exports

## Constraints
- Use TradingView free widget API only — no paid / Pro embed
- Script injected via `useEffect` to avoid SSR issues
- Script cleaned up on unmount
- Economic calendar configured for markets relevant to crypto (US, global)
- Reuse the `useTradingViewWidget` hook from T-12-015 if available

## Steps
1. Write failing tests first (RED):
   - Test: `<TimelineWidget>` renders a container div with widget script injected
   - Test: script removed on unmount
   - Test: `theme="light"` passes correct `colorTheme` to widget config
   - Test: `<EconomicCalendarWidget>` renders with correct market configuration
2. Implement widgets (GREEN):
   - Use `useTradingViewWidget` hook (from T-12-015) with Timeline and EconomicCalendar configs
   - Configure `feedMode: "market"` for Timeline to show crypto-relevant news
   - Configure `importanceFilter: "0,1"` for Economic Calendar (medium and high impact only)
3. Refactor (REFACTOR): verify both widgets share the same `useTradingViewWidget` abstraction

## Acceptance Criteria
- Container div is present in the rendered output for both widgets
- Script injected on mount, removed on unmount for both
- `theme` prop maps to correct TradingView `colorTheme` value
- Economic calendar shows only medium/high impact events
- `bun test -- --filter "timeline-widget"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "timeline-widget"
bun run typecheck
bun run lint
```

## Out of Scope
- Custom news source integration (not TradingView)
- Filtering news by symbol / strategy
- Saving / bookmarking news items
