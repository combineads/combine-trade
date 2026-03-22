# T-116 Implement exchange credential encryption (AES-256-GCM)

## Goal
Build an encryption service for exchange API keys using AES-256-GCM, with CRUD operations and masking.

## Why
EP10 M4 — exchange API keys must be encrypted at rest per SECURITY.md. Plain text storage is a critical security risk.

## Inputs
- `db/schema/exchange-credentials.ts` (existing schema)
- `docs/SECURITY.md` (AES-256-GCM specification)

## Dependencies
None (independent encryption module)

## Expected Outputs
- `encrypt(plaintext, masterKey)` → { ciphertext, iv, tag }
- `decrypt(ciphertext, iv, tag, masterKey)` → plaintext
- `maskApiKey(key)` → "sk-****...1234"
- `CredentialService` with save/get/delete/list operations

## Deliverables
- `packages/shared/auth/encryption.ts`
- `packages/shared/auth/__tests__/encryption.test.ts`

## Constraints
- AES-256-GCM with random 12-byte IV per encryption
- Master key from env var `MASTER_ENCRYPTION_KEY` (32 bytes hex)
- Never log plaintext API keys
- Masking: show first 3 chars + "****" + last 4 chars
- Decryption only in-memory, never written to disk

## Steps
1. Write tests for encrypt/decrypt/mask
2. Implement AES-256-GCM encryption using Node.js crypto
3. Implement CredentialService with deps-injected DB calls
4. Test masking output format

## Acceptance Criteria
- Encrypt → decrypt roundtrip produces original plaintext
- Different IVs for same plaintext (not deterministic)
- Wrong master key → decryption fails
- Tampering with ciphertext → decryption fails (GCM auth tag)
- maskApiKey produces correct masked format

## Validation
```bash
bun test packages/shared/auth/__tests__/encryption.test.ts
bun run typecheck
```

## Out of Scope
- Key rotation CLI (later task)
- REST API endpoints for credentials
- Master key derivation
