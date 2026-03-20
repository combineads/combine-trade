# Combine Trade — UI/UX AI Design Prompts

> 각 프롬프트는 AI 디자인 도구(Figma AI, Midjourney, v0, Pencil 등)에 바로 사용할 수 있도록 작성됨.
> 전체 디자인 시스템: **다크 테마 우선**, 크립토 트레이딩 전문가용, 데스크탑 퍼스트 (Tauri + Next.js).

---

## 0. 글로벌 디자인 시스템

```
Design a professional dark-theme design system for a crypto futures trading desktop application called "Combine Trade".

Platform: Desktop app (Tauri wrapping Next.js), also accessible via web browser.
Target user: Solo crypto futures trader who writes TypeScript strategies.

Color palette:
- Background: #0A0A0F (near-black), #12121A (card surface), #1A1A2E (elevated surface)
- Primary: #22C55E (green-500, main actions, CTAs, navigation highlights, active states)
- Secondary: #EF4444 (red-500, secondary actions, SHORT, loss, kill switch, destructive)
- Profit/Win/LONG: #22C55E (green-500, same as primary — profit and positive states)
- Loss/SHORT/Danger: #EF4444 (red-500, same as secondary — loss and negative states)
- Warning: #F59E0B (amber-500 for alerts, caution)
- Neutral text: #E2E8F0 (primary), #94A3B8 (secondary), #475569 (muted)
- Pass/Neutral: #64748B (slate-500 for PASS decisions)
- The green/red duality is intentional: green = positive action/profit, red = caution/loss. This aligns with crypto trading conventions.

Typography:
- UI text: Inter or Geist Sans (clean, neutral)
- Code/numbers: JetBrains Mono or Geist Mono (monospace for prices, code, stats)
- Prices and financial numbers always in monospace, right-aligned

Component patterns:
- Cards with subtle border (#1E293B) and no drop shadow
- Tables with alternating row opacity (not color)
- Status badges: pill-shaped, color-coded (green=active/running, red=stopped/error, amber=warning/paused, slate=inactive/draft)
- Buttons: primary (green filled), secondary (red outline/ghost for caution actions), tertiary (neutral ghost/outline), danger (red filled for destructive actions)
- Charts: dark background, thin gridlines (#1E293B), colored data series

Color philosophy:
- Green is the PRIMARY identity color of Combine Trade — used for all main CTAs, navigation accents, active/selected states, links, progress indicators, and positive outcomes (profit, WIN, LONG).
- Red is the SECONDARY identity color — used for caution, danger, destructive actions, negative outcomes (loss, LOSS, SHORT), kill switch, and warnings that need immediate attention.
- This green/red duality creates a clear visual language: green = go/positive, red = stop/negative — directly mapping to trading psychology.

Layout:
- Fixed left sidebar navigation (collapsible, 64px collapsed / 240px expanded)
- Top bar: ticker tape (scrolling prices) + system status indicators
- Content area: responsive grid, max-width 1440px
- All financial data right-aligned in tables
```

---

## 1. Login 페이지

```
Design a minimal, secure-feeling login page for "Combine Trade" — a crypto trading system.

Context: Single-user system but authentication is mandatory because real funds are at stake. The user sees this page when first opening the desktop app or web interface.

Layout:
- Centered login card on a dark background (#0A0A0F)
- Subtle animated gradient or grid pattern in background (very subtle, not distracting)
- "Combine Trade" logo/wordmark at top of card
- Tagline below logo: "Strategy-Defined Vector Trading" in muted text

Login card contents:
- Username input field (pre-filled with "admin" for single-user, editable)
- Password input field with show/hide toggle
- "Remember me" checkbox (extends session to 7 days)
- "Sign In" primary button (green filled, full width)
- Error state: red border on inputs + error message below

Visual cues for security:
- Small lock icon next to "Sign In" button
- Subtle text at bottom: "All API endpoints require authentication. Your exchange keys are AES-256 encrypted."

States to design:
1. Default (empty form)
2. Filled form (ready to submit)
3. Loading (button shows spinner)
4. Error (invalid credentials, red feedback)
5. Success (brief green flash before redirect)

No social login, no "forgot password", no registration link — single user system.
Dark theme only for this page.
```

---

## 2. Dashboard (메인 대시보드)

```
Design the main dashboard for "Combine Trade" — a real-time crypto futures trading system.

This is the home screen the trader sees after login. It provides an at-a-glance overview of the entire trading system status.

Top section — Ticker Tape:
- Horizontal scrolling ribbon showing watched symbols with prices and 24h change
- Format: "BTCUSDT $67,234.50 +2.3%" with green/red color for change
- This runs continuously across the full width

Layout: 4-column grid on desktop

Row 1 — Key Metrics (4 stat cards):
1. "Total PnL Today" — large number with +/- color, small sparkline
2. "Active Strategies" — count with status breakdown (e.g., "5 running, 2 paused")
3. "Open Positions" — count with total unrealized PnL
4. "Pipeline Health" — green/yellow/red indicator with latency "avg 120ms"

Row 2 — Main content (2 columns):

Left column (wider, ~60%):
- "Recent Decisions" live feed — scrolling list of latest decisions:
  Each row: timestamp | strategy name | symbol | direction badge (LONG green / SHORT red / PASS gray) | winrate | expectancy
  New entries slide in from top with subtle animation
  Show last 20 decisions

Right column (~40%):
- "System Status" panel:
  - Worker status list: candle-collector, strategy-worker, vector-worker, label-worker, alert-worker, execution-worker
  - Each: name + status dot (green=healthy, red=down) + last heartbeat time
  - Pipeline latency gauge: p50 / p95 / p99 in real-time
- "Quick Actions" panel:
  - Kill Switch button (large, red, prominent) with ON/OFF state
  - Mode selector: Analysis / Alert / Paper / Auto-Trade
  - "Run Backtest" shortcut button

Row 3 — Charts (2 columns):

Left:
- "Daily PnL" — bar chart showing today's realized PnL per trade (green/red bars)
- Time axis: hours of today

Right:
- "Strategy Performance" — horizontal bar chart comparing strategies by winrate
- Each bar labeled: strategy name + winrate percentage

Bottom section:
- "Recent Alerts" — last 5 Slack alerts with delivery status (sent/failed)
- "Recent Orders" — last 5 orders with status badges (filled/pending/rejected)

Real-time updates: elements that update via SSE should have a subtle pulse/glow when new data arrives.
Kill switch should be ALWAYS visible and accessible — it's a safety-critical control.
```

