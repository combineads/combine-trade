# 17-double-bb-strategy

## Objective

검증된 Double-BB 전략을 기본(default) 전략으로 구현하여, DB 등록 → 백테스트 → 벡터 생성 → 실시간 이벤트 감지 → Binance 라이브 트레이딩까지 end-to-end 운영 가능하게 한다. 다른 전략이 등록되기 전까지 이 전략이 시스템의 유일한 운영 전략이 된다.

## Scope

- Sandbox executor 확장: 전략별 커스텀 지표 pre-compute (BB source/period, MA period 등)
- Schema 확장: `strategies.timeframes text[]` (단일 → 배열)
- Double-BB 전략 TypeScript 스크립트 (BB20/BB4 패턴 탐지 + 에비던스 시스템 + 이벤트 게이트)
- 전략 DB 등록 및 설정 (BTCUSDT, 1m/3m/5m/15m, LONG+SHORT)
- 3년치 백테스트 실행 및 통계 검증
- 실시간 파이프라인 통합 검증
- Paper trading → Live trading 전환 절차

## Non-goals

- 전략 코드 에디터 UI (EP08에서 처리)
- 새로운 전략 패밀리 (Double-BB 이외)
- S/R, trendline, breakout 에비던스 (외부 컨텍스트 입력 필요 — 추후 확장)
- Multi-symbol 운영 (ETHUSDT, SOLUSDT 등 — 안정화 후 확장)
- 에비던스 계산기를 별도 도메인 모듈로 분리 (전략 스크립트 내 자급자족 구조)

## Prerequisites

- `00-project-bootstrap` M2-M7 ✅
- `02-strategy-sandbox` M1-M6 ✅ (indicators, sandbox, API, strategy-worker)
- `03-vector-engine` M1-M5 ✅ (normalization, vector tables, L2 search, statistics)
- `04-label-decision` M1-M3 ✅ (labeler, label-worker, decision engine)
- `05-backtest` M1 partial (CSV parser done, Binance Vision download needed), M2-M3 ✅
- `01-candle-collection` M4 ✅ (candle-collector worker — basic)
- `06-alert-execution` M1-M4 ✅ (alert-worker, execution-worker)
- `07-realtime-pipeline` ✅ (pipeline infrastructure)
- `09-risk-management` M1-M3 ✅ (kill switch, loss limit, position sizing)
- `14-paper-trading` ✅ (paper order matcher, balance tracker, readiness score)

## Milestones

### M1 — Sandbox & Schema Extensions

- Deliverables:
  - **전략별 커스텀 지표 pre-compute 설정**:
    - `strategies` 메타데이터에 `indicator_config` JSONB 필드 추가
    - Executor가 `strategy.indicator_config` 기반으로 pre-compute 수행
    - BB: custom source (open/close), custom period, custom stddev 지원
    - MA: custom periods 지원 (MA100, MA200 등 기본 pre-compute에 없는 period)
    - `indicator_config`가 없는 기존 전략은 기본 pre-compute 유지 (하위 호환)
  - **Schema 마이그레이션: `strategies.timeframes text[]`**:
    - `strategies.timeframe text` → `strategies.timeframes text[]` 변경
    - 기존 단일 timeframe 데이터 자동 마이그레이션 (`'5m'` → `['5m']`)
    - `findActiveStrategies(symbol, timeframe)` 쿼리: `timeframe = ANY(strategies.timeframes)`
    - strategy-worker dispatch 로직 업데이트
  - **Sandbox 컨텍스트 주입**:
    - `context.direction` ('long'|'short') — 전략 스크립트가 방향 필터링 가능
    - `context.timeframe` — 현재 평가 중인 타임프레임 확인 가능
    - `context.symbol` — 현재 평가 중인 심볼
- Acceptance criteria:
  - `indicator.bb(open, 4, 4)` 호출 시 open-source BB4 값 정상 반환
  - MA100/MA200 pre-compute 정상 작동
  - `timeframes: ['1m','3m','5m','15m']`으로 전략 등록 가능
  - `findActiveStrategies('BTCUSDT', '5m')` → timeframes에 '5m' 포함된 전략 반환
  - 기존 단일 timeframe 전략 테스트 모두 통과 (하위 호환)
  - `context.direction` 스크립트 내에서 접근 가능
