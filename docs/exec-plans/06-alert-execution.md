# 06-alert-execution

## Objective
의사결정 엔진이 LONG/SHORT 판정을 내리면 Slack 알람을 발송하고, 자동매매 모드에서는 거래소에 주문을 실행하는 알림/실행 레이어를 구축한다.

## Scope
- `packages/alert/` — Slack 알람 엔진
- `packages/execution/` — 주문 실행 엔진
- `workers/alert-worker/` — Slack 발송 워커
- `workers/execution-worker/` — 주문 실행 워커
- DB schema: `alerts`, `orders` 테이블

## Non-goals
- 리스크 관리 (킬스위치, 일일 손실 한도 — 09-risk-management)
- 포지션 관리 (trailing SL, break-even — 추후 에픽)
- 모의매매 (가상 체결 엔진, 가상 잔고 — 14-paper-trading)
- UI 알림 (08-api-ui에서 처리)

## Prerequisites
- `01-candle-collection` M1 — 거래소 어댑터 (주문 실행에 재사용)
- `03-vector-engine` M5 — vector-worker가 decision_completed 발행
- `04-label-decision` M3 — 의사결정 엔진

## Milestones

### M1 — Slack alert engine
- Deliverables:
  - `packages/alert/formatter.ts` — 알람 메시지 포맷터
  - `packages/alert/slack.ts` — Slack webhook 클라이언트
  - 알람 내용:
    - 전략명, 심볼, 타임프레임
    - Direction (LONG/SHORT)
    - Entry price, TP, SL
    - 유사 패턴 통계: winrate, expectancy, sample_count
    - 유사도 top-1
  - 실행 모드 확인: 알람 모드일 때만 발송
- Acceptance criteria:
  - Slack 메시지가 올바른 포맷으로 발송
  - 발송 실패 시 3회 재시도 후 failed 처리
  - 알람 모드가 아니면 발송 스킵
- Validation:
  ```bash
  bun test -- --filter "alert"
  ```

### M2 — Alert worker & delivery tracking
- Deliverables:
  - `workers/alert-worker/` — 알람 발송 워커
  - `alerts` 테이블: delivery_state (pending → sent | failed)
  - 의사결정 결과 수신 → 알람 생성 → Slack 발송 → 상태 업데이트
  - 재시도 로직: 3회 exponential backoff
  - Dead-letter 로깅
- Acceptance criteria:
  - LONG/SHORT 결정 → 알람 저장 → Slack 발송
  - PASS 결정 → 알람 미생성
  - delivery_state 정확히 추적
  - 멱등성: 동일 event_id 알람 중복 발송 방지
- Validation:
  ```bash
  bun test -- --filter "alert-worker"
  ```

### M3 — Order execution engine
- Deliverables:
  - `packages/execution/order-builder.ts` — 주문 생성 로직
  - `packages/execution/executor.ts` — 거래소 주문 실행
  - 주문 타입: Market (기본), 전략 커스텀 entry/exit 시 Limit 지원
  - SL/TP 주문 자동 설정
  - 주문 전 유효성 검증: 심볼, 수량, 가격 범위
  - client_order_id 기반 중복 방지
  - 실행 모드 확인: 자동매매 모드일 때만 실행
  - **Partial fill handling**: orders may be partially filled by the exchange
    - `partially_filled` status tracked in orders table
    - Remaining quantity: either cancel remainder or wait (configurable per strategy)
    - SL/TP adjusted to actual filled quantity
    - Slack notification on partial fill with fill percentage
- Acceptance criteria:
  - LONG/SHORT 결정 → 거래소 주문 실행
  - SL/TP 주문 자동 설정
  - 중복 주문 방지
  - 주문 실패 시 에러 로깅 (자동 재시도 3회)
  - 자동매매 모드가 아니면 실행 스킵
  - All order records must reference a valid `decision_id` foreign key. Direct order creation without a decision engine judgment is architecturally prohibited.
- Validation:
  ```bash
  bun test -- --filter "execution"
  ```

### Temporary safety limits (pre-EP09)
Until EP09 (risk management) is complete, the following hard caps apply:
- Single order max notional: configurable via environment variable (default: $1,000)
- Orders per hour per symbol: max 10
- These limits are replaced by EP09's position sizing and risk management upon completion.

### M4 — Execution worker & order tracking
- Deliverables:
  - `workers/execution-worker/` — 주문 실행 워커
  - `orders` 테이블 상태 추적: planned → submitted → partially_filled → filled | rejected | canceled
  - 주문 실행 후 거래소 상태 확인 (polling)
  - 거래소 연결 실패 시 주문 보류 + 알림
  - **Symbol+direction-level serialization queue**: orders for the same (symbol, direction) pair are processed sequentially via PostgreSQL advisory locks to prevent conflicting simultaneous orders within the same direction (see ARCHITECTURE.md § Position direction policy)
