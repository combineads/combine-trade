# T-093 LLM evaluator with claude CLI

## Goal
Implement LLM invocation wrapper that runs `claude -p` subprocess, parses JSON output, and handles all failure modes with CONFIRM fallback.

## Why
EP16 M7 — the evaluator bridges the prompt builder and the decision worker, handling subprocess execution, timeout, and output parsing.

## Inputs
- `packages/core/macro/decision-prompt-builder.ts` (T-092: LlmDecision type)

## Dependencies
T-092

## Expected Outputs
- `evaluateWithLlm(prompt, deps)` function returning `LlmDecision`
- `LlmEvaluatorDeps` interface with spawn runner

## Deliverables
- `packages/core/macro/llm-evaluator.ts`
- `packages/core/macro/__tests__/llm-evaluator.test.ts`

## Constraints
- Default action on any failure: CONFIRM (preserve kNN decision)
- Timeout: 60 seconds
- JSON parse failure → CONFIRM + warning log
- CLI not found → CONFIRM + warning log
- Must not import Elysia/CCXT/Drizzle

## Steps
1. Implement evaluateWithLlm with injected spawn runner
2. Parse stdout as JSON, validate against LlmDecision schema
3. Handle all failure modes: timeout, bad JSON, empty output, CLI missing
4. Write tests with mock spawn

## Acceptance Criteria
- Valid JSON output → parsed LlmDecision returned
- Invalid JSON → CONFIRM fallback
- Spawn failure → CONFIRM fallback
- Empty output → CONFIRM fallback

## Validation
```bash
bun test packages/core/macro/__tests__/llm-evaluator.test.ts
bun run typecheck
```

## Out of Scope
- Actual claude CLI execution
- Worker integration (T-094)
