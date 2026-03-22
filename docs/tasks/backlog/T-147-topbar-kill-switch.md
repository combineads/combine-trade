# T-147 Top bar kill switch indicator

## Goal
Update the existing `TopBar` component in `packages/ui/src/components/top-bar.tsx` to include a kill switch status indicator: a red dot icon and "Kill Switch Active" label that appears when the kill switch is engaged, and is hidden when inactive.

## Why
EP08 — The kill switch state must be visible in the persistent top navigation bar so that operators are always aware of the system's safety state, regardless of which page they are on. The `NotificationBanner` (T-146) handles page-level alerting; the `TopBar` indicator provides a compact persistent indicator within the navigation chrome.

## Inputs
- `packages/ui/src/components/top-bar.tsx` — existing TopBar component (from T-128/T-129)
- `packages/ui/src/components/notification-banner.tsx` — KillSwitchBanner (from T-146)
- `docs/DESIGN_SYSTEM.md` §5.4 (card kill-switch state: `--color-danger` red)
- `docs/DESIGN_SYSTEM.md` §3.1 (top bar layout)

## Dependencies
- T-146 (NotificationBanner — establishes kill switch visual vocabulary)

## Expected Outputs
- `packages/ui/src/components/top-bar.tsx` (updated)
- `packages/ui/__tests__/topbar-kill-switch.test.tsx`

## Deliverables

### 1. TopBar prop extension
Add `killSwitchActive` prop to existing TopBar:
```typescript
interface TopBarProps {
  // ... existing props preserved
  killSwitchActive?: boolean;   // default: false
}
```

### 2. Kill switch indicator element
When `killSwitchActive` is true:
- Renders `div[data-testid="kill-switch-indicator"]` in the TopBar right section
- Contains:
  - `span[data-testid="kill-switch-dot"]` — red circle (8px, `--color-danger` background, `border-radius: 50%`)
  - `span[data-testid="kill-switch-label"]` — text "Kill Switch Active"
  - Text color: `--color-danger`
  - Font weight: semibold

When `killSwitchActive` is false (or undefined):
- `[data-testid="kill-switch-indicator"]` is NOT rendered (no hidden/invisible element)

### 3. Existing TopBar structure preserved
- All existing props and rendered elements must continue working
- Indicator placed in the right side of the top bar, before any existing right-side controls
- No breaking changes to the TopBar component API

## Constraints
- Do not remove or change any existing TopBar props or testids
- The indicator element must not render at all when `killSwitchActive` is false — no visibility: hidden
- Use CSS custom properties — no hardcoded colors
- The red dot must be visually distinct even in dark mode (use `--color-danger` which has sufficient contrast in both themes)
- No click handler on the indicator — it is read-only status display

## Steps
1. Read existing `top-bar.tsx` to understand current structure and props
2. Write failing tests (RED):
   - TopBar renders kill-switch-indicator when killSwitchActive is true
   - TopBar does NOT render kill-switch-indicator when killSwitchActive is false
   - kill-switch-label contains text "Kill Switch Active"
   - Existing TopBar functionality still passes
3. Add `killSwitchActive` prop to TopBar type (GREEN)
4. Implement indicator rendering (GREEN)
5. Run full test suite to confirm no regressions (REFACTOR)

## Acceptance Criteria
- `TopBar` with `killSwitchActive={true}` renders `[data-testid="kill-switch-indicator"]`
- `[data-testid="kill-switch-dot"]` and `[data-testid="kill-switch-label"]` are present when active
- `[data-testid="kill-switch-label"]` contains text "Kill Switch Active"
- `TopBar` with `killSwitchActive={false}` renders no `[data-testid="kill-switch-indicator"]`
- All previously passing TopBar tests continue to pass

## Validation
```bash
bun test packages/ui/__tests__/topbar-kill-switch.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- Wiring kill switch API state to the TopBar in apps/web (integration task)
- Click-to-disable kill switch from the TopBar
- Kill switch history or audit trail
- Animated pulse effect on the red dot
