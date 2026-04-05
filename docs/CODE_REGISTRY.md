# Code Registry

> Auto-generated: 2026-04-05 | Total: 21,440 lines (src) + 939 lines (scripts) = **22,379 lines**

## Summary

| Module | Layer | Files | Lines | Key Exports |
|--------|-------|-------|-------|-------------|
| core | L0 | 6 | 856 | Types, constants, Decimal wrappers, ports |
| db | L1 | 6 | 919 | Schema (13 tables), pool, event-log, queries |
| config | L1 | 4 | 911 | Config loader, schema validation, seed data |
| indicators | L2 | 7 | 357 | BB20, BB4, MA, RSI, ATR, squeeze |
| exchanges | L2 | 8 | 1,582 | BaseExchangeAdapter + 4 concrete adapters |
| candles | L3 | 9 | 1,587 | CandleManager, collector, history, gap recovery |
| vectors | L3 | 5 | 1,870 | Vectorizer (202-dim), normalizer, features |
| filters | L4 | 3 | 350 | Daily direction, trade blocks |
| knn | L4 | 4 | 558 | KNN engine, time decay, decision |
| signals | L5 | 4 | 1,083 | Watching, evidence gate, safety gate |
| positions | L5 | 5 | 1,184 | FSM, ticket manager, sizer, pyramid |
| limits | L5 | 2 | 443 | Loss limit (daily/session/hourly) |
| orders | L6 | 3 | 766 | Order executor, slippage check |
| exits | L6 | 4 | 843 | 3-stage exit, trailing stop, MFE/MAE |
| labeling | L6 | 2 | 205 | Trade result classification |
| reconciliation | L7 | 3 | 538 | Position reconciliation worker |
| notifications | L7 | 2 | 254 | Slack webhook alerts |
| transfer | L7 | 4 | 397 | Futures→spot auto transfer |
| api | L8 | 14 | 1,283 | REST routes (Hono), auth, middleware |
| backtest | L8 | 10 | 2,514 | Engine, WFO, mock adapter, CLI |
| daemon | L9 | 4 | 1,919 | Pipeline, crash recovery, shutdown |
| web | — | 22 | 3,429 | React SPA (dashboard, trades, login) |
| scripts | — | 5 | 939 | kill-switch, check-layers, seed, etc. |

---

## L0: core (856 lines)

### `src/core/types.ts` (348 lines)
**Exports:** `FsmState`, `ExecutionMode`, `DailyBias`, `Timeframe`, `VectorTimeframe`, `Direction`, `Exchange`, `DetectionType`, `SignalType`, `KnnDecision`, `TicketState`, `CloseReason`, `TradeResult`, `VectorGrade`, `OrderType`, `OrderStatus`, `OrderSide`, `closeSide()`, `BlockType`, `BacktestRunType`, `EventType`, `CommonCodeGroup`, `SymbolKey`, `SymbolEntity`, `SymbolState`, `CommonCode`, `TradeBlock`, `Candle`, `WatchSession`, `Signal`, `SignalDetail`, `Vector`, `TicketSnapshot`, `Ticket`, `Order`, `Backtest`, `EventLog`
**Imports:** `decimal.js`

### `src/core/ports.ts` (122 lines)
**Exports:** `OHLCVCallback`, `Unsubscribe`, `ExchangePosition`, `CreateOrderParams`, `EditOrderParams`, `OrderResult`, `ExchangeSymbolInfo`, `ExchangeAdapter`, `ExchangeConfig`, `ExchangeAdapterFactory`, `SymbolRepository`, `CommonCodeRepository`
**Imports:** `@/core/decimal`, `@/core/types`

### `src/core/decimal.ts` (150 lines)
**Exports:** `Decimal` (re-export), `d()`, `add()`, `sub()`, `mul()`, `div()`, `abs()`, `neg()`, `min()`, `max()`, `eq()`, `gt()`, `gte()`, `lt()`, `lte()`, `isZero()`, `isPositive()`, `isNegative()`, `toFixed()`, `toPercent()`, `toNumber()`, `pctChange()`, `pctOf()`
**Imports:** `decimal.js`

### `src/core/logger.ts` (198 lines)
**Exports:** `LogLevel`, `LogDetails`, `Logger`, `WriteFn`, `createLogger()`, `setLogLevel()`, `getLogLevel()`, `_setWriteFunctions()`, `_reset()`
**Imports:** (none)

### `src/core/constants.ts` (37 lines)
**Exports:** `BB20_CONFIG`, `BB4_CONFIG`, `MA_PERIODS`, `MA20_PERIOD`, `MA60_PERIOD`, `MA120_PERIOD`, `VECTOR_DIM`, `NORMALIZATION_METHOD`, `TIMEFRAMES`, `ENTRY_TIMEFRAMES`, `MAX_LEVERAGE`, `MAX_SYMBOLS`, `MAX_EXCHANGES`, `MAX_PYRAMID_COUNT`, `RECONCILIATION_INTERVAL_MS`, `SUPPORTED_EXCHANGES`, `SUPPORTED_SYMBOLS`
**Imports:** (none)