---

## 3. Strategies 목록 페이지

```
Design the strategy list page for "Combine Trade".

Purpose: View all trading strategies, their status, performance summary, and manage them.

Top bar:
- Page title: "Strategies"
- "New Strategy" button (green, primary) on the right
- Filter/search bar: text search + status filter (active/paused/draft) + direction filter (LONG/SHORT)

Strategy list — Card grid layout (2 columns on desktop):

Each strategy card contains:
- Header row: Strategy name (bold) + version badge "v3" (small pill) + status badge (active/paused/draft)
- Direction badge: "LONG" (green pill) or "SHORT" (red pill)
- Symbols: "BTCUSDT, ETHUSDT" as small tags
- Timeframe: "15m" tag
- Execution mode: "Alert" / "Paper" / "Auto-Trade" with corresponding icon

Performance metrics row (4 mini stats):
- Winrate: "62.5%" with color indicator (green if ≥55%, amber if close, red if below)
- Expectancy: "+0.85%" with color
- Total trades: "347"
- Avg hold: "12 bars"

Decision criteria row (smaller text):
- "Min samples: 30 | Min winrate: 55% | Min expectancy: >0"

Footer row:
- "Last event: 5 min ago" timestamp
- Quick actions: Edit (pencil icon) | Backtest (play icon) | Toggle mode (dropdown) | More (...)

States:
1. Active strategy — normal card, green status dot
2. Paused strategy — dimmed card, amber status dot
3. Draft strategy — dashed border, gray status dot
4. Strategy with kill switch active — red border accent, warning icon

Empty state: Illustration + "No strategies yet. Create your first strategy to start trading."
```

---

## 4. Strategy 에디터 (생성/편집)

```
Design a full-screen strategy editor page for "Combine Trade".

This is where traders write TypeScript strategy code with a Monaco Editor and configure strategy parameters.

Layout: Split-pane (resizable divider)

Left pane (~55%) — Code Editor:
- Monaco Editor (dark theme matching VS Code Dark+)
- Full TypeScript syntax highlighting and autocompletion
- Strategy API type hints visible (candle, sma, ema, rsi, macd, bb, atr, defineFeature, etc.)
- Tab bar at top: "strategy.ts" tab (active) + "Preview" tab
- Line numbers, minimap on right edge
- Bottom status bar: "TypeScript" | "UTF-8" | line:col | errors/warnings count

Right pane (~45%) — Configuration panels (scrollable, accordion sections):

Section 1: "Basic Info"
- Strategy name (text input)
- Direction: LONG / SHORT toggle (radio buttons, color-coded)
- Symbols: multi-select dropdown (BTCUSDT, ETHUSDT, etc.)
- Timeframe: dropdown (1m, 3m, 5m, 15m, 1h, 4h, 1d)

Section 2: "Features & Vectorization"
- Features list (dynamic, from code analysis):
  Each feature: name | normalization type dropdown (ratio, sigmoid, percentile, min-max, boolean) | dimension badge
- Total dimension display: "Dimension: 8"

Section 3: "Search Config"
- Similarity metric: L2 (default, locked)
- Top K: number input (default 50)
- Similarity threshold: auto-calculated "√d × 0.3 = 0.849"
- Min samples: number input (default 30)

Section 4: "Result Config"
- TP %: number input (e.g., 2.0%)
- SL %: number input (e.g., 1.0%)
- Max hold bars: number input (e.g., 48)

Section 5: "Decision Config"
- Min winrate: number input (default 55%)
- Min expectancy: number input (default >0)

Section 6: "Execution Mode"
- Mode selector: Analysis → Alert → Paper → Auto-Trade (step selector)
- Current mode highlighted

Top action bar (sticky):
- Back arrow + "Strategy: {name}" breadcrumb
- "Validate" button (checks TypeScript syntax)
- "Save Draft" button (secondary)
- "Save & Activate" button (primary, green)
- Version indicator: "v3 → v4 (new version will be created)"

Warning banner (when applicable):
- "Saving will create version 4. A new vector table will be created and historical data will be re-vectorized."

States:
1. New strategy (blank editor with template code)
2. Editing existing (code loaded, config populated)
3. Validation error (red squiggly in editor + error panel)
4. Saving (progress indicator + "Creating new vector table...")
5. Unsaved changes (dot indicator on tab, confirmation on navigate away)
```

