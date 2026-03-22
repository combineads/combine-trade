# T-105 Implement Binance adapter order methods

## Goal
Implement the stubbed exchange adapter methods: createOrder, cancelOrder, fetchBalance, fetchPositions, fetchFundingRate in BinanceAdapter via CCXT.

## Why
EP06 M3/M4 — order execution requires real exchange communication. All 5 methods are currently throwing NOT_IMPLEMENTED errors.

## Inputs
- `packages/exchange/types.ts` (ExchangeAdapter interface)
- `packages/exchange/binance/adapter.ts` (existing stubs)
- CCXT binanceusdm API

## Dependencies
None (builds on existing adapter skeleton)

## Expected Outputs
- All 5 ExchangeAdapter methods implemented in BinanceAdapter
- Error handling: BadSymbol, InsufficientFunds, InvalidOrder, RequestTimeout, NetworkError
- CCXT response mapped to our types (ExchangeOrder, ExchangeBalance, ExchangePosition, ExchangeFundingRate)

## Deliverables
- `packages/exchange/binance/adapter.ts` (updated — 5 methods implemented)
- `packages/exchange/__tests__/binance-order-methods.test.ts` (unit tests with CCXT mock)

## Constraints
- Use CCXT binanceusdm methods: createOrder, cancelOrder, fetchBalance, fetchPositions, fetchFundingRates
- Map CCXT errors to UserError/RetryableError consistently with fetchOHLCV pattern
- InsufficientFunds → UserError ERR_USER_INSUFFICIENT_FUNDS
- InvalidOrder → UserError ERR_USER_INVALID_ORDER
- RequestTimeout/NetworkError → RetryableError ERR_RETRY_EXCHANGE_TIMEOUT
- Decimal precision: do not round — pass through exchange values as-is

## Steps
1. Write tests for each method using CCXT mock/spy
2. Implement createOrder: map params → ccxt.createOrder → map response to ExchangeOrder
3. Implement cancelOrder: ccxt.cancelOrder with error handling
4. Implement fetchBalance: ccxt.fetchBalance → extract USDT balance → map to ExchangeBalance[]
5. Implement fetchPositions: ccxt.fetchPositions → map to ExchangePosition[]
6. Implement fetchFundingRate: ccxt.fetchFundingRate → map to ExchangeFundingRate

## Acceptance Criteria
- All 5 methods return correctly typed responses
- CCXT errors mapped to domain errors (UserError/RetryableError)
- InsufficientFunds, InvalidOrder, BadSymbol errors handled
- Tests verify both happy path and error paths

## Validation
```bash
bun test packages/exchange/__tests__/binance-order-methods.test.ts
bun run typecheck
```

## Out of Scope
- Actual exchange connectivity (test with mocks)
- Order tracking/polling
- Rate limiting

## Implementation Notes
- **Date**: 2026-03-22
- **Files changed**: `packages/exchange/binance/adapter.ts` (5 methods implemented + shared error mapping), `packages/exchange/__tests__/binance-order-methods.test.ts` (new — 19 tests), `packages/exchange/__tests__/binance-adapter.test.ts` (removed NOT_IMPLEMENTED expectations)
- **Approach**: TDD — wrote 19 tests first (7 createOrder, 3 cancelOrder, 3 fetchBalance, 3 fetchPositions, 3 fetchFundingRate), then implemented all methods.
- **Refactored**: Extracted `mapExchangeError()` private method shared by all 6 adapter methods (including fetchOHLCV). Removed dynamic import of RetryableError.
- **Added**: `mapCcxtOrderStatus()` helper for CCXT order status normalization.
- **Validation**: 19/19 new tests pass, 960 total pass, typecheck clean.

## Outputs
- `BinanceAdapter.createOrder()` — submit market/limit orders, returns `ExchangeOrder`
- `BinanceAdapter.cancelOrder()` — cancel by ID
- `BinanceAdapter.fetchBalance()` — returns non-zero balances as `ExchangeBalance[]`
- `BinanceAdapter.fetchPositions()` — returns non-empty positions as `ExchangePosition[]`
- `BinanceAdapter.fetchFundingRate()` — returns `ExchangeFundingRate`
- Shared error mapping: BadSymbol/InsufficientFunds/InvalidOrder → UserError, RequestTimeout/NetworkError → RetryableError
