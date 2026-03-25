# T-23-010 Integrate Logo into Sidebar & Login

## Goal
Use the `Logo` and `Lockup` components in the app sidebar header and login page for both web and desktop apps.

## Why
The sidebar and login screen are the highest-visibility surfaces. Adding the branded logo/lockup completes the visual identity integration.

## Inputs
- T-23-008 `Logo` component
- T-23-009 `Lockup` component
- `apps/web/src/components/layout/sidebar.tsx` (web sidebar)
- `apps/desktop/src/components/layout/sidebar.tsx` (desktop sidebar — if exists, or shared)
- `apps/web/src/app/[locale]/(auth)/login/page.tsx` (web login)
- `apps/desktop/src/app/(auth)/login/page.tsx` (desktop login)
- `packages/ui/src/views/auth/login-view.tsx` (shared login view)

## Dependencies
- T-23-008 (Logo component)
- T-23-009 (Lockup component)

## Expected Outputs
- Updated sidebar component(s) with Logo in header area
- Updated login view/page with Lockup above the form
- Both apps visually show branded logo

## Deliverables
- **Sidebar**: Add `<Logo size={28} />` + "Combine Trade" text (or just `<Logo />`) to the top of the sidebar, above the navigation sections
  - Web: `apps/web/src/components/layout/sidebar.tsx`
  - Desktop: `apps/desktop/src/components/layout/sidebar.tsx` (or shared sidebar)
- **Login**: Add `<Lockup size="lg" />` centered above the login form
  - Prefer updating `packages/ui/src/views/auth/login-view.tsx` if it's the shared view
  - Fallback: update individual login pages
- Ensure proper spacing and alignment with existing layouts

## Constraints
- Do not restructure existing layouts — add logo to existing containers
- Sidebar logo should be compact (icon + short text or icon only in collapsed state)
- Login lockup should be prominent but not overwhelming
- Must work in both dark and light themes

## Steps
1. RED: Write test that sidebar renders a Logo component; login view renders a Lockup component
2. GREEN: Import and place Logo/Lockup in sidebar and login view
3. Adjust spacing/alignment to fit existing layouts
4. REFACTOR: Ensure consistent appearance across web and desktop

## Acceptance Criteria
- Web sidebar shows Combine Trade logo at the top
- Desktop sidebar shows Combine Trade logo at the top
- Login page shows centered Lockup above the form
- No layout breaks in existing pages
- Both themes render correctly

## Validation
```bash
bun test --filter=sidebar
bun test --filter=login
bun run typecheck
bun run lint
bun run build
```

## Browser Verification
- http://localhost:3000/login → verify Lockup (icon + "Combine Trade") visible above login form
- http://localhost:3000/dashboard → verify Logo visible in sidebar header

## Out of Scope
- Sidebar collapse/expand logo behavior
- About dialog
- Footer branding