---

## 5. Strategy Detail 페이지

```
Design the strategy detail page for "Combine Trade".

Purpose: Deep dive into a single strategy's performance, events, statistics, and vector analysis.

Top section — Strategy header:
- Strategy name (large) + version badge "v3" + status badge
- Direction: LONG (green) or SHORT (red) pill
- Symbols as tags + timeframe tag
- Execution mode indicator
- Action buttons: "Edit Strategy" | "Run Backtest" | "Change Mode" | "Pause/Resume"

Tab navigation (horizontal tabs below header):
- Overview | Events | Statistics | Vector Analysis | Backtest Results | Journal

--- Tab: Overview ---

Row 1 — Performance cards (5 columns):
- Winrate: large "62.5%" with circular progress indicator (primary green fill)
- Expectancy: "+0.85%"
- Total events: "1,247"
- Total decisions (LONG+SHORT): "347"
- Pass rate: "72.2%"

Row 2 — TradingView candlestick chart (full width):
- Main chart showing the strategy's primary symbol
- Strategy event markers overlaid:
  - Green up arrow = LONG entry
  - Red down arrow = SHORT entry
  - Green checkmark = WIN exit
  - Red X = LOSS exit
  - Gray clock = TIME_EXIT
- When clicking an event marker: popup showing decision details (winrate, expectancy, sample count, similarity score)
- TP/SL horizontal lines drawn from entry point when event is selected
- Technical indicator overlays (SMA, BB, RSI as per strategy features)

Row 3 — Recent activity (2 columns):
Left: "Recent Events" table — last 10 events with time, direction, result, PnL
Right: "Decision Distribution" — donut chart showing LONG / SHORT / PASS ratio

--- Tab: Events ---
- Full event table with pagination (20 per page)
- Columns: Time | Direction | Entry Price | Features (expandable) | Result | PnL% | Hold Bars | Similarity Score
- Row click → Event detail modal
- Filters: date range, direction, result type (WIN/LOSS/TIME_EXIT/pending)
- Export CSV button

--- Tab: Statistics ---
- Comprehensive statistics grid:
  - Overall: winrate, expectancy, avg_win, avg_loss, profit factor, max consecutive wins/losses
  - By direction: LONG stats vs SHORT stats (side by side)
  - By time: monthly performance heatmap (green=profit, red=loss, intensity=magnitude)
  - Distribution: PnL histogram, hold bars distribution
  - Similarity analysis: avg similarity score for WIN vs LOSS events

--- Tab: Vector Analysis ---
- Visualization of the strategy's vector space
- "Current event" vector highlighted vs nearest neighbors
- Similarity score distribution chart
- Feature importance analysis (which features contribute most to similarity)
- Sample count over time chart (vector table growth)

--- Tab: Backtest Results ---
- Latest backtest summary
- Equity curve (line chart)
- Drawdown chart (area chart, red)
- Monthly returns heatmap
- WIN/LOSS distribution histogram
- Version comparison: overlay equity curves from different versions

--- Tab: Journal ---
- Trade journal entries for this strategy
- Filterable by result, tags, date
- Quick view: entry snapshot + exit context
```

---

## 6. Backtest 페이지

```
Design the backtest execution and results page for "Combine Trade".

Purpose: Run backtests on strategies using 3 years of historical data and analyze results.

Section 1 — Backtest Configuration (top panel):
- Strategy selector: dropdown with strategy names + versions
- Symbol selector: multi-select from strategy's configured symbols
- Date range: start date / end date picker (default: 3 years ago → today)
- Advanced options (collapsible):
  - Custom TP/SL override (optional)
  - Custom decision thresholds (optional)
- "Run Backtest" button (large, green primary)
- Concurrent limit notice: "Max 2 backtests can run simultaneously"

Section 2 — Running Backtest (shown during execution):
- Progress bar with percentage: "Processing: 67% (245,000 / 365,000 candles)"
- Estimated time remaining
- Live stats updating as backtest progresses:
  - Events found so far
  - Current winrate
  - Current equity
- "Cancel" button

Section 3 — Backtest Results (shown after completion):

Summary cards row:
- Total events: 1,247
- Winrate: 62.5%
- Expectancy: +0.85%
- Net PnL: +127.3%
- Max drawdown: -12.4%
- Sharpe ratio: 1.83
- Duration: "3y 0m" | Processing time: "2m 34s"

Charts section (2x2 grid):

Top-left: Equity Curve
- Line chart showing cumulative PnL over time
- Green line for equity, gray line for benchmark (buy & hold)
- Drawdown periods highlighted with red tint

Top-right: Drawdown Chart
- Inverted area chart (red) showing drawdown depth over time
- Max drawdown point labeled

Bottom-left: PnL Distribution
- Histogram of individual trade PnL percentages
- Green bars (positive), red bars (negative)
- Bell curve overlay
- Vertical line at 0%

Bottom-right: Monthly Returns Heatmap
- Grid: months (columns) × years (rows)
- Cell color: green intensity (profit) / red intensity (loss)
- Cell value: monthly PnL percentage

Additional analysis section:
- "Winning Streak Analysis" — bar chart of consecutive wins/losses
- "Hold Duration Distribution" — histogram of bars held per trade
- "Best/Worst Trades" — table of top 5 winners and losers

Version comparison (if multiple backtest results exist):
- Overlay button: "Compare with v2"
- Equity curves overlaid with different colors
- Side-by-side stat comparison table

Action buttons:
- "Apply to Strategy" — use these parameters as strategy config
- "Export Report" — download PDF/CSV
- "Run Again" — re-run with modified parameters
```