- Acceptance criteria:
  - 의사결정 → 주문 생성 → 거래소 제출 → 상태 추적
  - 주문 상태가 DB에 정확히 반영
  - 거래소 장애 시 주문이 무한 재시도되지 않음
  - Same-symbol re-order cooldown: minimum 5 seconds between consecutive orders for the same symbol+direction. Prevents runaway orders from event bus storms or worker bugs.
- Validation:
  ```bash
  bun test -- --filter "execution-worker"
  ```

### M5 — Execution mode management
- Prerequisites:
  - CRITICAL: Live (auto-trade) mode activation requires: (1) kill switch enabled and verified functional, (2) daily loss limit configured. If EP09 (Risk Management) is not yet complete, live (auto-trade) mode must remain disabled. The system must programmatically enforce this — not just document it.
- Deliverables:
  - 실행 모드 관리 서비스:
    - 분석 모드: 이벤트/벡터/라벨만 처리
    - 알람 모드: + Slack 알람
    - 모의매매 모드: + 가상 체결 (14-paper-trading에서 구현)
    - 자동매매 모드: + 실제 주문 실행
  - 모드 전환 API
  - 전략별 개별 모드 설정 가능
  - 모드 상태 영속화 (DB)
- Acceptance criteria:
  - 모드별 정확한 동작 범위 적용
  - 전략 A는 알람, 전략 B는 자동매매 등 개별 설정 가능
  - 모드 전환 즉시 반영
  - Auto-trade mode activation is rejected programmatically if kill switch is not enabled or daily loss limit is not configured
- Validation:
  ```bash
  bun test -- --filter "execution-mode"
  ```

## Task candidates
- T-077: Implement Slack webhook client with retry
- T-078: Implement alert message formatter (strategy, stats, prices)
- T-079: Build alert-worker with LISTEN → decide → alert → send
- T-080: Implement alert delivery state tracking (pending/sent/failed)
- T-081: Add alert deduplication (unique event_id)
- T-082: Extend exchange adapter with createOrder, cancelOrder, fetchOrder
- T-083: Implement order builder (market, limit, SL/TP)
- T-084: Implement order executor with validation and client_order_id
- T-085: Build execution-worker with decision → order → track
- T-086: Implement order status tracking (polling exchange)
- T-087: Implement execution mode service (analysis/alert/auto-trade)
- T-088: Add per-strategy execution mode configuration
- T-089: Integration test: decision → alert + order execution
- T-089a: Implement slippage tracking (expected price vs actual fill price)
- T-089b: Add slippage threshold alert (abnormal slippage → WARNING + Slack)
- T-089c: Implement partial fill handling and status tracking
- T-089d: Implement symbol-level order serialization queue (advisory locks)

## Risks
- 거래소 주문 API 응답 지연으로 1초 레이턴시 예산 초과 가능
- Slack webhook rate limit (분당 1회?)
- 거래소 장애 시 주문 실패 후 시장 가격 변동
- 분석 → 알람 → 자동매매 모드 전환 시 진행 중 이벤트 처리
- 시장가 주문 시 슬리피지로 인한 실제 진입가와 기대 진입가 차이 → 실효 PnL 저하
- Partial fill SL/TP mismatch: if an order is partially filled and SL/TP orders are placed for the original quantity, over-hedging occurs. Mitigation: SL/TP quantities must be synchronized with actual `filled_quantity`, updated on each fill event.

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Market 주문 기본 (Limit은 전략 커스텀) | 1초 레이턴시 예산 내 실행 우선 |
| 2026-03-21 | 전략별 개별 실행 모드 | 일부 전략만 자동매매, 나머지는 알람만 |
| 2026-03-21 | client_order_id 기반 중복 방지 | 네트워크 재시도 시 이중 주문 방지 |

## Progress notes
- 2026-03-22: Tasks generated — T-043 (formatter), T-044 (mode service), T-045 (order builder), T-046 (alert handler), T-047 (integration).
- 2026-03-22: M1 (formatter), M2 partial (alert handler), M3 partial (order builder), M5 (mode service) completed. 396 tests passing. Full workers and DB schemas deferred to future tasks.
- 2026-03-22: M2-M4 completed. T-105 (Binance adapter order methods), T-106 (Slack webhook), T-107 (execution worker handler), T-109 (order tracker), T-110 (alert worker event bus), T-111 (execution worker event bus). 1008 tests passing. EP06 fully implemented.
