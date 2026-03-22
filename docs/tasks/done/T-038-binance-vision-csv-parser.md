# T-038 Binance Vision CSV parser

## Goal
Parse Binance Vision monthly/daily kline CSV files into Candle objects. Accepts a raw CSV string and returns a typed `CandleBar[]` (for labeling) plus a factory that produces full `Candle` objects when exchange/symbol/timeframe context is supplied.

## Why
The backtest replay engine (T-039) needs a way to ingest historical candle data from Binance Vision ZIP archives without hitting the REST API. A standalone parser isolates the format-specific logic and makes the replay engine testable with fixture strings.

## Inputs
- Binance Vision kline CSV format (12 columns, no header row in production files):
  `open_time, open, high, low, close, volume, close_time, quote_volume, trades, taker_buy_base_vol, taker_buy_quote_vol, ignore`
- `open_time` and `close_time` are Unix millisecond timestamps (integers)
- All price/volume columns are numeric strings (may be integer or decimal)
- Files occasionally contain a header row (`open_time,open,...`) that must be skipped
- Files may have trailing empty lines

## Dependencies
None

## Expected Outputs
- `packages/backtest/csv-parser.ts`
  - `parseBinanceVisionCsv(csv: string, ctx: CandleContext): Candle[]`
  - `parseBinanceVisionCsvRows(csv: string): RawKlineRow[]`
  - `RawKlineRow` interface
  - `CandleContext` interface `{ exchange: Exchange; symbol: string; timeframe: Timeframe }`
- `packages/backtest/__tests__/csv-parser.test.ts`

## Deliverables
- `packages/backtest/csv-parser.ts`
- `packages/backtest/__tests__/csv-parser.test.ts`

## Constraints
- Pure functions only — no I/O, no network, no DB
- `packages/backtest` may import from `@combine/candle` and `@combine/shared`
- Use `Candle` type from `@combine/candle` exactly: `{ exchange, symbol, timeframe, openTime: Date, open, high, low, close, volume, isClosed: boolean }`
- `isClosed` is always `true` for historical candles (the bar is complete)
- `openTime` must be `new Date(open_time_ms)`
- Skip rows where the first column is non-numeric (header detection)
- Skip entirely empty lines
- Throw a descriptive `Error` if a non-empty, non-header row has fewer than 11 columns
- All numeric string values must be preserved as strings (no `parseFloat`) — only `open_time` is parsed to number for `Date` construction

## Steps
1. Create `packages/backtest/__tests__/csv-parser.test.ts` with failing tests (RED):
   - Parse a 3-row fixture CSV → returns 3 Candle objects with correct field values
   - Skip a header row if first column is `open_time`
   - Skip trailing empty lines
   - Throw on malformed row (< 11 columns, non-empty, non-header)
   - `openTime` is a valid `Date` matching the ms timestamp
   - `isClosed` is always `true`
   - `open`, `high`, `low`, `close`, `volume` match CSV columns exactly as strings
2. Implement `packages/backtest/csv-parser.ts` (GREEN)
3. Export `parseBinanceVisionCsv`, `parseBinanceVisionCsvRows`, `RawKlineRow`, `CandleContext` from `packages/backtest/index.ts`
4. Refactor: extract `parseRow` helper, add inline JSDoc

## Acceptance Criteria
- 3-row fixture → array of 3 `Candle` objects in order
- `open_time` column (ms) → `openTime: new Date(open_time_ms)`
- `open`, `high`, `low`, `close`, `volume` columns preserved as strings without alteration
- `isClosed === true` for every row
- Header row (`open_time,...`) skipped silently
- Empty lines skipped silently
- Row with < 11 non-empty columns throws `Error` containing column count
- `CandleContext` fields (`exchange`, `symbol`, `timeframe`) appear on every returned `Candle`

## Validation
```bash
bun test packages/backtest/__tests__/csv-parser.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- ZIP decompression (caller's responsibility)
- Checksum verification
- Downloading files from data.binance.vision
- OKX or non-Binance CSV formats
- Streaming / large-file chunking
