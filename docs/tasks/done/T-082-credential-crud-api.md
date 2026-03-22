# T-082 Exchange credential CRUD API routes

## Goal
API endpoints for managing exchange credentials (encrypted at rest).

## Dependencies
- T-079, T-081

## Deliverables
- `apps/api/src/routes/credentials.ts`
- `apps/api/__tests__/credentials.test.ts`

## Validation
```bash
bun test apps/api/__tests__/credentials.test.ts
bun run typecheck
```
