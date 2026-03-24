# T-08-006 Wire all API routes + SSE event stream

## Goal
Wire all implemented routes into the main Elysia app and add an SSE endpoint for real-time updates.

## Dependencies
- T-08-001, T-08-002, T-08-003, T-08-004, T-08-005, T-10-002

## Deliverables
- Updated `apps/api/src/index.ts` with all routes mounted
- `apps/api/src/routes/sse.ts` — SSE event stream endpoint
- `apps/api/__tests__/sse.test.ts`

## Validation
```bash
bun test apps/api/__tests__/sse.test.ts
bun run typecheck
```
