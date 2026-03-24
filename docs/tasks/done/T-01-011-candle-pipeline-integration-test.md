# T-01-011 Candle Pipeline Integration Test

## Goal
Write end-to-end integration tests for the candle pipeline in `packages/candle/__tests__/pipeline-integration.test.ts`.

## Steps
1. Create the test file (RED — no pipeline orchestrator exists yet, test against the module API)
2. All tests must pass using the existing validation + repository interface

## Spec
- Test flow: mock WS message → parse candle → validate continuity → upsert → NOTIFY
- Use mock `CandleRepository` and a mock notify function
- Verify: candle continuity check, upsert called, closed candle triggers notification
- At least 5 integration test cases

## Constraints
- Tests must live in `packages/candle/__tests__/pipeline-integration.test.ts`
- No real DB or network connections
- Use bun:test only
