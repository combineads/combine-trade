# Combine Trade — Design System

Design system reference for a crypto futures trading desktop application.
**Dark & Light theme support**, desktop-first (Tauri + Next.js), built for professional traders.
Dark theme is the default and primary experience. Light theme is an opt-in via Settings.

---

## 1. Theme Strategy

### Mode Selection

The active theme is controlled by a `data-theme` attribute on `<html>`:

```html
<html data-theme="dark">   <!-- default -->
<html data-theme="light">
```

- Default: `dark` (set on app startup unless user has saved a preference)
- Toggle: Settings → Appearance → Theme
- Persistence: saved to localStorage and synced across windows
- OS preference (`prefers-color-scheme`) is used only as the initial fallback when no saved preference exists

### What Stays the Same in Both Themes

Brand identity colors (green/red), semantic trading colors, direction badges, typography, layout, and spacing are **theme-invariant**. Only surface colors (backgrounds, borders, text) and chart backgrounds differ between themes.

> **Green = Go / Positive**, **Red = Stop / Negative** — this duality holds in both themes.

---

## 2. Color Palette

### 2.1 Brand & Semantic (Theme-invariant)

These values are the same in dark and light mode.

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| Primary (Green) | `--color-primary` | `#22C55E` | Main CTAs, nav accents, active states, LONG, profit, WIN |
| Primary Hover | `--color-primary-hover` | `#16A34A` | Hover state for primary elements |
| Secondary (Red) | `--color-secondary` | `#EF4444` | Danger, destructive actions, SHORT, loss, LOSS, Kill Switch |
| Secondary Hover | `--color-secondary-hover` | `#DC2626` | Hover state for secondary elements |
| Warning | `--color-warning` | `#F59E0B` | Alerts, caution, paused states |
| Neutral | `--color-neutral` | `#64748B` | PASS decisions, neutral states |

**Trading decision colors:**

| Value | Token | Hex |
|-------|-------|-----|
| LONG | `--color-long` | `#22C55E` |
| SHORT | `--color-short` | `#EF4444` |
| PASS | `--color-pass` | `#64748B` |
| WIN | `--color-win` | `#22C55E` |
| LOSS | `--color-loss` | `#EF4444` |
| TIME_EXIT | `--color-time-exit` | `#64748B` |
| PENDING | `--color-pending` | `#F59E0B` |

### 2.2 Surface Colors (Theme-specific)

#### Dark Theme (`[data-theme="dark"]`)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-base` | `#0A0A0F` | App root background |
| `--bg-card` | `#12121A` | Card surface |
| `--bg-elevated` | `#1A1A2E` | Elevated layers (modals, dropdowns, tooltips) |
| `--border-subtle` | `#1E293B` | Card borders, chart gridlines, dividers |
| `--border-default` | `#334155` | Hover borders, input borders |
| `--text-primary` | `#E2E8F0` | Body copy, labels |
| `--text-secondary` | `#94A3B8` | Secondary text, descriptions |
| `--text-muted` | `#475569` | Inactive, placeholders |

#### Light Theme (`[data-theme="light"]`)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-base` | `#F8FAFC` | App root background |
| `--bg-card` | `#FFFFFF` | Card surface |
| `--bg-elevated` | `#F1F5F9` | Elevated layers (modals, dropdowns, tooltips) |
| `--border-subtle` | `#E2E8F0` | Card borders, chart gridlines, dividers |
| `--border-default` | `#CBD5E1` | Hover borders, input borders |
| `--text-primary` | `#0F172A` | Body copy, labels |
| `--text-secondary` | `#475569` | Secondary text, descriptions |
| `--text-muted` | `#94A3B8` | Inactive, placeholders |

### 2.3 Semantic State Colors (Theme-invariant)

| State | Color | Examples |
|-------|-------|---------|
| Active / Running / Connected | `#22C55E` | Status dots, badges, connection indicators |
| Error / Down / Loss | `#EF4444` | Error badges, loss figures, Kill Switch |
| Warning / Paused / Degraded | `#F59E0B` | Warning banners, paused badges |
| Inactive / Draft | `#64748B` | Inactive badges, PASS decisions |

---

## 3. Typography

### Font Families (Theme-invariant)