---

## 7. Events 페이지

```
Design the events monitoring page for "Combine Trade".

Purpose: Real-time view of all strategy events across all strategies and symbols.

Top section — Live event feed indicator:
- Green dot + "Live" badge (pulsing when SSE connected)
- "Last event: 3 seconds ago"
- Total events today: count

Filter bar:
- Strategy: multi-select dropdown
- Symbol: multi-select dropdown
- Direction: ALL / LONG / SHORT / PASS
- Result: ALL / WIN / LOSS / TIME_EXIT / PENDING
- Date range picker
- "Clear filters" link

Main content — Event table (full width):
Columns:
- Time (timestamp, most recent first)
- Strategy (name + version)
- Symbol (e.g., BTCUSDT)
- Direction (color-coded badge: LONG green, SHORT red, PASS gray)
- Entry Price (monospace, right-aligned)
- Decision (expandable):
  - Winrate: 62.5%
  - Expectancy: +0.85%
  - Samples: 42
  - Reason: "criteria_met" / "insufficient_samples" / "low_winrate" / "negative_expectancy"
- Result (badge: WIN green, LOSS red, TIME_EXIT gray, PENDING amber pulse)
- PnL % (green/red number, monospace)
- Hold Bars
- Actions: View detail (eye icon)

New events animate in from top with a brief highlight glow.
PASS events shown in muted style (lower opacity) — toggle to show/hide.

Event detail modal (on row click):
- Full event context:
  - Strategy name + version
  - Symbol + timeframe
  - Event time
  - Direction + entry price
  - Feature vector (before and after normalization): table of feature name | raw value | normalized value
  - Similarity search results: top 5 similar patterns with scores and their outcomes
  - Decision breakdown: sample_count, winrate, expectancy, avg_win, avg_loss, threshold check results
  - Result (if labeled): type, PnL, MFE, MAE, hold bars, exit price
  - TP/SL lines visualization (mini chart showing entry → exit path)

Pagination: 50 events per page, with "Load more" infinite scroll option.
```

---

## 8. Alerts 페이지

```
Design the alerts history page for "Combine Trade".

Purpose: Track all Slack alert delivery status and contents.

Top section — Alert summary:
- Today's alerts count
- Delivery success rate: "98.5%" with green/red indicator
- Failed alerts count (if any, red badge)

Filter bar:
- Status: ALL / Sent / Pending / Failed
- Strategy: dropdown
- Date range picker

Alert list (card-based, each alert is a card):

Each alert card:
- Left color bar: green (sent) / amber (pending) / red (failed)
- Header: Strategy name + symbol + direction badge
- Timestamp: "2024-03-21 14:35:22 UTC"
- Alert message preview (Slack message content):
  "[LONG] BTCUSDT — Strategy: Momentum Breakout v3
   Winrate: 62.5% | Expectancy: +0.85% | Samples: 42
   Entry: $67,234.50 | TP: $68,578.19 | SL: $66,562.16"
- Delivery status: "Sent at 14:35:23" / "Failed: timeout" / "Pending..."
- If paper mode: "[PAPER]" tag prominently displayed
- Retry button (for failed alerts)

Failed alert detail (expandable):
- Error message
- Retry count
- Last retry time

Pagination: 20 per page
```

---

## 9. Orders 페이지

```
Design the orders management page for "Combine Trade".

Purpose: View all orders (real and paper), their execution status, and order details.

Top section — Order summary cards:
- Open orders: count
- Filled today: count + total volume
- Rejected/Failed: count (red if > 0)
- Paper orders: count (with paper icon)

Tab navigation:
- All Orders | Open | Filled | Paper Orders

Filter bar:
- Strategy: dropdown
- Symbol: dropdown
- Side: BUY / SELL
- Status: planned / submitted / partially_filled / filled / rejected / canceled
- Date range

Order table:
Columns:
- Time
- Strategy (name)
- Symbol
- Side (BUY green / SELL red badge)
- Type (MARKET / LIMIT)
- Price (monospace)
- Quantity (monospace)
- Filled Qty (monospace, with progress bar if partially filled)
- SL Price
- TP Price
- Status (color-coded badge)
- Exchange Order ID (truncated, copy button)
- Paper tag (if paper order, show "PAPER" badge)

Order detail modal (on row click):
- Full order information
- Timeline: planned → submitted → partially_filled → filled (with timestamps)
- Related: strategy event link, decision link
- If paper: "This is a simulated order. No real funds were used."

Visual distinctions:
- Paper orders: subtle dashed left border + paper icon
- Real orders: solid left border
- Failed orders: red background tint
```

---

## 10. Trade Journal 페이지