### `src/core/index.ts` (1 line)
**Exports:** (empty barrel)

---

## L1: db (919 lines)

### `src/db/schema.ts` (575 lines)
**Exports:** Tables: `symbolTable`, `symbolStateTable`, `commonCodeTable`, `candleTable`, `tradeBlockTable`, `watchSessionTable`, `signalTable`, `signalDetailTable`, `vectorTable`, `ticketTable`, `orderTable`, `eventLogTable`, `backtestTable`. Types: `Symbol`/`NewSymbol`, `SymbolStateRow`/`NewSymbolStateRow`, `CommonCodeRow`/`NewCommonCodeRow`, `CandleRow`/`NewCandleRow`, `TradeBlockRow`/`NewTradeBlockRow`, `WatchSessionRow`/`NewWatchSessionRow`, `SignalRow`/`NewSignalRow`, `SignalDetailRow`/`NewSignalDetailRow`, `VectorRow`/`NewVectorRow`, `TicketRow`/`NewTicketRow`, `OrderRow`/`NewOrderRow`, `EventLogRow`/`NewEventLogRow`, `BacktestRow`/`NewBacktestRow`, `vectorType`
**Imports:** `drizzle-orm`, `drizzle-orm/pg-core`

### `src/db/event-log.ts` (132 lines)
**Exports:** `EVENT_TYPES`, `EventType`, `InsertEventParams`, `insertEvent()`, `QueryEventsFilters`, `queryEvents()`
**Imports:** `drizzle-orm`, `@/db/pool`, `@/db/schema`

### `src/db/pool.ts` (124 lines)
**Exports:** `DbInstance`, `PostgresClient`, `initDb()`, `getDb()`, `getPool()`, `closePool()`, `isHealthy()`
**Imports:** `drizzle-orm/postgres-js`, `postgres`, `@/core/logger`

### `src/db/queries.ts` (54 lines)
**Exports:** `makeGetActiveTickets()`
**Imports:** `drizzle-orm`, `@/core/types`, `@/db/pool`, `@/db/schema`

### `src/db/migrate.ts` (30 lines)
**Exports:** (none — side-effect script)
**Imports:** `drizzle-orm/postgres-js/migrator`, `@/core/logger`, `@/db/pool`

### `src/db/index.ts` (4 lines)
**Exports:** barrel re-exports from `event-log`, `pool`, `queries`, `schema`

---

## L1: config (911 lines)

### `src/config/seed.ts` (429 lines)
**Exports:** `SeedEntry`, `SEED_DATA`, `seed()`
**Imports:** `@/config/schema`, `@/core/constants`, `@/core/logger`, `@/db/pool`, `@/db/schema`

### `src/config/schema.ts` (223 lines)
**Exports:** Schemas: `ExchangeConfigSchema`, `TimeframeConfigSchema`, `SymbolConfigSchema`, `KnnConfigSchema`, `PositionConfigSchema`, `LossLimitConfigSchema`, `SlippageConfigSchema`, `FeatureWeightConfigSchema`, `TimeDecayConfigSchema`, `WfoConfigSchema`, `AnchorConfigSchema`, `NotificationConfigSchema`, `TransferConfigSchema`. Types: corresponding inferred types. Constants: `CONFIG_SCHEMAS`, `ANCHOR_GROUPS`, `TRANSFER_CODE_SCHEMAS`. Functions: `validateConfigValue()`
**Imports:** `zod`, `@/core/types`

### `src/config/index.ts` (133 lines)
**Exports:** `ConfigChangeCallback`, `Unsubscribe`, `AnchorModificationError`, `ConfigNotFoundError`, `loadConfig()`, `getConfig()`, `getGroupConfig()`, `refreshConfig()`, `updateConfig()`, `watchConfig()`
**Imports:** `drizzle-orm`, `@/db/pool`, `@/db/schema`, `./loader`, `./schema`

### `src/config/loader.ts` (126 lines)
**Exports:** `loadAllConfig()`, `getCachedValue()`, `getGroupConfig()`, `isLoaded()`, `clearCache()`, `ConfigNotFoundError`, `AnchorModificationError`
**Imports:** `drizzle-orm`, `@/core/logger`, `@/db/pool`, `@/db/schema`, `./schema`

---

## L2: indicators (357 lines)

### `src/indicators/bollinger.ts` (114 lines)
**Exports:** `candlesToCloses()`, `candlesToOpens()`, `calcBB()`, `calcBB20()`, `calcBB4()`
**Imports:** `@ixjb94/indicators`, `@/core/constants`, `@/core/decimal`, `@/core/types`, `./types`

### `src/indicators/index.ts` (66 lines)
**Exports:** `calcAllIndicators()`, barrel re-exports: `ATR_DEFAULT_PERIOD`, `calcATR`, `calcATRSeries`, `calcBB`, `calcBB4`, `calcBB20`, `candlesToCloses`, `calcEMA`, `calcEMASeries`, `calcSMA`, `calcSMASeries`, `calcRSI`, `calcRSISeries`, `RSI_DEFAULT_PERIOD`, `detectSqueeze`, `AllIndicators`, `BollingerResult`, `SqueezeState`
**Imports:** `@/core/types`, sub-modules

