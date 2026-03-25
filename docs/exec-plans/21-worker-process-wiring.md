# 21-worker-process-wiring

## Objective

Replace the stub `index.ts` files in all 9 worker processes with real process bootstrap implementations.
Each bootstrap: connects to the DB, creates the event bus (LISTEN/NOTIFY), wires Drizzle query functions to the worker's deps interface, starts the main loop, and handles graceful shutdown.
After this epic, `bun run scripts/supervisor.ts` starts a fully functional trading pipeline.

## Scope

Per worker, the deliverable is:
- `workers/{name}/src/db.ts` — Drizzle query functions implementing the worker's typed deps interface
- `workers/{name}/src/index.ts` — process bootstrap: env validation → db → event bus → deps wiring → start → SIGTERM/SIGINT shutdown

Workers covered:
| Worker | Current state | Entry point exists? |
|--------|--------------|-------------------|
| candle-collector | `collector.ts` implemented | No (stub only) |
| strategy-worker | `evaluator.ts` implemented | No (stub only) |
| vector-worker | `handler.ts` implemented | No (stub only) |
| label-worker | `scanner.ts` implemented | No (stub only) |
| alert-worker | `handler.ts` + `entry.ts` implemented | `startAlertWorker()` in `entry.ts` ✅ |
| execution-worker | `handler.ts` + `entry.ts` implemented | `startExecutionWorker()` in `entry.ts` ✅ |
| journal-worker | `journal-event-handler.ts` implemented | No (stub only) |
| macro-collector | `calendar-collector.ts` + `news-collector.ts` implemented | index.ts does not exist |
| llm-decision-worker | `LlmDecisionWorker` class in index.ts | Class only, no process bootstrap |
| retrospective-worker | `RetrospectiveWorker` class in index.ts | Class only, no process bootstrap |

## Non-goals

- WebSocket-based candle streaming (candle-collector bootstrap uses polling via `fetchOHLCV` — true WebSocket is a separate improvement)
- Exchange credential rotation or multi-user execution (single set of exchange API keys per process)
- Worker health check HTTP endpoint (a separate monitoring epic)
- Tauri desktop integration
- Horizontal scaling (single-node only)
- Backpressure / priority queue for strategy evaluation (use simple sequential evaluation)
- LLM provider configuration beyond Anthropic Claude API
- Macro-collector external API integrations beyond what `SavetickerClient` already implements

## Prerequisites

- EP19 (API DB Wiring) T-19-001–T-19-013: `db/index.ts` Drizzle singleton available ✅
- `packages/shared/event-bus/`: `PgEventSubscriber`, `PgEventPublisher` implemented ✅
- Domain logic packages fully implemented (EP01–EP17): all handler/collector/evaluator classes ready ✅
- `DATABASE_URL` and `MASTER_ENCRYPTION_KEY` in `.env` ✅
- `ANTHROPIC_API_KEY` in `.env` (for llm-decision-worker and retrospective-worker)

## Milestones

### M1 — Reference Pattern: journal-worker

Establish the canonical worker bootstrap pattern using the simplest worker (journal-worker).
All subsequent workers follow this pattern.

- Deliverables:
  - `workers/journal-worker/src/db.ts` — Drizzle implementation of `JournalStorage` interface:
    `save(journal): Promise<void>` → inserts into `trade_journals` table
  - `workers/journal-worker/src/index.ts` — process bootstrap:
    1. Validate `DATABASE_URL` from env
    2. Import `db` from `db/index.ts`
    3. Create `PgEventSubscriber` + `.connect()`
    4. Create `PgEventPublisher`
    5. Wire `JournalEventHandler(eventBus, storage)`; call `.start()`
    6. SIGTERM/SIGINT → `subscription.unsubscribe()` + `subscriber.close()`
- Acceptance criteria:
  - `bun run workers/journal-worker/src/index.ts` starts without error and prints "Journal worker started"
  - Worker subscribes to `label_ready` channel
  - On SIGTERM: clean shutdown within 5 seconds
  - `bun run typecheck` passes
- Validation:
  ```bash
  bun run typecheck
  bun run workers/journal-worker/src/index.ts &
  sleep 2 && kill -TERM %1
  ```

### M2 — Simple Subscriber Workers (alert, llm-decision, retrospective)