```
Design the trade journal page for "Combine Trade".

Purpose: Review completed trades with full context — entry decision, market conditions, exit results, and pattern analysis.

Top section — Journal analytics summary:
- Total journal entries
- Overall winrate (journal-tracked trades)
- Avg PnL per trade
- "Strategy Drift" indicator: green (aligned with backtest) / amber (minor drift) / red (significant drift)

Filter bar:
- Strategy: dropdown
- Symbol: dropdown
- Direction: LONG / SHORT
- Result: WIN / LOSS / TIME_EXIT
- Tags: multi-select (trending_up, high_volatility, with_trend, quick_win, pattern_drift, etc.)
- Date range
- Paper/Live: ALL / Live only / Paper only

Journal list (each entry is an expandable card):

Collapsed card view:
- Left color bar: green (WIN) / red (LOSS) / gray (TIME_EXIT)
- Header: Symbol + Direction badge + Result badge + PnL% (large, colored)
- Subtitle: Strategy name v3 | 2024-03-21 14:35 → 2024-03-21 18:22 | 12 bars held
- Tags row: auto-tags as small pills (e.g., "trending_up" "high_volume" "quick_win" "with_trend")
- Mini equity sparkline showing entry→exit price path

Expanded card view (accordion):

Section A: "Entry Decision"
- Decision context: winrate, expectancy, sample count, similarity score
- Similar patterns matched: top 5 with scores and their actual outcomes
- Feature vector: table of feature name | raw | normalized
- Entry price, TP target, SL level

Section B: "Market Context at Entry"
- Higher TF trend: 1h ↑ | 4h ↑ | 1d → (arrows with colors)
- Volatility: "1.2x average" (above/below average)
- Volume: "0.8x average"
- Funding rate: "+0.01%" (if available)

Section C: "Exit Result"
- Result type: WIN / LOSS / TIME_EXIT
- PnL: +2.1% (gross) / +1.95% (net, after fees)
- MFE: +2.8% (max favorable), reached at bar 5
- MAE: -0.4% (max adverse), reached at bar 2
- Hold duration: 12 bars
- Exit market context (same format as entry)

Section D: "Pattern Post-Verification"
- "Of the 42 similar patterns found at entry, 65% actually resulted in WIN"
- Comparison: strategy overall winrate (62.5%) vs this cohort's actual rate (65%)
- Drift indicator if significant deviation

Section E: "Backtest Comparison"
- Side-by-side: Backtest stats vs Live stats for this strategy
- Winrate: 64.2% (backtest) vs 61.8% (live)
- Expectancy: +0.92% vs +0.78%
- Visual: bar chart comparing key metrics

Section F: "User Notes" (editable)
- Text area for trader's personal notes
- Custom tags input (add/remove)
- Save button

Analytics sub-page (accessible from top):
- Tag-based performance breakdown:
  Table: Tag | Count | Winrate | Avg PnL | Expectancy
  E.g., "trending_up" → 145 trades, 67% winrate, +1.2% avg
- Strategy drift chart: rolling 30-trade winrate vs backtest winrate over time
- Best performing conditions: which tag combinations yield highest expectancy
```

---

## 11. Paper Trading 페이지

```
Design the paper trading (simulated trading) status page for "Combine Trade".

Purpose: Monitor simulated trading performance with virtual balance, compare with backtest results, and assess readiness for live trading.

Top banner:
- "[PAPER TRADING MODE]" prominent banner with paper/simulation icon
- "Virtual balance — no real funds at risk" subtitle

Section 1 — Virtual Account Overview (4 stat cards):
- Starting Balance: 10,000 USDT
- Current Balance: 10,847.32 USDT (+8.47%)
- Unrealized PnL: +123.45 USDT (from open positions)
- Total Trades: 47 (since current run started)

Section 2 — Open Positions table:
Columns:
- Symbol
- Direction (LONG/SHORT badge)
- Strategy
- Entry Price
- Current Price
- Quantity
- Unrealized PnL (green/red, updating in real-time)
- Duration (how long position has been open)

Section 3 — Performance Charts (2 columns):

Left: Paper Trading Equity Curve
- Line chart of virtual balance over time
- Starting balance reference line (dashed)
- Drawdown shading

Right: Paper vs Backtest Comparison
- Dual bar chart comparing:
  - Winrate: backtest vs paper
  - Expectancy: backtest vs paper
  - Avg Win: backtest vs paper
  - Avg Loss: backtest vs paper
  - Max consecutive loss: backtest vs paper

Section 4 — Readiness Score (prominent card):
- Large circular progress indicator showing overall readiness
- Checklist:
  ✅ Min duration (2 weeks): "18 days — PASSED"
  ✅ Min trades (30): "47 trades — PASSED"
  ✅ Winrate within 10%p of backtest: "62.1% vs 64.2% (2.1%p diff) — PASSED"
  ❌ Expectancy within 20% of backtest: "+0.65% vs +0.92% (29% diff) — FAILED"
- Overall verdict: "NOT READY — Expectancy gap exceeds threshold"
- Or if all pass: green "READY FOR LIVE TRADING" with celebration subtle animation

Section 5 — Paper Trade History:
- Table of all paper trades (same as Orders page but filtered to paper)
- Quick stats per strategy

Actions:
- "Reset Paper Account" button (warning: resets balance, preserves history)
- "Switch to Live" button (disabled until readiness score passes, with confirmation dialog)
- "View Detailed Report" → PDF export

Run history dropdown:
- "Current Run (started Mar 5)" / "Previous Run (Feb 1 — Feb 28)" — switch between paper trading sessions
```

---

## 12. Risk Management 페이지