### `src/indicators/squeeze.ts` (43 lines)
**Exports:** `detectSqueeze()`
**Imports:** `@/core/decimal`, `./types`

### `src/indicators/rsi.ts` (37 lines)
**Exports:** `RSI_DEFAULT_PERIOD`, `calcRSI()`, `calcRSISeries()`
**Imports:** `@ixjb94/indicators`, `@/core/decimal`

### `src/indicators/ma.ts` (33 lines)
**Exports:** `calcSMA()`, `calcSMASeries()`, `calcEMA()`, `calcEMASeries()`
**Imports:** `@ixjb94/indicators`, `@/core/decimal`

### `src/indicators/atr.ts` (33 lines)
**Exports:** `ATR_DEFAULT_PERIOD`, `calcATR()`, `calcATRSeries()`
**Imports:** `@ixjb94/indicators`, `@/core/decimal`

### `src/indicators/types.ts` (31 lines)
**Exports:** `BollingerResult`, `SqueezeState`, `AllIndicators`
**Imports:** `@/core/decimal`

---

## L2: exchanges (1,582 lines)

### `src/exchanges/binance.ts` (600 lines)
**Exports:** `BinanceAdapter`
**Imports:** `@/core/decimal`, `@/core/ports`, `@/core/types`, `./base`, `./ws-manager`

### `src/exchanges/base.ts` (288 lines)
**Exports:** `BaseExchangeAdapter` (abstract), re-exports all error classes
**Imports:** `ccxt`, `@/core/decimal`, `@/core/ports`, `@/core/types`, `./errors`

### `src/exchanges/ws-manager.ts` (259 lines)
**Exports:** `WsOptions`, `WsConnection`, `WebSocketFactory`, `WsManager`
**Imports:** `@/core/logger`

### `src/exchanges/mexc.ts` (108 lines)
**Exports:** `MexcAdapter`
**Imports:** `@/core/decimal`, `@/core/ports`, `@/core/types`, `./base`

### `src/exchanges/bitget.ts` (99 lines)
**Exports:** `BitgetAdapter`
**Imports:** `@/core/decimal`, `@/core/ports`, `@/core/types`, `./base`

### `src/exchanges/okx.ts` (99 lines)
**Exports:** `OkxAdapter`
**Imports:** `@/core/decimal`, `@/core/ports`, `@/core/types`, `./base`

### `src/exchanges/errors.ts` (83 lines)
**Exports:** `ExchangeError`, `ExchangeRateLimitError`, `ExchangeNetworkError`, `ExchangeAuthError`, `ExchangeOrderNotFoundError`, `ExchangeInsufficientFundsError`, `ExchangeNotImplementedError`
**Imports:** (none)

### `src/exchanges/index.ts` (46 lines)
**Exports:** `createExchangeAdapter()`, barrel re-exports all adapters + errors
**Imports:** `@/core/ports`, `@/core/types`, sub-modules

---

## L3: candles (1,587 lines)

### `src/candles/history-loader.ts` (370 lines)
**Exports:** `NewCandle`, `mapTimeframe()`, `buildMonthlyUrl()`, `buildDailyUrl()`, `parseCSVRow()`, `downloadCandles()`, `fetchCandlesViaREST()`
**Imports:** `fflate`, `@/core/decimal`, `@/core/logger`, `@/core/ports`, `@/core/types`

### `src/candles/collector.ts` (281 lines)
**Exports:** `CollectorStatus`, `CandleCollector`
**Imports:** `@/core/logger`, `@/core/ports`, `@/core/types`, `@/db/pool`, `./history-loader`, `./repository`, `./types`

### `src/candles/sync.ts` (255 lines)
**Exports:** `SyncResult`, `SyncOptions`, `syncCandles()`
**Imports:** `@/core/constants`, `@/core/logger`, `@/core/ports`, `@/core/types`, `@/db/pool`, `./history-loader`, `./repository`

### `src/candles/gap-recovery.ts` (191 lines)
**Exports:** `RecoveryResult`, `GapRecovery`
**Imports:** `@/core/logger`, `@/core/ports`, `@/core/types`, `@/db/pool`, `./gap-detection`, `./history-loader`, `./repository`

### `src/candles/repository.ts` (149 lines)
**Exports:** `bulkUpsertCandles()`, `getLatestCandleTime()`, `getCandles()`
**Imports:** `drizzle-orm`, `@/db/pool`, `@/db/schema`, `./history-loader`

### `src/candles/index.ts` (143 lines)
**Exports:** `CandleManagerConfig`, `CandleManagerStatus`, `CandleManagerDeps`, `CandleManager`, barrel re-exports all sub-modules
**Imports:** `@/core/constants`, `@/core/logger`, `@/core/ports`, `@/core/types`, sub-modules

