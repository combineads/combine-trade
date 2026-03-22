# T-089 Retrospective prompt builder

## Goal
Build a structured prompt assembler that combines trade data, features, and macro context into a Korean-language LLM analysis prompt for trade retrospectives.

## Why
EP16 M5 — the retrospective worker needs a well-structured prompt that gives the LLM all relevant context (trade result, indicators, economic events, news) to generate meaningful retrospective analysis.

## Inputs
- `packages/core/macro/types.ts` (T-083 outputs: MacroContext)

## Dependencies
T-083

## Expected Outputs
- `buildRetrospectivePrompt(input)` function returning a structured prompt string
- `RetrospectivePromptInput` interface

## Deliverables
- `packages/core/macro/prompt-builder.ts`
- `packages/core/macro/__tests__/prompt-builder.test.ts`

## Constraints
- Prompt sections: strategy info, trade result, decision basis, technical indicators, MFE/MAE, economic events, news, analysis request
- Output language instruction: Korean (한국어)
- Must not import Drizzle/Elysia/CCXT
- Prompt must be a single string (no streaming)
- Max prompt length: reasonable for claude CLI input

## Steps
1. Define `RetrospectivePromptInput` interface with all trade/macro fields
2. Implement section builders for each prompt section
3. Implement `buildRetrospectivePrompt` that assembles all sections
4. Handle missing/optional data gracefully (omit sections if no data)
5. Write tests verifying prompt structure and content

## Acceptance Criteria
- Prompt contains all relevant sections when data is provided
- Missing optional data (e.g., no macro events) results in section omission, not errors
- Prompt requests Korean language output
- Prompt includes structured analysis request
- Output is a valid string suitable for `claude -p` input

## Validation
```bash
bun test packages/core/macro/__tests__/prompt-builder.test.ts
bun run typecheck
```

## Out of Scope
- LLM invocation (T-090)
- Decision prompt builder for M7 (separate task)
- Prompt optimization/tuning
