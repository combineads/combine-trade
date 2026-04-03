# T-01-005 core/ports.ts — ExchangeAdapter and repository port interfaces

## Goal
Define the port interfaces in `src/core/ports.ts` that abstract external dependencies (exchanges, database). These interfaces form the hexagonal architecture boundary — modules depend on interfaces, not concrete implementations.

## Why
The ExchangeAdapter interface decouples trading logic from specific exchange implementations (Binance, OKX, etc.). This enables: (1) testing with mock adapters, (2) adding new exchanges without changing business logic, (3) backtest using the same code paths with mock adapters. The repository ports provide a similar abstraction for data access.

## Inputs
- `docs/ARCHITECTURE.md` — module map, ExchangeAdapter in core/ports.ts, dependency rules
- `docs/DATA_MODEL.md` — entity types for repository method signatures
- `docs/PRODUCT.md` — exchange capabilities (WebSocket, REST, partial close, SL management)
- `src/core/types.ts` (T-01-002) — entity types used in interface signatures
- `src/core/decimal.ts` (T-01-004) — Decimal type for price/size parameters

## Dependencies
T-01-002 (core/types.ts — entity types for method signatures)
T-01-004 (core/decimal.ts — Decimal type for monetary parameters)

## Expected Outputs
- `src/core/ports.ts` — ExchangeAdapter interface, repository port interfaces
- Exchange adapter implementations (EP-03) will implement ExchangeAdapter
- DB query layer (T-01-009) will implement repository ports

## Deliverables
- `src/core/ports.ts`

## Constraints
- L0 module: only imports from `core/types.ts` and `core/decimal.ts`
- Interfaces must abstract CCXT common methods without leaking CCXT types
- All price/size parameters must use `Decimal` type
- Methods must return `Promise<>` (all exchange operations are async)
- Interface must support: fetch candles, fetch positions, place order, cancel order, edit order, fetch balance
- Must include WebSocket subscription methods for candle streams

## Steps
1. Define `ExchangeAdapter` interface with CCXT-abstracted methods:
   - `fetchOHLCV(symbol, timeframe, since?, limit?): Promise<Candle[]>`
   - `fetchBalance(): Promise<{ total: Decimal; available: Decimal }>`
   - `fetchPositions(symbol?): Promise<ExchangePosition[]>`
   - `createOrder(params: CreateOrderParams): Promise<OrderResult>`
   - `cancelOrder(orderId: string, symbol: string): Promise<void>`
   - `editOrder(orderId: string, params: EditOrderParams): Promise<OrderResult>`
   - `fetchOrder(orderId: string, symbol: string): Promise<OrderResult>`
   - `watchOHLCV(symbol: string, timeframe: string, callback: OHLCVCallback): Promise<Unsubscribe>`
   - `getExchangeInfo(symbol: string): Promise<ExchangeSymbolInfo>`
2. Define supporting types:
   - `ExchangePosition` — current position on exchange
   - `CreateOrderParams` — order parameters (side, type, price, size, stopLoss, etc.)
   - `EditOrderParams` — editable order fields
   - `OrderResult` — filled order information
   - `ExchangeSymbolInfo` — tick size, min order size, etc.
   - `OHLCVCallback` — WebSocket candle callback type
   - `Unsubscribe` — cleanup function type `() => void`
3. Define `ExchangeAdapterFactory` type:
   - `(exchange: Exchange, config: ExchangeConfig) => ExchangeAdapter`
4. Define repository port interfaces (minimal, for this epic):
   - `SymbolRepository` — CRUD for Symbol entity
   - `CommonCodeRepository` — read/write for CommonCode
5. Export all interfaces and supporting types
6. Write type-level tests (compilation checks)
7. Verify `bun run typecheck` passes

## Acceptance Criteria
- ExchangeAdapter interface covers all CCXT operations needed by the system
- All price/size/balance parameters use `Decimal` type
- All methods return `Promise<>`
- No CCXT types leak into the interface (fully abstracted)
- Interface is sufficient for mock implementation (backtest adapter)
- `bun run typecheck` passes

## Test Scenarios
- ExchangeAdapter interface can be implemented by a mock class → compiles
- Mock implementation returning typed values for each method → type-safe
- CreateOrderParams requires side, symbol, and size fields → compile error if missing
- ExchangePosition includes symbol, side, size (Decimal), entryPrice (Decimal), unrealizedPnl (Decimal)
- OrderResult includes orderId, status, filledPrice (Decimal), filledSize (Decimal)
- OHLCVCallback type accepts Candle argument → type-checked

## Validation
```bash
bun run typecheck
bun test --grep "core/ports"
```

## Out of Scope
- Concrete exchange adapter implementations (EP-03: exchanges module)
- Rate limiting logic (exchange adapter internal concern)
- WebSocket reconnection logic (exchange adapter internal concern)
- Full CRUD repository interfaces for all entities (added per-epic as needed)
