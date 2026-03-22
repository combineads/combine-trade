# T-092 Decision prompt builder for LLM 2-stage evaluation

## Goal
Build a prompt assembler for real-time LLM trade evaluation that combines kNN results, recent trade history, current features, and macro context.

## Why
EP16 M7 — when kNN produces a LONG/SHORT signal on ≥15min timeframes, the LLM needs a structured prompt with all relevant context to make a CONFIRM/PASS/REDUCE_SIZE decision.

## Inputs
- `packages/core/macro/types.ts` (T-083: MacroContext)

## Dependencies
T-083

## Expected Outputs
- `buildDecisionPrompt(input)` function returning structured prompt string
- `DecisionPromptInput` and `LlmDecision` interfaces

## Deliverables
- `packages/core/macro/decision-prompt-builder.ts`
- `packages/core/macro/__tests__/decision-prompt-builder.test.ts`

## Constraints
- Must not import Elysia/CCXT/Drizzle
- JSON output format enforced in prompt
- LlmDecision: { action: CONFIRM|PASS|REDUCE_SIZE, reason: string, confidence: number, risk_factors: string[] }

## Steps
1. Define DecisionPromptInput and LlmDecision interfaces
2. Build sections: kNN result, current features, recent trade history, current macro context, judgment request
3. Write tests verifying prompt structure

## Acceptance Criteria
- Prompt includes kNN results, features, trade history, macro context
- Prompt requests specific JSON output format
- Missing optional data handled gracefully

## Validation
```bash
bun test packages/core/macro/__tests__/decision-prompt-builder.test.ts
bun run typecheck
```

## Out of Scope
- LLM invocation (T-093)
- Worker implementation (T-094)