- Validation:

  ```bash
  bun test -- --filter "executor|strategy-worker|sandbox"
  bun run typecheck
  bun run db:generate
  ```

### M2 — Double-BB Strategy Script

- Deliverables:
  - **Double-BB 패턴 탐지**:
    - BB20: close-source, period=20, stddev=2
    - BB4: open-source, period=4, stddev=4
    - Variant 분류:
      - **Trend continuation**: 가격이 BB20 밴드 방향으로 BB4 밴드를 따라 이동
      - **Reversal**: BB20 밴드 터치 후 BB4 반전 신호 (wick ≥ 2× body)
      - **Breakout**: BB20 확장 + BB4 강한 body (≥ 60% range) + key-level 돌파
    - Variant 우선순위: breakout > reversal > trend
    - Side 판정: bullish/bearish (BB4 upper/lower band 관계)
  - **에비던스 시스템 (4개 패밀리)**:
    - **Candle pattern**: hammer, inverted hammer, doji, engulfing, strong body
      - Body ≤ 35% + dominant wick ≥ 55% = hammer/inverted
      - Body ≤ 10% = doji
      - Body ≥ 70% = strong body
    - **MA evidence**: slope (MA20/50 기울기), ordering (MA20<50<100<200 bullish), price reaction (MA에서의 반등/저항)
    - **Separation evidence**: MA20 대비 가격 이격도 (signed distance ratio). Extension/reset 판정
    - **1h bias**: multi-TF API로 1h 캔들 참조. aligned/counter_trend/neutral_bias 판정
  - **이벤트 게이트**:
    - 필수 조건: Double-BB 패턴 감지 (미감지 시 즉시 SKIP)
    - 에비던스 ≥ 3개 패밀리 적중 (미달 시 SKIP with `weak_evidence`)
    - 1h bias: counter_trend → SKIP with `counter_trend`
    - direction 필터: context.direction이 'long'이면 bearish 패턴 무시, 반대도 마찬가지
  - **Feature 정의 (dimension=10)**:
    - `double_bb_variant`: minmax (trend=0.33, reversal=0.67, breakout=1.0)
    - `candle_pattern_score`: boolean (hit=1, miss=0)
    - `ma_slope_score`: sigmoid (bullish/bearish 강도)
    - `ma_ordering_score`: boolean (정배열=1, 역배열 or 혼합=0)
    - `ma_reaction_score`: boolean (반등/저항 확인=1, 미확인=0)
    - `separation_distance`: sigmoid (MA20 이격도)
    - `h1_bias_alignment`: minmax (counter=0, neutral=0.5, aligned=1.0)
    - `price_in_bb20`: percent (BB20 lower~upper 내 위치, 0~1)
    - `volume_ratio`: percentile (20-bar 대비 현재 거래량)
    - `atr_range`: sigmoid (ATR14 대비 현재 캔들 range)
  - **ATR 기반 TP/SL**:
    - LONG: TP = entry + ATR14 × 2.0, SL = entry - ATR14 × 1.0
    - SHORT: TP = entry - ATR14 × 2.0, SL = entry + ATR14 × 1.0
    - max_hold_bars = 60 (설정 가능)
  - **단위 테스트**: deterministic fixture 기반
    - Double-BB 3 variants × 2 sides = 6 조합 테스트
    - 에비던스 4개 패밀리 각각 hit/miss 테스트
    - 이벤트 게이트: 통과/거부 시나리오 (Double-BB 없음, 에비던스 부족, counter_trend)
    - Feature 정규화 범위 [0,1] 검증
    - 방향 필터링: LONG 전략에서 bearish 무시 검증
- Acceptance criteria:
  - Double-BB 3 variants × 2 directions 정확 분류
  - 에비던스 4개 패밀리 독립 테스트 통과
  - 이벤트 게이트: Double-BB 없으면 미발생, 에비던스 < 3 미발생, counter_trend SKIP
  - 동일 입력 → 동일 출력 (결정론적)
  - context.direction에 따른 방향 필터링 정상 작동
  - 모든 feature 값 [0, 1] 범위 내
