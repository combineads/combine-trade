# T-08-023 Persistent notification banner component

## Goal
Create `NotificationBanner` — a persistent top-of-page banner for critical system states such as kill switch activation. Per `DESIGN_SYSTEM.md` §10.1, critical notifications never auto-dismiss and are always red top banners, never toast notifications.

## Why
The kill switch is a safety-critical feature. When it is active, every page must display a persistent warning so the trader is never unaware of the halted trading state. A dismissible toast would violate this requirement. The `NotificationBanner` is the single source of this persistent indicator across all pages.

## Inputs
- `docs/DESIGN_SYSTEM.md` §10.1 (notification system: critical = persistent red top banner)
- `docs/DESIGN_SYSTEM.md` §4.1 (color tokens: `--color-danger`, `--color-text-on-danger`)
- `packages/ui/src/components/button.tsx` (from T-08-012) — for optional dismiss button on non-critical variants

## Dependencies
- T-08-012 (base UI components — design tokens, button)

## Expected Outputs
- `packages/ui/src/components/notification-banner.tsx`
- `packages/ui/__tests__/notification-banner.test.tsx`

## Deliverables

### 1. NotificationBanner component
```typescript
// packages/ui/src/components/notification-banner.tsx
export type BannerVariant = 'critical' | 'warning' | 'info';

interface NotificationBannerProps {
  active: boolean;
  variant?: BannerVariant;    // default: 'critical'
  message: string;
  actionLabel?: string;       // optional action button label
  onAction?: () => void;      // optional action callback
}

export function NotificationBanner({
  active,
  variant = 'critical',
  message,
  actionLabel,
  onAction,
}: NotificationBannerProps)
```

### 2. Rendering rules
- When `active` is false → renders nothing (returns null) — no DOM node
- When `active` is true → renders `div[data-testid="notification-banner"]`
  - `data-variant="{variant}"` attribute on the banner element
- `critical` variant:
  - Background: `--color-danger`, Text: `--color-text-on-danger` (white)
  - No dismiss button — banner cannot be closed by user
  - Full viewport width, fixed position at top (z-index: 9999)
- `warning` variant:
  - Background: `--color-warning`, contrasting text
  - No dismiss button
- `info` variant:
  - Background: `--color-info`, contrasting text
  - Optional dismiss button if `onAction` provided
- Message text rendered in `span[data-testid="banner-message"]`
- Action button (when provided): `button[data-testid="banner-action"]` with `actionLabel` text

### 3. KillSwitchBanner convenience export
```typescript
export function KillSwitchBanner({ active }: { active: boolean }) {
  return (
    <NotificationBanner
      active={active}
      variant="critical"
      message="Kill Switch Active — All trading is halted"
    />
  );
}
```
- Pre-configured for the kill switch use case
- `data-testid="kill-switch-banner"` on the root element (override via the NotificationBanner's testid)

### 4. Index export
- Export `NotificationBanner`, `KillSwitchBanner`, `BannerVariant` from `packages/ui/src/index.ts`

## Constraints
- Per DESIGN_SYSTEM.md §10.1: critical banners NEVER auto-dismiss — no timeout, no close button
- No animation on the banner (no slide-in/fade-in) — immediate render for critical states
- Full viewport width, `position: fixed`, `top: 0`, `z-index: 9999` for the active critical banner
- When `active` is false, the component must render absolutely no DOM nodes (not hidden, not invisible)
- CSS custom properties only — no hardcoded hex colors

## Steps
1. Write failing tests (RED):
   - NotificationBanner renders nothing when active is false
   - NotificationBanner renders banner element when active is true
   - Critical variant has data-variant="critical"
   - Banner message text is rendered in span[data-testid="banner-message"]
   - Action button renders when actionLabel and onAction are provided
   - KillSwitchBanner renders red banner when active
2. Implement `NotificationBanner` with variant logic (GREEN)
3. Implement `KillSwitchBanner` convenience wrapper (GREEN)
4. Export from barrel (GREEN)
5. Run validation (REFACTOR)

## Acceptance Criteria
- `NotificationBanner` with `active={false}` renders zero DOM nodes
- `NotificationBanner` with `active={true}` renders `[data-testid="notification-banner"]`
- `[data-variant="critical"]` is set on the banner element for the critical variant
- `[data-testid="banner-message"]` contains the message text
- `KillSwitchBanner` with `active={true}` renders a visible critical banner
- `KillSwitchBanner` with `active={false}` renders nothing

## Validation
```bash
bun test packages/ui/__tests__/notification-banner.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- Stacking multiple banners (only one banner at a time)
- Banner animation
- PaperTradingBanner (T-08-027 — separate amber banner variant)
- TopBar integration (T-08-024 — depends on this task)
