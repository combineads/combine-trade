# T-080 Wire all API routes + SSE event stream

## Goal
Wire all implemented routes into the main Elysia app and add an SSE endpoint for real-time updates.

## Dependencies
- T-073, T-074, T-075, T-076, T-077, T-079

## Deliverables
- Updated `apps/api/src/index.ts` with all routes mounted
- `apps/api/src/routes/sse.ts` — SSE event stream endpoint
- `apps/api/__tests__/sse.test.ts`

## Validation
```bash
bun test apps/api/__tests__/sse.test.ts
bun run typecheck
```
