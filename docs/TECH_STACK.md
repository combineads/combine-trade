# Tech Stack — combine-trade

> Last verified: 2026-04-03

## Why This Stack

**Bun** is chosen as the single runtime for daemon, API server, test runner, and build tool — eliminating Node.js/npm/webpack tooling fragmentation. TypeScript provides type safety critical for a financial system where a mistyped price field means real money lost. **PostgreSQL + pgvector** combines battle-tested relational storage for trade state with native 202-dimensional vector similarity search for KNN, avoiding a separate vector database. **Drizzle ORM** wraps the postgres driver with type-safe schema definitions and zero-abstraction SQL, keeping queries predictable while eliminating raw-SQL boilerplate. **@ixjb94/indicators** provides 100+ technical analysis indicators (BB, SMA, EMA, RSI, MACD) as a zero-dependency ~30kb library — the core computation layer for the Double-BB strategy. **CCXT** provides unified exchange API abstraction that covers all 4 target exchanges. **React + Vite** delivers a fast-building dashboard UI served as static files from the same Bun process. **Decimal.js** is non-negotiable — all monetary arithmetic must be arbitrary-precision to prevent floating-point errors in position sizing, PnL calculation, and leverage computation.

## Core Technologies

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Runtime | Bun | 1.3.11 | TypeScript, WebSocket, HTTP server, test runner, bundler |
| Language | TypeScript | 6.0.2 | Strict mode, no implicit any |
| Frontend | React | 19.2.4 | Dashboard UI |
| Build | Vite | 8.0.3 | + @vitejs/plugin-react 6.0.1 |
| State | Zustand | 5.0.12 | Lightweight client state |
| Data fetching | @tanstack/react-query | 5.96.1 | 3-5s polling for dashboard |
| Routing | react-router | 7.14.0 | SPA routing |
| Styling | Tailwind CSS | 4.2.2 | Utility-first, dark mode |
| Database | PostgreSQL | 16+ | WAL, PITR, partitioning |
| ORM | Drizzle ORM | 0.45.2 | TypeScript-first, zero-abstraction SQL |
| DB driver | postgres (porsager) | 3.4.8 | Native Bun-compatible, used by Drizzle |
| DB toolkit | drizzle-kit | 0.31.10 | Migration generation & push |
| Vector search | pgvector | 0.2.1 | JS client for pg_vector extension |
| Indicators | @ixjb94/indicators | 1.2.4 | 100+ TA indicators (BB, SMA, EMA, RSI, MACD) |
| Exchange | CCXT | 4.5.46 | Binance, OKX, Bitget, MEXC |
| Precision | decimal.js | 10.6.0 | All monetary calculations |
| API framework | Hono | 4.12.10 | Lightweight web framework for Bun.serve() |
| Validation | Zod | 4.3.6 | Config schema, API input validation |
| Auth | jsonwebtoken | 9.0.3 | JWT (HttpOnly cookie) |
| Alerts | @slack/webhook | 7.0.8 | Incoming webhook |
| Linting & Formatting | Biome | 2.4.10 | Lint + format for TS/JS/JSX/TSX/JSON/CSS |
| Testing | bun:test | built-in | Native Bun test runner |

## Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^6.0.2 | Type system |
| react | ^19.2.4 | UI library |
| react-dom | ^19.2.4 | DOM rendering |
| react-router | ^7.14.0 | SPA routing |
| zustand | ^5.0.12 | Client state management |
| @tanstack/react-query | ^5.96.1 | Server state / polling |
| @ixjb94/indicators | ^1.2.4 | Technical analysis indicators |
| ccxt | ^4.5.46 | Unified exchange API |
| decimal.js | ^10.6.0 | Arbitrary-precision arithmetic |
| drizzle-orm | ^0.45.2 | TypeScript ORM |
| postgres | ^3.4.8 | PostgreSQL driver (Drizzle adapter) |
| pgvector | ^0.2.1 | pgvector JS client |
| hono | ^4.12.10 | Lightweight web framework (Bun native) |
| zod | ^4.3.6 | Schema validation |
| jsonwebtoken | ^9.0.3 | JWT auth |
| @slack/webhook | ^7.0.8 | Slack notifications |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| vite | ^8.0.3 | Frontend build tool |
| @vitejs/plugin-react | ^6.0.1 | React JSX transform for Vite |
| tailwindcss | ^4.2.2 | Utility CSS |
| drizzle-kit | ^0.31.10 | Drizzle migration toolkit |
| @biomejs/biome | ^2.4.10 | Linting & formatting |
| @types/jsonwebtoken | ^9.0.10 | JWT type definitions |

## Install

```bash
# Production dependencies
bun add typescript react react-dom react-router zustand @tanstack/react-query @ixjb94/indicators ccxt decimal.js drizzle-orm postgres pgvector hono zod jsonwebtoken @slack/webhook

# Development dependencies
bun add -d vite @vitejs/plugin-react tailwindcss drizzle-kit @biomejs/biome @types/jsonwebtoken
```

## Setup

### 1. Prerequisites
```bash
# Bun runtime
curl -fsSL https://bun.sh/install | bash  # or: brew install oven-sh/bun/bun

# PostgreSQL 16+ with pgvector extension
brew install postgresql@16
# or: apt install postgresql-16 postgresql-16-pgvector

# Enable pgvector
psql -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 2. Environment variables
```bash
cp .env.example .env
# Required:
# DATABASE_URL=postgresql://user:pass@localhost:5432/combine_trade
# BINANCE_API_KEY=...
# BINANCE_API_SECRET=...
# JWT_SECRET=<random 64-char string>
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### 3. Database setup
```bash
bun run db:migrate    # Run migrations
bun run db:seed       # Load historical candle data (optional)
```

### 4. First run
```bash
bun install           # Install all dependencies
bun run build         # Build web UI (Vite → ./public)
bun run dev           # Start daemon in development mode
```

## Compatibility Notes

- **Bun ≥ 1.3**: Required for stable WebSocket client and built-in test runner
- **PostgreSQL ≥ 16**: Required for pgvector HNSW index support
- **pgvector ≥ 0.5.0** (PostgreSQL extension): Required for HNSW index type
- **Node.js**: Not used — Bun is the sole runtime. If Bun stability issues emerge, migration path is Node.js 22 LTS (see ADR-001)
- **Browser targets**: Dashboard is internal tool — latest Chrome/Firefox/Safari sufficient
- **Drizzle ORM**: Uses `postgres` (porsager) as underlying driver — both must be compatible. drizzle-kit is dev-only (migration generation)
- **@ixjb94/indicators**: Zero dependencies, ~30kb. Provides BB, SMA, EMA, RSI, MACD and 100+ indicators needed for Double-BB strategy
- **CCXT**: Major versions may change exchange API mappings — pin to minor version and test before upgrading

## Version Policy

**Patch releases** (x.x.N): Safe to auto-update — apply immediately.
**Minor releases** (x.N.0): Review changelog before upgrading — API additions are generally safe.
**Major releases** (N.0.0): Gate on a dedicated upgrade task — breaking changes require testing.

**Special cases:**
- **CCXT**: Even minor updates can change exchange behavior. Test against sandbox before upgrading.
- **Decimal.js**: Extremely stable. Upgrades are safe.
- **Drizzle ORM**: 0.x — API still evolving. Pin to minor version, review changelog before upgrading.
- **postgres driver**: Test DB operations after any upgrade. Must stay compatible with drizzle-orm.
- **Bun runtime**: Test WebSocket stability and test runner after upgrades.

Update cadence: Run `bun outdated` monthly and after major Bun releases.
