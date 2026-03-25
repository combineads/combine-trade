# 09-risk-management

## Objective
실제 자금을 보호하기 위한 리스크 관리 시스템을 구축한다. 킬스위치, 손실 한도, 포지션 사이징, 포지션 모니터링을 포함하여 자동매매의 안전장치 역할을 한다.

## Scope
- `packages/core/risk/` — 리스크 관리 도메인 로직
- `packages/execution/position.ts` — 포지션 추적 및 관리
- 킬스위치: 수동 + 자동 긴급 정지
- 손실 한도: 일일/주간 손실 한도 → 초과 시 자동매매 중단
- 포지션 사이징: 거래당 리스크 비율 기반 수량 결정
- 포지션 모니터링: 오픈 포지션 추적, 총 노출 관리

## Non-goals
- 복잡한 헤지 전략
- 마진 최적화
- 멀티 계정 리스크 집계

## Prerequisites
- `06-alert-execution` M3-M4 — 주문 실행 및 추적
- `01-candle-collection` M1 — 거래소 어댑터 (잔고/포지션 조회)

## Milestones

### M0 — Execution concurrency control
- Deliverables:
  - Symbol+direction-level serialization queue: PostgreSQL advisory locks keyed on (symbol, direction) hash (see ARCHITECTURE.md § Position direction policy)
  - Pessimistic locking on balance read during position sizing (SELECT ... FOR UPDATE)
  - Concurrency test suite: simulate simultaneous orders for same symbol
- Acceptance criteria:
  - Two simultaneous orders for the same symbol are serialized (not concurrent)
  - Balance read during position sizing is atomic (no double-spend)
  - Advisory lock timeout: 5 seconds (fail-fast if lock held too long)
- Validation:
  ```bash
  bun test -- --filter "concurrency|advisory-lock"
  ```

### M1 — Kill switch
- Deliverables:
  - 수동 킬스위치: API 호출 또는 UI 버튼으로 즉시 자동매매 전면 중단
  - **자동 킬스위치 트리거** (PRODUCT.md §9 참조, 4개 카테고리):
    - **Financial (즉시, grace 없음)**:
      - Daily loss limit breach (per-strategy / global)
      - Balance deviation > 5% from expected (global)
      - Untracked position on exchange (global)
      - Order rejected 3× consecutive (per-strategy)
    - **Infrastructure (grace period, 포지션 있을 때만)**:
      - Exchange API unreachable 30s (per-exchange)
      - DB connection lost 15s (global)
      - Execution worker unresponsive 60s (global)
      - Strategy worker unresponsive 60s (per-strategy)
    - **Sandbox (즉시, per-strategy)**:
      - Sandbox OOM (> 128MB)
      - Sandbox timeout (> 500ms)
      - Sandbox crash 3× consecutive
    - **Data integrity (즉시, 포지션 있을 때만)**:
      - Candle gap ≥ 3 consecutive (per-symbol)
      - Vector search timeout 3× consecutive (per-strategy)
  - Scope 계층: per-strategy / per-exchange / global
  - Infrastructure triggers: 포지션 없으면 신규 진입 차단만 (kill 아님)
  - 킬스위치 활성화 시: 모든 신규 주문 차단, 기존 오픈 포지션 유지 (선택적 청산)
  - Kill switch activation policy for open orders:
    - Cancel all pending/submitted orders immediately
    - Partially filled orders: cancel remaining quantity
    - Existing open positions: maintained by default (manual close option in UI)
  - 킬스위치 해제: 수동으로만 가능 (자동 해제 금지)
  - Financial trigger 해제 시: 원인 확인 체크박스 필수
  - `kill_switch_events` audit table (ARCHITECTURE.md 참조): 발동 시점 포지션 스냅샷 기록
  - 킬스위치 이벤트 Slack 알림
- Acceptance criteria:
  - 킬스위치 활성화 후 신규 주문 0건
  - Financial trigger: 즉시 활성화 (grace 없음)
  - Infrastructure trigger: grace period 경과 후 + 포지션 있을 때만 활성화
  - Sandbox trigger: 즉시 per-strategy 활성화
  - 해제는 명시적 수동 조작만 허용
  - 모든 kill 이벤트가 audit table에 기록됨
- Validation:
  ```bash
  bun test -- --filter "kill-switch"
  ```

### M2 — Loss limits
- Deliverables:
  - 일일 실현 손실 한도 설정 (기본: 계좌 잔고의 3%)
  - 주간 실현 손실 한도 설정 (기본: 계좌 잔고의 10%)
  - 연속 손절 한도 (기본: 3회 연속 SL)
  - 한도 초과 시: 해당 범위 자동매매 중단 + Slack 알림
  - 리셋: 일일은 UTC 00:00 자동 리셋, 주간은 월요일 자동 리셋
  - 손익 추적 서비스: 주문 체결 결과 실시간 집계
- Acceptance criteria:
  - 일일 손실 3% 초과 시 자동매매 중단
  - 연속 3회 SL 시 자동매매 중단
  - 날짜 변경 시 일일 한도 리셋
  - 한도는 전략별/전체 두 레벨에서 적용
- Validation:
  ```bash
  bun test -- --filter "loss-limit"
  ```

