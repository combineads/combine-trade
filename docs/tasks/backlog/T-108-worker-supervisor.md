# T-108 Implement worker process supervisor

## Goal
Build a process supervisor that starts all workers, monitors health, auto-restarts on crash, and handles graceful shutdown.

## Why
EP07 M1 — all individual workers exist but there's no orchestration to run them together as a system.

## Inputs
- Worker entry points: `workers/*/src/index.ts`
- SIGTERM/SIGINT signal handling

## Dependencies
- T-107 (execution worker handler — all workers should be functional)

## Expected Outputs
- `scripts/supervisor.ts` — starts all workers as child processes
- Auto-restart with exponential backoff (max 5 restarts, then give up)
- Graceful shutdown on SIGTERM: signal all workers → wait → exit
- Health check: track last heartbeat per worker

## Deliverables
- `packages/core/supervisor/supervisor.ts` (supervisor logic)
- `packages/core/supervisor/__tests__/supervisor.test.ts`
- `scripts/supervisor.ts` (entry point)

## Constraints
- Workers run as Bun.spawn() child processes
- Backoff: 1s, 2s, 4s, 8s, 16s then stop
- Restart counter resets after 60s of stable running
- SIGTERM → send SIGTERM to all workers → wait 10s → SIGKILL remaining → exit
- Log worker start/stop/crash events
- Pure functions for restart logic (testable without spawning processes)

## Steps
1. Write tests for restart logic (backoff calculation, counter reset, max restarts)
2. Implement WorkerSupervisor class with start/stop/restart methods
3. Implement graceful shutdown handler
4. Create scripts/supervisor.ts entry point
5. Test signal handling

## Acceptance Criteria
- All workers started concurrently
- Crashed worker auto-restarted with exponential backoff
- Max 5 restarts before giving up on a worker
- SIGTERM → graceful shutdown within 10s
- Worker crash does not affect other workers

## Validation
```bash
bun test packages/core/supervisor/__tests__/supervisor.test.ts
bun run typecheck
```

## Out of Scope
- Docker Compose (EP07-M4)
- Metrics collection
- Health check HTTP endpoint
