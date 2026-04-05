# Code Registry

> schema: v2 | 22,379 lines | 130 files | 23 modules | Last: 2026-04-05

| Module | Layer | Files | Lines | Purpose | MODULE.md |
|--------|-------|-------|-------|---------|-----------|
| core | L0 | 6 | 856 | Types, constants, Decimal wrappers, ports | src/core/MODULE.md |
| db | L1 | 6 | 919 | Schema (13 tables), pool, event-log, queries | src/db/MODULE.md |
| config | L1 | 4 | 911 | Config loader, schema validation, seed data | src/config/MODULE.md |
| indicators | L2 | 7 | 357 | BB20, BB4, MA, RSI, ATR, squeeze | src/indicators/MODULE.md |
| exchanges | L2 | 8 | 1,582 | BaseExchangeAdapter + 4 concrete adapters | src/exchanges/MODULE.md |
| candles | L3 | 9 | 1,587 | CandleManager, collector, history, gap recovery | src/candles/MODULE.md |
| vectors | L3 | 5 | 1,870 | Vectorizer (202-dim), normalizer, features | src/vectors/MODULE.md |
| filters | L4 | 3 | 350 | Daily direction, trade blocks | src/filters/MODULE.md |
| knn | L4 | 4 | 558 | KNN engine, time decay, decision | src/knn/MODULE.md |
| signals | L5 | 4 | 1,083 | Watching, evidence gate, safety gate | src/signals/MODULE.md |
| positions | L5 | 5 | 1,184 | FSM, ticket manager, sizer, pyramid | src/positions/MODULE.md |
| limits | L5 | 2 | 443 | Loss limit (daily/session/hourly) | src/limits/MODULE.md |
| orders | L6 | 3 | 766 | Order executor, slippage check | src/orders/MODULE.md |
| exits | L6 | 4 | 843 | 3-stage exit, trailing stop, MFE/MAE | src/exits/MODULE.md |
| labeling | L6 | 2 | 205 | Trade result classification | src/labeling/MODULE.md |
| reconciliation | L7 | 3 | 538 | Position reconciliation worker | src/reconciliation/MODULE.md |
| notifications | L7 | 2 | 254 | Slack webhook alerts | src/notifications/MODULE.md |
| transfer | L7 | 4 | 397 | Futures→spot auto transfer | src/transfer/MODULE.md |
| api | L8 | 14 | 1,283 | REST routes (Hono), auth, middleware | src/api/MODULE.md |
| backtest | L8 | 10 | 2,514 | Engine, WFO, mock adapter, CLI | src/backtest/MODULE.md |
| daemon | L9 | 4 | 1,919 | Pipeline, crash recovery, shutdown | src/daemon/MODULE.md |
| web | — | 22 | 3,429 | React SPA (dashboard, trades, login) | src/web/MODULE.md |
| scripts | — | 5 | 939 | kill-switch, check-layers, seed, etc. | — |