### `src/candles/gap-detection.ts` (118 lines)
**Exports:** `CandleGap`, `getTimeframeDurationMs()`, `detectGaps()`
**Imports:** `@/core/types`, `@/db/pool`

### `src/candles/cleanup.ts` (77 lines)
**Exports:** `CleanupResult`, `cleanupOldCandles()`
**Imports:** `@/core/logger`, `@/db/pool`

### `src/candles/types.ts` (3 lines)
**Exports:** `CandleCloseCallback`
**Imports:** `@/core/types`

---

## L3: vectors (1,870 lines)

### `src/vectors/vectorizer.ts` (1,174 lines)
**Exports:** `vectorize()`
**Imports:** `@/core/constants`, `@/core/types`, `@/indicators/index`, `@/indicators/types`, `@/vectors/features`

### `src/vectors/features.ts` (352 lines)
**Exports:** `FEATURE_CATEGORIES`, `FEATURE_NAMES`, `FEATURE_WEIGHTS`, `VECTOR_DIM`
**Imports:** (none)

### `src/vectors/normalizer.ts` (174 lines)
**Exports:** `NormParams`, `normalize()`, `computeNormParams()`
**Imports:** `@/vectors/features`

### `src/vectors/repository.ts` (159 lines)
**Exports:** `InsertVectorParams`, `insertVector()`, `getVectorByCandle()`, `getVectorsForNormalization()`, `updateVectorLabel()`
**Imports:** `drizzle-orm`, `@/db/pool`, `@/db/schema`

### `src/vectors/index.ts` (11 lines)
**Exports:** barrel re-exports from sub-modules

---

## L4: filters (350 lines)

### `src/filters/trade-block.ts` (260 lines)
**Exports:** `OneTimeBlockParams`, `isInMarketOpenWindow()`, `isInFundingWindow()`, `matchesRecurrenceRule()`, `isTradeBlocked()`, `seedTradeBlocks()`, `addOneTimeBlock()`
**Imports:** `drizzle-orm`, `@/core/types`, `@/db/pool`, `@/db/schema`

### `src/filters/daily-direction.ts` (80 lines)
**Exports:** `determineDailyBias()`, `updateDailyBias()`
**Imports:** `drizzle-orm`, `@/core/decimal`, `@/core/types`, `@/db/pool`, `@/db/schema`

### `src/filters/index.ts` (10 lines)
**Exports:** barrel re-exports

---

## L4: knn (558 lines)

### `src/knn/decision.ts` (206 lines)
**Exports:** `KnnDecision`, `KnnDecisionResult`, `KnnDecisionConfig`, `FEE_RATE`, `makeDecision()`, `updateSignalKnnDecision()`, `loadKnnDecisionConfig()`
**Imports:** `drizzle-orm`, `@/core/types`, `@/db/pool`, `@/db/schema`, `@/knn/time-decay`

### `src/knn/engine.ts` (203 lines)
**Exports:** `KnnSearchOptions`, `KnnConfig`, `loadKnnConfig()`, `searchKnn()`
**Imports:** `drizzle-orm`, `@/db/pool`, `@/db/schema`, `@/knn/time-decay`

### `src/knn/time-decay.ts` (138 lines)
**Exports:** `TimeDecayConfig`, `TIME_DECAY_STEPS`, `KnnNeighbor`, `WeightedNeighbor`, `calcTimeDecay()`, `applyTimeDecay()`, `loadTimeDecayConfig()`
**Imports:** (none)

### `src/knn/index.ts` (11 lines)
**Exports:** barrel re-exports

---

## L5: signals (1,083 lines)

### `src/signals/watching.ts` (470 lines)
**Exports:** `WatchingResult`, `detectWatching()`, `checkInvalidation()`, `openWatchSession()`, `invalidateWatchSession()`, `updateWatchSessionTp()`, `getActiveWatchSession()`, `OpenWatchSessionParams`
**Imports:** `decimal.js`, `drizzle-orm`, `@/core/decimal`, `@/core/types`, `@/db/pool`, `@/db/schema`, `@/indicators/types`

### `src/signals/safety-gate.ts` (320 lines)
**Exports:** `SafetyResult`, `checkSafety()`, `updateSignalSafety()`, `WICK_RATIO_THRESHOLD`, `BOX_MA20_MARGIN_RATIO`, `ABNORMAL_CANDLE_MULTIPLE`
**Imports:** `decimal.js`, `drizzle-orm`, `@/core/decimal`, `@/core/types`, `@/db/pool`, `@/db/schema`, `@/indicators/types`

### `src/signals/evidence-gate.ts` (281 lines)
**Exports:** `EvidenceResult`, `calcSlPrice()`, `checkEvidence()`, `createSignal()`
**Imports:** `decimal.js`, `@/core/decimal`, `@/core/types`, `@/db/pool`, `@/db/schema`, `@/indicators/types`

### `src/signals/index.ts` (12 lines)
**Exports:** barrel re-exports

---

## L5: positions (1,184 lines)

