# T-180 Repository user isolation

## Goal
Add a `userId: string` parameter to all query methods in `StrategyRepository` (interface + concrete implementation), `OrderRepository`, `KillSwitchRepository`, and `DailyLossLimitRepository`. Every DB query that reads or writes user-owned records must include a `WHERE user_id = $userId` filter.

## Why
Adding `user_id` columns to the DB schema (T-179) is necessary but not sufficient — the application layer must also enforce isolation. Without explicit `userId` filtering in repository methods, any route handler could accidentally return all users' data. Repository-level filtering is the correct place to enforce this: it is closest to the DB and cannot be bypassed by callers.

The epic decision log specifies that cross-user access must return 404 (not 403) to avoid revealing the existence of resources owned by other users.

## Inputs
- `packages/core/strategy/repository.ts` — `StrategyRepository` interface to update
- Worker-layer concrete implementation of `StrategyRepository` (Drizzle-based)
- `db/schema/strategies.ts`, `db/schema/orders.ts`, `db/schema/kill-switch.ts`, `db/schema/daily-loss-limits.ts` — updated schemas from T-179 (contain `userId` column)
- `docs/exec-plans/18-better-auth-multiuser.md` § M4 — method signature patterns and 404-for-cross-user-access rule
- `apps/api/src/routes/kill-switch.ts`, `apps/api/src/routes/orders.ts` — route dependency interfaces to update

## Dependencies
- T-179 (DB schema must have `user_id` columns before repository queries can filter on them)

## Expected Outputs
- `packages/core/strategy/repository.ts` — `StrategyRepository` interface updated with `userId` parameter on all methods
- Concrete Drizzle implementations of all four repositories — all queries include `WHERE user_id = $userId`
- Updated route dependency interfaces (`KillSwitchRouteDeps`, `OrderRouteDeps`, etc.) to thread `userId` through
- Unit tests verifying user isolation at the repository level (mock DB / in-memory)

## Deliverables

### Updated `StrategyRepository` interface
```typescript
export interface StrategyRepository {
  create(input: CreateStrategyInput, userId: string): Promise<Strategy>;
  findById(id: string, userId: string): Promise<Strategy | null>;
  findByNameAndVersion(name: string, version: number, userId: string): Promise<Strategy | null>;
  findActive(userId: string): Promise<Strategy[]>;
  findAll(userId: string): Promise<Strategy[]>;
  update(id: string, input: UpdateStrategyInput, userId: string): Promise<Strategy>;
  softDelete(id: string, userId: string): Promise<void>;
  createNewVersion(id: string, input: UpdateStrategyInput, userId: string): Promise<Strategy>;
}
```

### Query pattern for all read methods
```typescript
// findById — returns null (not 404) when record belongs to different user; route layer converts null → 404
const result = await db
  .select()
  .from(strategies)
  .where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
  .limit(1);
return result[0] ?? null;
```

### Query pattern for create
```typescript
const [row] = await db
  .insert(strategies)
  .values({ ...input, userId })
  .returning();
return row;
```

### Query pattern for update/delete (ownership check)
```typescript
// Update: only affects rows owned by userId
const [row] = await db
  .update(strategies)
  .set({ ...input, updatedAt: new Date() })
  .where(and(eq(strategies.id, id), eq(strategies.userId, userId)))
  .returning();
if (!row) return null; // caller throws 404
return row;
```

### Repositories to update
1. `StrategyRepository` (interface in `packages/core/`, implementation in workers layer)
2. `OrderRepository` — `findAll(userId)`, `findById(id, userId)`, `create(input, userId)`
3. `KillSwitchRepository` — `activate(..., userId)`, `deactivate(id, userId)`, `getActiveStates(userId)`, `getAuditEvents(page, pageSize, userId)`
4. `DailyLossLimitRepository` — all read/write methods with `userId`

## Constraints
- Repository methods return `null` for not-found-or-wrong-user — the route layer is responsible for converting `null` → 404 HTTP response
- Do NOT return 403; returning `null` (which the route converts to 404) prevents existence disclosure
- `packages/core` must only contain the interface update — the concrete Drizzle implementation lives in the workers layer
- All existing repository unit tests must be updated to pass `userId` arguments
- Do not skip the `userId` filter on any read operation — even `findAll` must be scoped

## Steps
1. Write failing tests: call repository methods without `userId` filter and assert they fail type-check or return wrong-user data (RED)
2. Update `StrategyRepository` interface in `packages/core/strategy/repository.ts`
3. Update all concrete `StrategyRepository` method implementations to include `AND user_id = $userId`
4. Update `OrderRepository`, `KillSwitchRepository`, `DailyLossLimitRepository` interfaces and implementations
5. Update all callers of these repository methods (route dependency interfaces) to accept and pass `userId`
6. Update existing unit tests to supply a `userId` argument (GREEN)
7. Add new unit tests: confirm that querying with a different `userId` returns `null` / empty array (REFACTOR)
8. Run `bun run typecheck` — zero errors

## Acceptance Criteria
- All repository interface methods have a `userId: string` parameter
- Concrete implementations include `WHERE user_id = $userId` in every relevant query
- `findById(id, wrongUserId)` returns `null`
- `findAll(userId)` returns only the calling user's records
- `create(input, userId)` stores `userId` on the new record
- `update(id, input, wrongUserId)` returns `null`
- `softDelete(id, wrongUserId)` is a no-op (returns without error, deletes nothing)
- `bun run typecheck` passes
- Unit tests for isolation behavior pass

## Validation
```bash
bun run typecheck
bun test --filter "repository|user-isolation|strategy-repo|kill-switch-repo"
```

## Out of Scope
- Extracting `userId` from the HTTP session in route handlers — T-181
- DB schema changes — T-179
- SSE authentication — T-183
