# QUALITY.md

## Definition of done
A change is done only when:
- implementation matches the documented intent
- relevant tests pass
- lint/typecheck/build pass
- docs are updated if behavior or architecture changed
- all monetary calculations use Decimal.js (no float)
- SL registration is verified for any order-related change

## Validation commands
```bash
bun test
bun run lint
bun run typecheck
bun run build
```

## Test strategy
- Unit tests for indicator calculations (BB20, BB4, MA, RSI, ATR)
- Unit tests for signal logic (Evidence Gate, Safety Gate, direction filter)
- Unit tests for vectorization and normalization (202-dim, edge cases: NaN, zero width)
- Unit tests for KNN distance/ranking/time-decay
- Unit tests for position sizing (Decimal.js precision, leverage cap)
- Integration tests for ExchangeAdapter implementations (mock exchange responses)
- Integration tests for FSM state transitions (IDLE→WATCHING→HAS_POSITION→exit scenarios)
- Integration tests for Reconciliation (DB↔exchange mismatch scenarios)
- End-to-end: backtest produces expected signals on known historical data
- Contract tests for CCXT exchange API responses

## Review expectations
- Every non-trivial change should explain why, not just what
- New dependencies must be justified
- Architecture violations are blockers
- Any use of `number` for financial values is a blocker
- Exchange adapter changes require testing against sandbox/testnet

## Performance and DX gates
- End-to-end pipeline (candle close → order placed) < 1.2s (ARCHITECTURE.md Pipeline latency budget)
- Backtest 3 years of 5M data completes in reasonable time
- `bun run dev` starts the full system locally
- Config changes (mode, trade block toggle) take effect without restart

## Initial quality risks
- Exchange API differences may surface only during live testing
- pgvector KNN performance at scale needs benchmarking
- WebSocket reconnection edge cases in Bun runtime
- Decimal.js performance overhead in hot paths (vectorization)