### `src/positions/ticket-manager.ts` (386 lines)
**Exports:** `CreateTicketParams`, `CloseTicketParams`, `InvalidStateError`, `DuplicateTicketError`, `TicketNotFoundError`, `createTicket()`, `transitionTicket()`, `closeTicket()`, `getActiveTicket()`, `getTicketById()`
**Imports:** `drizzle-orm`, `@/core/decimal`, `@/core/types`, `@/db/pool`, `@/db/schema`, `./fsm`

### `src/positions/pyramid.ts` (353 lines)
**Exports:** `PyramidConfig`, `PyramidCheckResult`, `EntryResult`, `PyramidSlippageConfig`, `ExecuteEntryFn`, `ExecutePyramidParams`, `canPyramid()`, `executePyramid()`, `loadPyramidConfig()`
**Imports:** `drizzle-orm`, `@/core/decimal`, `@/core/logger`, `@/core/ports`, `@/core/types`, `@/db/pool`, `@/db/schema`, `./sizer`

### `src/positions/sizer.ts` (225 lines)
**Exports:** `SizeParams`, `SizeResult`, `MinSizeError`, `InvalidSlError`, `getRiskPct()`, `calculateSize()`
**Imports:** `@/core/decimal`, `@/core/ports`, `@/core/types`

### `src/positions/fsm.ts` (181 lines)
**Exports:** `FsmEvent`, `InvalidTransitionError`, `canTransition()`, `validateTransition()`, `getNextState()`, `getAllowedTransitions()`, `SYMBOL_STATE_TRANSITION_MAP`, `InvalidSymbolStateTransitionError`, `canSymbolStateTransition()`, `validateSymbolStateTransition()`, `getAllowedSymbolStateTransitions()`
**Imports:** `@/core/types`

### `src/positions/index.ts` (39 lines)
**Exports:** barrel re-exports

---

## L5: limits (443 lines)

### `src/limits/loss-limit.ts` (424 lines)
**Exports:** `LossViolation`, `LossTimeframe`, `LossLimitResult`, `AccountDailyLimitResult`, `LossLimitConfig`, `SymbolLossState`, `LastResets`, `ResetResult`, `checkLossLimit()`, `recordLoss()`, `loadLossLimitConfig()`, `checkAccountDailyLimit()`, `shouldResetDaily()`, `shouldResetSession()`, `shouldResetHourly()`, `resetDailyLosses()`, `resetSessionLosses()`, `resetHourlyLosses()`, `resetAllExpired()`
**Imports:** `decimal.js`, `drizzle-orm`, `@/core/decimal`, `@/db/pool`, `@/db/schema`

### `src/limits/index.ts` (19 lines)
**Exports:** barrel re-exports

---

## L6: orders (766 lines)

### `src/orders/executor.ts` (596 lines)
**Exports:** `ExecutionModeError`, `SpreadCheckConfig`, `ExecuteEntryParams`, `OrderRecord`, `ExecuteEntryResult`, `EmergencyCloseParams`, `RecordOrderParams`, `recordOrder()`, `emergencyClose()`, `executeEntry()`
**Imports:** `decimal.js`, `@/core/decimal`, `@/core/logger`, `@/core/ports`, `@/core/types`, `@/db/schema`, `./slippage`

### `src/orders/slippage.ts` (159 lines)
**Exports:** `SpreadCheckResult`, `SlippageResult`, `SlippageConfig`, `checkSlippage()`, `checkSpread()`, `loadSlippageConfig()`
**Imports:** `decimal.js`, `drizzle-orm`, `@/core/decimal`, `@/db/pool`, `@/db/schema`

### `src/orders/index.ts` (11 lines)
**Exports:** barrel re-exports

---

## L6: exits (843 lines)

### `src/exits/manager.ts` (494 lines)
**Exports:** `ExitTicket`, `ProcessExitParams`, `ExitResult`, `ProcessTrailingParams`, `TrailingUpdateResult`, `TpUpdateParams`, `TpUpdateResult`, `MfeMaeUpdateParams`, `MfeMaeUpdateResult`, `processExit()`, `processTrailing()`, `updateTpPrices()`, `updateMfeMae()`
**Imports:** `decimal.js`, `@/core/decimal`, `@/core/logger`, `@/core/ports`, `@/core/types`, `@/db/schema`, `@/orders/executor`, `./checker`, `./trailing`

### `src/exits/checker.ts` (214 lines)
**Exports:** `ExitActionType`, `ExitAction`, `MfeMaeResult`, `CheckExitInput`, `checkExit()`, `calcCloseSize()`, `calcMfeMae()`
**Imports:** `decimal.js`, `@/core/decimal`, `@/core/types`

### `src/exits/trailing.ts` (103 lines)
**Exports:** `DEFAULT_TRAILING_RATIO`, `TrailingParams`, `TrailingResult`, `calculateTrailingSl()`, `shouldUpdateTrailingSl()`, `calcMaxProfit()`
**Imports:** `decimal.js`, `@/core/decimal`, `@/core/types`

### `src/exits/index.ts` (32 lines)
**Exports:** barrel re-exports

