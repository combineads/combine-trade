# 14-paper-trading (모의매매)

## 왜 필요한가

현재 시스템의 전략 검증 경로:

```
백테스트 (과거 데이터) ──────→ 자동매매 (실제 돈)
         ↑                           ↑
     안전하지만               위험하지만
     과거일 뿐               현실임
```

이 사이에 **빈 칸**이 있습니다.

백테스트는 과거 데이터로 "이 전략이 과거에 통했는가"를 검증합니다.
하지만 실제 환경에서는 백테스트에서 잡을 수 없는 문제가 있습니다:

- **데이터 지연**: 실시간으로 캔들이 들어올 때 1초 안에 처리가 되는가?
- **체결 차이**: 시장가 주문 시 기대했던 가격과 실제 체결 가격이 다름 (슬리피지)
- **파이프라인 버그**: 백테스트에선 안 터지지만 라이브에서만 터지는 버그
- **전략 퇴화**: 백테스트 때는 좋았는데 최근 시장에서는 안 통하는 경우

**모의매매**는 이 문제를 해결합니다:

```
백테스트 (과거 데이터) → 모의매매 (실시간, 가짜 돈) → 자동매매 (실제 돈)
                              ↑
                     실시간 데이터로 돌리되
                     실제 주문은 안 넣음
                     가상 잔고로 성과 추적
```

쉽게 말하면: **실전과 똑같이 돌리되, 진짜 돈은 안 거는 연습 모드**입니다.

## Objective
실시간 시장 데이터를 사용하되 실제 주문은 넣지 않는 모의매매 모드를 구축한다. 가상 잔고와 가상 포지션으로 전략 성과를 추적하고, 백테스트 결과와 비교하여 실전 투입 준비 상태를 판단한다.

## Scope
- `packages/execution/paper/` — 가상 체결 엔진
- `packages/execution/paper/balance.ts` — 가상 잔고/포지션 관리
- DB schema: `paper_balances`, `paper_positions`, `paper_orders` 테이블
- 실행 모드 확장: 분석 → 알람 → **모의매매** → 자동매매
- 모의매매 성과 추적 및 백테스트 대비 비교

## Non-goals
- 거래소 테스트넷 연동 (Binance testnet 등) — 추후 확장 가능하나 초기에는 자체 시뮬레이션
- 호가창(order book) 시뮬레이션 — 시장가 기반으로 충분
- 모의매매용 별도 UI 페이지 — 기존 대시보드에 "모의매매" 뱃지로 구분

### Leverage and liquidation simulation
- Paper trading respects the leverage setting configured per strategy
- Margin calculation uses the same formula as real execution
- Forced liquidation simulation: deferred to future extension (Non-goals)
- Minimum viable: track unrealized PnL and warn when margin ratio approaches maintenance level

## Prerequisites
- `06-alert-execution` M3-M5 — 주문 실행 엔진 + 실행 모드 관리
- `04-label-decision` M3 — 의사결정 엔진
- `01-candle-collection` M2 — 실시간 캔들 데이터
- EP09 M1-M2 (kill switch, loss limits): paper trading should respect risk limits for realistic simulation
- EP11-M2 (fee calculation) — optional: if unavailable, use flat fee estimate with warning log

## Milestones

### M1 — 가상 체결 엔진

> **쉽게 말하면**: LONG/SHORT 신호가 나오면 진짜 거래소에 주문을 넣는 대신, "지금 시장가로 샀다고 치자"라고 기록하는 엔진.

- Deliverables:
  - `packages/execution/paper/matcher.ts` — 가상 주문 체결 로직
  - 시장가 주문 시뮬레이션:
    - 다음 캔들의 시가(open)를 체결가로 사용
    - 슬리피지 시뮬레이션: 체결가에 설정 가능한 슬리피지 비율 추가 (기본 0.05%)
    - 체결 시 수수료 계산 (Epic 11 fee calculator 재사용)
  - SL/TP 주문 시뮬레이션:
    - 매 캔들마다 high/low를 확인하여 SL/TP 도달 여부 판정
    - 판정 로직은 라벨 엔진(Epic 04)과 동일 (동시 도달 시 SL 우선)
  - `paper_orders` 테이블: 실제 orders 테이블과 동일 구조 + `is_paper=true` 구분
- Acceptance criteria:
  - 가상 체결가가 현실적 (다음 캔들 open ± 슬리피지)
  - SL/TP 판정이 라벨 엔진과 일관됨
  - 수수료가 정확히 반영됨
- Validation:
  ```bash
  bun test -- --filter "paper-matcher"
  ```

### M2 — 가상 잔고 & 포지션 관리

> **쉽게 말하면**: 게임에서 "골드"처럼, 진짜 돈 대신 가상 잔고를 관리. 얼마로 시작해서 지금 얼마가 됐는지 추적.