```
Design the risk management control panel for "Combine Trade".

Purpose: Monitor and control all safety mechanisms — kill switch, loss limits, position sizing, and position monitoring. This is a safety-critical page.

Top section — System Safety Status:
- Large status indicator: "ALL SYSTEMS NORMAL" (green) or "KILL SWITCH ACTIVE" (red, pulsing) or "LOSS LIMIT REACHED" (amber)

Section 1 — Kill Switch (most prominent, full width):
- Giant toggle switch or button: "EMERGENCY STOP"
  - OFF state: green border, "Trading Active"
  - ON state: red background, pulsing, "ALL TRADING HALTED"
- When active: timestamp of activation, reason, "Manual release required"
- Auto-trigger status: list of automatic triggers with their thresholds
  - "Exchange API failures: 0/5" (green)
  - "Order sync mismatch: None detected" (green)
  - "Abnormal slippage: 0.02% (threshold: 0.5%)" (green)
- Manual activate button: large red "ACTIVATE KILL SWITCH" (requires confirmation)
- Manual deactivate: "RELEASE KILL SWITCH" (only when active, requires confirmation)

Section 2 — Loss Limits (2 columns):

Left: Daily Loss Limit
- Progress bar: "Today's realized loss: -1.2% / -3.0% limit"
- Color: green (<50%), amber (50-80%), red (>80%)
- Resets: "Next reset: UTC 00:00 (in 5h 23m)"
- Strategy breakdown: loss per strategy

Right: Weekly Loss Limit
- Progress bar: "This week's loss: -2.8% / -10.0% limit"
- Same color coding
- Resets: "Next reset: Monday UTC 00:00"

Bottom: Consecutive SL counter
- "Current streak: 1 loss / 3 limit"
- Per-strategy streak display

Section 3 — Position Sizing Config:
- Risk per trade: slider + input "1.0%" of account balance
- Max total exposure: slider + input "10%" of account balance
- Current exposure: bar showing used/available
- Lot size rules: table showing exchange minimums per symbol

Section 4 — Position Monitor (full width table):
- All open positions (real + paper, distinguished):
  Columns:
  - Symbol
  - Direction
  - Strategy
  - Entry Price
  - Current Price
  - Quantity
  - Margin Used
  - Unrealized PnL
  - Liquidation Price (with warning if current price within 10%)
  - Duration
  - Source (Live/Paper badge)

- Liquidation proximity warnings: positions approaching liquidation highlighted in red
- External position detection: "1 position found not created by Combine Trade" (warning card)
- Total aggregate exposure: bar chart showing exposure per symbol

Section 5 — Risk Event Log:
- Timeline of risk events:
  - Kill switch activations/deactivations
  - Loss limit triggers
  - Slippage warnings
  - Position sync mismatches
- Each event: timestamp | type | details | resolution

Color hierarchy: Red elements (kill switch, loss limit breached) should dominate visually when active.
Everything on this page must feel like a control panel — clear, unambiguous, no decorative elements.
```

---

## 13. Settings 페이지

```
Design the settings page for "Combine Trade".

Purpose: System configuration — exchange credentials, notification settings, risk parameters, and system preferences.

Layout: Left sidebar navigation within settings + right content area

Settings categories (left sidebar):

1. "Exchange Credentials"
   - Exchange selector: Binance / OKX
   - API Key: masked input "sk-****...1234" with copy/reveal toggle
   - API Secret: masked input with copy/reveal toggle
   - Label: text input (e.g., "Main Binance Account")
   - Status: "Connected" (green) / "Invalid" (red) with "Test Connection" button
   - "Add Exchange" button
   - "Delete" button (red, with confirmation)
   - Security note: "Keys are stored with AES-256-GCM encryption. Master key is in environment variable."

2. "Notifications"
   - Slack webhook URL: masked input with test button
   - Notification triggers checkboxes:
     ✅ LONG/SHORT decisions
     ✅ Order fills
     ✅ Kill switch activation
     ✅ Loss limit warnings
     ✅ Daily performance summary
     ☐ PASS decisions (off by default)
     ✅ Paper trading events (with [PAPER] tag)
   - Notification quiet hours: time range picker

3. "Trading Defaults"
   - Default risk per trade: percentage input
   - Default daily loss limit: percentage input
   - Default weekly loss limit: percentage input
   - Default consecutive SL limit: number input
   - Default slippage for paper trading: percentage input
   - Default paper trading initial balance: number input

4. "System"
   - API server status: running/stopped
   - Workers status overview
   - Database connection status
   - Log level selector: DEBUG / INFO / WARN / ERROR
   - Data retention settings display (read-only, informational)
   - Backup status: last backup time, next scheduled

5. "Appearance"
   - Theme: Dark (default) / Light toggle
   - Chart color scheme selector
   - Number format: "1,234.56" vs "1.234,56"
   - Timezone selector (default: UTC)

6. "Account"
   - Change password form
   - Active sessions list with "Revoke" button
   - Master key rotation: "Rotate Master Key" button (with strong warning)
   - Export all data: "Export" button → download everything

Each section has a "Save" button at the bottom.
Destructive actions (delete credential, rotate master key) require typed confirmation.
```

---

## 14. TradingView 차트 컴포넌트