---

## L6: labeling (205 lines)

### `src/labeling/engine.ts` (198 lines)
**Exports:** `TicketNotFoundError`, `FinalizeLabelResult`, `classifyResult()`, `classifyGrade()`, `finalizeLabel()`
**Imports:** `decimal.js`, `drizzle-orm`, `@/core/decimal`, `@/core/types`, `@/db/pool`, `@/db/schema`

### `src/labeling/index.ts` (7 lines)
**Exports:** barrel re-exports

---

## L7: reconciliation (538 lines)

### `src/reconciliation/worker.ts` (356 lines)
**Exports:** `ReconciliationConfig`, `ExchangeError`, `ReconciliationRunResult`, `ReconciliationHandle`, `ReconciliationDeps`, `runOnce()`, `startReconciliation()`
**Imports:** `@/core/logger`, `@/core/ports`, `@/core/types`, `./comparator`

### `src/reconciliation/comparator.ts` (162 lines)
**Exports:** `TicketSnapshot`, `MatchedPair`, `UnmatchedPosition`, `OrphanedTicket`, `ExcludedPosition`, `ReconciliationResult`, `isRecentTicket()`, `comparePositions()`
**Imports:** `@/core/ports`, `@/core/types`

### `src/reconciliation/index.ts` (20 lines)
**Exports:** barrel re-exports

---

## L7: notifications (254 lines)

### `src/notifications/slack.ts` (246 lines)
**Exports:** `SlackEventType`, `SlackAlertDetails`, `SlackPayload`, `getWebhookUrl()`, `formatMessage()`, `sendSlackAlert()`
**Imports:** `drizzle-orm`, `drizzle-orm/pg-core`, `@/core/logger`, `@/db/schema`

### `src/notifications/index.ts` (8 lines)
**Exports:** barrel re-exports

---

## L7: transfer (397 lines)

### `src/transfer/scheduler.ts` (191 lines)
**Exports:** `TransferSchedulerDeps`, `TransferScheduler`
**Imports:** `./executor`

### `src/transfer/executor.ts` (113 lines)
**Exports:** `TransferResult`, `TransferExecutorDeps`, `executeTransfer()`
**Imports:** `@/core/decimal`, `@/core/ports`, `./balance`

### `src/transfer/balance.ts` (77 lines)
**Exports:** `TransferableResult`, `TransferableParams`, `calculateTransferable()`
**Imports:** `@/core/decimal`

### `src/transfer/index.ts` (16 lines)
**Exports:** barrel re-exports

---

## L8: api (1,283 lines)

### `src/api/auth.ts` (177 lines)
**Exports:** `AuthDeps`, `verifyPassword()`, `generateToken()`, `createAuthRoutes()`
**Imports:** `hono`, `hono/jwt`

### `src/api/middleware.ts` (122 lines)
**Exports:** `createAuthGuard()`, `corsMiddleware()`, `errorHandler()`, `queryTimeout()`
**Imports:** `hono`, `hono/cookie`, `hono/cors`, `hono/http-exception`, `hono/jwt`, `hono/utils/jwt/types`

### `src/api/server.ts` (141 lines)
**Exports:** `createApiServer()`
**Imports:** `hono`, `hono/bun`, `@/api/middleware`, all route modules, `@/api/types`

### `src/api/types.ts` (81 lines)
**Exports:** `RouteDeps`, `ApiServerDeps`, `ApiServerHandle`
**Imports:** all route Deps types, `@/core/logger`

### `src/api/routes/control.ts` (168 lines)
**Exports:** `ExecutionMode`, `KillSwitchResult`, `TradeBlockInput`, `ControlDeps`, `createControlRoutes()`
**Imports:** `hono`

### `src/api/routes/tickets.ts` (139 lines)
**Exports:** `TicketRow`, `TicketFilters`, `TicketQueryResult`, `TicketsDeps`, `createTicketRoutes()`
**Imports:** `hono`

### `src/api/routes/transfers.ts` (123 lines)
**Exports:** `TransferEventRow`, `TransfersDeps`, `createTransferRoutes()`
**Imports:** `hono`, `@/transfer/executor`

### `src/api/routes/positions.ts` (81 lines)
**Exports:** `PositionRow`, `PositionsDeps`, `createPositionsRoutes()`
**Imports:** `hono`

### `src/api/routes/signals.ts` (77 lines)
**Exports:** `SignalRow`, `SignalsDeps`, `createSignalsRoutes()`
**Imports:** `hono`

### `src/api/routes/events.ts` (71 lines)
**Exports:** `EventRow`, `EventsDeps`, `createEventsRoutes()`
**Imports:** `hono`

### `src/api/routes/health.ts` (68 lines)
**Exports:** `HealthDeps`, `createHealthRoutes()`
**Imports:** `hono`

### `src/api/routes/stats.ts` (66 lines)
**Exports:** `StatsResult`, `StatsDeps`, `createStatsRoutes()`
**Imports:** `hono`

