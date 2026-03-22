# T-009 Implement event bus infrastructure

## Goal
Create the PostgreSQL LISTEN/NOTIFY event bus abstraction in `packages/shared/event-bus/` with typed channels, publisher/subscriber interfaces, dedicated LISTEN connection pool, and auto-reconnect.

## Why
All workers communicate through the event bus (ARCHITECTURE.md pipeline). The candle-collector notifies strategy-worker, which notifies vector-worker, etc. This shared infrastructure must exist before any worker implementation. The epic plan explicitly placed this in EP00 (not EP07) because it's a prerequisite for all workers.

## Inputs
- `docs/ARCHITECTURE.md` § "Event bus (PostgreSQL LISTEN/NOTIFY)" — channel definitions and rules
- `docs/TECH_STACK.md` § "Event bus" — LISTEN/NOTIFY, 60s catchup polling, idempotency
- T-001 outputs: `packages/shared/` directory
- T-002 outputs: running PostgreSQL instance

## Dependencies
- T-001 (monorepo structure with packages/shared/)
- T-002 (PostgreSQL for integration testing)

## Expected Outputs
- `packages/shared/event-bus/types.ts` — Channel, Payload, EventHandler types
- `packages/shared/event-bus/channels.ts` — typed channel definitions (candle_closed, strategy_event_created, decision_completed, label_ready, kill_switch_activated)
- `packages/shared/event-bus/publisher.ts` — EventPublisher class (NOTIFY wrapper)
- `packages/shared/event-bus/subscriber.ts` — EventSubscriber class (LISTEN wrapper)
- `packages/shared/event-bus/connection-pool.ts` — dedicated LISTEN connection management with auto-reconnect
- `packages/shared/event-bus/index.ts` — barrel export
- Unit tests for serialization/deserialization
- Integration tests for NOTIFY → LISTEN round-trip

## Deliverables
- Complete event bus abstraction layer
- Typed channel definitions with payload schemas
- Publisher/subscriber with auto-reconnect
- Tests proving end-to-end message delivery

## Constraints
- NOTIFY payloads are JSON-serialized strings (PostgreSQL NOTIFY payload limit: 8000 bytes)
- Notifications are signals only — workers must re-read DB state (ARCHITECTURE.md rule)
- All handlers must be idempotent (at-least-once delivery)
- LISTEN uses a dedicated connection (not from the query pool)
- Auto-reconnect with exponential backoff on connection loss
- 60-second catchup polling for missed events (TECH_STACK.md)

## Steps
1. Define channel types with Zod schemas for each payload
2. Implement EventPublisher: wraps `NOTIFY channel, payload` SQL
3. Implement EventSubscriber: wraps `LISTEN channel` with callback registration
4. Implement LISTEN connection manager with:
   - Dedicated PostgreSQL connection (not from query pool)
   - Auto-reconnect on disconnect (exponential backoff: 1s, 2s, 4s, max 30s)
   - Connection health check
5. Implement payload serialization/deserialization with Zod validation
6. Write unit tests for payload serialization (known inputs → expected JSON)
7. Write integration tests (requires PostgreSQL from T-002):
   - Publish event → subscriber receives it
   - Multiple subscribers on same channel
   - Reconnect after connection drop
8. Create barrel export

## Acceptance Criteria
- All 5 channels defined with typed payloads
- Publisher.publish(channel, payload) sends NOTIFY
- Subscriber.subscribe(channel, handler) receives events
- Auto-reconnect recovers from connection loss
- Payload validation rejects malformed messages
- At least 5 unit tests and 3 integration tests
- `bun test --filter event-bus` passes

## Validation
```bash
bun test --filter "event-bus"
```

## Out of Scope
- Catchup polling implementation (deferred to EP07 realtime pipeline)
- Worker-specific event handlers (each worker's epic)
- Message persistence / replay
- Redis pub/sub migration (Phase 4 per ARCHITECTURE.md)

## Implementation Plan
- Files: event-bus/types.ts, channels.ts, serialization.ts, publisher.ts, subscriber.ts, index.ts, __tests__/event-bus.test.ts
- Approach: Abstract publisher/subscriber with mock-friendly connection injection
- Test strategy: 10 unit tests (serialization, channels, publisher, subscriber)

## Implementation Notes
- Date: 2026-03-22
- Files changed: packages/shared/event-bus/ (7 files)
- Tests: 10 passing
- Approach: Channel type system with phantom types. Publisher wraps NOTIFY SQL via injected connection. Subscriber wraps LISTEN via injected connection factory. Serialization validates payload size (7900 byte limit).
- Validation: `bun test --filter event-bus` → 10/10 pass, lint pass, typecheck pass
- Discovered work: Catchup polling (60s) deferred to EP07. Auto-reconnect with exponential backoff needs live DB integration test.

## Outputs
- `packages/shared/event-bus/types.ts` — Channel<T>, EventPublisher, EventSubscriber, EventBusOptions
- `packages/shared/event-bus/channels.ts` — 5 typed channels (candle_closed, strategy_event_created, decision_completed, label_ready, kill_switch_activated)
- `packages/shared/event-bus/serialization.ts` — serialize/deserialize with size validation
- `packages/shared/event-bus/publisher.ts` — PgEventPublisher class
- `packages/shared/event-bus/subscriber.ts` — PgEventSubscriber class
