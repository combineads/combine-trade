# T-020 Implement strategy code validation

## Goal
Implement pre-save validation for strategy TypeScript code: syntax parsing, forbidden API detection, and Strategy API type compatibility.

## Why
EP02-M2 requires code validation before strategy persistence. Invalid or dangerous code must be rejected before reaching the sandbox runtime.

## Inputs
- `packages/core/strategy/types.ts` — Strategy types from T-019
- EP02 exec plan M2 specification (TypeScript parsing, forbidden API detection)

## Dependencies
- T-019 (strategies schema and CRUD — must exist for integration)

## Expected Outputs
- `packages/core/strategy/validation.ts` — Code validation functions
- `packages/core/strategy/service.ts` — Updated to call validation on create/update

## Deliverables
- `validateStrategyCode(code: string)` — Returns validation result with errors
- Syntax validation: parse TypeScript, report syntax errors
- Forbidden API detection: reject code using eval, import, require, fetch, fs, net, http, child_process, process, global, globalThis, Deno, Bun
- Strategy API compatibility: check for defineFeature usage
- Integration with StrategyCrudService: validate before create/update

## Constraints
- Use TypeScript compiler API or a lightweight parser (e.g., `typescript` package parseSourceFile)
- No execution of the code during validation — static analysis only
- Return all validation errors, not just the first one

## Steps
1. Write failing tests: valid code passes, syntax error rejected, forbidden APIs rejected
2. Implement syntax validation using TypeScript parser
3. Implement forbidden API static analysis (AST walk)
4. Implement defineFeature usage check
5. Wire validation into StrategyCrudService
6. Test edge cases: empty code, minified code, comments containing forbidden words

## Acceptance Criteria
- Valid strategy code passes all checks
- `eval("malicious")` detected and rejected
- `import fs from "fs"` detected and rejected
- `require("child_process")` detected and rejected
- `fetch("http://evil.com")` detected and rejected
- Code with syntax errors returns clear error message
- Code without defineFeature warns (not hard reject — features[] in metadata is the requirement)
- Comments containing forbidden words are NOT flagged (only actual code usage)

## Validation
```bash
bun test --filter "strategy-model|strategy-crud|strategy-valid"
bun run typecheck
bun run lint
```

## Out of Scope
- Runtime sandbox enforcement (T-021)
- Strategy activation workflow
