# 04-label-decision

## Objective
이벤트 발생 후 결과(WIN/LOSS/TIME_EXIT)를 판정하는 라벨 엔진과, 유사 패턴 통계를 기반으로 LONG/SHORT/PASS를 결정하는 의사결정 엔진을 구축한다.

## Scope
- `packages/core/label/` — 결과 라벨링 (TP/SL/TIME_EXIT 판정)
- `packages/core/decision/` — 통계 기반 의사결정
- `workers/label-worker/` — 지연 라벨링 워커
- DB schema: `event_labels` 테이블

## Non-goals
- 벡터 검색 (03-vector-engine에서 처리)
- 주문 실행 (06-alert-execution에서 처리)
- 알람 발송 (06-alert-execution에서 처리)

## Prerequisites
- `01-candle-collection` M2 — 라벨링에 forward 캔들 데이터 필요
- `02-strategy-sandbox` M2 — 전략의 tp_pct, sl_pct, max_hold_bars 정의 필요
- `03-vector-engine` M4 — 통계 계산 결과 필요 (M3 의사결정 엔진에서만 의존, M1-M2 라벨링 자체는 캔들 데이터만 필요)

## Milestones

### M1 — Result labeling engine
- Deliverables:
  - `packages/core/label/labeler.ts` — 결과 판정 로직
  - 이벤트 발생 시점부터 max_hold_bars 동안 캔들 순회:
    - TP 가격 먼저 도달 → WIN
    - SL 가격 먼저 도달 → LOSS
    - 동시 도달 (같은 캔들 내 TP+SL) → LOSS (sl_hit_first=true)
    - max_hold_bars 만료 → TIME_EXIT
  - 기록: result_type, pnl_pct, mfe_pct, mae_pct, hold_bars, exit_price, sl_hit_first
  - TP/SL 가격은 전략의 tp_pct, sl_pct, entry_price로 계산
- Acceptance criteria:
  - 다양한 시나리오별 정확한 판정 (WIN, LOSS, TIME_EXIT, 동시도달)
  - pnl_pct: direction 기준 정규화 (LONG이면 상승이 +)
  - mfe_pct: 최대 유리 이동 (항상 양수)
  - mae_pct: 최대 불리 이동 (항상 양수)
  - hold_bars: 진입부터 이탈까지 바 수
- Validation:
  ```bash
  bun test -- --filter "labeler"
  ```

### M2 — Label worker
- Deliverables:
  - `workers/label-worker/` — 지연 라벨링 워커
  - 주기적 스캔 (5분 간격): 라벨 미생성 + 시간 만료 이벤트 조회
  - 라벨 생성 조건: max_hold_bars 이후 충분한 confirmed 캔들 존재
  - `event_labels` 저장 + `NOTIFY label_ready`
  - 캔들 연속성 갭이 있으면 라벨링 보류
- Acceptance criteria:
  - 미라벨 이벤트 자동 스캔 및 라벨링
  - 캔들 갭 시 라벨링 스킵 (무효 라벨 방지)
  - 라벨 멱등성: unique(event_id)
- Validation:
  ```bash
  bun test -- --filter "label-worker"
  ```

### M3 — Decision engine
- Deliverables:
  - `packages/core/decision/engine.ts` — 의사결정 로직
  - 입력: 패턴 통계 (winrate, expectancy, sample_count)
  - 판정 기준:
    - sample_count ≥ 30 AND winrate ≥ 55% AND expectancy > 0 → 전략 direction 진입
    - 미충족 → PASS
  - expectancy = (winrate × avg_win) − ((1 − winrate) × avg_loss)
  - 전략이 커스텀 decision_config 정의 시 해당 값으로 오버라이드
  - **Decision confidence tiers** (PRODUCT.md §4 참조):
    - 95% Wilson score CI 계산: `winrate ± 1.96 × sqrt(winrate × (1 - winrate) / n)`
    - Tier 분류: Low (30-59), Medium (60-149), High (150-299), Very High (≥300)
    - 출력에 ci_lower, ci_upper, confidence_tier 포함
    - Confidence tier는 정보 표시용 — 진입 gate는 min_samples=30 유지
  - 출력: { decision: LONG | SHORT | PASS, reason, statistics, ci_lower, ci_upper, confidence_tier }
- Acceptance criteria:
  - 기준 충족 시 올바른 direction 반환
  - 기준 미충족 시 PASS + 미충족 사유 명시
  - 커스텀 threshold 오버라이드 정상 작동
  - 통계 부족 (< 30 samples) 시 PASS
  - CI 계산이 수학적으로 정확 (known dataset 대비 검증)
  - Confidence tier가 sample_count에 따라 정확히 분류됨