### M3 — Position sizing engine
- Deliverables:
  - `packages/core/risk/position-sizer.ts` — 수량 결정 로직
  - 고정 비율 방식: 거래당 리스크 = 계좌 잔고의 N% (기본 1%)
  - 수량 계산: `quantity = (account_balance × risk_pct) / (entry_price × sl_pct)`
  - 최소/최대 수량 제한 (거래소별 lot size 규칙 준수)
  - 총 노출 한도: 전체 오픈 포지션의 합계 제한
  - 잔고 조회: 거래소 API 실시간 잔고 확인
  - Maximum leverage limit: configurable per strategy (default: 5x, hard cap: 20x)
  - Pre-order validation: reject orders that would result in effective leverage exceeding the configured limit
  - Leverage is calculated as: total_notional_exposure / account_balance
- Acceptance criteria:
  - 계산된 수량이 거래소 lot size 규칙 준수
  - 총 노출 한도 초과 시 신규 주문 차단
  - 잔고 부족 시 주문 차단
- Validation:
  ```bash
  bun test -- --filter "position-siz"
  ```

### Boundary rule compliance
- `packages/core/risk/` must not import `packages/exchange/` directly (ARCHITECTURE.md boundary rule: core must not import CCXT)
- Exchange data access via interfaces: `BalanceProvider`, `PositionProvider` interfaces defined in `packages/core/risk/`
- Concrete implementations in `packages/exchange/` injected via IoC container
- Same pattern for M4 (position monitoring): exchange API polling through interface abstraction

### M4 — Position monitoring & liquidation awareness
- Deliverables:
  - 오픈 포지션 실시간 추적 (거래소 API 주기적 동기화)
  - DB ↔ 거래소 포지션 불일치 감지
  - 시스템 외부에서 생성된 포지션 감지 + 경고
  - 총 노출(aggregate exposure) 실시간 계산
  - 포지션 상태 API 제공 (UI 연동)
  - **청산 가격 인식**:
    - 거래소 API로 포지션별 liquidation price 조회
    - 현재가가 liquidation price의 N% 이내 접근 시 WARNING 알림
    - 레버리지 기반 liquidation price 추정 계산 (거래소 조회 불가 시 fallback)
    - 청산 위험 포지션 대시보드 표시
- Acceptance criteria:
  - 거래소 실제 포지션과 DB 동기화
  - 불일치 감지 시 WARNING 로그 + Slack 알림
  - 외부 포지션 감지
- Validation:
  ```bash
  bun test -- --filter "position-monitor"
  ```

## Task candidates
- T-09-009: Implement symbol-level advisory lock for order serialization + concurrency test: simultaneous orders for same symbol
- T-09-003: Implement fixed-fraction position sizer + pessimistic balance locking for position sizing
- T-09-008: Implement manual kill switch (API endpoint + state management + scope hierarchy) + kill_switch_events audit table with positions snapshot + Slack notification (all trigger types)
- T-09-011: Implement financial auto-triggers (balance deviation, untracked position, order rejection counter) + infrastructure auto-triggers (exchange API, DB, worker health) with grace period + position check
- T-02-006: Implement sandbox auto-triggers (OOM, timeout, crash counter) — integration with EP02 sandbox errors
- T-09-016: Implement data integrity auto-triggers (candle gap, vector search timeout)
- T-09-002: Implement daily realized loss tracking service
- T-09-007: Implement daily/weekly loss limit enforcement + consecutive SL limit enforcement + loss limit auto-reset (daily/weekly)
- T-09-020: Implement exchange lot size validation
- T-09-021: Implement total exposure limit check
- T-09-010: Implement position sync service (exchange → DB)
- T-09-012: Implement external position detection + position monitoring API for UI
- T-09-022: Implement liquidation price tracking (exchange API + fallback estimation)
- T-09-023: Implement liquidation proximity warning (N% threshold → Slack alert)
- T-09-005: Integration test: loss limit → auto-trade suspension → Slack alert

## Risks
- 거래소 잔고 조회 지연으로 포지션 사이징 계산 시점의 잔고가 부정확할 수 있음
- 동시 다수 전략이 동시에 진입 시 총 노출 한도 race condition
- 거래소 API 장애 시 포지션 동기화 불가 → 킬스위치 자동 활성화로 대응
- Balance cache staleness: cached balance has a validity window of 10 seconds. Orders submitted with balance data older than 10 seconds are rejected with ERR_USER_STALE_BALANCE. This prevents oversized positions when exchange balance has changed (e.g., another order filled).

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | 킬스위치 해제는 수동만 허용 | 자동 해제 시 동일 장애 재발 위험 |
| 2026-03-21 | 고정 비율 포지션 사이징 (기본 1%) | 가장 단순하고 검증된 방식 |
| 2026-03-21 | 손실 한도 2단계 (전략별 + 전체) | 개별 전략 폭주 방지 + 전체 자본 보호 |
| 2026-03-22 | Kill switch 자동 트리거 4개 카테고리 12개 조건 확정 | Discovery 세션에서 설계. Financial (즉시), Infrastructure (grace+position), Sandbox (즉시 per-strategy), Data integrity (즉시+position). 포지션 없을 때 infrastructure 장애는 신규 진입 차단만. 모든 자동 kill은 수동 해제 필수. Financial 해제는 원인 확인 체크박스 추가. |

## Progress notes
- 2026-03-22: Tasks generated — T-09-001 (kill switch), T-09-002 (loss tracker), T-09-003 (position sizer), T-09-004 (risk gate), T-09-005 (integration test).
- 2026-03-22: Core risk modules completed. M1-M3 pure logic implemented. M0/M4 deferred (require DB/exchange integration). 487 tests passing.
