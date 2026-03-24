# T-08-018 Implement Risk Management page

## Goal
Build the Risk Management page with kill switch controls, loss limit display, and position monitor.

## Why
EP08 M3 — Design Priority 4. Safety-critical UI for trading operations.

## Inputs
- `docs/DESIGN_SYSTEM.md` §5.9 (kill switch), §11 (risk management UI)
- Kill switch API routes
- Risk API hooks (T-08-013)

## Dependencies
- T-08-012 (base UI components)
- T-08-013 (API client hooks)

## Expected Outputs
- Kill Switch card (ON/OFF states per §5.9, keyboard shortcut Ctrl+Shift+K)
- Loss limit progress bars (green/amber/red per §11)
- Kill switch audit event log
- Confirmation dialog for activate/deactivate

## Deliverables
- `packages/ui/src/views/risk/risk-management-view.tsx`
- `packages/ui/src/views/risk/kill-switch-control.tsx`
- `packages/ui/src/views/risk/loss-limit-display.tsx`
- `packages/ui/src/views/risk/audit-log.tsx`
- `packages/ui/src/components/confirmation-dialog.tsx`
- `apps/web/src/app/risk/page.tsx`
- `packages/ui/__tests__/risk-management.test.tsx`

## Constraints
- Kill Switch UI matches DESIGN_SYSTEM.md §5.9 EXACTLY
- Must be accessible in 1 click (pinned in top bar also)
- Keyboard shortcut: Ctrl+Shift+K with confirmation
- Loss limit progress colors: 0-50% green, 50-80% amber, 80-100% red
- No toast notifications (banned per §10.1)
- Critical errors use persistent top red banner

## Steps
1. Write tests for risk components
2. Implement kill switch card (ON/OFF states)
3. Implement confirmation dialog
4. Implement loss limit progress bars
5. Implement audit event log
6. Wire API hooks for activate/deactivate
7. Add keyboard shortcut

## Acceptance Criteria
- Kill switch shows correct state
- Activate/deactivate with confirmation dialog
- Loss limit progress bars color-coded
- Audit log shows history
- Keyboard shortcut works

## Validation
```bash
bun test packages/ui/__tests__/risk-management.test.tsx
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- Position liquidation monitor (future)
- Position sync display
- Auto-trigger configuration UI
- Keyboard shortcut handler (hint displayed, event listener deferred)
- Confirmation dialog page-level wiring (component created, integration deferred)

## Implementation Notes
- Date: 2026-03-23
- Files changed:
  - `packages/ui/src/views/risk/loss-limit-display.tsx` (new)
  - `packages/ui/src/views/risk/audit-log.tsx` (new)
  - `packages/ui/src/views/risk/kill-switch-control.tsx` (new)
  - `packages/ui/src/views/risk/risk-management-view.tsx` (new)
  - `packages/ui/src/components/confirmation-dialog.tsx` (new)
  - `packages/ui/__tests__/risk-management.test.tsx` (new)
  - `packages/ui/src/index.ts` (updated)
  - `apps/web/src/app/(app)/risk/page.tsx` (updated)
- Tests written: 16 (LossLimitDisplay: 3, AuditLog: 3, ConfirmationDialog: 3, KillSwitchControl: 3, RiskManagementView: 4)
- Validation results: 16/16 tests pass, typecheck clean, Next.js build succeeds, 1257 total pass

## Outputs
- `RiskManagementView` component — full risk management page
- `KillSwitchControl` component — kill switch with Ctrl+Shift+K hint
- `LossLimitDisplay` component — progress bar with §11 thresholds
- `AuditLog` component — chronological audit events
- `ConfirmationDialog` component — reusable modal
- `RiskState` interface — risk page state type
