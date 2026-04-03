# ADR-003: Phased Exchange Rollout

## Date
2026-04-03

## Status
Accepted

## Context
The PRD specifies 4 exchanges (Binance, OKX, Bitget, MEXC). The critic review flagged multi-exchange support as the most likely YAGNI violation — investing in 4 exchange adapters before the strategy is proven on even 1.

CCXT provides unified API abstraction, but the normalization is lossy. Order types, fee structures, position modes, and rate limits differ in ways that surface only during live testing. Each exchange requires sandbox/testnet validation, rate limit testing, and API edge case handling.

## Decision
Phase the exchange rollout:
1. **Phase 1**: Binance (candles + orders, full pipeline). Validate strategy profitability.
2. **Phase 2**: OKX (candles + orders). Validate ExchangeAdapter pattern works for a second exchange.
3. **Phase 3**: Bitget + MEXC (candles + orders). Only after the adapter pattern is proven stable.

Each exchange runs its own independent pipeline: candle collection → signal detection → order execution. Same symbol on different exchanges has different prices, so SL/TP must be calculated from that exchange's candles.

The ExchangeAdapter interface is designed upfront (in `core/ports.ts`) so the code structure supports multi-exchange from day 1, but implementation effort is deferred.

## Consequences
- Positive: Faster time to first live trade
- Positive: Concentrated testing effort on one exchange
- Positive: Discover CCXT lossy abstractions incrementally, not all at once
- Negative: Initial capital concentration on a single exchange
- Negative: XAUTUSDT availability may require an earlier exchange if Binance doesn't support it
- Mitigation: Interface is ready; adding an exchange is adapter code + config, not architectural change