- Deliverables:
  - `packages/execution/paper/balance.ts` — 가상 잔고 관리
  - `paper_balances` 테이블:
    - 초기 잔고 설정 (기본: 10,000 USDT)
    - 실현 PnL 반영 (체결 시 잔고 업데이트)
    - 미실현 PnL 실시간 계산 (현재가 기준)
  - `paper_positions` 테이블:
    - 오픈 포지션 추적 (심볼, 방향, 수량, 진입가)
    - 포지션 마진 계산
    - SL/TP 체결 시 포지션 청산
  - 잔고 리셋 기능: 모의매매를 처음부터 다시 시작
  - 기간별 성과 요약: 일별/주별/월별 PnL
- Acceptance criteria:
  - 가상 잔고가 체결마다 정확히 업데이트
  - 미실현 PnL이 현재가 반영
  - 리셋 후 초기 잔고로 복귀, 이전 기록 보존 (히스토리 구분)
- Validation:
  ```bash
  bun test -- --filter "paper-balance|paper-position"
  ```

### M3 — 모의매매 모드 통합

> **쉽게 말하면**: 기존 실행 모드에 "모의매매"를 끼워 넣기. 전략 설정에서 모드만 바꾸면 나머지는 똑같이 돌아감.

- Deliverables:
  - 실행 모드 확장 (06-alert-execution M5 수정):
    - `analysis` → `alert` → **`paper`** → `auto_trade`
  - 모의매매 모드 동작:
    - 파이프라인 전체 동일 (캔들 → 전략 → 벡터 → 의사결정)
    - LONG/SHORT 판정 → **가상 체결 엔진**으로 라우팅 (거래소 대신)
    - Slack 알람 발송 (알람 메시지에 "[모의매매]" 태그 포함)
    - 매매일지(Epic 13) 정상 생성 (일지에 `is_paper=true` 표시)
  - 모드 전환 규칙:
    - `paper` → `auto_trade` 전환 시 가상 포지션은 실포지션으로 전환 안 됨 (경고 표시)
    - 모의매매 중인 전략의 실거래 모드 전환 시 확인 요구
- Acceptance criteria:
  - 모의매매 모드에서 파이프라인 end-to-end 작동 (1초 이내)
  - 실제 거래소에 주문이 절대 안 나감 (이중 확인)
  - 매매일지에 paper 구분 정확
  - 기존 분석/알람/자동매매 모드에 영향 없음
- Validation:
  ```bash
  bun test -- --filter "paper-mode|paper-integration"
  ```

### M4 — Readiness score (Paper → Live gate)

> **쉽게 말하면**: "백테스트도 잘 됐고, 모의매매도 잘 됐고, 안전장치도 다 설정했어? 그러면 실전 투입 가능." — 4개 카테고리 100점 만점 종합 점수.

- Deliverables:
  - `packages/execution/paper/readiness.ts` — Readiness score 계산 엔진
  - **Composite score 0-100** (PRODUCT.md §Readiness score 참조):
    - **Backtest Validation (35점)**: min trades ≥ 100 (10점), expectancy > 0 (10점), Sharpe > 1.0 annualized √365 (10점), max drawdown < 20% (5점)
    - **Paper Validation (35점)**: duration ≥ 7 days (8점), trades ≥ 10 (7점), win rate z-test pass p<0.05 (12점), daily loss limit breach = 0 (8점)
    - **Risk Setup (20점)**: daily loss limit configured (5점), position sizing configured (5점), kill switch test within 24h (5점), exchange credentials valid + balance check (5점)
    - **Manual Confirmation (10점)**: risk acknowledgment checkbox (5점), "go live" text confirmation (5점)
  - **Win rate z-test**: `z = (paper_wr - bt_wr) / sqrt(bt_wr × (1 - bt_wr) / n_paper)`, pass: z ≥ -1.645
  - **Gate thresholds**: 0-69 LOCKED, 70-89 CAUTION, 90-100 READY
  - **Reset conditions**: loss limit breach or kill switch → score=0, +7 paper days. Strategy code change → backtest score resets.
  - Paper auto-extend: trades < 10 after 7 days → extend to 14 days
  - Live confirmation expiry: 24h
  - `packages/execution/paper/comparator.ts` — 성과 비교 (z-test, Sharpe, drawdown 계산)
  - Slack 리포트: 모의매매 기간 종료 시 성과 요약 + readiness score 발송
- Acceptance criteria:
  - 각 카테고리 점수가 조건에 따라 정확히 계산됨
  - Z-test 계산이 수학적으로 정확 (known dataset 대비 검증)
  - Score < 70이면 Live 전환 불가 (API + UI 양쪽 모두 차단)
  - Reset 조건 발동 시 score=0 + paper 기간 연장
  - Live confirmation 24h 후 만료
- Validation:
  ```bash
  bun test -- --filter "readiness|paper-comparator"
  ```

### M5 — 모의매매 API

> **쉽게 말하면**: 모의매매 현황을 UI에서 볼 수 있게 데이터를 제공하는 API.

- Deliverables:
  - 모의매매 현황 API:
    - `GET /api/v1/paper/status` — 가상 잔고, 오픈 포지션, 총 PnL
    - `GET /api/v1/paper/orders` — 가상 주문 내역 (페이지네이션)
    - `GET /api/v1/paper/performance` — 기간별 성과 요약
    - `GET /api/v1/paper/comparison` — 백테스트 대비 비교 (M4)
    - `POST /api/v1/paper/reset` — 가상 잔고 리셋 (새 기간 시작)
  - 모의매매 데이터도 기존 SSE 스트림에 포함 (paper 이벤트 구분)
