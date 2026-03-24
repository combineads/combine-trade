# Anti-Patterns

Patterns tried and failed. Check here before attempting similar approaches.

## Template

```
### [Short description]
- **Tried**: YYYY-MM-DD, T-EP-NNN
- **Problem**: [what went wrong]
- **Instead**: [what works]
```

<!-- Add entries below as they are discovered -->

## Pre-seeded anti-patterns (from architecture decisions)

### AP-001: Native float for monetary calculations
- **Tried**: Using JavaScript `number` type for price, PnL, fee calculations
- **Problem**: IEEE 754 floating-point produces rounding errors (e.g., 0.1 + 0.2 !== 0.3). In trading, this causes incorrect PnL, wrong order quantities, and potential financial loss.
- **Instead**: Use `Decimal.js` for all price/PnL/fee/balance calculations. Native `number` is allowed only for indicators and features. See ARCHITECTURE.md § Decimal precision boundary.

### AP-002: Cross-strategy/cross-symbol vector search
- **Tried**: Querying vectors across different strategies, versions, or symbols
- **Problem**: Violates Critical Invariant #1. Patterns from different strategies or symbols have incompatible feature spaces. Cross-contamination produces meaningless similarity scores and dangerous trading decisions.
- **Instead**: All vector queries must include `WHERE strategy_id = ? AND version = ? AND symbol = ?`. Enforced by physical table separation (vectors_{strategy_id}_v{version}).

### AP-003: Manual transaction management
- **Tried**: Direct `BEGIN`/`COMMIT`/`ROLLBACK` SQL calls in application code
- **Problem**: Violates AOP guardrail. Manual transactions are error-prone (missing rollback, nested transaction bugs) and bypass logging/retry decorators.
- **Instead**: Use `@Transactional` decorator from packages/shared/aop/. All transaction management is handled by the AOP layer.

### AP-004: Manual service instantiation
- **Tried**: `new ServiceName()` or direct constructor calls for services
- **Problem**: Violates IoC guardrail. Manual instantiation bypasses dependency injection, makes testing harder, and creates hidden coupling.
- **Instead**: Register all services in the IoC container (packages/shared/di/). Obtain instances via container resolution.

### AP-005: Strategy accessing external resources
- **Tried**: Strategy code calling DB, network, filesystem, or global APIs
- **Problem**: Violates Critical Invariant #2 (sandbox isolation). A malicious or buggy strategy could corrupt data, exfiltrate secrets, or cause system-wide failures.
- **Instead**: Strategies receive only the provided sandbox API (candle data, technical indicators, timeframe helpers). All external access is blocked at runtime.

### AP-006: Unbounded position sizing
- **Tried**: Placing orders without checking position size limits or account balance
- **Problem**: A single oversized order can deplete account balance or trigger exchange liquidation. Combined with leverage, losses can exceed the initial margin.
- **Instead**: All orders go through position sizing validation (EP09-M3). Pre-order checks: max position size as % of balance, max leverage limit, daily loss limit check.

### AP-007: Running strategy evaluation on unchecked candle data
- **Tried**: Evaluating strategy on candles with gaps or missing bars
- **Problem**: Evaluating strategy on candles with gaps produces invalid events. Gap-containing candle sequences cause indicator miscalculation, incorrect event timing, and misleading pattern vectors that corrupt the vector store.
- **Instead**: Always validate candle continuity before strategy evaluation. See CLAUDE.md Critical Invariant #3.
- **Source**: CLAUDE.md Critical Invariant #3

### AP-008: Submitting orders without decision engine
- **Tried**: Direct order submission to execution engine bypassing the decision engine
- **Problem**: Direct order submission bypasses statistical validation and safety checks. Orders placed without a valid decision_id FK have no audit trail, skip winrate/expectancy/min_samples gates, and circumvent kill-switch enforcement.
- **Instead**: All orders must originate from a decision engine judgment with valid decision_id FK. See CLAUDE.md Critical Invariant #4.
- **Source**: CLAUDE.md Critical Invariant #4

### AP-009: Propagating native float from indicators into financial calculations
- **Tried**: Passing raw indicator output (native `number`) directly into PnL, fee, or balance calculations
- **Problem**: Float precision errors accumulate across PnL/fee/balance calculations. Indicator math (e.g., RSI, ATR) operates on native floats; passing those values unchanged into financial logic causes compounding rounding drift.
- **Instead**: Convert to Decimal.js at the precision boundary (strategy output → vectorization input). Native `number` is acceptable inside the strategy sandbox for indicator math only. See ARCHITECTURE.md Decimal precision boundary.
- **Source**: ARCHITECTURE.md Decimal precision boundary
