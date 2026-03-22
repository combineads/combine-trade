# T-037 Label-decision integration test

## Goal
Write integration tests verifying the full flow: event labeling → statistics computation → decision engine judgment.

## Why
Validates that labels feed correctly into the statistics calculator and decision engine, ensuring the end-to-end pipeline produces correct trading decisions.

## Inputs
- T-035 labeler engine
- T-031 pattern statistics
- T-032 decision engine

## Dependencies
- T-035 (labeler)
- T-036 (label worker)

## Expected Outputs
- `tests/integration/label-decision.test.ts`

## Deliverables
- `tests/integration/label-decision.test.ts`

## Constraints
- Use fixture candle data for deterministic results
- Verify mathematical correctness of full chain

## Steps
1. Write integration tests:
   a. Label multiple events → compute stats → verify decision
   b. Gradually accumulate WIN labels → observe PASS→LONG transition
   c. Simultaneous TP/SL handling → verify LOSS label
   d. TIME_EXIT scenario → verify correct pnl calculation
   e. Decision confidence tiers change with sample accumulation
2. Run full project validation

## Acceptance Criteria
- Full chain produces mathematically correct results
- PASS → LONG/SHORT transition verified with accumulating labels
- Confidence tier progression: low → medium → high with increasing samples
- Simultaneous TP/SL correctly produces LOSS

## Validation
```bash
bun test tests/integration/label-decision.test.ts
bun test
bun run typecheck
bun run lint
```

## Out of Scope
- Real database integration
- Performance benchmarks