Workers that subscribe to one channel and have minimal DB write logic.

- Deliverables:
  - `workers/alert-worker/src/db.ts` — Drizzle implementations:
    `loadExecutionMode`, `isAlertSent`, `saveAlert`, `loadAlertContext`, `loadDecisionResult`
  - `workers/alert-worker/src/index.ts` — bootstrap using existing `startAlertWorker(deps)` from `entry.ts`; wires `sendSlackWebhook` to `SlackWebhookClient`
  - `workers/llm-decision-worker/src/db.ts` — Drizzle implementations:
    `getKnnDecision`, `getRecentTrades`, `getMacroContext`, `updateWithLlmResult`, `publishDecisionCompleted`
  - `workers/llm-decision-worker/src/main.ts` — process bootstrap: LISTEN `decision_pending_llm` → `LlmDecisionWorker.processDecision()`; wires `evaluate` to `LlmEvaluator`
  - `workers/retrospective-worker/src/db.ts` — Drizzle implementations:
    `getJournalWithContext`, `saveReport`
  - `workers/retrospective-worker/src/main.ts` — process bootstrap: LISTEN `journal_ready` → `RetrospectiveWorker.processJournal()`; wires `spawn` to Claude CLI runner
- Acceptance criteria:
  - Each worker starts and prints ready message
  - `bun run typecheck` passes
  - SIGTERM triggers clean shutdown for all three
- Validation:
  ```bash
  bun run typecheck
  for w in alert-worker llm-decision-worker retrospective-worker; do
    echo "--- $w ---"
    timeout 3 bun run workers/$w/src/index.ts 2>&1 | head -5 || true
  done
  ```

### M3 — Pipeline Core: label-worker + vector-worker

Workers that process strategy events in the vectorization pipeline.

- Deliverables:
  - `workers/label-worker/src/db.ts` — Drizzle implementations of `LabelScanner` deps:
    `findUnlabeledEvents`, `findCandlesForward`, `saveLabel`, publisher
  - `workers/label-worker/src/index.ts` — bootstrap: LISTEN `strategy_event_created` → LabelScanner; also polls for events missed during downtime
  - `workers/vector-worker/src/db.ts` — Drizzle + raw SQL implementations of `VectorHandlerDeps`:
    `loadEvent`, `loadStrategy`, `normalizeFeatures` (wraps packages/core/vector normalizer), `ensureTable` (VectorTableManager), `storeVector`, `searchVectors`, `loadLabels`, `persistDecision`
  - `workers/vector-worker/src/index.ts` — bootstrap: LISTEN `strategy_event_created` → `VectorEventHandler.handle()`; NOTIFY `decision_completed` on result
- Acceptance criteria:
  - `bun run typecheck` passes
  - `bun run workers/label-worker/src/index.ts` starts and subscribes to `strategy_event_created`
  - `bun run workers/vector-worker/src/index.ts` starts and subscribes to `strategy_event_created`
  - On SIGTERM: clean shutdown
- Validation:
  ```bash
  bun run typecheck
  timeout 3 bun run workers/label-worker/src/index.ts 2>&1 | head -5 || true
  timeout 3 bun run workers/vector-worker/src/index.ts 2>&1 | head -5 || true
  ```

### M4 — Execution Worker

- Deliverables:
  - `workers/execution-worker/src/db.ts` — Drizzle implementations of `ExecutionWorkerEntryDeps`:
    `loadExecutionMode`, `isOrderExists`, `validateRiskGate` (RiskGate from packages/core/risk),
    `buildAndSaveOrder` (OrderBuilder from packages/execution), `saveOrderResult`
  - `workers/execution-worker/src/db.ts` — exchange adapter wiring:
    `submitOrder` → `loadCredential(userId)` → decrypt via `packages/shared/crypto` → `BinanceFuturesAdapter.createOrder()`
    `loadDecisionResult` → Drizzle query from `decisions` table
  - `workers/execution-worker/src/index.ts` — bootstrap using existing `startExecutionWorker(deps)` from `entry.ts`
- Acceptance criteria:
  - `bun run typecheck` passes
  - Worker starts and subscribes to `decision_completed`
  - Exchange API calls are routed through the credential decryption layer (not plaintext)
- Validation:
  ```bash
  bun run typecheck
  timeout 3 bun run workers/execution-worker/src/index.ts 2>&1 | head -5 || true
  ```

