# ARCHITECTURE.md

## System overview

Combine Trade is a strategy-defined vectorization trading system. Strategies are written in TypeScript, stored in DB, and executed in a sandbox runtime. The system vectorizes strategy events, performs L2 similarity search against historical patterns, and makes statistical entry decisions.

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Combine Trade                            │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Candle   │→│ Strategy  │→│  Vector   │→│ Decision  │       │
│  │ Collector │  │  Engine   │  │  Engine   │  │  Engine   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│       ↑             ↑                            │              │
│       │        ┌──────────┐               ┌──────────┐         │
│       │        │ Strategy  │               │  Alert /  │         │
│       │        │ Sandbox   │               │ Execution │         │
│       │        └──────────┘               └──────────┘         │
│       │                                         │              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │              │
│  │ Exchange  │  │  Label   │  │ Backtest  │     │              │
│  │ Adapter   │  │  Engine  │  │  Engine   │     │              │
│  └──────────┘  └──────────┘  └──────────┘     │              │
│       │                                         ↓              │
│  ┌──────────────────────────────────────────────────┐          │
│  │              PostgreSQL + pgvector                │          │
│  └──────────────────────────────────────────────────┘          │
│       ↑                                         ↑              │
│  ┌──────────┐                            ┌──────────┐         │
│  │ Binance  │                            │   OKX    │         │
│  └──────────┘                            └──────────┘         │
└─────────────────────────────────────────────────────────────────┘

                  ┌──────────────────────┐
                  │  packages/ui/        │
                  │  공통 React 컴포넌트   │
                  │  + Platform Adapter  │
                  └─────────┬────────────┘
                    import  │  import
              ┌─────────────┼─────────────┐
              ▼                           ▼
         ┌──────────┐              ┌──────────────┐
         │ apps/web │              │apps/desktop  │
         │ Next.js  │              │Next.js Static│
         │ SSR/SSG  │              │+ src-tauri/  │
         └────┬─────┘              └──────┬───────┘
              │                           │
              └────── Elysia API ─────────┘