| Role | Font | Usage |
|------|------|-------|
| UI Sans | `Inter` / `Geist Sans` | All UI text, labels, descriptions |
| Mono | `JetBrains Mono` / `Geist Mono` | Prices, numbers, code, statistics, volumes |

### Rules

- **All financial figures use Mono** font, **right-aligned** in tables
- **Prices, PnL, quantities, timestamps** → Mono
- **Strategy names, labels, descriptions** → Sans

### Type Scale

| Level | Size | Font | Usage |
|-------|------|------|-------|
| Display | 28–32px | Sans Bold | Page titles, large figures |
| Heading | 18–20px | Sans SemiBold | Section headers, card titles |
| Body | 14–16px | Sans Regular | Body copy, descriptions |
| Caption | 12px | Sans Regular | Secondary labels, timestamps |
| Mono Display | 20–28px | Mono SemiBold | Large PnL figures |
| Mono Body | 13–14px | Mono Regular | Prices, statistics table cells |

---

## 4. Layout & Spacing

### Global Layout Shell

```
┌─────────────────────────────────────────────────────────────┐
│  Top Bar (Ticker Tape + Status + Kill Switch + Notif)       │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│ Sidebar  │  Content Area                                    │
│ 64/240px │  max-width: 1440px, padding: 24px                │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### Sidebar

| State | Width | Content |
|-------|-------|---------|
| Collapsed | 64px | Icons only + hover tooltips |
| Expanded | 240px | Icons + labels + section headers |

### Breakpoints

| Name | Range | Layout |
|------|-------|--------|
| Desktop | ≥ 1280px | Full layout, 4-column grid |
| Tablet | 768–1279px | Sidebar collapsed by default, 2-column grid |
| Mobile | < 768px | Bottom tab bar, 1-column, simplified layout |

### Spacing Scale

```
4px → 8px → 12px → 16px → 20px → 24px → 32px → 48px → 64px
```

- Card inner padding: `16px` / `24px`
- Section gap: `24px` / `32px`
- Inline element gap: `8px` / `12px`

---

## 5. Components

### 5.1 Buttons (Theme-invariant)

Brand-colored buttons look the same in both themes. Only the Tertiary button adapts.

| Variant | Dark Style | Light Style | Usage |
|---------|-----------|------------|-------|
| **Primary** | bg `#22C55E`, text white | same | Main CTAs: Save, Activate, Run |
| **Secondary** | border `#EF4444`, text `#EF4444` | same | Caution: Cancel, Pause |
| **Tertiary** | border `--border-subtle`, text `--text-secondary` | same (tokens adapt) | Edit, Export |
| **Danger** | bg `#EF4444`, text white | same | Delete, Kill Switch |

```
[Primary Button]    → bg: #22C55E,  text: white,              hover: #16A34A
[Secondary Button]  → border: #EF4444, text: #EF4444,         hover: bg rgba(#EF4444, 0.12)
[Tertiary Button]   → border: var(--border-subtle), text: var(--text-secondary), hover: bg var(--bg-elevated)
[Danger Button]     → bg: #EF4444,  text: white,              hover: #DC2626
```

### 5.2 Status Badges (Pills)

Badge backgrounds use alpha on the brand color so they remain readable in both themes.

```
[active]   → bg: rgba(#22C55E, 0.12), text: #22C55E, border: rgba(#22C55E, 0.25)
[stopped]  → bg: rgba(#EF4444, 0.12), text: #EF4444, border: rgba(#EF4444, 0.25)
[warning]  → bg: rgba(#F59E0B, 0.12), text: #F59E0B, border: rgba(#F59E0B, 0.25)
[draft]    → bg: rgba(#64748B, 0.12), text: #64748B, border: rgba(#64748B, 0.25)
```

> In light mode, `text: #22C55E` on a white card may have insufficient contrast. Use `#16A34A` for the text color of green badges in light mode.

### 5.3 Direction Badges (Theme-invariant)

Fully filled badges — legible in both themes.

```
[LONG]  → bg: #22C55E, text: white
[SHORT] → bg: #EF4444, text: white
[PASS]  → bg: #64748B, text: white
```

### 5.4 Cards

| Property | Dark | Light |
|----------|------|-------|
| Background | `#12121A` | `#FFFFFF` |
| Border | `1px solid #1E293B` | `1px solid #E2E8F0` |
| Shadow | none | `0 1px 3px rgba(0,0,0,0.06)` |
| Hover border | `#334155` | `#CBD5E1` |
| Border radius | `8px` / `12px` | `8px` / `12px` |

