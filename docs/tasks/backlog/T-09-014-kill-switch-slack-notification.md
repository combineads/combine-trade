# T-09-014 Kill switch Slack notification

## Goal
Send a formatted Slack notification on every kill switch activation and deactivation, including trigger type, scope, affected positions, and activation time.

## Why
EP09 M1 — operators must be immediately alerted when trading is halted. Without Slack notification, a kill switch activation could go unnoticed for an extended period, delaying incident response and recovery.

## Inputs
- `docs/exec-plans/09-risk-management.md` M1 (Slack notification requirement)
- `packages/core/risk/kill-switch.ts` (KillSwitchState, KillSwitchScope, KillSwitchTrigger)
- `packages/core/risk/kill-switch-audit.ts` (KillSwitchAuditEvent — T-09-013)
- T-06-007 (Slack webhook client — existing SlackClient or equivalent)

## Dependencies
- T-09-001 (kill switch state machine)
- T-09-013 (kill switch audit table — provides KillSwitchAuditEvent with positions snapshot)
- T-06-007 (Slack webhook client)

## Expected Outputs
- `packages/core/risk/kill-switch-notifier.ts`
  - `KillSwitchNotifierDeps` interface:
    ```ts
    interface KillSwitchNotifierDeps {
      sendSlackMessage(blocks: SlackBlock[]): Promise<void>;
    }
    ```
  - `buildActivationMessage(event: KillSwitchAuditEvent): SlackBlock[]` — pure function producing Slack block kit payload with: trigger type, trigger reason, scope (+ scopeTarget if set), open positions count from snapshot, activation timestamp
  - `buildDeactivationMessage(event: KillSwitchAuditEvent): SlackBlock[]` — pure function producing deactivation notification with: who deactivated, how long it was active (duration), scope
  - `KillSwitchNotifier` class:
    - Constructor takes `KillSwitchNotifierDeps`
    - `notifyActivation(event: KillSwitchAuditEvent): Promise<void>`
    - `notifyDeactivation(event: KillSwitchAuditEvent): Promise<void>`
    - Errors from `sendSlackMessage` are caught and logged (never throw — notification failure must not block trading logic)
- `packages/core/risk/__tests__/kill-switch-notifier.test.ts`

## Deliverables
- `packages/core/risk/kill-switch-notifier.ts`
- `packages/core/risk/__tests__/kill-switch-notifier.test.ts`

## Constraints
- `packages/core/risk/kill-switch-notifier.ts` must not import CCXT, Drizzle, Elysia, or actual Slack SDK
- `SlackBlock` type must be a minimal local interface (no external Slack SDK import in core)
- `buildActivationMessage` and `buildDeactivationMessage` are pure functions — no side effects, no async
- Notification failure must never throw or propagate to the caller — catch and log only
- All tests use `bun:test`; mock deps are plain inline objects

## Steps
1. Define `SlackBlock` minimal interface in `kill-switch-notifier.ts`
2. Write failing tests (RED):
   - `buildActivationMessage` includes trigger type in output blocks
   - `buildActivationMessage` includes scope and scopeTarget when present
   - `buildActivationMessage` includes positions count from snapshot
   - `buildActivationMessage` includes activation timestamp formatted as ISO string
   - `buildDeactivationMessage` includes deactivatedBy field
   - `buildDeactivationMessage` includes duration when both activatedAt and deactivatedAt are set
   - `notifyActivation` calls `deps.sendSlackMessage` exactly once
   - `notifyDeactivation` calls `deps.sendSlackMessage` exactly once
   - `notifyActivation` does not throw when `sendSlackMessage` rejects
   - `notifyDeactivation` does not throw when `sendSlackMessage` rejects
3. Implement `kill-switch-notifier.ts` (GREEN)
4. Refactor: add JSDoc to all exported symbols

## Acceptance Criteria
- `buildActivationMessage` includes trigger type, reason, scope, position count, and activation time
- `buildDeactivationMessage` includes deactivated-by and active duration
- Notification errors are swallowed — never propagate to caller
- `notifyActivation` and `notifyDeactivation` each call `sendSlackMessage` exactly once
- All tests pass, zero TypeScript errors

## Validation
```bash
bun test --filter "kill-switch-slack" && bun run typecheck
```

## Out of Scope
- Scheduling or debouncing repeated notifications
- Slack interactive buttons or acknowledgment flows
- Email or PagerDuty notification
- Wiring the notifier into the worker pipeline (worker concern)
