# T-02-006 Build V8 isolate sandbox runtime

## Goal
Implement the strategy sandbox runtime using `isolated-vm` for secure V8 isolate execution with resource limits.

## Why
EP02-M0/M3 require a secure execution environment for user-defined strategy code. V8 isolates provide heap-level isolation, memory limits, and execution timeouts.

## Inputs
- EP02 exec plan M0 and M3 specifications
- ARCHITECTURE.md — strategy sandbox security requirements
- SECURITY.md — sandbox escape prevention

## Dependencies
- T-02-004 (strategy types — for Strategy interface)

## Expected Outputs
- `packages/core/strategy/sandbox.ts` — Sandbox runtime class
- `packages/core/strategy/isolate-factory.ts` — V8 isolate factory with resource limits

## Deliverables
- Install `isolated-vm` package
- IsolateFactory: create V8 isolate with 128MB memory limit, 500ms timeout
- StrategySandbox: load strategy code, execute with candle data, return results
- Security boundary: no access to fs, net, http, process, require, import
- Resource violation errors: ERR_FATAL_SANDBOX_OOM, ERR_FATAL_SANDBOX_TIMEOUT
- Isolate lifecycle: create on activation, reuse between candle evaluations, destroy on deactivation

## Constraints
- Must use `isolated-vm` (NOT Bun worker threads — see decision log)
- Memory limit: 128MB per isolate
- Execution timeout: 500ms per evaluation
- No access to Node/Bun built-ins from within isolate
- One isolate crash must not affect other isolates

## Steps
1. Install `isolated-vm` in packages/core
2. Write failing tests: sandbox creation, code execution, timeout enforcement, memory limit
3. Implement IsolateFactory with resource limits
4. Implement StrategySandbox with code loading and execution
5. Test security boundary: verify fs/net/process inaccessible
6. Test error isolation: one crash doesn't affect others
7. Benchmark: isolate creation < 50ms, execution < 100ms for simple strategy

## Acceptance Criteria
- Strategy code executes in V8 isolate and returns results
- Infinite loop triggers timeout after 500ms with ERR_FATAL_SANDBOX_TIMEOUT
- Memory allocation > 128MB triggers ERR_FATAL_SANDBOX_OOM
- `require("fs")` from sandbox throws error
- `fetch()` from sandbox throws error
- Isolate creation < 50ms
- Strategy execution < 100ms for single candle evaluation

## Validation
```bash
bun test --filter "sandbox"
bun run typecheck
bun run lint
```

## Out of Scope
- Strategy API injection (T-02-007)
- Multi-timeframe data access (T-02-008)
- Strategy worker integration (T-02-010)
