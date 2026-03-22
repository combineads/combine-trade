# T-026 Strategy sandbox integration test

## Goal
Write an end-to-end integration test: strategy code → sandbox execution → event generation, validating the full EP02 pipeline.

## Why
Individual unit tests validate components in isolation. This integration test verifies the complete flow from strategy code to event output, catching integration issues between sandbox, API, and event persistence.

## Inputs
- All EP02 components: sandbox, API, evaluator, event model
- `tests/helpers/` — test infrastructure

## Dependencies
- T-025 (strategy worker — all EP02 components must be in place)

## Expected Outputs
- `tests/integration/strategy-sandbox.test.ts` — Integration test file

## Deliverables
- Test: define a simple SMA crossover strategy → provide candle data → execute in sandbox → verify features extracted and event generated
- Test: strategy with forbidden API call → verify rejection at validation and sandbox level
- Test: strategy exceeding timeout → verify ERR_FATAL_SANDBOX_TIMEOUT
- Test: multiple strategies, one crashes → verify others succeed

## Constraints
- Uses real sandbox (isolated-vm), not mocks
- Candle data from test fixtures (candle-generator)
- Does not require running PostgreSQL (mock repository for event storage)

## Steps
1. Write SMA crossover strategy fixture
2. Test: execute strategy → collect features → verify output shape
3. Test: forbidden API in sandbox → verify error
4. Test: timeout enforcement with infinite loop strategy
5. Test: error isolation with multiple strategies

## Acceptance Criteria
- SMA crossover strategy produces correct features
- Forbidden API access blocked in sandbox
- Timeout enforced for runaway strategies
- Error isolation works for concurrent strategies
- All assertions pass

## Validation
```bash
bun test --filter "strategy-sandbox"
bun run typecheck
bun run lint
```

## Out of Scope
- Database integration (uses mock repository)
- Event bus integration (uses mock publisher)
- Performance benchmarking