```

## Chosen stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Backend framework | Elysia |
| Cross-cutting | AOP (transaction management, logging) |
| DI | IoC container |
| ORM | DrizzleORM |
| Database | PostgreSQL + pgvector (HNSW index) |
| Exchange adapter | CCXT |
| Desktop/Mobile UI | Tauri |
| Web UI | Next.js |
| Strategy execution | TypeScript sandbox (DB-stored, runtime-executed) |
| Notification | Slack webhook |

## Proposed repository layout
```text
.
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── apps/
│   ├── api/                    # Elysia API server
│   │   ├── src/
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── middleware/     # AOP middleware (tx, logging)
│   │   │   └── container.ts   # IoC container setup
│   │   └── index.ts
│   ├── web/                    # Next.js web UI (SSR/SSG)
│   │   ├── app/                # App Router pages (Server Components + Client)
│   │   ├── lib/                # Web-specific utilities (prefetch, middleware)
│   │   └── next.config.ts
│   └── desktop/                # Tauri desktop app (Next.js static + Rust)
│       ├── app/                # App Router pages (all 'use client', output: 'export')
│       ├── src-tauri/
│       │   ├── src/            # Rust commands (keychain, tray, auto-start)
│       │   ├── tauri.conf.json # devUrl, frontendDist
│       │   └── Cargo.toml
│       ├── out/                # Static export output (git-ignored)
│       └── next.config.ts      # output: 'export'
├── packages/
│   ├── core/                   # Domain logic (strategy-agnostic)
│   │   ├── strategy/           # Strategy sandbox, API, execution
│   │   ├── vector/             # Vectorization, normalization, search
│   │   ├── decision/           # Statistical decision engine
│   │   ├── label/              # Result labeling (WIN/LOSS/TIME_EXIT)
│   │   ├── indicator/          # Technical indicator library
│   │   ├── journal/            # Trade journal domain logic, tag management, pattern analysis
│   │   └── risk/               # Kill switch, daily loss limit, position sizing rules
│   ├── exchange/               # Exchange adapter layer (CCXT)
│   │   ├── binance/
│   │   └── okx/
│   ├── candle/                 # Candle collection and storage
│   ├── backtest/               # Backtesting engine
│   ├── alert/                  # Slack alert engine
│   ├── execution/              # Order execution engine
│   ├── ui/                     # Shared React component library
│   │   ├── components/         # Common UI (Button, Card, Table, Chart, ...)
│   │   ├── views/              # Page views (DashboardView, StrategyListView, ...)
│   │   ├── hooks/              # Shared hooks (useSSE, useStrategy, ...)
│   │   └── platform/           # Platform adapter (web/Tauri runtime branching)
│   │       ├── types.ts        # PlatformAdapter interface
│   │       ├── context.tsx     # PlatformProvider (React Context)
│   │       ├── web.ts          # Web implementation
│   │       └── tauri.ts        # Tauri implementation (dynamic import)
│   └── shared/                 # Shared types, utilities, IoC
│       ├── types/
│       ├── di/                 # IoC container abstractions
│       └── aop/                # AOP decorators (tx, logging)
├── workers/
│   ├── candle-collector/       # Real-time candle ingestion
│   ├── strategy-worker/        # Strategy event evaluation
│   ├── vector-worker/          # Vectorization + similarity search
│   ├── label-worker/           # Delayed result labeling
│   ├── alert-worker/           # Slack notification dispatch
│   ├── execution-worker/       # Order execution
│   ├── journal-worker/          # Trade journal entry creation
│   ├── macro-collector/         # Economic calendar + event-triggered news collection
│   ├── retrospective-worker/    # LLM retrospective report generation (claude -p)
│   └── llm-decision-worker/     # LLM 2nd-stage decision filter (≥15m timeframes, opt-in)
├── db/
│   ├── schema/                 # DrizzleORM schemas
│   ├── migrations/             # Generated migrations
│   └── seed/                   # Seed data for development
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/
├── docs/
└── .env.example
```

## Architectural boundaries

### Dependency direction
```
apps/api         → packages (core/exchange/candle/...) → packages/shared
apps/web         → packages/ui → packages/shared
apps/desktop     → packages/ui → packages/shared
workers          → packages (core/exchange/candle/...) → packages/shared
```
- `packages/ui/` is consumed by `apps/web/` and `apps/desktop/` only. Never by `apps/api/`, workers, or backend packages.
- `packages/ui/` may import from `packages/shared/types/` (shared type definitions) but NOT from `packages/core/`, `packages/exchange/`, or `db/`.
- `packages/ui/platform/tauri.ts` imports `@tauri-apps/api` via dynamic import — isolated from web builds.

#### packages/core internal dependency rules
- packages/core/strategy → packages/core/indicator (allowed: strategy uses indicators)
- packages/core/decision → packages/core/vector (allowed: decision reads statistics)
- packages/core/label → (no core dependencies: only candle data needed)
- packages/core/vector → (no core dependencies: receives features from strategy-worker)
- packages/core/indicator → (leaf module: no core dependencies)
- Circular dependencies within packages/core are prohibited.

### Worker → Package import rules

| Worker | Allowed imports |
|--------|----------------|
| candle-collector | packages/candle, packages/exchange, packages/shared |
| strategy-worker | packages/core/strategy, packages/core/indicator, packages/candle, packages/shared |
| vector-worker | packages/core/vector, packages/core/decision, packages/shared |
| label-worker | packages/core/label, packages/candle, packages/shared |
| execution-worker | packages/execution, packages/exchange, packages/core/risk, packages/shared |
| alert-worker | packages/alert, packages/shared |
| journal-worker | packages/core/journal, packages/candle, packages/shared |
| macro-collector | packages/core/macro, packages/shared |
| retrospective-worker | packages/core/macro, packages/core/journal, packages/shared |
| llm-decision-worker | packages/core/macro, packages/core/journal, packages/shared |

Workers must not import from `apps/` or from other workers.

### Layer responsibilities

**packages/core/strategy** — Strategy sandbox
- Load TypeScript strategy code from DB
- Execute in isolated sandbox with Pine Script-level API via V8 isolates
- Output: event_condition result, features[], entry/exit conditions
- **Sandbox isolation model**: V8 isolates (`isolated-vm` library)
  - Each strategy runs in a separate V8 heap with no shared memory
  - Memory limit per isolate: 128MB (prevents runaway allocations)
  - Execution timeout: 500ms (prevents infinite loops)
  - No access to DB, filesystem, or network — only provided API surface
  - One strategy's crash does not affect other strategies

##### Sandbox API version policy
- The sandbox API uses semantic versioning (`MAJOR.MINOR.PATCH`)
- Breaking changes (removed or renamed API surface) increment `MAJOR`; the previous major version remains supported for 2 minor releases after the breaking change
- Each strategy's manifest declares the minimum API version it requires (e.g. `"apiVersion": ">=2.0.0"`)
- The runtime validates API version compatibility before executing a strategy; incompatible strategies are rejected with `ERR_USER_API_VERSION`

**packages/core/vector** — Vectorization engine
- Normalize features to [0,1] using strategy-defined methods
- Store vectors in pgvector with HNSW index
- L2 similarity search within strategy+version+symbol scope

**packages/core/decision** — Decision engine
- Calculate winrate, expectancy from similar pattern statistics
- Apply decision criteria: ≥30 samples, ≥55% winrate, >0 expectancy
- Output: LONG / SHORT / PASS
- Note: The decision engine is a pure function module: it receives statistics and returns a judgment (LONG/SHORT/PASS). The calling worker (vector-worker) is responsible for persisting the decision to the decisions table.

**packages/core/label** — Label engine
- Scan forward bars after event for TP/SL/TIME_EXIT
- Record result_type, pnl_pct, mfe_pct, mae_pct, hold_bars

**packages/core/indicator** — Technical indicator library
- SMA, EMA, BB, RSI, MACD, ATR, etc.
- Exposed to strategy sandbox as built-in API

**packages/exchange** — Exchange adapter
- CCXT-based adapters for Binance and OKX
- Standardized interface: fetchOHLCV, watchOHLCV, createOrder, cancelOrder, fetchPositions, fetchBalance

**packages/candle** — Candle management
- Collection, storage, gap detection, continuity validation
- Exchange/symbol/timeframe isolation

**packages/backtest** — Backtesting engine
- Replay 3 years of historical data through strategy
- Generate events, vectors, labels during backtest
- Performance target: complete in minutes

**packages/alert** — Alert engine
- Format and send Slack notifications
- Delivery state tracking (pending/sent/failed)

**packages/execution** — Order execution
- Exchange order submission via adapter
- Position tracking, SL/TP management
- All order submissions must originate from a decision engine judgment (no direct order API). Orders require a valid decision_id foreign key.
- Paper trading engine: packages/execution/paper/ — simulated fill engine for paper mode. Uses same interfaces as real execution but writes to paper_* tables. See EP14.

### packages/core/journal
- Trade journal entry assembly and snapshot linkage
- Journal enrichment with market context data
- Tag management and pattern analysis
- Must not import Elysia, CCXT, or Drizzle directly

### Boundary rules
- Domain code (packages/core) must not import Elysia, CCXT, Drizzle, or Slack SDK
- Workers call domain packages through explicit interfaces
- Exchange-specific logic stays in packages/exchange
- UI apps communicate only through the Elysia API layer
- Strategy sandbox has no direct DB, network, or filesystem access — only the provided API

**Database schema access**: Only `apps/` and `workers/` may import from `db/schema/`. Domain packages (`packages/core/*`) must receive data access through injected repository interfaces, never by importing Drizzle schema objects directly.

#### Dynamic vector table exception
Dynamic vector tables (`vectors_{strategy_id}_v{version}`) are an exception to the DrizzleORM-only policy:
- These tables use raw SQL with type-safe wrapper functions (DrizzleORM cannot model schema-dynamic tables)
- All dynamic table operations must go through the vector-engine module's table manager (`packages/core/vector`)
- Upper bound: max 1000 dynamic vector tables per deployment to manage operational complexity
- No other module may issue raw SQL for vector tables; the table manager is the single access point

## Tauri + Next.js integration architecture

### UI code sharing model

**`packages/ui/` 중심의 3-tier 아키텍처.** 공통 컴포넌트는 `packages/ui/`에, 앱별 페이지 셸은 각 앱에 위치한다.

```
                packages/ui/
                ├── components/    (공통 UI)
                ├── views/         (페이지 뷰 — 실제 UI 로직)
                ├── hooks/         (공통 훅)
                └── platform/      (플랫폼 분기)
                    ↑         ↑
        ┌───────────┘         └───────────┐
  apps/web/                         apps/desktop/
  ├── app/ (SSR pages)              ├── app/ ('use client' pages)
  │   └── dashboard/page.tsx        │   └── dashboard/page.tsx
  │       → <DashboardView />       │       → <DashboardView />
  └── lib/ (prefetch, middleware)   └── src-tauri/ (Rust native)
```

**Invariants:**
- `packages/ui/` owns all shared React components and views. Both apps import from here.
- `apps/web/` pages are thin wrappers that optionally add SSR prefetching around shared views.
- `apps/desktop/` pages are thin `'use client'` wrappers around the same shared views.
- `@tauri-apps/api` is a dependency of `packages/ui/` only, loaded via dynamic import when `__TAURI_INTERNALS__` is detected. Tree-shaken from `apps/web/` bundles.
- New UI components go in `packages/ui/`, NOT in `apps/web/` or `apps/desktop/`.

### Platform adapter (`packages/ui/platform/`)

Abstracts web/desktop differences behind a React Context provider.

```typescript
interface PlatformAdapter {
  isDesktop: boolean;
  sendNotification(title: string, body: string): Promise<void>;
  storeRefreshToken(token: string): Promise<void>;
  getRefreshToken(): Promise<string | null>;
}
```

| Method | Web implementation | Tauri implementation |
|--------|-------------------|---------------------|
| `sendNotification` | Web Notification API | `@tauri-apps/plugin-notification` |
| `storeRefreshToken` | No-op (httpOnly cookie handles it) | `@tauri-apps/plugin-store` (Keychain) |
| `getRefreshToken` | No-op (cookie auto-sent) | `@tauri-apps/plugin-store` (Keychain read) |

Runtime detection via `PlatformProvider` in root layout:
```typescript
// packages/ui/platform/context.tsx
useEffect(() => {
  if ('__TAURI_INTERNALS__' in window) {
    import('./tauri').then(m => setAdapter(m.tauriAdapter));
  }
}, []);
```

Components use `usePlatform()` hook — no direct platform checks in component code.

### Authentication flow

| Token | Storage | Web | Tauri |
|-------|---------|-----|-------|
| Access (15min) | zustand (memory) | Same | Same |
| Refresh (7days) | httpOnly cookie (Elysia sets) | Same | Same (WebView cookie jar) |
| Refresh backup | — | N/A | Keychain via plugin-store |

### CSP policy (Tauri `apps/desktop/` only)

Monaco Editor requires `unsafe-eval` for internal JS processing. Acceptable because:
- Strategy code execution happens in V8 isolates (server-side), NOT in WebView
- Private single-user tool
- `unsafe-eval` is limited to `script-src`

```
default-src 'self'; script-src 'self' 'unsafe-eval'; connect-src 'self' http://localhost:* https://api.*; style-src 'self' 'unsafe-inline'
```

### `apps/desktop/` static export constraints

`output: 'export'` (Tauri용 정적 빌드)는 모든 페이지가 클라이언트에서 렌더링 가능해야 한다:
- All route components must use `'use client'`
- No Server Components data fetching — react-query only
- No Middleware — client-side route guards (zustand + router)
- Dynamic routes require `generateStaticParams()` or catch-all `[...slug]`

`apps/web/`은 이 제약에 해당하지 않음. 풀 Next.js SSR/SSG 가능.

## Data ownership

### Storage structure
- **Candles**: stored per exchange/symbol/timeframe (shared table)
- **Strategies**: stored in DB (code + metadata + version)
- **Events**: shared table (all strategy events)
- **Vectors**: physically separated per strategy+version + pgvector HNSW index
- **Labels**: per-event results (shared table)
- **Decisions**: per-event decision audit trail (shared table)

### Isolation principle
- Vector search scope: same strategy + same version + same symbol
- Cross-strategy vector comparison is forbidden
- Cross-symbol search is forbidden

### Position direction policy
- Each strategy declares a single direction: LONG or SHORT
- Multiple strategies may target the same symbol with different directions (e.g., strategy A = LONG BTCUSDT, strategy B = SHORT BTCUSDT)
- The system allows simultaneous opposing positions on the same symbol from different strategies (hedge mode)
- Exchange adapter must use hedge mode (Binance: `dualSidePosition=true`, OKX: `posMode=long_short_mode`)
- EP09 symbol-level serialization queue serializes orders per (symbol, direction) pair, not per symbol alone

### Version management
- New strategy version = new vector table creation
- Historical data re-vectorization (backtest re-run)

## Database schema (core tables)

### candles
```sql
exchange, symbol, timeframe, open_time (PK composite)
open, high, low, close, volume
is_closed, source, created_at, updated_at
```

### strategies
```sql
id, version, name, code (TypeScript source)
symbols[], timeframe, direction
features_definition (JSON), normalization_config (JSON)
search_config (top_k, threshold, min_samples)
result_config (tp_pct, sl_pct, max_hold_bars)
decision_config (min_winrate, min_expectancy)
execution_mode       text         'analysis'  -- analysis/alert/paper/live
api_version, status, created_at, updated_at
```

### strategy_events
```sql
id, strategy_id, strategy_version, symbol, timeframe
event_time, direction, features_vector (JSON)
entry_price, status, created_at
```

### vectors_{strategy_id}_v{version}
```sql
id, event_id, symbol, timeframe
embedding vector(dimension), created_at
-- HNSW index on embedding
-- Partitioned per strategy+version (physical table separation)
```

### event_labels
```sql
id, event_id
result_type (WIN/LOSS/TIME_EXIT)
pnl_pct, mfe_pct, mae_pct, hold_bars
exit_price, sl_hit_first, created_at
```

### alerts
```sql
id, event_id, channel, message
delivery_state (pending/sent/failed)
created_at, sent_at
```

### orders
```sql
id, event_id, decision_id (FK decisions), strategy_id, exchange, symbol
side, order_type, price, quantity, filled_quantity
sl_price, tp_price
status (planned/submitted/partially_filled/filled/rejected/canceled), exchange_order_id
created_at, updated_at
```

### decisions
```sql
id, event_id, strategy_id, strategy_version, symbol
direction (LONG/SHORT/PASS)
sample_count, winrate, expectancy, avg_win, avg_loss
ci_lower DECIMAL              -- 95% CI lower bound for winrate
ci_upper DECIMAL              -- 95% CI upper bound for winrate
confidence_tier TEXT           -- 'low' | 'medium' | 'high' | 'very_high'
similarity_top1_score
decision_reason (criteria_met/insufficient_samples/low_winrate/negative_expectancy)
execution_mode (analysis/alert/paper/live)
created_at
-- Append-only audit table. Every decision is recorded, including PASS.
```

### users
```sql
id, email, password_hash, name
role, is_active
created_at, updated_at
```

### exchange_credentials
```sql
id, user_id (FK users)
exchange, api_key_encrypted, api_secret_encrypted
label, is_active
created_at, updated_at
```

### funding_rates
```sql
exchange, symbol, funding_rate, funding_time (PK composite)
created_at
```
Funding rates are collected by the candle-collector worker alongside OHLCV data. Consumed by the journal-worker for net PnL calculation (gross PnL - fees - funding).

### trade_journals
```sql
id, user_id, event_id, order_id, entry_snapshot_id (FK entry_snapshots)
strategy_id, symbol, direction
entry_price, exit_price, quantity
gross_pnl, net_pnl, fees_paid, funding_paid
entry_time, exit_time, hold_bars
mfe_pct DECIMAL
mae_pct DECIMAL
exit_market_context JSONB
matched_patterns JSONB
auto_tags TEXT[]
user_notes TEXT
notes, tags[]
created_at, updated_at
```

### entry_snapshots
```sql
id, event_id (FK strategy_events)
snapshot_type (decision, market_context)
data (JSONB)
created_at
-- Created at decision time (before journal exists). trade_journals references this via entry_snapshot_id.
```

### paper_balances
```sql
id, user_id, exchange
balance, initial_balance
created_at, updated_at
```

### paper_positions
```sql
id, user_id, strategy_id, symbol
side, quantity, entry_price, unrealized_pnl
created_at, updated_at
```

### paper_orders
```sql
id, user_id, strategy_id, event_id
exchange, symbol, side, order_type
price, quantity, filled_quantity
status, created_at, updated_at
```

### vector_table_registry
```sql
strategy_id, version (PK composite)
table_name, dimension, row_count
status (active/archived)
created_at, updated_at
```

## Event bus (PostgreSQL LISTEN/NOTIFY)

| Channel | Payload | Producer | Consumer |
|---------|---------|----------|----------|
| candle_closed | exchange, symbol, timeframe, open_time | candle-collector | strategy-worker |
| strategy_event_created | event_id, strategy_id, symbol | strategy-worker | vector-worker |
| decision_completed | decision_id, event_id, strategy_id, direction, decision | vector-worker (inline) | alert-worker, execution-worker |
| label_ready | event_id | label-worker | statistics refresh, journal-worker |
| decision_pending_llm | decision_id, event_id, strategy_id | vector-worker | llm-decision-worker |
| journal_ready | journal_id | journal-worker | retrospective-worker |

Rules:
- Notifications are signals only; workers re-read DB state
- At-least-once delivery; all handlers must be idempotent
- Backfill writes do not emit downstream notifications

## Pipeline data flow

### Real-time flow
```
Candle close (exchange WS)
→ candle-collector: validate + upsert + NOTIFY candle_closed
→ strategy-worker: load strategy sandbox → evaluate event_condition
  → if event: persist strategy_event + NOTIFY strategy_event_created
→ vector-worker: normalize features → store vector → L2 search → compute statistics
  → decision engine (inline): check ≥30 samples, ≥55% winrate, >0 expectancy
  → NOTIFY decision_completed
→ IF strategy.use_llm_filter AND timeframe >= 15m AND direction IN (LONG, SHORT):
  → NOTIFY decision_pending_llm
  → llm-decision-worker: gather context (recent trades, macro) → claude -p → structured evaluation
    → CONFIRM: NOTIFY decision_completed (original direction)
    → PASS: NOTIFY decision_completed (direction=PASS, override logged)
    → REDUCE_SIZE: NOTIFY decision_completed (original direction + size_modifier)
→ ELSE: NOTIFY decision_completed (direct, no LLM)
→ alert-worker (LISTEN decision_completed): LONG/SHORT → Slack notification
→ execution-worker (LISTEN decision_completed): LONG/SHORT → order execution
→ PASS: log only
```

#### Execution mode branching
After decision engine produces a judgment (LONG/SHORT/PASS):
- **analysis**: Log decision only. No alert, no order.
- **alert**: Send Slack notification. No order.
- **paper**: Route to paper execution engine (simulated fill, paper_* tables).
- **live**: Route to real execution engine (exchange order via CCXT).
Mode is configured per strategy in the `strategies.execution_mode` column.

### Backtest flow
```
Load 3 years of historical candles
→ For each candle close (simulated):
  → strategy sandbox: evaluate event_condition
  → if event: vectorize features → store vector
  → label: scan forward bars → WIN/LOSS/TIME_EXIT
  → accumulate statistics
→ Output: vectors + labels + performance report
```

Optionally, decision engine can be invoked in simulation mode during backtest to measure historical decision accuracy (e.g., "would this signal have been taken?").

## Strategy evaluation concurrency

Concurrent strategy evaluation uses a V8 isolate pool (`isolated-vm`) to avoid blocking the main event loop while providing strong sandbox isolation.

### Pool configuration
- Pool size: `Math.max(2, os.cpus().length - 1)` (minimum 2 isolates)
- Each isolate runs a dedicated strategy sandbox instance
- Isolate lifecycle:
  - Created on-demand when strategy is activated
  - Memory limited to 128MB per isolate (prevents runaway allocations)
  - Reused across multiple candle evaluations for same strategy (amortizes setup cost)
  - Destroyed when strategy is deactivated
- **Isolation guarantee**: no shared memory, no escape paths — one strategy cannot interfere with another

### Latency budget
| Scenario | Budget |
|----------|--------|
| Single strategy, one candle | < 100ms |
| 10 strategies, one candle (parallel) | < 200ms total |
| 50 strategies, one candle (parallel, with backpressure) | < 500ms total |

Memory usage estimate:
- Per isolate: ~50MB (including V8 heap + overhead)
- MVP (5-10 strategies): ~250-500MB
- Phase 2 target (20-30 strategies): ~1-1.5GB per strategy-worker

### Priority queue
- Real-time strategies are evaluated first (high-priority queue)
- Backtest strategies are queued behind real-time work (low-priority queue)
- Backpressure: if the pool is saturated, backtest tasks are dropped and re-queued on the next candle tick rather than blocking the real-time path

### Timeout & resource limits
- Per-strategy execution timeout: 500ms (prevents infinite loops, leaves 500ms headroom for vector search + decision)
- Memory violation: immediate termination + log `ERR_FATAL_SANDBOX_OOM` → kill switch triggers
- Timeout violation: immediate termination + log `ERR_FATAL_SANDBOX_TIMEOUT` → kill switch triggers

## Execution concurrency control

### Symbol+direction-level serialization queue
- Orders for the same (symbol, direction) pair are serialized through a per-pair queue
- Allows simultaneous LONG and SHORT for the same symbol from different strategies (hedge mode)
- Prevents conflicting orders within the same direction (e.g., two LONG orders for BTCUSDT)
- Queue implementation: PostgreSQL advisory locks keyed on hash(symbol + direction)

### Position sizing locking
- Pessimistic locking on balance read during position sizing
- SELECT ... FOR UPDATE on account balance to prevent race conditions
- Lock scope: per-exchange, per-user (single-user system, but future-proofed)

## Configuration management

### Hierarchy
Configuration is resolved in descending priority order:

```
ENV vars  >  DB settings  >  code defaults
```

### Category ownership

| Category | Source | Rationale |
|----------|--------|-----------|
| Infrastructure (ports, DB URLs, API keys) | ENV only | Must be set before process start; not user-editable at runtime |
| Trading parameters (risk limits, position sizing) | DB (user-configurable) | Users adjust these at runtime without a deploy |
| Feature flags | DB with ENV override | Default in DB; ENV can forcibly enable/disable for testing |
| Constants (exchange specs, decimal precision) | Code defaults | Stable, versioned with the codebase |

### Reload behaviour
- ENV-sourced config: requires process restart to take effect
- DB-sourced config: hot-reloaded on each decision cycle (no restart required)
- Code defaults: change only on deploy

### DB connection pool sizing
| Consumer | Connections |
|----------|-------------|
| candle-collector | 3 |
| strategy-worker | 3 |
| vector-worker | 5 |
| label-worker | 2 |
| alert-worker | 2 |
| execution-worker | 3 |
| journal-worker | 2 |
| macro-collector | 2 |
| retrospective-worker | 2 |
| llm-decision-worker | 2 |
| API server | 5 |
| LISTEN dedicated | 3 |
| Headroom | 2 |
| **Total minimum** | **30** |

Pool configuration: `max_connections = 30` in PostgreSQL and connection pool library.
Each worker maintains a bounded pool; no worker may exceed its allocated connections.

## Risk management components

### Kill switch
- **Module**: `packages/core/risk/kill-switch/`
- **State storage**: `kill_switch_state` table (strategy_id nullable for global, is_active boolean, activated_at, activated_by, reason)
- **Propagation**: Event bus channel `kill_switch_activated` — all execution-workers subscribe
- **Behavior**: When activated: (1) cancels all queued but unsubmitted orders, (2) prevents all new order submissions, (3) does NOT cancel already-submitted exchange orders (requires manual intervention).
- **Persistence**: Kill switch state persists across restarts. System boots in halted state if kill switch was active at shutdown.
- **Latency**: Must propagate to all workers within 1 second (CLAUDE.md invariant #6)

#### Automatic triggers
See PRODUCT.md §9 "Kill switch automatic activation triggers" for the full trigger table.

Trigger integration points:

| Trigger category | Detection module | Detection method |
|-----------------|-----------------|-----------------|
| Financial: balance deviation | execution-worker | Compare `fetchBalance()` vs tracked balance every decision cycle |
| Financial: untracked position | execution-worker | Compare `fetchPositions()` vs `orders` table every 30s |
| Financial: order rejected 3× | execution-worker | Counter per strategy, reset on success |
| Infrastructure: exchange API | candle-collector, execution-worker | Heartbeat check, 30s grace window |
| Infrastructure: DB connection | All workers | Connection pool health check, 15s grace |
| Infrastructure: worker health | Supervisor process | Heartbeat timeout (60s without heartbeat) |
| Sandbox: OOM/timeout | strategy-worker | V8 isolate resource violation callback |
| Sandbox: crash 3× | strategy-worker | Per-strategy crash counter, reset on success |
| Data: candle gap | candle-collector | Gap detection on candle_closed sequence |
| Data: vector search timeout | vector-worker | Per-strategy timeout counter, reset on success |

#### Audit table: `kill_switch_events`
```sql
id, triggered_at, deactivated_at
scope TEXT                  -- 'global' | 'per_exchange' | 'per_strategy' | 'per_symbol'
scope_target TEXT           -- null (global) | exchange name | strategy_id | symbol
trigger_type TEXT           -- 'manual' | 'financial' | 'infrastructure' | 'sandbox' | 'data_integrity'
trigger_detail TEXT         -- Human-readable cause description
had_open_positions BOOLEAN
positions_snapshot JSONB    -- Open positions at trigger time
deactivated_by TEXT         -- 'manual_user_action'
created_at
```
Append-only. Never deleted or updated (except `deactivated_at`).

### Daily loss limit
- **Module**: `packages/core/risk/loss-limit/`
- **Schema**: `daily_loss_limits` table (strategy_id nullable for global, limit_amount decimal, reset_hour integer default 0 UTC)
- **Tracking**: `daily_pnl_tracking` table (date, strategy_id, symbol, realized_pnl decimal, updated_at)
- **Scope**: Per-strategy AND global limits. Global limit breached → all auto-trade suspended. Per-strategy limit breached → that strategy suspended.
- **Calculation**: Based on realized PnL only (closed positions). Unrealized PnL tracked separately for display but does not trigger limits.
- **Time window**: UTC day boundary (configurable via reset_hour)
- **Re-enablement**: Manual only. Requires explicit user action after reviewing the loss event.
- **Integration**: Decision engine checks loss limit before every order submission

## Cross-cutting concerns

### AOP (Aspect-Oriented Programming)
- **Transaction management**: declarative @Transactional decorator for DB operations
- **Logging**: structured logging decorator for all service boundaries
- Applied via packages/shared/aop

### IoC (Inversion of Control)
- Container-based dependency injection
- All services registered in IoC container
- Workers resolve dependencies from container at startup
- Applied via packages/shared/di

## Data retention

| Data type | Retention policy |
|-----------|-----------------|
| Candle data | Indefinite (append-only); compressed to cold storage after 1 year |
| Vector embeddings | Retained while referenced strategy is active; pruned 90 days after strategy deactivation |
| Trade journal entries | Indefinite (regulatory compliance) |
| Backtest results | 1 year, then archived to cold storage |
| Audit logs | 2 years |
| Session data | 30-day TTL |

Compression and pruning jobs run as scheduled background tasks outside the real-time pipeline.

## Decimal precision boundary

Financial values use exact decimal representation; indicator calculations use native float for performance.

### Boundary rules
- **Indicators & features**: native `number` (float64) — performance-critical for bulk backtesting; precision impact on indicator values is negligible
- **Prices, PnL, fees, balances, position sizing**: `Decimal.js` — financial accuracy required
- **Storage**: price/PnL/fee columns use `TEXT` in Postgres (exact decimal strings, e.g. `"0.00123456"`); indicator outputs use standard numeric types
- **Strategy sandbox output**: `features[]` are `number[]` (float); Decimal conversion begins at the fee/PnL calculation layer
- **Display layer**: format to exchange-specified decimal places immediately before rendering
- **Boundary annotation**: every `Decimal` → `number` conversion must be explicitly annotated in code

### Violation patterns
```typescript
// BAD: floating-point arithmetic on price
const profit = entryPrice * quantity * 0.001;

// GOOD: Decimal for monetary calculation
const profit = new Decimal(entryPrice).mul(quantity).mul('0.001');

// GOOD: native float for indicator (acceptable)
const ema = previousEma + alpha * (close - previousEma);
```

## Error taxonomy

Every error in the system belongs to exactly one of the following categories. Error codes, log levels, and alert policies derive from the category.

### Categories

| Category | Code prefix | Log level | Alert policy |
|----------|-------------|-----------|--------------|
| Retryable | `ERR_RETRY_` | WARN | Retry silently; alert after N consecutive failures |
| Fatal | `ERR_FATAL_` | ERROR | Halt affected worker; page on-call |
| User | `ERR_USER_` | INFO | Return structured error to caller; do not alert |
| System | `ERR_SYS_` | ERROR | Halt process; page on-call |

### Examples

- **Retryable**: network timeouts, exchange rate limits, temporary exchange outages
- **Fatal**: invalid API keys, insufficient balance, schema violations
- **User**: invalid strategy syntax, missing required fields, unsupported symbol
- **System**: OOM (out of memory), disk full, DB connection pool exhausted

### Implementation contract
- All thrown errors must include a `code` field matching the prefix pattern
- Callers must not catch `ERR_SYS_` or `ERR_FATAL_` errors and swallow them
- Retry logic lives in the transport/worker layer, not in domain packages

## Observability
- Structured JSON logging at all service boundaries
- Latency tracking on: candle ingestion, strategy evaluation, vector search, order execution
- Worker health heartbeat
- Candle continuity gap detection and alerting

## API versioning

All external-facing API endpoints use URL-prefix versioning.

### Scheme
```
/api/v1/...
/api/v2/...   (future)
```

### Version lifecycle
```
active  →  deprecated (6-month notice period)  →  sunset (removed)
```

- Breaking changes (removed fields, changed semantics) require a new major version (`v1` → `v2`)
- Non-breaking additions (new optional fields, new endpoints) are allowed within the existing version
- Deprecation notices are communicated via response headers (`Deprecation`, `Sunset`) and changelog

### Server-Sent Events (SSE)
The API layer supports SSE for pushing real-time updates (decisions, alerts, worker status, pipeline metrics) to web/desktop clients. Token is validated on initial SSE connection. See SECURITY.md for SSE connection limits and reconnection handling.

## Horizontal scaling path

The system is designed for single-node vertical scaling at MVP. The architecture does not preclude horizontal scale-out in later phases.

### Phase roadmap

| Phase | Description | Scope |
|-------|-------------|-------|
| Phase 1 (current) | Single-node, vertical scaling | MVP |
| Phase 2 | Separate `candle-collector` and `strategy-evaluator` as independent processes | Post-MVP |
| Phase 3 | Postgres read replicas for backtest queries (isolate backtest I/O from real-time path) | Post-MVP |
| Phase 4 | Redis pub/sub replaces PostgreSQL LISTEN/NOTIFY for cross-process events | Post-MVP |

### Constraints that preserve scaling options
- Workers communicate through the DB event bus (LISTEN/NOTIFY) — no direct inter-process calls
- All handlers are idempotent; duplicate delivery is safe
- No in-process shared state between strategy evaluations (worker thread isolation)

## Backup & disaster recovery

### Automated backup schedule
- pg_dump full backup: daily at UTC 02:00
- WAL archiving: continuous (point-in-time recovery capability)
- Backup retention: 30 days for daily backups, 7 days for WAL archives

### Recovery procedures
- Point-in-time recovery: restore from WAL archive to any timestamp within retention window
- Full restore: latest pg_dump + WAL replay
- Recovery time objective (RTO): < 1 hour
- Recovery point objective (RPO): < 5 minutes (WAL archiving lag)

### Backup verification
- Weekly automated restore test to a temporary database
- Verify row counts match production within acceptable delta

## Architecture success criteria
- Candle close → decision: < 1 second end-to-end
- 3-year backtest per strategy: < 5 minutes
- Vector search (pgvector HNSW): < 100ms for top_k=50
- Zero cross-strategy or cross-symbol vector contamination
- Strategy sandbox isolation: no direct DB/network access
- All workers independently restartable without data loss (idempotent processing)
