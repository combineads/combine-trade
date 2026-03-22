# T-148 SSE client hook for real-time events

## Goal
Create `useSSE` — a React hook for subscribing to server-sent events (SSE) from the API. The hook handles `EventSource` lifecycle, automatic reconnection on disconnect, and event-type filtering.

## Why
EP08 — The monitoring pages (events, orders, alerts) and the dashboard need real-time updates. The API exposes SSE endpoints for streaming events. Without a client hook, views cannot consume real-time data. `useSSE` is the shared primitive for all real-time UI features.

## Inputs
- `docs/ARCHITECTURE.md` — SSE endpoint pattern (`GET /api/v1/stream/events`)
- `docs/TECH_STACK.md` — Elysia SSE specification
- `packages/ui/src/hooks/` — existing hooks directory (from T-131)

## Dependencies
- T-131 (API client hooks — establishes hooks directory and API base URL pattern)

## Expected Outputs
- `packages/ui/src/hooks/use-sse.ts`
- `packages/ui/__tests__/use-sse.test.ts`

## Deliverables

### 1. useSSE hook
```typescript
// packages/ui/src/hooks/use-sse.ts
export type SSEStatus = 'connecting' | 'open' | 'error' | 'closed';

export interface SSEOptions {
  url: string;
  eventTypes?: string[];        // filter to specific event type names; undefined = all
  withCredentials?: boolean;    // default: true (send cookies for auth)
  reconnectDelay?: number;      // ms, default: 3000
  maxReconnects?: number;       // default: 10 (0 = unlimited)
  enabled?: boolean;            // default: true — set false to pause subscription
}

export interface SSEEvent<T = unknown> {
  type: string;
  data: T;
  id?: string;
  timestamp: number;            // Date.now() at receipt
}

export interface UseSSEReturn<T = unknown> {
  lastEvent: SSEEvent<T> | null;
  events: SSEEvent<T>[];        // rolling buffer of last 100 events
  status: SSEStatus;
  reconnectCount: number;
  close: () => void;            // manually close and stop reconnecting
}

export function useSSE<T = unknown>(options: SSEOptions): UseSSEReturn<T>
```

### 2. EventSource lifecycle
- Creates `EventSource` on mount (or when `url` / `enabled` changes)
- Sets `status` to `'connecting'` immediately, `'open'` on `onopen`
- Sets `status` to `'error'` on `onerror`
- On error: schedules reconnect after `reconnectDelay` ms (if `reconnectCount < maxReconnects`)
- Increments `reconnectCount` on each reconnect attempt
- `close()` sets `enabled`-like internal flag to false, closes EventSource, sets status `'closed'`
- Cleans up EventSource on unmount

### 3. Event filtering
- When `eventTypes` is provided, only events matching those type names are appended to `events` buffer and update `lastEvent`
- Raw EventSource listeners added for each type in `eventTypes`
- When `eventTypes` is undefined, listens to the generic `message` event

### 4. Events buffer
- `events` is a rolling buffer capped at 100 entries (oldest entries dropped first when capacity exceeded)
- Each entry has `type`, parsed `data` (JSON.parse of event.data), optional `id`, and `timestamp`

### 5. Index export
- Export `useSSE`, `SSEOptions`, `SSEEvent`, `UseSSEReturn`, `SSEStatus` from `packages/ui/src/index.ts`

## Constraints
- `EventSource` must be lazily instantiated — do not instantiate during SSR (check `typeof window !== 'undefined'`)
- `events` buffer length capped at 100 — never grows unbounded
- Hook must not cause memory leaks — EventSource closed on unmount
- No external library for SSE — use native browser `EventSource` API only
- JSON.parse errors in event data must be caught; fall back to raw string data

## Steps
1. Write failing tests (RED) using `vi.fn()` mock for EventSource:
   - Creates EventSource with correct URL
   - Sets status to 'open' when EventSource opens
   - Appends events to buffer when events arrive
   - Filters events by type when eventTypes provided
   - Schedules reconnect on error
   - Increments reconnectCount on reconnect
   - Closes EventSource on unmount (cleanup)
2. Implement EventSource lifecycle (GREEN)
3. Implement event filtering and buffer (GREEN)
4. Implement reconnection logic (GREEN)
5. Export from barrel, run validation (REFACTOR)

## Acceptance Criteria
- Hook creates `EventSource` at the given URL on mount
- `status` transitions to `'open'` when EventSource `onopen` fires
- Incoming events are appended to `events` array and set `lastEvent`
- When `eventTypes` is `['candle']`, only `candle`-typed events appear in the buffer
- `reconnectCount` increments each time a reconnect attempt is made after an error
- `close()` sets `status` to `'closed'` and stops reconnect attempts
- EventSource is closed when the component unmounts (no leak)

## Validation
```bash
bun test packages/ui/__tests__/use-sse.test.ts
bun run typecheck
cd apps/web && bun run build
```

## Out of Scope
- WebSocket support (SSE only)
- Authentication token refresh triggered by SSE 401
- SSE event deduplication by id
- Wiring to specific monitoring pages (integration task)