- Validation:

  ```bash
  bun test -- --filter "double-bb"
  bun run typecheck
  ```

### M3 — Strategy Registration & Backtest

- Deliverables:
  - **전략 등록 스크립트** (`scripts/seed-double-bb.ts`):
    - **Double-BB-LONG**:
      - symbols: ['BTCUSDT']
      - timeframes: ['1m', '3m', '5m', '15m']
      - direction: 'long'
      - execution_mode: 'analysis' (초기)
    - **Double-BB-SHORT**:
      - symbols: ['BTCUSDT']
      - timeframes: ['1m', '3m', '5m', '15m']
      - direction: 'short'
      - execution_mode: 'analysis' (초기)
    - 공통 설정:
      - indicator_config: BB20(close,20,2), BB4(open,4,4), MA(20,50,100,200), ATR(14)
      - features_definition: 10개 feature + normalization type
      - search_config: top_k=50, threshold=√10×0.3≈0.95, min_samples=30
      - result_config: tp_pct=ATR×2, sl_pct=ATR×1, max_hold_bars=60
      - decision_config: min_winrate=55%, min_expectancy>0
  - **히스토리컬 데이터 로딩**:
    - 3yr BTCUSDT 1m 캔들 (Binance Vision monthly → daily → REST)
    - 1m → 3m/5m/15m/1h 타임프레임 합성
    - 연속성 검증 (갭 0)
    - EP05-M1 Binance Vision 다운로더 완성 (부분 구현 상태에서 완료)
  - **백테스트 실행**:
    - Double-BB-LONG + Double-BB-SHORT 각각 백테스트
    - 벡터 생성 + 라벨 판정 (ATR TP/SL + max_hold_bars=60)
    - 통계 집계 + JSON 리포트
    - Post-backtest HNSW REINDEX
  - **통계 검증**:
    - 전략당 trades ≥ 100
    - expectancy > 0
    - 월별/분기별 분포 안정성
    - cold start 기간 보고
    - ATR TP/SL 배수 적정성 평가 (필요 시 조정)
- Acceptance criteria:
  - 전략 2개 정상 등록 (DB 조회 확인)
  - 3yr BTCUSDT 1m 캔들 ≈ 1,576,800건 로딩 완료 (갭 0)
  - 백테스트 < 5분/전략
  - 벡터 + 라벨 정상 생성
  - positive expectancy 확인
- Validation:

  ```bash
  bun run scripts/seed-double-bb.ts
  bun run backtest -- --strategy-id <long-id> --version 1 --report
  bun run backtest -- --strategy-id <short-id> --version 1 --report
  ```

### M4 — Real-time Pipeline Verification

- Deliverables:
  - **Binance BTCUSDT 실시간 수집 확인**:
    - candle-collector: Binance WS → 1m 캔들 수집 → DB 저장
    - 1m → 3m/5m/15m/1h 합성 + candle_closed NOTIFY 발행
  - **전략 평가 흐름 검증**:
    - candle_closed → strategy-worker → Double-BB-LONG/SHORT 평가
    - 이벤트 발생 시 → strategy_events 저장 + NOTIFY strategy_event_created
    - vector-worker → 정규화 → 벡터 저장 → L2 검색 → 통계 → 의사결정 (인라인)
    - decision_completed → alert-worker → Slack 알림
  - **Execution mode 전환 테스트**:
    - analysis → alert: Slack 알림 정상 수신
    - alert → paper: 모의 체결 정상 작동
  - **Latency 벤치마크**:
    - candle close → decision_completed < 1초 (p99)
    - 각 단계별 timing 로그 확인
- Acceptance criteria:
  - 실시간 파이프라인 full cycle 작동 (candle → strategy → vector → decision → alert)
  - Slack 알림 정상 수신 (LONG/SHORT 신호)
  - p99 latency < 1s
  - 단일 전략 에러가 타 전략에 영향 없음
  - execution mode 전환 정상 작동
- Validation:

  ```bash
  # Docker compose up으로 전체 시스템 실행
  # 실시간 캔들 수집 → 전략 평가 → 이벤트 → 결정 모니터링
  bun test -- --filter "pipeline-e2e"
  ```

### M5 — Paper Trading & Live Deployment

