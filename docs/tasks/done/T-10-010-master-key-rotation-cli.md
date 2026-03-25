# T-10-010 Master key rotation CLI

## Goal
CLI utility for rotating the AES-256-GCM master key used for exchange API key encryption.

## Why
Security best practice requires periodic key rotation. Without a rotation tool, credentials cannot be re-encrypted under a new master key without downtime or data loss risk.

## Inputs
- `packages/shared/auth/encryption.ts` — encrypt/decrypt primitives (T-10-009)
- `db/schema/exchange-credentials.ts` — credentials schema
- `docs/SECURITY.md` — AES-256-GCM and key management requirements

## Dependencies
- T-10-009 (AES-256-GCM encryption service)

## Expected Outputs
- `packages/shared/cli/rotate-master-key.ts` — CLI entry point
- Reads `MASTER_ENCRYPTION_KEY` (old key) and `NEW_MASTER_ENCRYPTION_KEY` from env
- Decrypts all credentials with old key, re-encrypts with new key in a single DB transaction
- Verifies every credential decrypts correctly post-rotation before committing
- Prints rotation report: count rotated, time elapsed, any failures

## Deliverables
- `packages/shared/cli/rotate-master-key.ts`
- `packages/shared/cli/__tests__/rotate-master-key.test.ts`

## Constraints
- Zero-downtime rotation: all re-encryptions occur inside a single atomic transaction
- Rollback on any failure — no partial rotation
- Never log plaintext API keys at any point
- Old key and new key must not be the same (validate at startup)
- New key must be a valid 32-byte hex string (64 chars)

## Steps
1. Write failing tests first (RED):
   - Test: all credentials re-encrypted with new key, old key can no longer decrypt
   - Test: rollback occurs if any single credential fails to re-encrypt
   - Test: CLI exits non-zero on missing env vars
   - Test: CLI rejects identical old and new keys
2. Implement rotation logic (GREEN):
   - Load all `exchange_credentials` rows inside a transaction
   - Decrypt each with `MASTER_ENCRYPTION_KEY`
   - Re-encrypt each with `NEW_MASTER_ENCRYPTION_KEY`
   - Verify decryption of new ciphertext before updating row
   - Commit transaction; rollback on any error
3. Print rotation report to stdout: `{ rotated, failed, elapsedMs }`
4. Refactor (REFACTOR): extract `rotateCredentials(db, oldKey, newKey)` as a pure function for testability

## Acceptance Criteria
- Running the CLI with valid old and new keys rotates every credential
- After rotation, decrypting with the old key fails for all credentials
- After rotation, decrypting with the new key succeeds for all credentials
- Any mid-rotation failure causes full rollback (zero credentials updated)
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
- Automated scheduled rotation (cron / worker)
- Multi-key / key hierarchy / KMS integration
- Key derivation from passphrase
- Rotation of keys other than the master encryption key
