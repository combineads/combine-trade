# T-12-007 Chart data hook with SSE updates

## Goal
Create a `useCandleData` React hook that fetches historical candle data from the API and subscribes to SSE candle events for live real-time updates, with infinite-scroll pagination for historical data.

## Why
The chart component (T-12-006) is a pure presentational component — it needs a hook to supply it with data. Without `useCandleData`, chart views must each implement their own fetching and SSE subscription logic, leading to duplication and inconsistency. A single hook ensures all chart instances stay in sync with live market data.

## Inputs
- `packages/ui/src/hooks/use-sse.ts` — `useSSE` hook from T-08-025
- `LightweightChart` / `OHLCVBar` from T-12-006
- `GET /api/v1/candles?symbol=X&timeframe=Y` — candle endpoint (T-08-028)
- SSE candle event format from API
- `docs/ARCHITECTURE.md` — hooks location, naming conventions

## Dependencies
- T-08-025 (useSSE hook exists)
- T-12-006 (OHLCVBar type defined)

## Expected Outputs
- `packages/ui/src/hooks/use-candle-data.ts`
- `packages/ui/__tests__/use-candle-data.test.ts`
- Updated `packages/ui/src/index.ts` — hook exported

## Deliverables

### 1. useCandleData hook
```typescript
// packages/ui/src/hooks/use-candle-data.ts

export interface UseCandleDataOptions {
  symbol: string;
  timeframe: string;       // '1m', '5m', '1h', '1d', etc.
  apiBaseUrl?: string;
}

export interface UseCandleDataResult {
  bars: OHLCVBar[];
  isLoading: boolean;
  error: Error | null;
  fetchMore(): void;       // load older candles (infinite scroll back)
  hasMore: boolean;
}

export function useCandleData(options: UseCandleDataOptions): UseCandleDataResult
```

### 2. Fetch behavior
- Initial fetch: `GET /api/v1/candles?symbol={symbol}&timeframe={timeframe}&page=1&pageSize=500`
- `fetchMore()`: fetches next page and prepends older bars to `bars` array
- `hasMore`: false when API returns fewer bars than `pageSize`
- Bars sorted chronologically (oldest first) for Lightweight Charts compatibility

### 3. SSE subscription
- Subscribe to candle SSE stream: `/api/v1/candles/stream?symbol={symbol}&timeframe={timeframe}`
- On new candle event: append to `bars` or update last bar if same timestamp
- On SSE error: set `error` state, do not crash

### 4. Tests
- Initial fetch populates `bars` with correct shape
- `fetchMore()` prepends older bars
- `hasMore` is false when fewer bars than pageSize returned
- Empty data handled without error (bars = [])
- SSE update appends new bar to end of bars array

## Constraints
- Hook must be SSR-safe — no `window`/`EventSource` access during server render
- SSE subscription starts only after initial fetch completes
- `bars` array is always sorted oldest-first (ascending time)
- Deduplication: if SSE delivers a bar with same timestamp as last bar, replace (update) it
- No direct `fetch` calls — use abstracted API client or plain `fetch` with `apiBaseUrl`

## Steps
1. Write failing tests (RED):
   - Hook returns `{ bars, isLoading, error, fetchMore, hasMore }` shape
   - Initial fetch sets `bars` and clears `isLoading`
   - `fetchMore` appends older data
   - `hasMore` false when page exhausted
2. Implement `useCandleData` with initial fetch logic (GREEN)
3. Add SSE subscription using `useSSE` (GREEN)
4. Implement `fetchMore` with pagination (GREEN)
5. Export from barrel (GREEN)
6. Run validation (REFACTOR)

## Acceptance Criteria
- `useCandleData` returns `{ bars, isLoading, error, fetchMore, hasMore }`
- Initial render has `isLoading: true`, after fetch `isLoading: false`
- Empty API response results in `bars: []` and `hasMore: false`
- `fetchMore()` fetches next page and prepends bars
- SSE bar update with same timestamp replaces last bar (upsert)
- `bun run typecheck` passes

## Validation
```bash
bun test packages/ui
bun run typecheck
```

## Out of Scope
- Multiple timeframe subscriptions in one hook instance
- Candlestick aggregation logic
- Chart component rendering (T-12-006)
- Strategy event overlay (T-12-008)
