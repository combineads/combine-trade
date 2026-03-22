# T-126 Implement kill switch auto-trigger evaluator

## Goal
Build an evaluator that checks the 12 auto-trigger conditions and activates the kill switch when conditions are met.

## Why
EP09 M1 — manual kill switch exists, but automated triggers are needed to protect against sudden losses, infrastructure failures, sandbox crashes, and data integrity issues.

## Inputs
- `packages/core/risk/kill-switch.ts` (activate function)
- `docs/exec-plans/09-risk-management.md` M1 (12 trigger conditions in 4 categories)
- T-118 (kill switch DB service)

## Dependencies
- T-118 (kill switch DB service)

## Expected Outputs
- `KillSwitchTriggerEvaluator` class with per-category evaluation
- Financial triggers: instant, no grace
- Infrastructure triggers: grace period, position-check
- Sandbox triggers: instant, per-strategy
- Data integrity triggers: instant, position-check

## Deliverables
- `packages/core/risk/kill-switch-triggers.ts`
- `packages/core/risk/__tests__/kill-switch-triggers.test.ts`

## Constraints
- Pure evaluation functions — no side effects beyond calling activate()
- Each trigger returns { shouldActivate: boolean, scope, scopeTarget, reason }
- Financial: daily loss breach, balance deviation >5%, untracked position, 3x order rejection
- Infrastructure: exchange API 30s, DB 15s, worker 60s unresponsive (with grace period)
- Sandbox: OOM >128MB, timeout >500ms, 3x consecutive crash
- Data integrity: candle gap >=3, vector search timeout 3x
- All trigger checks are pure functions taking current state as input

## Steps
1. Write tests for each trigger category (financial, infrastructure, sandbox, data integrity)
2. Implement trigger evaluation functions
3. Implement KillSwitchTriggerEvaluator that runs all checks
4. Wire to activate() on trigger

## Acceptance Criteria
- Each of 12 conditions correctly evaluated
- Financial triggers activate immediately
- Infrastructure triggers respect grace period
- Sandbox triggers are per-strategy scoped
- No false positives on edge cases

## Validation
```bash
bun test packages/core/risk/__tests__/kill-switch-triggers.test.ts
bun run typecheck
```

## Out of Scope
- Scheduling the evaluator (worker responsibility)
- Slack notification
- UI for trigger status

## Implementation Plan
- 4 pure evaluation functions, one per trigger category
- Each takes a state snapshot and returns TriggerResult[]
- No class needed — functions are simpler and more testable

## Implementation Notes
- Date: 2026-03-22
- Files changed: `packages/core/risk/kill-switch-triggers.ts` (new), `packages/core/risk/__tests__/kill-switch-triggers.test.ts` (new)
- Tests: 17 tests across 4 describe blocks covering all 12 trigger conditions + edge cases
- Approach: Pure functions per category rather than a class — simpler, more composable
- Validation: 17/17 pass, typecheck clean, full suite 1137 pass

## Outputs
- `evaluateFinancialTriggers(state)` — 4 trigger checks (daily loss, balance deviation, untracked, rejections)
- `evaluateInfrastructureTriggers(state)` — 3 trigger checks (exchange, DB, worker) with position-check guard
- `evaluateSandboxTriggers(state)` — 3 trigger checks (OOM, timeout, crashes) per-strategy scoped
- `evaluateDataIntegrityTriggers(state)` — 2 trigger checks (candle gap, vector timeout)
- Types: `TriggerResult`, `FinancialState`, `InfrastructureState`, `SandboxState`, `DataIntegrityState`