- Validation:
  ```bash
  bun test -- --filter "decision"
  ```

### M4 — End-to-end label → statistics → decision flow
- Deliverables:
  - 통합 테스트: 이벤트 라벨링 → 통계 갱신 → 의사결정
  - 라벨 생성 시 해당 전략의 통계 자동 갱신
  - 의사결정이 최신 통계 기반으로 작동 확인
- Acceptance criteria:
  - 라벨 추가 → 통계 변경 → 다음 의사결정에 반영
  - 충분한 WIN 라벨 축적 시 PASS → LONG/SHORT 전환 확인
- Validation:
  ```bash
  bun test -- --filter "label-decision-e2e"
  ```

## Task candidates
- T-04-001: Labeler engine — TP/SL price calculator, forward candle scanner, WIN/LOSS/TIME_EXIT judgment, simultaneous TP+SL handling, pnl_pct/mfe_pct/mae_pct/hold_bars calculation
- T-04-002: Label-worker — periodic scan, conditional labeling, candle gap detection guard
- T-03-006: Decision engine — configurable thresholds, Wilson score CI calculation, confidence tier classification (Low/Medium/High/Very High), custom decision_config override
- (not implemented): Implement optional confidence tier filtering (strategy config: min_confidence_tier)
- T-04-003: Integration test: label → stats refresh → decision output (including CI + tier)
- (not implemented): Edge case tests: zero samples, exactly 30 samples, 55% boundary, CI boundary tests
- (not implemented): Add simultaneous TP/SL hit ratio tracking to backtest report

## Risks
- 라벨링 시 forward 캔들이 충분하지 않은 경우 (최근 이벤트) 처리
- 동시 도달(TP+SL) 판정의 OHLC 기반 한계 (intra-bar 순서 불명)
- 통계 갱신과 의사결정 간 일관성 (race condition)

### Decimal precision in labeling
- pnl_pct, mfe_pct, mae_pct, exit_price calculations must use Decimal.js
- entry_price from decision snapshot is TEXT (Decimal), not float
- TIME_EXIT exit_price: defined as the close price of the last bar in the holding period

### Integration with vector-worker (EP03-M5)
- Decision engine (packages/core/decision) is designed as a pure function module
- vector-worker imports and calls decisionEngine.judge() inline after L2 search + statistics
- This avoids an extra event bus hop, saving ~50ms in the latency budget
- The decision engine is a pure function: it receives pattern statistics and returns a judgment (LONG/SHORT/PASS) with confidence metadata. The calling worker (vector-worker) is responsible for persisting the result to the decisions table.

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | 동시 도달 시 LOSS (보수적) | OHLC로는 intra-bar 순서 판별 불가, 보수적 접근 |
| 2026-03-21 | pnl_pct direction 정규화 | LONG +가 상승, SHORT +가 하락으로 통일 |
| 2026-03-21 | 캔들 갭 시 라벨링 보류 | 불완전 데이터 기반 라벨은 통계 오염 |
| 2026-03-21 | intra-bar TP/SL 동시도달 시 LOSS (한계 인정) | OHLC 데이터는 bar 내 가격 이동 순서를 알 수 없음. 이는 1m 타임프레임에서도 불가피한 한계. 백테스트 리포트에 동시도달 비율을 표시하여 사용자가 인지하도록 함 |
| 2026-03-21 | Decision engine as pure function module for vector-worker inline execution | Decision engine (packages/core/decision) is designed as a pure function module. vector-worker imports and calls decisionEngine.judge() inline after L2 search + statistics. This avoids an extra event bus hop, saving ~50ms in the latency budget. The decision engine is a pure function: it receives pattern statistics and returns a judgment (LONG/SHORT/PASS) with confidence metadata. The calling worker (vector-worker) is responsible for persisting the result to the decisions table. |
| 2026-03-22 | Decision confidence tiers added (Low/Medium/High/Very High) | min_samples=30 유지 (CLT 최소). 30개 샘플의 55% winrate CI는 37%-73%로 매우 넓음 — 사용자에게 불확실성을 명시적으로 표시. 기준을 올리면 초기에 진입 신호 부족. CI + tier 표시로 정보 비대칭 해소. decisions 테이블에 ci_lower, ci_upper, confidence_tier 컬럼 추가. |

## Progress notes
- 2026-03-22: Tasks generated — T-04-001 (labeler), T-04-002 (label worker), T-04-003 (integration test). Decision engine covered by T-03-006 in EP03.
- 2026-03-22: All tasks completed. T-04-001 labeler (Decimal.js, MFE/MAE tracking), T-04-002 label worker (scanner + health), T-04-003 integration test (7 scenarios). 307 tests passing.