### M5 — Strategy Worker + Candle Collector

The most complex workers — require sandbox executor and exchange adapter wiring.

- Deliverables:
  - `workers/strategy-worker/src/db.ts` — Drizzle implementations:
    `findActiveStrategies(symbol, timeframe)` → query strategies table
    `StrategyEventRepository` → insert into `strategy_events`
    `CandleRepository` → read candles for warmup
  - `workers/strategy-worker/src/index.ts` — bootstrap:
    LISTEN `candle_closed` → `StrategyEvaluator.evaluate()`
    Instantiate `StrategyExecutor` (from packages/core/strategy sandbox runtime)
    Publish `strategy_event_created`
  - `workers/candle-collector/src/db.ts` — Drizzle implementations:
    `CandleRepository` (upsert, findLatestOpenTime)
    `findActiveSymbolTimeframes()` → query distinct (symbol, timeframe) from strategies where status = 'active'
  - `workers/candle-collector/src/index.ts` — bootstrap:
    Load active (symbol, timeframe) pairs from DB
    Create `BinanceFuturesAdapter`
    Start one `CandleCollector` per (symbol, timeframe) pair concurrently
    Publish `candle_closed` on each closed candle
    On new strategy activation (poll every 60s): start collector for new pair
- Acceptance criteria:
  - `bun run typecheck` passes
  - Both workers start and print ready messages
  - `candle-collector` correctly reads active strategies to determine which pairs to collect
- Validation:
  ```bash
  bun run typecheck
  timeout 3 bun run workers/strategy-worker/src/index.ts 2>&1 | head -5 || true
  timeout 3 bun run workers/candle-collector/src/index.ts 2>&1 | head -5 || true
  ```

### M6 — Macro Collector + Supervisor Smoke Test

- Deliverables:
  - `workers/macro-collector/src/db.ts` — Drizzle implementations:
    `CalendarEventRepository.upsertByExternalId()` → insert/update `economic_events`
    `NewsEventRepository` → insert/update `news_events`
  - `workers/macro-collector/src/index.ts` — process bootstrap (NEW from scratch):
    No event subscription (polling-based)
    Schedule: run `CalendarCollector.collect()` every 60 minutes
    Schedule: run `NewsCollector.collect()` every 30 minutes
    Wire `SavetickerClient` for `fetchEvents`
    SIGTERM → clear intervals + cleanup
  - `scripts/supervisor.ts` updated: add `macro-collector` to `WORKER_CONFIGS` array
  - `bun test workers/` smoke test: start all workers via supervisor, wait 3 seconds, verify all are running (non-zero PIDs), send SIGTERM, verify clean exit
- Acceptance criteria:
  - `macro-collector` starts and logs "Collection scheduled" without crashing
  - `scripts/supervisor.ts` includes macro-collector
  - `bun run typecheck` passes
  - Supervisor smoke test passes (all workers start + shut down cleanly)
- Validation:
  ```bash
  bun run typecheck
  timeout 3 bun run workers/macro-collector/src/index.ts 2>&1 | head -5 || true
  bun test workers/__tests__/supervisor-smoke.test.ts
  ```

## Task candidates

