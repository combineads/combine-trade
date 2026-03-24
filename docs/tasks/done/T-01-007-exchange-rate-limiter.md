# T-01-007 Exchange Rate Limiter

## Goal
Implement a token bucket rate limiter in `packages/shared/rate-limiter/` that exchange adapters use before making API calls.

## Why
Exchange APIs enforce rate limits (e.g., Binance: 1200 req/min, OKX: 20 req/sec). Without a limiter, requests get rejected (HTTP 429) or the account is banned. A per-exchange configurable token bucket prevents over-calling.

## Inputs
- Exchange API rate limit specs (Binance, OKX, Bybit)
- `packages/shared/` existing structure

## Dependencies
None

## Expected Outputs
- `packages/shared/rate-limiter/token-bucket.ts` — core token bucket implementation
- `packages/shared/rate-limiter/profiles.ts` — per-exchange default profiles
- `packages/shared/rate-limiter/index.ts` — public exports
- `packages/shared/rate-limiter/__tests__/token-bucket.test.ts` — full test coverage

## Deliverables
- `TokenBucket` class: configurable capacity + refill rate, `acquire(n?)` async method
- `ExchangeRateLimiter` class: wraps TokenBucket with per-exchange profile
- Pre-built profiles: `BINANCE_PROFILE`, `OKX_PROFILE`, `BYBIT_PROFILE`
- Thread-safe via atomic token tracking (single-threaded Bun, no locks needed)
- Warning emitted when bucket is below 20% capacity

## Constraints
- No external dependencies beyond `packages/shared`
- packages/core must not import this directly (adapters import it)
- Pure in-memory implementation (no Redis, no DB)

## Steps
1. Write failing tests for TokenBucket
2. Implement TokenBucket with token bucket algorithm
3. Write failing tests for ExchangeRateLimiter with profiles
4. Implement ExchangeRateLimiter + profiles
5. Export from packages/shared/rate-limiter/index.ts
6. Run `bun test` + `bun run typecheck`

## Acceptance Criteria
- `acquire()` waits until tokens are available
- `tryAcquire()` returns false immediately if tokens unavailable
- Profiles match documented exchange limits
- All tests pass
- `bun run typecheck` passes

## Validation
```bash
bun test packages/shared/rate-limiter/__tests__/
bun run typecheck
```

## Implementation Notes
<!-- filled by implementer -->

## Outputs
<!-- filled by implementer -->
