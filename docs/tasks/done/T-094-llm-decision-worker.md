# T-094 LLM decision worker

## Goal
Implement a worker that receives kNN LONG/SHORT decisions for LLM-enabled strategies, evaluates them through LLM, and publishes final decisions.

## Why
EP16 M7 — this worker is the runtime component that orchestrates the 2-stage decision pipeline: receive kNN signal → gather context → LLM evaluate → publish final decision.

## Inputs
- `packages/core/macro/decision-prompt-builder.ts` (T-092: buildDecisionPrompt)
- `packages/core/macro/llm-evaluator.ts` (T-093: evaluateWithLlm)

## Dependencies
T-092, T-093

## Expected Outputs
- `LlmDecisionWorker` class with `processDecision(decisionId)` method
- `LlmDecisionWorkerDeps` interface

## Deliverables
- `workers/llm-decision-worker/src/index.ts`
- `workers/llm-decision-worker/__tests__/llm-decision-worker.test.ts`
- `workers/llm-decision-worker/package.json`
- `workers/llm-decision-worker/tsconfig.json`

## Constraints
- CONFIRM → direction preserved
- PASS → direction changed to PASS
- REDUCE_SIZE → direction preserved + size_modifier=0.5
- Results stored in decisions table (llm_action, llm_reason, llm_confidence, llm_risk_factors, llm_evaluated_at)
- kNN PASS decisions must never reach this worker
- LLM must never promote PASS to LONG/SHORT (safety invariant)

## Steps
1. Define LlmDecisionRepository interface
2. Implement processDecision: fetch kNN result + context → build prompt → evaluate → update decision → publish
3. Handle CONFIRM/PASS/REDUCE_SIZE outcomes
4. Write tests with mocked dependencies

## Acceptance Criteria
- CONFIRM preserves original direction
- PASS overrides direction to PASS
- REDUCE_SIZE preserves direction with size_modifier
- All LLM results persisted to decisions table
- LLM failure defaults to CONFIRM

## Validation
```bash
bun test workers/llm-decision-worker/__tests__/llm-decision-worker.test.ts
bun run typecheck
```

## Out of Scope
- vector-worker branching logic
- strategies/decisions schema migrations
- Event bus channel setup