**Card state variants (both themes):**

| State | Style |
|-------|-------|
| Active | Default card + `3px` `#22C55E` left bar |
| Paused | opacity 70%, `3px` `#F59E0B` left bar |
| Draft | `dashed` border using `--border-subtle` |
| Kill Switch active | `3px` `#EF4444` left bar + `rgba(#EF4444, 0.08)` bg tint |
| Error | `rgba(#EF4444, 0.06)` background tint |
| Paper | `dashed` left border using `--border-subtle` |

### 5.5 Tables

| Property | Dark | Light |
|----------|------|-------|
| Odd rows | `--bg-card` | `--bg-card` |
| Even rows | `--bg-elevated` | `--bg-elevated` |
| Header bg | `#1E293B` | `#F1F5F9` |
| Header text | `#94A3B8` uppercase | `#475569` uppercase |
| Row hover | `#1E293B` | `#F1F5F9` |
| Number columns | Mono, right-aligned | Mono, right-aligned |

### 5.6 Charts

| Element | Dark | Light |
|---------|------|-------|
| Background | `#0A0A0F` | `#FFFFFF` |
| Gridlines | `#1E293B` (thin) | `#E2E8F0` (thin) |
| Crosshair | `#334155` | `#CBD5E1` |
| Price scale text | `#94A3B8` Mono | `#475569` Mono |
| Bullish candle | `#22C55E` | `#22C55E` |
| Bearish candle | `#EF4444` | `#EF4444` |
| Volume bars | candle color, opacity 40% | candle color, opacity 40% |

**Data series colors (theme-invariant):**
- SMA: `#3B82F6` (blue)
- EMA: `#8B5CF6` (violet)
- Bollinger Bands lines: `#64748B`
- Bollinger Bands fill: `rgba(#64748B, 0.06)`

### 5.7 Status Dots (Real-time, theme-invariant)

```
● Connected / Running   → #22C55E, optional pulse animation
● Warning / Degraded    → #F59E0B
● Down / Error          → #EF4444
● Inactive              → #64748B
```

### 5.8 Inputs

| Property | Dark | Light |
|----------|------|-------|
| Background | `#12121A` | `#FFFFFF` |
| Border | `1px solid #1E293B` | `1px solid #E2E8F0` |
| Focus border | `#22C55E` | `#22C55E` |
| Error border | `#EF4444` | `#EF4444` |
| Placeholder text | `#475569` | `#94A3B8` |
| Masked value pattern | `sk-****...1234` | `sk-****...1234` |

### 5.9 Kill Switch (Safety-Critical, theme-invariant)

```
OFF state (normal):    green border (#22C55E), label "Trading Active"
ON state (emergency):  red background (#EF4444) + pulsing animation, label "ALL TRADING HALTED"
```

The Kill Switch uses explicit brand colors and is never driven by surface tokens — it must look **identical and unmistakable in both themes**.

#### Card anatomy

| Element | OFF state (normal) | ON state (emergency) |
|---------|-------------------|---------------------|
| Card bg | `--bg-card` | `#EF4444` |
| Card border | `2px solid #22C55E` | `2px solid #DC2626` |
| Header label | `"KILL SWITCH"` `--text-muted` 11px | same |
| State badge | `bg: #22C55E1A` · dot `#22C55E` · text `"ARMED"` `#22C55E` | `bg: rgba(0,0,0,0.15)` · dot `#FFFFFF` · text `"TRIGGERED"` `#FFFFFF` |
| Status icon | `shield-check` `#22C55E` | `shield-off` `#EF4444` (dark) / `#FFFFFF` (on red card) |
| Status label | `"Trading Active"` `--text-primary` | `"ALL TRADING HALTED"` `#FFFFFF` |
| Description | `--text-secondary` | `rgba(255,255,255,0.8)` |
| CTA button | **Danger** — `bg: #EF4444, text: #FFFFFF` · `"Activate Kill Switch"` | **Danger-dark** — `bg: #DC2626, text: #FFFFFF` · `"Release Kill Switch"` |

> The CTA on the OFF card is always the **Danger variant** (solid red, white text).
> The CTA on the ON card uses `#DC2626` (darker red) for contrast against the `#EF4444` card background.