```
Design the TradingView chart component that appears across multiple pages in "Combine Trade".

This is a reusable candlestick chart component using TradingView Lightweight Charts library.

Chart header bar:
- Symbol selector dropdown: "BTCUSDT" with search
- Timeframe buttons: 1m | 3m | 5m | 15m | 1h | 4h | 1d (pill-shaped, selected highlighted)
- Indicator dropdown: "Indicators +" → multi-select: SMA(20), EMA(50), BB(20,2), Volume
- Strategy overlay toggle: "Show events" on/off
- Fullscreen toggle button
- Screenshot button (capture chart as image)

Main chart area:
- Candlestick chart with OHLCV data
- Green candles (close > open), Red candles (close < open)
- Volume bars at bottom (lower opacity, green/red matching candles)
- Crosshair: vertical and horizontal lines following mouse
- Price scale on right (monospace numbers)
- Time scale on bottom

Overlays (when enabled):
- SMA lines: thin colored lines (blue, orange)
- EMA lines: thin colored lines (different shade)
- Bollinger Bands: upper/lower as thin lines with shaded fill between
- Strategy events: markers as described in Strategy Detail page

Separate indicator panels (below main chart, resizable):
- RSI panel: line chart 0-100, overbought (70) and oversold (30) horizontal reference lines
- MACD panel: histogram (green/red) + signal line + MACD line
- Stochastic panel: %K and %D lines, 20/80 reference lines

Interactive features:
- Scroll to zoom (horizontal)
- Drag to pan
- Click event marker → popup with decision details
- Double-click → center on that candle
- Right-click context menu: "Copy price", "Add alert at price", "Measure tool"
- Infinite scroll left to load historical data (with loading spinner)

Real-time updates:
- Current candle updates live via SSE
- New candle appears when previous candle closes
- Subtle animation on live price updates

Performance: Must handle 10,000+ candles smoothly.
Dark theme: chart background matches app background (#0A0A0F), gridlines (#1E293B).
```

---

## 15. 모바일/태블릿 반응형 레이아웃

```
Design the responsive/mobile layout adaptations for "Combine Trade" Tauri app.

Note: Desktop-first, but the Tauri app may be used on iPad or smaller screens.

Breakpoints:
- Desktop: ≥1280px (full layout)
- Tablet: 768px–1279px (adapted layout)
- Mobile: <768px (stacked layout, not primary target)

Tablet adaptations:
- Sidebar: collapsed by default (icon-only, 64px), swipe or tap to expand
- Dashboard: 2-column grid instead of 4
- Strategy editor: stacked (code on top, config below) instead of side-by-side
- Tables: horizontal scroll for wide tables, or hide less important columns
- Charts: full width, stacked vertically
- Kill switch: always visible in top bar (floating action button)

Mobile adaptations (minimal support):
- Sidebar: bottom tab bar (5 icons: Dashboard, Strategies, Events, Orders, More)
- Cards: single column, full width
- Tables: card-based list view (each row becomes a card)
- Charts: simplified (candlestick chart only, no separate indicator panels)
- Strategy editor: NOT supported on mobile (show message "Use desktop for strategy editing")
- Kill switch: prominent floating button, always accessible

Critical rule: Kill switch must ALWAYS be accessible regardless of screen size — 1 tap/click maximum.
```

---

## 16. 시스템 트레이 & 네이티브 알림 (Tauri)

```
Design the system tray and native notification patterns for "Combine Trade" Tauri desktop app.

System tray icon:
- Normal state: Combine Trade logo icon (monochrome, fits macOS/Windows tray style)
- Active trading: small green dot overlay on icon
- Kill switch active: small red dot overlay, icon pulses
- Disconnected: small amber dot overlay

System tray context menu (right-click):
- "Combine Trade" (bold title, not clickable)
- Separator
- "Dashboard" → opens main window
- "Quick Status":
  - "Active strategies: 5"
  - "Open positions: 3"
  - "Today's PnL: +$234.56"
- Separator
- "Kill Switch: OFF" → click to toggle (with confirmation)
- "Mode: Alert" → submenu: Analysis / Alert / Paper / Auto-Trade
- Separator
- "Show Window" / "Hide Window"
- "Quit Combine Trade"

Native notification patterns:

1. Trade signal:
   Title: "[LONG] BTCUSDT — Momentum v3"
   Body: "WR: 62.5% | Exp: +0.85% | Entry: $67,234.50"
   Action: Click → opens Strategy Detail page

2. Order filled:
   Title: "Order Filled: BUY BTCUSDT"
   Body: "0.015 BTC @ $67,234.50 | PnL target: +$201.70"

3. Trade closed (WIN):
   Title: "WIN: BTCUSDT +2.1%"
   Body: "Strategy: Momentum v3 | +$141.79 | 12 bars"
   Color/icon: green checkmark

4. Trade closed (LOSS):
   Title: "LOSS: BTCUSDT -1.0%"
   Body: "Strategy: Momentum v3 | -$67.23 | 8 bars"
   Color/icon: red X

5. Kill switch activated:
   Title: "⚠️ KILL SWITCH ACTIVATED"
   Body: "All trading halted. Reason: 5 consecutive API failures. Manual release required."
   Priority: CRITICAL (persistent notification)

6. Loss limit warning:
   Title: "Daily Loss Limit: 80% reached"
   Body: "Today's loss: -2.4% / -3.0% limit. Auto-stop at limit."

7. Paper trade signal:
   Title: "[PAPER] [LONG] BTCUSDT"
   Body: same as real signal but with PAPER prefix
```

---

## 17. 에러/빈 상태 디자인

