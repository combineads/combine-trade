# T-01-008 OKX Futures Adapter

## Goal
Implement an OKX Futures exchange adapter using CCXT, following the same `ExchangeAdapter` interface as the existing Binance adapter.

## Steps
1. Create `packages/exchange/adapters/okx-futures.ts` with `OkxFuturesAdapter`
2. Implement: `fetchOHLCV`, `createOrder`, `cancelOrder`, `fetchBalance`, `fetchPositions`, `fetchFundingRate`
3. OKX-specific config: contract type (swap), margin mode (cross/isolated)
4. Write tests with mocked CCXT in `packages/exchange/__tests__/okx-futures-adapter.test.ts`
5. Export `OkxFuturesAdapter` from `packages/exchange/index.ts`

## Constraints
- Must implement `ExchangeAdapter` interface from `types.ts`
- Error mapping: same pattern as BinanceAdapter (`BadSymbol` → `UserError`, `NetworkError`/`RequestTimeout` → `RetryableError`)
- No direct network calls in tests — mock CCXT instance
- Follow naming conventions from Binance adapter

## Outputs
- `packages/exchange/adapters/okx-futures.ts`
- `packages/exchange/adapters/index.ts`
- `packages/exchange/__tests__/okx-futures-adapter.test.ts`
- Updated `packages/exchange/index.ts`
