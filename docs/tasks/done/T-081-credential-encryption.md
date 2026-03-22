# T-081 Exchange credential encryption service

## Goal
Implement AES-256-GCM encryption/decryption for exchange API keys.

## Dependencies
- None (pure packages/shared)

## Deliverables
- `packages/shared/crypto/encryption.ts`
- `packages/shared/crypto/__tests__/encryption.test.ts`

## Validation
```bash
bun test packages/shared/crypto/__tests__/encryption.test.ts
bun run typecheck
```