- **Always accessible from the top layer** (pinned in Top Bar)
- Mobile: Floating Action Button
- Keyboard shortcut: `Ctrl+Shift+K` (with confirmation dialog)
- Must be reachable in 1 click/tap at any screen size

---

## 6. Navigation

### Left Sidebar

| Property | Dark | Light |
|----------|------|-------|
| Background | `#0A0A0F` | `#F1F5F9` |
| Active item bg | `rgba(#22C55E, 0.10)` | `rgba(#22C55E, 0.10)` |
| Active left bar | `3px solid #22C55E` | `3px solid #22C55E` |
| Active text | `#22C55E` | `#16A34A` |
| Hover bg | `#1E293B` | `#E2E8F0` |
| Default text | `#94A3B8` | `#475569` |
| Section label | `#475569` uppercase | `#94A3B8` uppercase |

### Sidebar Structure

```
[Logo / Wordmark]

OVERVIEW
  ├── Dashboard        (grid icon)
  └── Events           (signal icon)

TRADING
  ├── Strategies       (code icon)
  ├── Orders           (list icon)
  └── Positions        (layers icon)

ANALYSIS
  ├── Backtest         (play-chart icon)
  └── Journal          (book icon)

SIMULATION
  └── Paper Trading    (paper/ghost icon)

SYSTEM
  ├── Risk Management  (shield icon) ← red dot when kill switch is active
  ├── Alerts           (bell icon)   ← unread count badge
  └── Settings         (gear icon)

─────────────────────
  Connection status dot + "Connected"
  [admin] avatar
  Collapse toggle
```

### Top Bar

```
[Breadcrumb]  |  [Ticker Tape – scrolling prices]  |  [Kill Switch] [Mode] [🔔] [● SSE]
```

- Ticker format: `BTCUSDT $67,234.50 +2.3%` (green/red for change direction)
- SSE connection indicator: always visible

| Property | Dark | Light |
|----------|------|-------|
| Top bar bg | `#0A0A0F` | `#FFFFFF` |
| Top bar border-bottom | `#1E293B` | `#E2E8F0` |

### Mobile (<768px)

- Left sidebar → Bottom Tab Bar (5 icons: Dashboard, Strategies, Events, Orders, More)
- Kill Switch → always-visible Floating Action Button

---

## 7. States

### 7.1 Loading Skeletons

| Property | Dark | Light |
|----------|------|-------|
| Skeleton base | `#1E293B` | `#E2E8F0` |
| Skeleton shimmer | `#334155` | `#CBD5E1` |
| Animation | `pulse` (opacity 60%→100%) | same |

- Tables: skeleton rows with pulsing rectangles
- Charts: empty chart frame + centered spinner
- Cards: skeleton card matching content shape
- **Rule: never show a blank screen** — always skeleton or stale data

### 7.2 Empty States

| Screen | Title | CTA |
|--------|-------|-----|
| Strategies | "No strategies yet" | "Create Strategy" |
| Events | "No events detected" | — |
| Orders | "No orders yet" | — |
| Backtest | "No backtests run" | "Run Backtest" |
| Journal | "No trade journal entries" | — |

Icon illustrations use `--text-muted` color to remain theme-aware.

### 7.3 Error States

| Error | UI Pattern |
|-------|-----------|
| SSE disconnected | Top amber banner + "Last updated: N min ago" + Retry |
| API error | Inline red left-border card + error code + Retry |
| Worker down | Dashboard widget turns red + impact description |
| Exchange API error | Settings credential card shows red status |
| Backtest failed | Error panel + link to strategy editor |

Error banners and cards use explicit semantic colors (`#EF4444`, `#F59E0B`) that work in both themes.

### 7.4 Real-time Updates (SSE)

| Event | Animation |
|-------|-----------|
| New data | Subtle `pulse/glow` on the element |
| New event row | Slides in from top + brief highlight flash |
| Live price | Subtle number transition animation |

Highlight flash color:
- Dark: `rgba(#22C55E, 0.15)` → transparent
- Light: `rgba(#22C55E, 0.10)` → transparent

---

## 8. Strategy Editor

**Split-pane layout (resizable divider):**

| Pane | Ratio | Content |
|------|-------|---------|
| Left | ~55% | Monaco Editor |
| Right | ~45% | Configuration panels (scrollable, accordion) |

**Monaco Editor theme:**