### `src/api/routes/symbol-states.ts` (64 lines)
**Exports:** `SymbolStateRow`, `SymbolStatesDeps`, `createSymbolStatesRoutes()`
**Imports:** `hono`

### `src/api/routes/config.ts` (62 lines)
**Exports:** `TradeBlockRow`, `ConfigResult`, `ConfigDeps`, `createConfigRoutes()`
**Imports:** `hono`

### `src/api/index.ts` (20 lines)
**Exports:** barrel re-exports

---

## L8: backtest (2,514 lines)

### `src/backtest/mock-adapter.ts` (509 lines)
**Exports:** `MockAdapterConfig`, `MockExchangeAdapter`
**Imports:** `@/core/decimal`, `@/core/ports`, `@/core/types`

### `src/backtest/pipeline-adapter.ts` (499 lines)
**Exports:** `BacktestCollectors`, `createBacktestPipelineDeps()`
**Imports:** `decimal.js`, `@/core/decimal`, `@/core/ports`, `@/core/types`, `@/db/event-log`, `@/db/pool`, `@/db/schema`, `@/exits/checker`, `@/exits/manager`, `@/indicators/index`, `@/knn/engine`, `@/knn/time-decay`, `@/knn/decision`, `@/limits/loss-limit`, `@/notifications/slack`, `@/orders/executor`, `@/positions/pyramid`, `@/positions/sizer`, `@/positions/ticket-manager`, `@/signals/evidence-gate`, `@/signals/safety-gate`, `@/signals/watching`, `@/vectors/repository`, `@/vectors/vectorizer`, `@/filters/daily-direction`, `./mock-adapter`

### `src/backtest/metrics.ts` (310 lines)
**Exports:** `BasicMetrics`, `AdvancedMetrics`, `FullMetrics`, `calcBasicMetrics()`, `calcAdvancedMetrics()`, `calcFullMetrics()`
**Imports:** `@/core/decimal`, `@/backtest/engine`

### `src/backtest/wfo.ts` (298 lines)
**Exports:** `WfoConfig`, `WfoWindow`, `WfoWindowResult`, `WfoResult`, `WfoDeps`, `generateWfoWindows()`, `runWfo()`
**Imports:** `@/core/decimal`, `@/backtest/metrics`, `@/backtest/param-search`

### `src/backtest/cli.ts` (271 lines)
**Exports:** `CliArgs`, `parseArgs()`, `runCli()`
**Imports:** `@/backtest/engine`, `@/backtest/wfo`, `@/backtest/reporter`, `@/backtest/param-search`

### `src/backtest/param-search.ts` (243 lines)
**Exports:** `ParamSpace`, `ParamSet`, `ParamResult`, `generateGridCombinations()`, `generateRandomCombinations()`, `runParameterSearch()`
**Imports:** `@/backtest/metrics`

### `src/backtest/engine.ts` (137 lines)
**Exports:** `BacktestConfig`, `BacktestTrade`, `BacktestResult`, `LoadCandles`, `OnCandleClose`, `BacktestRunner`
**Imports:** `@/core/types`, `@/core/decimal`, `./mock-adapter`

### `src/backtest/reporter.ts` (134 lines)
**Exports:** `ReporterDb`, `BacktestReportRow`, `printReport()`, `saveReport()`
**Imports:** `@/backtest/engine`, `@/backtest/metrics`

### `src/backtest/parallel.ts` (112 lines)
**Exports:** `ParallelSearchConfig`, `ParallelSearchManager`
**Imports:** `@/backtest/metrics`, `@/backtest/param-search`

### `src/backtest/index.ts` (1 line)
**Exports:** (empty)

---

## L9: daemon (1,919 lines)

### `src/daemon/pipeline.ts` (967 lines)
**Exports:** `ActiveSymbol`, `PipelineDeps`, `handleCandleClose()`
**Imports:** `decimal.js`, `@/core/logger`, `@/core/ports`, `@/core/types`, `@/db/event-log`, `@/db/pool`, `@/db/schema`, `@/exits/checker`, `@/exits/manager`, `@/indicators/types`, `@/knn/decision`, `@/knn/engine`, `@/knn/time-decay`, `@/limits/loss-limit`, `@/notifications/slack`, `@/orders/executor`, `@/orders/slippage`, `@/positions/pyramid`, `@/positions/ticket-manager`, `@/signals/evidence-gate`, `@/signals/safety-gate`, `@/signals/watching`, `@/vectors/repository`

### `src/daemon/crash-recovery.ts` (463 lines)
**Exports:** `CrashRecoveryResult`, `CrashRecoveryDeps`, `recoverFromCrash()`
**Imports:** `@/core/logger`, `@/core/ports`, `@/core/types`, `@/orders/executor`, `@/reconciliation/comparator`

### `src/daemon.ts` (245 lines)
**Exports:** `DaemonDeps`, `DaemonHandle`, `startDaemon()`
**Imports:** `@/api/types`, `@/candles/index`, `@/core/logger`, `@/core/ports`, `@/core/types`, `@/daemon/crash-recovery`, `@/daemon/pipeline`, `@/daemon/shutdown`, `@/reconciliation/worker`

