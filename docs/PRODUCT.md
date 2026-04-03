# PRODUCT.md

## One-line pitch
Automated crypto futures trading system implementing Kim Jikseon's Double-BB strategy with KNN-based statistical validation across multiple exchanges.

## Problem
Manual execution of the Double-BB trading strategy is subject to human emotion, missed entries, inconsistent position sizing, and inability to monitor markets 24/7. The system automates direction filtering (1D), context detection (1H), precise entry (5M/1M), and mechanical risk management across BTCUSDT and XAUTUSDT on 4 exchanges.

## Target users
- Single operator (설계자 병화) running the bot with 300K~30M KRW capital

## Core capabilities
- Multi-timeframe candle collection (1D/1H/5M/1M) via WebSocket per exchange
- Daily direction filter (LONG_ONLY / SHORT_ONLY / NEUTRAL)
- Trade block system (market open, 3-star economic events, funding rate, manual)
- WATCHING state detection on 1H close (squeeze breakout, S/R confluence, BB4 touch)
- Evidence Gate: BB4 touch detection with Double-B vs One-B classification
- Safety Gate: wick ratio, box range center, abnormal candle filters
- 202-dimensional vectorization with Median/IQR normalization
- KNN decision engine (cosine/L2, time decay, A-grade signal boost)
- Dynamic position sizing with Decimal.js precision
- 3-stage exit (TP1→TP2→trailing) with per-ticket independent management
- Pyramiding (add-only, max 2, risk-free prerequisite)
- Multi-exchange ExchangeAdapter abstraction
- Reconciliation worker (1-min cycle, DB↔exchange sync, panic close)
- Crash recovery
- Loss limit (daily 10%, session 3, hourly 2/1)
- Labeling system (WIN/LOSS/TIME_EXIT with full metadata)
- Execution modes (analysis/alert/live)
- Slack alerts
- Web UI dashboard
- Backtesting (same code path as live)
- Walk-Forward Optimization (6mo IS / 2mo OOS / 1mo roll)

## Non-goals
- Multi-user support
- Spot trading
- Strategies other than Double-BB
- Mobile native app

## Constraints
- Single Bun process (no microservices)
- Decimal.js for all monetary calculations (no float)
- Structural anchors immutable: BB20(20,2), BB4(4,4), MA periods(20/60/120)
- Candle collection per exchange (same symbol has different prices across exchanges); orders routed to corresponding exchange
- Max leverage 38x hard cap
- Rate limits vary by exchange (Binance 1200/min → MEXC 20/s)
- Single-user password → JWT (HttpOnly cookie) for web UI

## Success metrics
- Backtest: expectancy > 0, MDD within tolerance
- WFO: OOS expectancy > 0, WFO efficiency > 0.5
- Analysis mode: signal frequency/ratio matches backtest (2+ weeks)
- Alert mode: 10+ completed trades execute correctly (2+ weeks)
- Runtime: Reconciliation match rate ≥ 99%
- Runtime: SL always registered on exchange (survives daemon crash)
- Runtime: Loss limits fire correctly at all 3 levels

## Assumptions
- Each exchange provides WebSocket kline streams for all required timeframes (Binance first, then OKX/Bitget/MEXC)
- CCXT abstracts enough exchange differences that ExchangeAdapter layer is thin
- pgvector HNSW is sufficient for 202-dim KNN with ~100K vectors per symbol
- Investing.com API can provide 3-star economic event schedule reliably
- Bun WebSocket client is production-stable for 24/7 operation
- Single Bun process handles 2 symbols × N exchanges × 4 TF + reconciliation + web server
- MEXC may need 2-step order flow (entry then SL separately)

## Visual Identity
- Design system: `docs/DESIGN_SYSTEM.md`
- Design tokens (CSS): `docs/assets/tokens.css`
- Design tokens (JSON): `docs/assets/tokens.json`
- Dark mode default, emerald green primary, data-dense trading terminal aesthetic

## Open questions
- XAUTUSDT futures availability on all 4 exchanges (fallback: PAXGUSDT or BTCUSDT only)
- MEXC editOrder support for SL modification (fallback: cancel+create)
- Investing.com API access method and reliability
- Exact partial close API differences across exchanges
