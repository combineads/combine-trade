# T-10-011 Master key rotation integration test

## Goal
Integration test suite verifying master key rotation with zero data loss across all failure scenarios.

## Why
Key rotation is a critical security operation. A defect that silently drops or corrupts credentials is irreversible. This task adds comprehensive integration coverage that cannot be provided by the unit tests in T-10-010.

## Inputs
- `packages/shared/cli/rotate-master-key.ts` — rotation CLI (T-10-010)
- `packages/shared/auth/encryption.ts` — encrypt/decrypt primitives (T-10-009)
- `db/schema/exchange-credentials.ts` — credentials schema

## Dependencies
- T-10-010 (master key rotation CLI)

## Expected Outputs
- `packages/shared/cli/__tests__/rotate-master-key.integration.test.ts`
- All scenarios listed below pass against a real (in-process) SQLite or test-Postgres DB

## Deliverables
- `packages/shared/cli/__tests__/rotate-master-key.integration.test.ts`

## Constraints
- Tests must use a dedicated test database (never the dev/prod DB)
- Each test case seeds its own credential rows and tears them down after
- No mocking of the crypto layer — use real AES-256-GCM operations
- Tests must be deterministic and order-independent

## Steps
1. Write tests (RED → GREEN cycle driven by T-10-010 implementation):
   - **Happy path**: seed N credentials → rotate → verify all decrypt with new key, none with old key
   - **Pre/post equality**: plaintext API key value is identical before and after rotation
   - **Rollback on failure**: inject error during re-encryption of credential N/2 → assert all rows unchanged
   - **Concurrent read during rotation**: start rotation in one async context, read credentials concurrently → assert no partial/corrupted state visible outside the transaction
   - **Large batch**: seed 100 credentials → rotate → all pass equality check
   - **Empty table**: rotate with zero credentials → no error, report shows `rotated: 0`
   - **Invalid new key**: 32-char (not 64) hex string → CLI exits non-zero before touching DB
   - **Same key**: old key === new key → CLI exits non-zero before touching DB

## Acceptance Criteria
- All 8 scenarios above are covered with dedicated test cases
- Pre-rotation and post-rotation plaintext equality verified for every credential in happy path
- Rollback scenario confirms zero rows were updated after injected failure
- `bun test -- --filter "master-key-rotation"` passes
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test -- --filter "master-key-rotation"
bun run typecheck
bun run lint
```

## Out of Scope
- Performance benchmarking of rotation speed
- UI or webhook notification of rotation events
- Testing rotation of any key other than the master encryption key