### `src/daemon/shutdown.ts` (244 lines)
**Exports:** `PendingOrder`, `ShutdownDeps`, `gracefulShutdown()`, `getExecutionMode()`, `buildGetPendingOrders()`
**Imports:** `drizzle-orm`, `@/core/logger`, `@/core/ports`, `@/core/types`, `@/db/pool`, `@/db/schema`

---

## Web SPA (3,429 lines)

### Pages
| File | Lines | Exports |
|------|-------|---------|
| `src/web/src/pages/LoginPage.tsx` | 180 | `LoginPage` |
| `src/web/src/pages/DashboardPage.tsx` | 66 | `DashboardPage` |
| `src/web/src/pages/TradesPage.tsx` | 65 | `TradesPage` |

### Components — Dashboard
| File | Lines | Exports |
|------|-------|---------|
| `src/web/src/components/dashboard/TransferHistory.tsx` | 419 | `TransferHistory` |
| `src/web/src/components/dashboard/PositionsTable.tsx` | 241 | `PositionsTable` |
| `src/web/src/components/dashboard/RecentTrades.tsx` | 166 | `RecentTrades` |
| `src/web/src/components/dashboard/SymbolCard.tsx` | 158 | `SymbolCard`, `SymbolCardSkeleton` |
| `src/web/src/components/dashboard/SystemStatusRow.tsx` | 138 | `SystemStatusRow` |
| `src/web/src/components/dashboard/RecentSignals.tsx` | 120 | `RecentSignals` |
| `src/web/src/components/dashboard/TodayPerformance.tsx` | 80 | `TodayPerformance` |

### Components — Trades
| File | Lines | Exports |
|------|-------|---------|
| `src/web/src/components/trades/TradesTable.tsx` | 237 | `TradesTable` |
| `src/web/src/components/trades/Pagination.tsx` | 171 | `Pagination` |
| `src/web/src/components/trades/PerformanceSummary.tsx` | 153 | `PerformanceSummary` |
| `src/web/src/components/trades/TradeFilters.tsx` | 152 | `TradeFilters` |

### Components — Modals
| File | Lines | Exports |
|------|-------|---------|
| `src/web/src/components/modals/ModeChangeModal.tsx` | 137 | `ModeChangeModal` |
| `src/web/src/components/modals/KillSwitchModal.tsx` | 129 | `KillSwitchModal` |

### Components — Layout
| File | Lines | Exports |
|------|-------|---------|
| `src/web/src/components/Header.tsx` | 256 | `Header`, `NavLink` |
| `src/web/src/components/Layout.tsx` | 25 | `Layout` |

### Hooks & Stores
| File | Lines | Exports |
|------|-------|---------|
| `src/web/src/hooks/useApi.ts` | 201 | `useHealth`, `useSymbolStates`, `usePositions`, `useStats`, `useSignalsRecent`, `useEventsRecent`, `useConfig`, `useTickets`, `useTradeStats` + types |
| `src/web/src/hooks/useTransfers.ts` | 64 | `useTransferHistory`, `useTriggerTransfer`, `TransferEvent` |
| `src/web/src/lib/api.ts` | 72 | `ApiResponseError`, `setOnUnauthorized()`, `apiGet()`, `apiPost()` |
| `src/web/src/stores/auth.ts` | 69 | `useAuthStore`, `AuthState` |

### Entry
| File | Lines | Exports |
|------|-------|---------|
| `src/web/src/main.tsx` | 28 | (entry point) |
| `src/web/src/App.tsx` | 17 | `App` |
| `src/web/vite.config.ts` | 13 | Vite config |
| `src/web/src/env.d.ts` | 1 | Vite env types |

---

## Scripts (939 lines)

### `scripts/kill-switch.ts` (382 lines)
**Exports:** `OpenOrder`, `KillSwitchDeps`, `KillSwitchResult`, `killSwitch()`
**Imports:** `@/core/logger`, `@/core/ports`, `@/core/types`, `@/orders/executor`, `drizzle-orm`, `@/db/pool`, `@/db/schema`, `@/db/event-log`, `@/notifications/slack`, `@/exchanges/index`

### `scripts/check-layers.ts` (286 lines)
**Exports:** `LAYER_MAP`, `Violation`, `moduleFromFilePath()`, `moduleFromImport()`, `parseImports()`, `collectTsFiles()`, `checkFile()`, `checkLayers()`
**Imports:** `node:fs`, `node:path`, `node:url`

### `scripts/transfer-now.ts` (202 lines)
**Exports:** `TransferNowArgs`, `parseArgs()`
**Imports:** `@/core/decimal`, `@/core/ports`, `@/transfer/balance`, `@/transfer/executor`

### `scripts/bench-indicators.ts` (66 lines)
**Exports:** (none — executable)
**Imports:** `@/core/decimal`, `@/core/types`, `@/indicators`

### `scripts/seed.ts` (3 lines)
**Exports:** (none — calls `seed()`)
**Imports:** `@/config/seed`