- Acceptance criteria:
  - 모든 API 정상 응답
  - 리셋 시 이전 데이터 보존 (run_id로 구분)
  - SSE에서 paper 이벤트 실시간 수신
- Validation:
  ```bash
  bun test -- --filter "paper-api"
  ```

## Task candidates
- T-14-001: Implement paper order matcher (market order simulation with slippage + SL/TP candle-by-candle check) + paper_balances/paper_positions/paper_orders DB schema
- T-14-002: Implement paper balance tracker and position manager (initial balance, PnL tracking, reset, unrealized PnL)
- T-14-006: Add 'paper' execution mode integration (mode management service wiring) + route execution-worker to paper matcher when mode=paper
- T-14-007: Add "[모의매매]" tag to Slack alerts in paper mode + ensure trade journal marks paper trades (is_paper flag)
- T-14-003: Implement paper vs backtest comparator (z-test, Sharpe √365, drawdown, expectancy)
- T-14-004: Implement readiness score calculator (0-100, 4 categories: backtest 35 + paper 35 + risk 20 + manual 10, win rate z-test, gate enforcement, reset conditions)
- T-14-008: Implement readiness gate enforcement (API: reject mode change if score < 70) + readiness score reset conditions (loss limit breach, kill switch, code change)
- T-14-009: Build paper trading status/orders/performance API endpoints
- T-14-010: Build paper reset API with run history preservation
- T-14-011: Add paper events to SSE stream
- T-14-005: Integration test: full pipeline in paper mode (matcher → balance → comparator → readiness)
- T-14-012: Safety test: verify zero real exchange calls in paper mode

## Risks
- 가상 체결가(다음 캔들 open + 슬리피지)가 실제 체결가와 차이가 클 수 있음
  - 완화: 슬리피지 비율을 보수적으로 설정(0.05%), 실거래 전환 후 실제 슬리피지와 비교하여 모델 보정
- 모의매매 성과가 좋아서 과신 → 실거래에서 손실
  - 완화: readiness score가 보수적 기준 적용, 모의매매 → 실거래 전환 시 Slack 경고
- paper_orders와 실제 orders 테이블 혼동
  - 완화: 별도 테이블 분리, is_paper 플래그 이중 확인, 실거래 경로에 paper 데이터 유입 불가능하도록 격리
- 모의매매에서는 잘 되지만 실거래에서 체결 지연/부분 체결 등 차이
  - 완화: 이 한계를 문서화하고, 실전 투입 초기에는 최소 수량으로 시작 권장

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | 자체 시뮬레이션 (거래소 testnet 아님) | testnet은 유동성/가격 비현실적, 자체 시뮬레이션이 더 일관됨 |
| 2026-03-21 | 다음 캔들 open을 체결가로 사용 | 백테스트 라벨링 로직과 일관, 실시간에서 가장 현실적인 추정 |
| 2026-03-21 | paper_orders 별도 테이블 | 실거래 데이터와 물리적 격리 — 혼동/오염 원천 차단 |
| 2026-03-21 | 실행 모드 순서: analysis → alert → paper → auto_trade | paper는 alert보다 높고 auto_trade보다 낮은 단계 |
| 2026-03-21 | 모의매매 최소 30건 + 2주 | 통계적 유의성 확보 + 다양한 시장 상황 경험 |
| 2026-03-22 | Readiness score 재설계 — 0-100 composite score (기존 단순 체크리스트 대체) | Discovery 세션 결정. 4개 카테고리: Backtest(35) + Paper(35) + Risk Setup(20) + Manual(10). Gate ≥ 70. Z-test로 paper vs backtest 검증 (기존 Pearson correlation 폐기 — 다른 시점 데이터 간 correlation은 무의미). Sharpe √365 (crypto 24/7). Paper 최소 기간 7일 (2주에서 단축, 대신 z-test로 통계적 검증 강화). |

## Progress notes
- 2026-03-22: EP14 M1, M2, M4 pure computation layer implemented.
  - T-14-001: Paper order matcher — `simulateMarketFill()`, `scanForExit()` (12 tests)
  - T-14-002: Paper balance tracker — `applyEntry()`, `applyExit()`, `calculateUnrealizedPnl()`, `computePeriodSummary()` (13 tests)
  - T-14-003: Paper comparator — `zTestWinRate()`, `sharpeRatio()`, `maxDrawdown()`, `expectancyDelta()` (18 tests)
  - T-14-004: Readiness score — `calculateReadinessScore()` 0-100 composite (13 tests)
  - T-14-005: Integration test — full pipeline matcher→balance→comparator→readiness (6 tests)
  - Total: 62 tests, all passing
  - M3 (mode integration), M5 (API) deferred — requires EP06/EP08 framework setup
- 2026-03-25: All tasks complete. T-14-001 through T-14-012 in done/. Epic fully implemented.