```
Design error states and empty states for "Combine Trade".

Empty states (when no data exists):

1. No strategies:
   - Illustration: abstract code editor icon with sparkles
   - Title: "No strategies yet"
   - Description: "Create your first TypeScript trading strategy to start vectorizing market patterns."
   - CTA: "Create Strategy" button (primary)

2. No events:
   - Illustration: radar/signal icon
   - Title: "No events detected"
   - Description: "Events will appear here when your strategies detect entry conditions in the market."

3. No orders:
   - Illustration: receipt/order icon
   - Title: "No orders yet"
   - Description: "Orders will appear when strategies are running in Paper or Auto-Trade mode."

4. No backtest results:
   - Illustration: chart with play button
   - Title: "No backtests run"
   - Description: "Run a backtest to see how your strategy performs against 3 years of historical data."
   - CTA: "Run Backtest" button

5. No journal entries:
   - Illustration: notebook icon
   - Title: "No trade journal entries"
   - Description: "Journal entries are automatically created when trades close. Start trading to build your journal."

Error states:

1. Connection lost (SSE disconnected):
   - Top banner (amber): "Real-time connection lost. Attempting to reconnect... [Retry Now]"
   - Data shown is marked as "Last updated: 2 min ago" in amber text

2. API error:
   - Inline error card: red left border
   - "Failed to load data" + error code + "Retry" button
   - Show stale data (if cached) with "Data may be outdated" warning

3. Worker down:
   - Dashboard widget turns red
   - "strategy-worker is unresponsive since 14:35:22"
   - "Impact: Strategy evaluation paused for all strategies"

4. Exchange API error:
   - Settings page: credential card shows red status
   - "Connection failed: Rate limited (429). Next retry in 45s"

5. Backtest failure:
   - Error panel replacing results
   - "Backtest failed: Strategy code error at line 42"
   - Show error details + link to fix in strategy editor

Loading states:
- Skeleton screens for all data sections (pulsing gray blocks matching content shape)
- Tables: skeleton rows with pulsing rectangles
- Charts: empty chart frame with centered spinner
- Cards: skeleton cards with pulsing placeholders
- Never show a blank white/empty screen — always show skeleton or previous data
```

---

## 18. Navigation & 글로벌 레이아웃

```
Design the global navigation and layout shell for "Combine Trade".

Left sidebar navigation (fixed):

Collapsed state (64px wide):
- Logo icon at top
- Icon-only navigation items with tooltip on hover
- Expand/collapse toggle at bottom

Expanded state (240px wide):
- "Combine Trade" wordmark + logo at top
- Navigation sections:

  OVERVIEW
  - Dashboard (grid icon)
  - Events (signal icon)

  TRADING
  - Strategies (code icon)
  - Orders (list icon)
  - Positions (layers icon)

  ANALYSIS
  - Backtest (play-chart icon)
  - Journal (book icon)

  SIMULATION
  - Paper Trading (paper/ghost icon)

  SYSTEM
  - Risk Management (shield icon) — red dot if kill switch active
  - Alerts (bell icon) — badge with unread count
  - Settings (gear icon)

- Bottom section:
  - Connection status: green dot "Connected" / red dot "Disconnected"
  - User avatar/name: "admin"
  - Collapse toggle

Active state: green highlighted background + green left accent bar on active item
Hover state: subtle background highlight

Top bar (full width, above content area):
- Left: Breadcrumb navigation (e.g., "Strategies / Momentum Breakout v3 / Events")
- Center: Ticker tape (scrolling symbol prices) — can be hidden in settings
- Right:
  - Kill switch quick-toggle (small red secondary button, always visible)
  - Execution mode indicator badge (green when active)
  - Notification bell (with green count badge)
  - SSE connection indicator (green dot=connected / red dot=disconnected)

Content area:
- Below top bar
- Scrollable
- Max-width: 1440px, centered
- Padding: 24px on all sides
- Pages transition with subtle fade

Global keyboard shortcuts (shown in a "?" help modal):
- Ctrl+K: Command palette (search anything — strategies, symbols, pages)
- Ctrl+/: Toggle sidebar
- Ctrl+E: Quick switch to strategy editor
- Ctrl+Shift+K: Toggle kill switch (with confirmation)
- Esc: Close modals/popups
```

---

## Usage Notes

### 프롬프트 사용 방법

1. **글로벌 디자인 시스템(#0)을 먼저 생성** — 모든 화면에서 참조
2. **각 화면 프롬프트를 순서대로 사용** — 디자인 시스템 기반으로 일관성 유지
3. **상태(states) 디자인 포함** — 각 프롬프트에 명시된 상태들을 빠짐없이 디자인
4. **반응형(#15) 마지막에 적용** — 데스크탑 디자인 완료 후 적응형 레이아웃

### 화면 간 연결

```
Login → Dashboard
Dashboard → [Strategies, Events, Orders, Alerts, Risk Management]
Strategies → Strategy Editor → Strategy Detail
Strategy Detail → [Events, Backtest, Journal]
Backtest → Backtest Results → Strategy Editor (apply params)
Orders → Order Detail → Strategy Event
Journal → Journal Entry Detail → Strategy Detail
Paper Trading → Readiness → Settings (switch mode)
Risk Management → Settings → Exchange Credentials
```

### 디자인 우선순위

1. Dashboard + Navigation (핵심 레이아웃)
2. Strategy Editor + Strategy Detail (핵심 기능)
3. TradingView Charts (시각화)
4. Risk Management (안전)
5. Events + Orders + Alerts (모니터링)
6. Journal + Paper Trading (분석)
7. Settings + Login (지원)
8. Mobile/Responsive + System Tray (확장)