| Mode | Monaco Theme |
|------|-------------|
| Dark | `vs-dark` (VS Code Dark+) |
| Light | `vs` (VS Code Light) |

API type hints: `candle`, `sma`, `ema`, `rsi`, `macd`, `bb`, `atr`, `defineFeature`, etc.
Bottom status bar: Language | Encoding | Line:Col | Error/Warning count

**Configuration panel sections:**
1. Basic Info (name, direction, symbols, timeframe)
2. Features & Vectorization (feature list, normalization type, dimension)
3. Search Config (Top K, similarity threshold, Min samples)
4. Result Config (TP%, SL%, Max hold bars)
5. Decision Config (Min winrate, Min expectancy)
6. Execution Mode (step selector: Analysis → Alert → Paper → Auto-Trade)

---

## 9. TradingView Chart Component

**Chart header:**
```
[BTCUSDT ▾] [1m][3m][5m][15m][1h][4h][1d]  [Indicators +]  [Show events ⬜]  [⛶] [📷]
```

The chart background and gridlines adapt to the active theme (see §5.6). Candle and series colors are always the same.

**Strategy event markers (theme-invariant):**
- ↑ Green up arrow: LONG entry
- ↓ Red down arrow: SHORT entry
- ✓ Green checkmark: WIN exit
- ✗ Red X: LOSS exit
- ⏱ Gray clock: TIME_EXIT

**Separate indicator panels (resizable):**
- RSI: 0–100 line, overbought (70) / oversold (30) reference lines
- MACD: histogram (green/red) + signal line
- Stochastic: %K/%D lines, 80/20 reference lines

---

## 10. Notification Patterns (Tauri)

### System Tray Icon States (theme-invariant)

| State | Overlay |
|-------|---------|
| Normal | None (default logo) |
| Trading active | Green dot |
| Kill Switch active | Red dot + pulsing |
| Disconnected | Amber dot |

### Native Notification Types

| Type | Title Pattern | Priority |
|------|--------------|----------|
| Trade signal | `[LONG] BTCUSDT — Momentum v3` | Normal |
| Order filled | `Order Filled: BUY BTCUSDT` | Normal |
| WIN | `WIN: BTCUSDT +2.1%` | Normal |
| LOSS | `LOSS: BTCUSDT -1.0%` | Normal |
| Kill Switch | `⚠️ KILL SWITCH ACTIVATED` | **CRITICAL (persistent)** |
| Loss limit | `Daily Loss Limit: 80% reached` | High |
| Paper signal | `[PAPER] [LONG] BTCUSDT` | Low |

---

## 10.1 In-App Feedback Patterns (No Toast Policy)

