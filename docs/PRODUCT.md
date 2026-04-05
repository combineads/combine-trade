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
- Safety Gate: wick ratio (5M: 0.1, 1M: 1.0), box range center, abnormal candle filters
- 1M noise filter: 5M MA20 direction must match daily bias (§7.7)
- 5M/1M simultaneous signal: 1M priority (tighter SL → better R:R). 1H BB4 touch → A-grade (§7.16)
- 202-dimensional vectorization: 38봉×5 candle features (190) + 12 strategy features, Median/IQR normalization (lookback=60, clamp(-3,3)→[0,1])
- KNN decision engine (cosine/L2, time decay, A-grade boost: winrate→50%, samples→20, commission 0.08% deducted)
- Dynamic position sizing with Decimal.js precision
- 3-stage exit (TP1→TP2→trailing) with per-ticket independent management
- Pyramiding (add-only, max 2, risk-free prerequisite)
- Multi-exchange ExchangeAdapter abstraction
- Reconciliation worker (1-min cycle, DB↔exchange sync, panic close)
- Crash recovery
- Loss limit (daily 10%, session 3, hourly 2/1)
- Labeling system (WIN/LOSS/TIME_EXIT with full metadata)
- Execution modes (analysis/alert/live)
- Slack alerts (entry, exit, consecutive loss record, slippage abort, daily loss limit, auto-transfer)
- Auto-transfer: futures → spot daily (50% of daily realized profit, min 10 USDT, Binance auto / others Slack alert)
- Web UI dashboard (3 screens: login, dashboard, trade history)
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

## Runtime KPI monitoring (PRD §9)
런타임 중 다음 KPI를 감시하고, 임계치 초과 시 Slack으로 경고한다.

| KPI | 경고 기준 | 알림 |
|-----|----------|------|
| MDD (최대 낙폭) | 10% 초과 | `⚠️ MDD {pct}% — 10% 초과` |
| 최대 연속 손실 | 역대 최대 갱신 | `⚠️ 전략 점검 필요: 연속 {n}회 손실` |
| 최근 30건 expectancy | 음수 전환 | `⚠️ 최근 30건 expectancy 음수 전환: {value}` |
| Reconciliation 일치율 | 99% 미만 | `⚠️ Reconciliation 일치율 {pct}% — 99% 미만` |

> KPI 경고는 알림만 발송하며, 자동 매매 중단은 하지 않는다 (판단은 운영자). 자동 중단은 Loss Limit이 담당.

## Deployment strategy (PRD §10)

| 단계 | 기간 | 내용 | 통과 기준 |
|------|------|------|----------|
| 백테스트 | — | 심볼×거래소별 WFO 검증 | expectancy > 0, MDD 감당 가능 |
| analysis | 2주+ | 30만원, 신호 기록만 | 빈도·비율 백테스트와 유사 |
| alert 최소자본 | 2주+ | 30만원/3%, 실제 주문 | 10건+ 완결 거래 정상 |
| 자본 확대 | — | 3천만원, risk_pct 1%로 하향, pyramid_count 확장 | KPI 지속 양호 |

## risk_pct 티어 (PRD §7.11)

| 시드 규모 | risk_pct | 1회 최대 손실 |
|----------|---------|-------------|
| 30만원 | 3% | 9,000원 |
| 3천만원 | 1% | 30만원 |

> 시드 30만원에서 시작하여 배포 단계를 거친 후, 자본 확대 시 risk_pct를 3%→1%로 하향.

## History data collection policy (PRD §3.4)

| 타임프레임 | 수집 기간 | 비고 |
|-----------|----------|------|
| 1D / 1H / 5M | 3년 | 거래소별 수집 |
| 1M | 6개월 | rolling 갱신 |

- 거래소 추가 시 해당 거래소의 히스토리 데이터도 동일 기간 수집
- 1M 6개월 초과 데이터는 아카이빙/삭제 대상 (KNN time decay로 가중치 감소)

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