- Deliverables:
  - **Paper trading 실행** (execution_mode → 'paper'):
    - ≥ 7일 모의매매 실행
    - Paper balance tracking + 모의 체결
    - Win rate z-test: paper vs backtest 통계 비교 (p < 0.05)
    - Daily loss limit breach = 0
  - **Readiness score 산출** (EP14 readiness-score 모듈 활용):
    - Backtest validation (35점): trades ≥ 100, expectancy > 0, Sharpe > 1.0, max DD < 20%
    - Paper validation (35점): duration ≥ 7d, trades ≥ 10, z-test pass, no breach
    - Risk setup (20점): loss limit, position size, kill switch test, credentials
    - Manual confirmation (10점): risk acknowledgment + "go live" 확인
    - 목표: ≥ 70점
  - **Binance 라이브 설정**:
    - Exchange API credentials 등록 (AES-256-GCM 암호화 — EP10 auth)
    - Binance Futures hedge mode 활성화 (`dualSidePosition=true`)
    - Kill switch 활성화/비활성화 테스트 (1초 이내 전파)
    - Daily loss limit 설정 (per-strategy + global)
    - Position sizing 설정
  - **Go-live 절차**:
    - Readiness score ≥ 70 확인
    - execution_mode → 'live'
    - Risk acknowledgment checkbox
    - "go live" 텍스트 확인 (24시간 후 재확인 필요)
- Acceptance criteria:
  - Paper trading 7일+ 무사고 실행
  - Readiness score ≥ 70
  - Kill switch 1초 이내 전파 확인
  - 라이브 전환 후 Binance 주문 정상 실행
  - Slack 알림에 실제 체결 정보 포함
- Validation:

  ```bash
  bun run readiness -- --strategy-id <long-id>
  bun run readiness -- --strategy-id <short-id>
  # Manual: paper trading 7일 모니터링
  # Manual: go-live confirmation flow
  ```

## Task candidates

- T-17-007: Sandbox executor 확장 — strategy.indicator_config 기반 커스텀 지표 pre-compute (BB source/period/stddev, MA custom periods)
- (not implemented): strategies.timeframe text → timeframes text[] 스키마 마이그레이션 + strategy-worker findActiveStrategies 쿼리 수정
- T-17-001: Sandbox에 context.direction/timeframe/symbol 주입 + 전략 스크립트에서 접근 API 제공
- T-17-002: BB20/BB4 기반 Double-BB 패턴 탐지 로직 (trend/reversal/breakout × bullish/bearish) + fixture 테스트
- T-17-003: 캔들 패턴 에비던스 (hammer/doji/engulfing/strong-body) + MA 에비던스 (slope/ordering/reaction) 로직 + 테스트
- T-17-004: Separation 에비던스 + 1h bias 통합 + 이벤트 게이트 (Double-BB 필수 + ≥3 에비던스) + Feature 10개 defineFeature() + ATR 기반 TP/SL + 테스트
- T-17-005: 전체 Double-BB 전략 스크립트 조립 (탐지 + 에비던스 + 게이트 + feature + direction 필터링) + 통합 테스트
- T-17-006: Double-BB 전략 샌드박스 실행 스크립트 (sandbox runner + 결과 출력)
- T-17-008: Double-BB LONG/SHORT 전략 DB 등록 시드 스크립트 (indicator_config, features_definition, search_config, result_config)
- T-17-009: 3yr BTCUSDT 1m Binance Vision 다운로더 완성 (monthly+daily ZIP → REST fallback) + 캔들 합성 (3m/5m/15m/1h)
- T-17-010: Double-BB LONG/SHORT 백테스트 실행 + 통계 검증 (trades ≥ 100, expectancy > 0) + HNSW REINDEX
- T-17-011: 실시간 파이프라인 end-to-end 검증: candle close → strategy → vector → decision → alert (latency < 1s)
- T-17-012: Paper trading ≥ 7일 실행 + win rate z-test + readiness score 산출
- T-17-013: Binance credentials 등록 + hedge mode + kill switch 테스트 + loss limit 설정 + go-live 절차

## Risks