**Toast notifications are prohibited.** They auto-dismiss, may be missed, and violate WCAG 2.2.1, 1.3.2, 2.1.1, and 4.1.3. Reference: [GitHub Primer — Accessible Notifications and Messages](https://primer.style/accessibility/patterns/accessible-notifications-and-messages/).

### Rule: successful actions show their result — no secondary confirmation needed

If the UI reflects the outcome (e.g. a new row appears, a value updates), that *is* the feedback. No banner or message required.

### Feedback pattern by scenario

| Scenario | Pattern |
|----------|---------|
| Form submit success | Optimistic UI — reflect the result inline immediately |
| Form validation error | Inline message below the field + red border |
| Async operation error | Persistent inline error card with red left border + Retry |
| System-level warning (SSE disconnect, etc.) | Top amber banner — stays until dismissed or resolved |
| Critical error (kill switch, loss limit breach) | Top red banner — never auto-dismisses, requires user action |
| Long-running task completion | Notification center bell (🔔) — unread count badge |
| Order filled / trade signal | Native OS notification via Tauri (see §10) |

### Banned patterns

- Auto-dismissing overlays (toast / snackbar)
- Confirmation messages that disappear before the user reads them
- Floating overlays that obscure trading controls or order buttons

---

## 11. Risk Management UI Principles

This page is a **control panel** — no decorative elements, clear and unambiguous in both themes.

**Visual hierarchy:**
1. Kill Switch state → always topmost, largest element on the page
2. Loss limit breach → red elements visually dominate
3. Position near liquidation → row highlighted red

**Progress bar thresholds (loss limits, theme-invariant):**
- 0–50%: `#22C55E`
- 50–80%: `#F59E0B`
- 80–100%: `#EF4444`

---

## 12. Paper Trading UI Distinction

| Element | Style |
|---------|-------|
| Paper banner | `[PAPER TRADING MODE]` full-width top banner (amber bg in both themes) |
| Paper order rows | `dashed` left border + `[PAPER]` badge |
| Paper notifications | `[PAPER]` prefix in title |
| Live switch gate | Disabled until readiness score ≥ 70/100 + "go live" text confirmation |

### Readiness Score UI

```
┌─────────────────────────────────────┐
│  READINESS SCORE: 78/100  ✅ READY  │
├─────────────────────────────────────┤
│                                     │
│  📊 Backtest Validation      30/35  │
│     ✓ Min trades (142)              │
│     ✓ Expectancy (+0.8%)            │
│     ✓ Sharpe ratio (1.2)            │
│     ✗ Drawdown (22%) — ⚠️           │
│                                     │
│  📈 Paper Validation         35/35  │
│     ✓ Duration (9 days)             │
│     ✓ Trades (15)                   │
│     ✓ Z-test pass (z = -0.42)      │
│     ✓ Loss limit OK                 │
│                                     │
│  🔒 Risk Setup               20/20  │
│     ✓ Daily loss limit ($5,000)     │
│     ✓ Position sizing (0.5 BTC)     │
│     ✓ Kill switch tested (2h ago)   │
│     ✓ API key active, balance OK    │
│                                     │
│  ✋ Final Confirmation        10/10  │
│     ☑ I understand risks            │
│     ☑ Typed "go live"               │
│                                     │
│  [Enable Live Trading]              │
│  [Keep in Paper Mode]               │
└─────────────────────────────────────┘
```

Score gate colors:
- 0–69: `--text-muted` + disabled button
- 70–89: `--color-warning` border + warning banner
- 90–100: `--color-primary` border

See PRODUCT.md "Readiness score" section for full calculation spec.

---

## 13. Screen Inventory

| # | Screen | Key Characteristics |
|---|--------|---------------------|
| 0 | Global Design System | This document |
| 1 | Login | Single-user, security-first feel, AES-256 notice |
| 2 | Dashboard | Live SSE, Kill Switch always visible, 4-column grid |
| 3 | Strategies List | Card grid, per-strategy mini performance stats |
| 4 | Strategy Editor | Monaco (theme-aware) + config split-pane |
| 5 | Strategy Detail | 6 tabs, TradingView with event overlays |
| 6 | Backtest | Config → progress → results (2×2 chart grid) |
| 7 | Events | Live feed, detail modal with feature vector |
| 8 | Alerts | Slack delivery status, failed retry |
| 9 | Orders | Real/paper distinction, step timeline |
| 10 | Trade Journal | Expandable cards, 6 analysis sections |
| 11 | Paper Trading | Virtual balance, readiness score, live gating |
| 12 | Risk Management | Kill Switch, loss limits, position monitor |
| 13 | Settings | Side-tab navigation, AES-256 credentials, theme toggle |
| 14 | TradingView Component | Reusable chart, theme-aware, indicators, event markers |
| 15 | Responsive Layout | Tablet/mobile adaptations |
| 16 | System Tray & Notifications | Tauri native patterns |
| 17 | Error / Empty States | Skeleton, empty, error patterns |
| 18 | Global Navigation | Sidebar + Top Bar shell |

### Screen Flow

```
Login
  └── Dashboard
        ├── Strategies → Strategy Editor → Strategy Detail
        │                                       ├── Events
        │                                       ├── Backtest Results
        │                                       └── Journal
        ├── Events → Event Detail (modal)
        ├── Orders → Order Detail (modal)
        ├── Alerts
        ├── Paper Trading → Settings (mode switch)
        └── Risk Management → Settings → Exchange Credentials
```

### Design Priority Order

```
Priority 1: Dashboard + Navigation (core layout)
Priority 2: Strategy Editor + Strategy Detail (core features)
Priority 3: TradingView Charts (visualization)
Priority 4: Risk Management (safety)
Priority 5: Events + Orders + Alerts (monitoring)
Priority 6: Journal + Paper Trading (analysis)
Priority 7: Settings + Login (support)
Priority 8: Mobile/Responsive + System Tray (extension)
```

---

## 14. Design Tokens (CSS Custom Properties)

```css
/* ─── Shared (theme-invariant) ─────────────────────────────── */
:root {
  /* Brand */
  --color-primary:        #22C55E;
  --color-primary-hover:  #16A34A;
  --color-secondary:      #EF4444;
  --color-secondary-hover:#DC2626;
  --color-warning:        #F59E0B;
  --color-neutral:        #64748B;

  /* Trading decisions */
  --color-long:      #22C55E;
  --color-short:     #EF4444;
  --color-pass:      #64748B;
  --color-win:       #22C55E;
  --color-loss:      #EF4444;
  --color-time-exit: #64748B;
  --color-pending:   #F59E0B;

  /* Typography */
  --font-sans: 'Inter', 'Geist Sans', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Geist Mono', monospace;

  /* Layout */
  --sidebar-collapsed:  64px;
  --sidebar-expanded:   240px;
  --content-max-width:  1440px;
  --content-padding:    24px;

  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

/* ─── Dark Theme (default) ──────────────────────────────────── */
[data-theme="dark"] {
  --bg-base:        #0A0A0F;
  --bg-card:        #12121A;
  --bg-elevated:    #1A1A2E;
  --border-subtle:  #1E293B;
  --border-default: #334155;

  --text-primary:   #E2E8F0;
  --text-secondary: #94A3B8;
  --text-muted:     #475569;

  --chart-bg:         #0A0A0F;
  --chart-grid:       #1E293B;
  --chart-crosshair:  #334155;
  --chart-scale-text: #94A3B8;

  --skeleton-base:    #1E293B;
  --skeleton-shimmer: #334155;

  --topbar-bg:     #0A0A0F;
  --topbar-border: #1E293B;
  --sidebar-bg:    #0A0A0F;
}

/* ─── Light Theme ───────────────────────────────────────────── */
[data-theme="light"] {
  --bg-base:        #F8FAFC;
  --bg-card:        #FFFFFF;
  --bg-elevated:    #F1F5F9;
  --border-subtle:  #E2E8F0;
  --border-default: #CBD5E1;

  --text-primary:   #0F172A;
  --text-secondary: #475569;
  --text-muted:     #94A3B8;

  --chart-bg:         #FFFFFF;
  --chart-grid:       #E2E8F0;
  --chart-crosshair:  #CBD5E1;
  --chart-scale-text: #475569;

  --skeleton-base:    #E2E8F0;
  --skeleton-shimmer: #CBD5E1;

  --topbar-bg:     #FFFFFF;
  --topbar-border: #E2E8F0;
  --sidebar-bg:    #F1F5F9;
}

/* ─── OS preference fallback (no saved setting) ─────────────── */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    /* mirror [data-theme="dark"] values */
    --bg-base: #0A0A0F; /* ... etc */
  }
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    /* mirror [data-theme="light"] values */
    --bg-base: #F8FAFC; /* ... etc */
  }
}
```

---

## 15. Design Assets

### Pencil Design Files

| File | Description |
|------|-------------|
| [`assets/design_system.pen`](assets/design_system.pen) | Design system components, tokens, and styles |
| [`assets/ui.pen`](assets/ui.pen) | UI screen designs and layouts |

### Logo & Brand Assets

| File | Description |
|------|-------------|
| [`assets/logo/icon.svg`](assets/logo/icon.svg) | App icon (universal) |
| [`assets/logo/icon-dark.svg`](assets/logo/icon-dark.svg) | App icon — dark theme |
| [`assets/logo/icon-light.svg`](assets/logo/icon-light.svg) | App icon — light theme |
| [`assets/logo/favicon.svg`](assets/logo/favicon.svg) | Favicon (browser tab) |
| [`assets/logo/lockup-dark.svg`](assets/logo/lockup-dark.svg) | Logo + wordmark — dark theme |
| [`assets/logo/lockup-light.svg`](assets/logo/lockup-light.svg) | Logo + wordmark — light theme |
| [`assets/logo/tray-dark.svg`](assets/logo/tray-dark.svg) | System tray icon — dark theme |
| [`assets/logo/tray-light.svg`](assets/logo/tray-light.svg) | System tray icon — light theme |
| [`assets/logo/preview.html`](assets/logo/preview.html) | Logo preview page |

---

*Generated from `docs/ui-design-prompts.md`. Keep in sync with the source prompts.*
