# T-08-021 Settings page with theme, exchange, and general config

## Goal
Create `SettingsView` — a settings page with a theme toggle section (light/dark) and placeholder sections for general and exchange configuration. Wire it to `apps/web/src/app/(app)/settings/page.tsx`.

## Why
EP08 — Users need a place to control application preferences. Theme switching is the most immediately valuable setting (required for day/night trading contexts). The page also establishes the section-based layout used for future exchange credential management and notification settings.

## Inputs
- `docs/DESIGN_SYSTEM.md` §4.2 (dark/light theme toggle)
- `packages/ui/src/components/card.tsx` (from T-08-012)
- `packages/ui/src/components/button.tsx` (from T-08-012)
- `apps/web/src/app/layout.tsx` — ThemeProvider context (from T-08-010)

## Dependencies
- T-08-010 (packages/ui scaffold — ThemeProvider and useTheme hook)

## Expected Outputs
- `packages/ui/src/views/settings/settings-view.tsx`
- `apps/web/src/app/(app)/settings/page.tsx` (wired)
- `packages/ui/__tests__/settings-page.test.tsx`

## Deliverables

### 1. SettingsView component
```typescript
// packages/ui/src/views/settings/settings-view.tsx
interface SettingsViewProps {
  theme?: 'dark' | 'light';
  onThemeChange?: (theme: 'dark' | 'light') => void;
}

export function SettingsView({ theme = 'dark', onThemeChange }: SettingsViewProps)
```
- `data-testid="settings-view"` root element
- Renders a page heading: `<h1 data-testid="settings-heading">Settings</h1>`

### 2. Appearance section
- `data-testid="section-appearance"` wrapper with a section heading
- `ThemeToggle` sub-component:
  - Two buttons: "Dark" (`data-testid="theme-dark"`) and "Light" (`data-testid="theme-light"`)
  - Active theme button uses `primary` variant; inactive uses `secondary`
  - Clicking calls `onThemeChange` with the new value
  - Current active theme reflected by button style

### 3. General section (placeholder)
- `data-testid="section-general"` wrapper
- Section heading "General"
- Placeholder text: "General settings coming soon."

### 4. Exchange section (placeholder)
- `data-testid="section-exchange"` wrapper
- Section heading "Exchange"
- Placeholder text: "Exchange configuration managed in Credentials."

### 5. apps/web page wiring
```typescript
// apps/web/src/app/(app)/settings/page.tsx
"use client";
import { SettingsView } from "@combine/ui";
import { useTheme } from "@combine/ui";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  return <SettingsView theme={theme} onThemeChange={setTheme} />;
}
```
- Uses `useTheme` hook from the ThemeProvider context

### 6. Barrel export
- Export `SettingsView` from `packages/ui/src/views/settings/index.ts`
- Add to `packages/ui/src/index.ts`

## Constraints
- `SettingsView` accepts `theme` and `onThemeChange` as props — does not call `useTheme` internally (keeps the component testable without ThemeProvider)
- The `apps/web` page wraps `SettingsView` and injects theme props from `useTheme`
- Use CSS custom properties for all styling — no hardcoded colors
- No form library required — the theme toggle is simple button state

## Steps
1. Write failing tests (RED):
   - SettingsView renders settings heading
   - SettingsView renders appearance section with theme toggle buttons
   - SettingsView renders general and exchange placeholder sections
   - Clicking "Light" button calls onThemeChange with "light"
   - Active theme button has primary style
2. Implement `SettingsView` layout with all sections (GREEN)
3. Implement theme toggle button logic (GREEN)
4. Wire `apps/web` settings page with `useTheme` (GREEN)
5. Run validation (REFACTOR)

## Acceptance Criteria
- `[data-testid="settings-heading"]` renders with text "Settings"
- `[data-testid="section-appearance"]` renders with "Dark" and "Light" buttons
- Clicking a theme button calls `onThemeChange` with the correct value
- `[data-testid="section-general"]` and `[data-testid="section-exchange"]` render
- `bun run build` in `apps/web` succeeds with the wired page

## Validation
```bash
bun test packages/ui/__tests__/settings-page.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- Credential management UI (separate task)
- Notification settings
- Timezone / locale settings
- User profile / password change