- **Sandbox pre-compute 확장 복잡도**: indicator_config 파싱 + 동적 pre-compute가 executor 내부를 크게 변경할 수 있음. 기본 pre-compute 하위 호환 필수.
- **BB4(open, 4, 4) 유효성**: 짧은 period + 높은 stddev → 밴드가 매우 넓거나 불안정할 수 있음. 백테스트에서 variant별 발생 빈도 검증 필요.
- **에비던스 3개 패밀리 임계값**: 4개 패밀리 중 3개 적중 조건이 너무 관대하거나 엄격할 수 있음. 백테스트 통계로 조정.
- **ATR TP/SL 배수 적정성**: TP 2×ATR / SL 1×ATR은 초기 설정. R:R = 2:1이 시장 조건에 맞지 않을 수 있음. 백테스트에서 최적 배수 탐색.
- **Binance Vision 데이터 가용성**: 월간/일간 아카이브 다운로드 실패 시 REST fallback 지연. CHECKSUM 불일치 시 재다운로드.
- **Paper ↔ Live 갭**: 모의매매와 실매매 간 슬리피지, 체결 속도, 유동성 차이. 특히 1m 타임프레임에서 entry price vs 실제 체결가 차이 주의.
- **timeframes[] 마이그레이션**: 기존 단일 timeframe 전략과의 호환성. CRUD 서비스, API 라우트 등 참조 지점 모두 업데이트 필요.
- **전략 스크립트 크기**: 모든 에비던스 로직이 스크립트 내에 포함되어 코드가 길어짐. 500ms 타임아웃 내 실행 가능한지 벤치마크 필요.

## Decision log

| Date       | Decision                                                                           | Rationale                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-22 | 이전 프로젝트(combine-trade-app) 03-strategy-engine의 Double-BB 설계를 참조        | 검증된 전략 로직 재사용, 신규 아키텍처에 맞게 적용                                                                                  |
| 2026-03-22 | 전략 등록을 LONG/SHORT 2개로 분리                                                  | ARCHITECTURE.md "Each strategy declares a single direction: LONG or SHORT" 원칙 준수. 동일 스크립트 + direction 필터링으로 코드 재사용 |
| 2026-03-22 | `strategies.timeframes`를 `text[]`로 확장                                          | 한 전략이 여러 타임프레임(1m/3m/5m/15m)에서 평가되어야 함. 8개(4TF×2방향) 대신 2개(LONG+SHORT) 등록으로 관리 단순화                  |
| 2026-03-22 | 에비던스 초기 4개 패밀리 (candle, MA, separation, 1h bias)                         | S/R, trendline, breakout는 외부 컨텍스트(가격 레벨, 추세선 데이터) 입력 필요 — 추후 EP에서 확장. 이전 프로젝트도 동일하게 3개를 explicit skip 처리 |
| 2026-03-22 | ATR 기반 동적 TP/SL 채택 (TP=2×ATR14, SL=1×ATR14, max_hold=60)                    | 고정 %보다 시장 변동성 반영. R:R 2:1 초기 설정, 백테스트 결과로 배수 조정 예정                                                       |
| 2026-03-22 | 에비던스 로직을 전략 스크립트 내에 포함 (별도 도메인 모듈 분리 안 함)              | 샌드박스 내 자급자족 구조. 제네릭 indicator API만 사용. YAGNI: 다른 전략이 동일 에비던스 필요 시 추출 가능                            |
| 2026-03-22 | `indicator_config`를 전략 메타데이터에 포함하여 pre-compute 동적 설정              | 전략별 커스텀 지표 조합 지원. BB4(open,4,4) 같은 비표준 설정 필요. 기본 pre-compute는 config 없는 전략에 유지                        |
| 2026-03-22 | 초기 심볼: BTCUSDT only                                                            | 단일 심볼로 전략 검증 완료 후 확장. 시스템 복잡도 최소화                                                                            |
| 2026-03-22 | Feature dimension = 10, similarity threshold = √10 × 0.3 ≈ 0.949                  | 10개 feature로 시작. EP03 threshold 공식 적용                                                                                       |

## Progress notes

- 2026-03-22: Plan created from user request. Reference: combine-trade-app/docs/exec-plans/03-strategy-engine.md (M1-M4 complete, M5 partial in old project). Implementation pending.
