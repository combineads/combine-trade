# EP-13 Backtest & WFO — Archive Summary

- **Completed**: 2026-04-05
- **Tasks**: 14 (T-13-001 ~ T-13-014)
- **Tests**: 248 pass, 0 fail
- **Source files**: 11 new files in src/backtest/

## Key decisions
- MockExchangeAdapter implements full ExchangeAdapter interface with lookahead prevention
- PipelineDeps DI pattern enables code path identity between live and backtest
- WFO uses 2-stage search: Grid (core params) → Random (feature weights)
- Promise-based parallelism instead of Bun Workers (stability risk)
- Backtest trades collected in-memory, only aggregates saved to DB

## Patterns discovered
- DI factory pattern for swapping live/mock adapters
- Temporal ordering enforcement via advanceTime + timestamp filtering
- Callback-based param search (runBacktest callback) for testability

## Outputs produced
- src/backtest/ (11 files, ~3000 LOC)
- tests/backtest/ (13 test files, 248 tests)
- src/db/schema.ts (backtestTable addition)
- package.json (backtest script)
