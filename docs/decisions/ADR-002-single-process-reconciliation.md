# ADR-002: Reconciliation in Same Process

## Date
2026-04-03

## Status
Accepted (with mitigations)

## Context
The critic review recommended running the reconciliation worker as a separate process, arguing it cannot monitor the system if it dies alongside it. This is a valid concern for a financial system.

However, the PRD mandates a single Bun process for operational simplicity (single operator, KISS principle). A separate process adds: deployment complexity, IPC coordination, potential state split, and doubles the exchange API connections.

## Decision
Keep reconciliation in the same process. Accept the shared-failure-domain tradeoff with these mitigations:

1. **SL always on exchange**: The primary safety net. Even if the entire daemon dies, open positions have stop-losses registered on the exchange. This is the #1 reliability invariant.
2. **systemd/pm2 auto-restart**: Process death → restart within seconds → crash recovery runs immediately.
3. **Kill switch as separate script**: `scripts/kill-switch.ts` runs independently, can flatten all positions even if daemon is down.
4. **Health check endpoint**: External monitoring can detect daemon death and alert.
5. **Slack on mismatch**: Any reconciliation drift triggers an alert.

## Consequences
- Positive: Single process to deploy, monitor, and reason about
- Positive: No IPC complexity, no state synchronization
- Negative: If daemon hangs (not crashes), reconciliation also hangs — positions rely solely on exchange-side SL
- Negative: No independent watchdog for open positions during daemon downtime
- Mitigation: Daemon crash triggers auto-restart + crash recovery. For hangs: health check timeout → external restart.
