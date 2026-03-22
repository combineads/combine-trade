# T-012 Implement Binance Futures CCXT adapter

## Goal
Implement `packages/exchange/binance/adapter.ts` — a concrete `ExchangeAdapter` that wraps CCXT to fetch OHLCV candles and watch live WebSocket streams from Binance USDT-M Futures. Order methods (createOrder, cancelOrder, fetchBalance, fetchPositions, fetchFundingRate) are stubbed with `throw new Error("not implemented — EP06")` as they belong to EP06.

## Why
The candle-collector worker (T-015) needs a real exchange adapter to pull historical candles for gap backfill (REST) and receive live candle closes (WebSocket). The MockExchangeAdapter serves tests but cannot reach Binance. This is the first concrete exchange adapter and establishes the pattern for the OKX adapter (deferred).

## Inputs
- `packages/exchange/types.ts` — ExchangeAdapter interface (fetchOHLCV, watchOHLCV signature)
- `packages/exchange/testing/mock-adapter.ts` — reference for interface shape
- `docs/ARCHITECTURE.md` § "packages/exchange" — CCXT isolation rule: CCXT imports stay inside packages/exchange only
- `docs/exec-plans/01-candle-collection.md` § M1 — acceptance criteria and decision log entry for hedge mode
- `docs/TECH_STACK.md` — CCXT usage rules
- T-001 outputs: monorepo structure with packages/exchange/

## Dependencies
- T-001 (monorepo scaffold — packages/exchange/ exists)

## Expected Outputs
- `packages/exchange/binance/adapter.ts` — BinanceAdapter class implementing ExchangeAdapter
- `packages/exchange/binance/index.ts` — barrel export
- `packages/exchange/__tests__/binance-adapter.test.ts` — unit tests using MockExchangeAdapter pattern + offline fixtures; one live smoke test (skipped in CI via `process.env.CI`)
- CCXT added as a dependency of packages/exchange (package.json)

## Deliverables
- BinanceAdapter: fetchOHLCV via REST, watchOHLCV via CCXT Pro WebSocket
- Exchange initialized in hedge mode (`dualSidePosition=true`) per ARCHITECTURE.md position direction policy
- Order-side methods stub-throw with `ERR_USER_NOT_IMPLEMENTED` error code
- Unit tests with offline fixtures asserting ExchangeCandle[] shape and since/limit filtering
- One optional live integration test (env-gated, skipped in CI)

## Constraints
- CCXT must only be imported inside `packages/exchange/`. No other package may import CCXT.
- ExchangeAdapter interface must not be modified (it is the contract, not the implementation)
- fetchOHLCV must map CCXT raw array `[ts, o, h, l, c, v]` to ExchangeCandle exactly
- Exchange credential source: `BINANCE_API_KEY` / `BINANCE_API_SECRET` from environment variables (EP01 decision: .env until EP10)
- If env vars are absent, adapter initializes in public-only mode (fetchOHLCV works without auth on Binance Futures public endpoints)
- watchOHLCV must accept a callback and call it for each new candle update received over WebSocket
- Volume uses native `number` (non-monetary; see ARCHITECTURE.md § Decimal precision boundary)
- No Decimal.js in this layer — prices arrive as numbers from CCXT; conversion to string happens at the repository boundary (T-013)
- Error codes: network timeouts → `ERR_RETRY_EXCHANGE_TIMEOUT`; invalid symbol → `ERR_USER_INVALID_SYMBOL`

## Steps
1. Add `ccxt` as a dependency to packages/exchange package.json (or root if monorepo hoists)
2. Write failing tests first (RED):
   - Test: fetchOHLCV returns ExchangeCandle[] matching fixture data shape
   - Test: `since` parameter filters candles with timestamp >= since
   - Test: `limit` parameter caps result length
   - Test: adapter.exchange === "binance"
   - Test: order methods throw with expected error code
3. Implement BinanceAdapter class (GREEN):
   - Constructor accepts `{ apiKey?, apiSecret? }` options; reads env vars as fallback
   - Instantiate `ccxt.pro.binanceusdm` (or `ccxt.binanceusdm` for REST-only)
   - Set `options.defaultType = 'future'` and hedge mode config
   - Implement `fetchOHLCV`: call `exchange.fetchOHLCV(symbol, timeframe, since, limit)`, map raw rows to ExchangeCandle
   - Implement `watchOHLCV`: use `exchange.watchOHLCV(symbol, timeframe)` in a loop, call callback per candle
   - Stub remaining methods: `createOrder`, `cancelOrder`, `fetchBalance`, `fetchPositions`, `fetchFundingRate`
4. Export from `packages/exchange/binance/index.ts`
5. Refactor (REFACTOR): extract CCXT row mapper to a pure function for easy unit testing
6. Run lint + typecheck

## Acceptance Criteria
- `adapter.exchange` equals `"binance"`
- `fetchOHLCV("BTCUSDT", "1m", since, limit)` returns `ExchangeCandle[]` with correct field types (timestamp: number, open/high/low/close/volume: number)
- Returned candles respect `since` and `limit` constraints
- Calling `createOrder(...)` throws an error with code `ERR_USER_NOT_IMPLEMENTED`
- CCXT is not imported anywhere outside `packages/exchange/`
- `bun test --filter "binance"` passes (unit tests; live test skipped in CI)
- `bun run typecheck` passes
- `bun run lint` passes

## Validation
```bash
bun test --filter "binance"
bun run typecheck
bun run lint
```

## Out of Scope
- OKX adapter (separate task, deferred)
- watchOHLCV integration test against live Binance (manual only — requires credentials)
- Order execution methods (EP06)
- Rate limiting / backoff (EP01-M6, deferred)
- OHLCV data quality validation (EP01-M6, deferred)
- Binance Vision bulk archive download (T-015)

## Implementation Notes
- Date: 2026-03-22
- Files changed: packages/exchange/binance/adapter.ts, binance/index.ts, __tests__/binance-adapter.test.ts, package.json
- Tests: 7 passing + 1 skipped (live test)
- Approach: CCXT binanceusdm wrapper. mapOhlcvRow extracts pure row mapping. Order methods throw UserError(ERR_USER_NOT_IMPLEMENTED). Live test gated on BINANCE_API_KEY env var.
- Validation: all pass

## Outputs
- `packages/exchange/binance/adapter.ts` — BinanceAdapter (fetchOHLCV + stubs)
- `packages/exchange/binance/index.ts` — barrel export
- `mapOhlcvRow()` — pure function for CCXT row mapping
