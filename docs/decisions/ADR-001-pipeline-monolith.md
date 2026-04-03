# ADR-001: Pipeline Module Monolith

## Date
2026-04-03

## Status
Accepted

## Context
Need to choose an architectural pattern for a 24/7 crypto trading daemon operated by 1 person. The system has a clear linear data flow (candles → indicators → signals → vectors → KNN → orders → exits) and backtest must reuse the exact same code paths as live trading.

Alternatives considered:
- **Event-driven / message queue**: Adds operational complexity (broker, dead-letter queues) with no benefit for a single-process system
- **Microservices**: Over-engineered for 1 operator. Introduces network latency in the critical path and deployment complexity
- **Hexagonal / Clean Architecture**: Too much indirection for a pipeline that flows in one direction
- **Simple scripts**: Insufficient structure for 18 distinct concerns that need clear boundaries

## Decision
Use Pipeline Module Monolith: single Bun process with 10 numbered layers (L0-L9), typed function calls, and strict downward-only imports. No event bus, no queues.

## Consequences
- Positive: Debuggable linear flow, shared backtest code paths, minimal operational overhead
- Positive: Layer numbers enable mechanical enforcement via linting
- Negative: Cannot independently scale or restart modules (e.g., reconciliation shares failure domain with order execution)
- Negative: CPU-intensive work (KNN search) can block the event loop — must monitor latency
- Mitigation: SL always on exchange (survives crash), systemd restarts daemon, kill switch is separate script