| # | Title | Description | Milestone |
|---|-------|-------------|-----------|
| T-21-001 | journal-worker-process-wiring | `workers/journal-worker/src/db.ts` (JournalStorage → Drizzle trade_journals) + `index.ts` (LISTEN label_ready, shutdown) | M1 |
| T-21-002 | alert-worker-process-wiring | `workers/alert-worker/src/db.ts` + `index.ts` (wraps entry.ts startAlertWorker, wires SlackWebhookClient) | M2 |
| T-21-003 | llm-decision-worker-process-bootstrap | `workers/llm-decision-worker/src/db.ts` + `main.ts` (LISTEN decision_pending_llm, Claude API evaluate) | M2 |
| T-21-004 | retrospective-worker-process-bootstrap | `workers/retrospective-worker/src/db.ts` + `main.ts` (LISTEN journal_ready, Claude spawn runner) | M2 |
| T-21-005 | label-worker-process-wiring | `workers/label-worker/src/db.ts` + `index.ts` (LISTEN strategy_event_created + catch-up poll) | M3 |
| T-21-006 | vector-worker-process-wiring | `workers/vector-worker/src/db.ts` (VectorTableManager + all deps) + `index.ts` (LISTEN strategy_event_created → VectorEventHandler) | M3 |
| T-21-007 | execution-worker-process-wiring | `workers/execution-worker/src/db.ts` (RiskGate + OrderBuilder + exchange adapter + credential decrypt) + `index.ts` (wraps entry.ts) | M4 |
| T-21-008 | strategy-worker-process-wiring | `workers/strategy-worker/src/db.ts` (strategy/event/candle repos) + `index.ts` (LISTEN candle_closed → StrategyEvaluator, StrategyExecutor sandbox) | M5 |
| T-21-009 | candle-collector-process-wiring | `workers/candle-collector/src/db.ts` (CandleRepository + findActiveSymbolTimeframes) + `index.ts` (multi-pair polling loop + dynamic pair detection) | M5 |
| T-21-010 | macro-collector-process-entry | `workers/macro-collector/src/db.ts` + `index.ts` NEW (scheduled polling, SavetickerClient wiring) + supervisor.ts update | M6 |
| T-21-011 | worker-supervisor-smoke-test | `workers/__tests__/supervisor-smoke.test.ts`: start all workers, verify running, SIGTERM, verify clean exit | M6 |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| StrategyExecutor (isolated-vm sandbox) initialization in strategy-worker — complex setup with isolate pool and API injection | High | T-21-008 must audit `packages/core/strategy` constructor requirements before wiring; consider `--max-old-space-size` for Bun process |
| candle-collector dynamic pair detection — polling strategies table every 60s may race with collector startup | Medium | T-21-009: load pairs at startup; use a Set to track active pairs; adding a new pair starts a new collector loop without restarting existing ones |
| execution-worker credential decryption — wrong MASTER_ENCRYPTION_KEY silently fails or crashes | Medium | T-21-007: validate decryption at startup by attempting a round-trip; log clear error and exit if key is wrong |
| PgEventSubscriber `connectionFactory` API — `ListenConnection` interface expects a factory but postgres.js connection API differs | Medium | T-21-001 (reference pattern) must establish the correct adapter; all subsequent workers copy the pattern |
| vector-worker VectorTableManager raw SQL — dynamic table names must be sanitized (SQL injection risk) | Medium | VectorTableManager already exists in packages/core/vector — T-21-006 must use it, not bypass it |
| llm-decision-worker + retrospective-worker entry points — these workers currently export a class in `index.ts`, not a default process entry | Low | T-21-003, T-21-004 add `main.ts` as the actual process entry; update package.json `main` field accordingly |

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-24 | journal-worker chosen as M1 reference pattern | Simplest deps (one subscribe channel + one DB write); establishes pattern before complex workers |
| 2026-03-24 | `workers/{name}/src/db.ts` for all Drizzle query functions | Mirrors `apps/api/src/db/` convention from EP19; isolates DB from domain logic |
| 2026-03-24 | candle-collector reads active symbol/timeframe pairs from DB (not ENV) | Avoids manual ENV management when adding strategies; pairs derived from `strategies.status = 'active'` |
| 2026-03-24 | llm-decision-worker + retrospective-worker get `main.ts` entry, keep `index.ts` as class export | Preserves existing class exports (used in tests); `main.ts` = runnable process entry; `package.json` `main` points to `main.ts` |
| 2026-03-24 | macro-collector uses interval-based polling, not event bus | Economic calendar and news data change on time schedule, not pipeline events; cron-style polling is appropriate |
| 2026-03-24 | execution-worker decrypts credentials per-order via DB lookup | MASTER_ENCRYPTION_KEY is env-only; no credential caching in worker memory beyond single order lifecycle |

## Progress notes

- 2026-03-24: 에픽 생성. 모든 도메인 로직(collector.ts, evaluator.ts, handler.ts 등)은 EP01-EP17에서 구현 완료. 누락된 것은 각 워커의 프로세스 부트스트랩(DB 연결, 이벤트 버스 구독, 의존성 주입, graceful shutdown)뿐. EP19의 `db/index.ts` Drizzle 인스턴스와 `packages/shared/event-bus/` PgEventSubscriber/Publisher를 재사용.
- 2026-03-25: All tasks complete. T-21-001 through T-21-011 in done/. Epic fully implemented.
