# T-01-009 Rate Limit Auto-Throttle

## Goal
Implement an auto-throttle wrapper that adds exponential backoff to token bucket rate limiting, handling both proactive throttle (bucket empty) and reactive throttle (429 HTTP response).

## Steps
1. Create `packages/shared/rate-limiter/auto-throttle.ts`
2. Implement `withThrottle(fn, rateLimiter)` wrapper
3. Exponential backoff: initial 1s, max 30s, factor 2x
4. Detect 429 HTTP responses and trigger throttle
5. Write tests in `packages/shared/rate-limiter/__tests__/auto-throttle.test.ts`
6. Export from `packages/shared/rate-limiter/index.ts`

## Constraints
- Must use existing `TokenBucket` / `ExchangeRateLimiter` — no reimplementation
- Backoff: initial 1000ms, factor 2, max 30000ms
- 429 detection: check error message or HTTP status property
- No infinite retry — configurable max attempts (default 5)

## Outputs
- `packages/shared/rate-limiter/auto-throttle.ts`
- `packages/shared/rate-limiter/__tests__/auto-throttle.test.ts`
- Updated `packages/shared/rate-limiter/index.ts`
