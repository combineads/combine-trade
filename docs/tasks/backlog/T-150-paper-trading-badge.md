# T-150 Paper trading mode UI indicators

## Goal
Create `PaperTradingBanner` (amber full-width persistent top banner) and `PaperBadge` (inline `[PAPER]` badge for order rows and cards), implementing the paper trading visual indicators specified in `DESIGN_SYSTEM.md` §12.

## Why
EP08 — Paper trading mode is the safety step between strategy analysis and live execution. The UI must make it unmistakably clear when paper trading is active so traders never confuse simulated orders with real ones. Per §12, paper mode requires three simultaneous indicators: amber top banner, [PAPER] badge on order rows, and dashed left border on order cards.

## Inputs
- `docs/DESIGN_SYSTEM.md` §12 (paper trading mode indicators: amber banner, [PAPER] badge, dashed left border)
- `docs/DESIGN_SYSTEM.md` §4.1 (color tokens: `--color-warning`, `--color-text-on-warning`)
- `packages/ui/src/components/notification-banner.tsx` (from T-146) — reference for banner pattern
- `packages/ui/src/components/badge.tsx` (from T-130)

## Dependencies
- T-130 (base UI components — badge, design tokens)

## Expected Outputs
- `packages/ui/src/components/paper-trading-badge.tsx`
- `packages/ui/__tests__/paper-trading-badge.test.tsx`

## Deliverables

### 1. PaperTradingBanner component
```typescript
// packages/ui/src/components/paper-trading-badge.tsx
interface PaperTradingBannerProps {
  active: boolean;
  strategyName?: string;    // optional: "Paper Trading Active — {strategyName}"
}

export function PaperTradingBanner({ active, strategyName }: PaperTradingBannerProps)
```
- When `active` is false → renders nothing (returns null)
- When `active` is true → renders `div[data-testid="paper-trading-banner"]`
  - Full viewport width, `position: fixed`, `top: 0`, `z-index: 9998` (below kill switch banner at 9999)
  - Background: `--color-warning` (amber), Text: `--color-text-on-warning` (dark)
  - Message: "Paper Trading Active" when no `strategyName`, "Paper Trading Active — {strategyName}" when provided
  - Message in `span[data-testid="paper-banner-message"]`
  - No dismiss button — persistent while paper mode is active
  - Font weight: medium, centered text

### 2. PaperBadge component
```typescript
interface PaperBadgeProps {
  className?: string;
}

export function PaperBadge({ className }: PaperBadgeProps)
```
- Renders `span[data-testid="paper-badge"]`
- Text: "PAPER"
- Style: amber background (`--color-warning` at 15% opacity), amber text (`--color-warning`), uppercase, mono font, small font size, rounded corners, horizontal padding
- Per §12: styled as `[PAPER]` inline label, not a full badge with border-radius pill

### 3. PaperOrderCard wrapper
```typescript
interface PaperOrderCardProps {
  children: React.ReactNode;
  isPaper?: boolean;    // default: false
}

export function PaperOrderCard({ children, isPaper = false }: PaperOrderCardProps)
```
- `data-testid="paper-order-card"` outer wrapper
- When `isPaper` is true: applies `border-left: 2px dashed var(--color-warning)` to the wrapper
- When `isPaper` is false: no left border modification
- Renders children inside the wrapper

### 4. Index exports
- Export `PaperTradingBanner`, `PaperBadge`, `PaperOrderCard` from `packages/ui/src/index.ts`

## Constraints
- Per DESIGN_SYSTEM.md §12: amber banner must be the exact warning color token — no custom amber hex
- `PaperTradingBanner` `z-index` must be 9998, one below `NotificationBanner` (9999) so kill switch always shows above paper trading banner
- `PaperBadge` uses mono font (matching order row financial figures)
- Neither banner nor badge renders any DOM node when `active` is false / `isPaper` is false
- No dismiss button on either banner — persistence is the design requirement

## Steps
1. Write failing tests (RED):
   - PaperTradingBanner renders nothing when active is false
   - PaperTradingBanner renders banner with message when active is true
   - PaperTradingBanner includes strategyName in message when provided
   - PaperBadge renders span with "PAPER" text
   - PaperOrderCard renders dashed left border when isPaper is true
   - PaperOrderCard renders no border modification when isPaper is false
2. Implement `PaperTradingBanner` (GREEN)
3. Implement `PaperBadge` (GREEN)
4. Implement `PaperOrderCard` (GREEN)
5. Export from barrel, run validation (REFACTOR)

## Acceptance Criteria
- `PaperTradingBanner` with `active={false}` renders zero DOM nodes
- `PaperTradingBanner` with `active={true}` renders `[data-testid="paper-trading-banner"]`
- `[data-testid="paper-banner-message"]` contains "Paper Trading Active" text
- When `strategyName` provided, message contains the strategy name
- `PaperBadge` renders `[data-testid="paper-badge"]` with text "PAPER"
- `PaperOrderCard` with `isPaper={true}` applies dashed left border style

## Validation
```bash
bun test packages/ui/__tests__/paper-trading-badge.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- Wiring paper mode state from API to the banner (integration task)
- PaperBadge placement in order table rows (T-135 update)
- Paper trade P&L coloring (same as live — green/red)
- Switching out of paper mode from the banner
