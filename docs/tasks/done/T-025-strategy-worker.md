# T-025 Build strategy evaluation worker

## Goal
Implement the strategy-worker that listens for candle_closed events, evaluates all active strategies in sandboxes, and emits strategy_event_created notifications.

## Why
EP02-M6 requires the pipeline: candle close → load active strategies → sandbox evaluation → event persistence → NOTIFY. This is the core execution loop of the strategy engine.

## Inputs
- `packages/core/strategy/sandbox.ts` — Sandbox runtime
- `packages/core/strategy/api.ts` — Strategy API
- `packages/core/strategy/event-types.ts` — StrategyEvent types
- `packages/shared/event-bus/` — Event bus infrastructure
- EP02 exec plan M6 specification

## Dependencies
- T-021 (sandbox runtime)
- T-022 (Strategy API)
- T-024 (strategy events schema)

## Expected Outputs
- `workers/strategy-worker/src/evaluator.ts` — Strategy evaluator
- `workers/strategy-worker/src/worker.ts` — Worker entry point
- `workers/strategy-worker/src/health.ts` — Health endpoint
- `workers/strategy-worker/package.json` — Workspace package

## Deliverables
- LISTEN candle_closed → load active strategies for symbol/timeframe
- Per-strategy sandbox execution with error isolation
- On event condition met: insert strategy_event + NOTIFY strategy_event_created
- Per-strategy error isolation: one strategy crash doesn't block others
- Health endpoint reporting: active strategies, last evaluation time, errors

## Constraints
- Each strategy evaluates independently — error in one doesn't affect others
- Use event bus subscriber for candle_closed channel
- Strategy evaluation must complete within 500ms per strategy
- Log but don't crash on individual strategy failures

## Steps
1. Create workers/strategy-worker package structure
2. Write failing tests for strategy evaluator
3. Implement StrategyEvaluator: load strategies, run in sandbox, collect results
4. Implement error isolation per strategy
5. Wire event bus: subscribe candle_closed, publish strategy_event_created
6. Add health endpoint
7. Integration test: candle close → strategy event generated

## Acceptance Criteria
- Candle closed event → all active strategies evaluated
- Strategy condition met → strategy_event inserted and NOTIFY sent
- One strategy throwing → other strategies still evaluated
- Error logged with strategy ID and error details
- Health endpoint returns evaluation status

## Validation
```bash
bun test --filter "strategy-worker"
bun run typecheck
bun run lint
```

## Out of Scope
- Parallel evaluation with isolate pool (optimization for later)
- Backtest integration (EP05)
- Kill switch integration (EP09)
