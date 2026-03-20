# PRODUCT.md

## One-line pitch
전략이 정의한 방식으로 이벤트를 벡터화하고, 동일 전략·버전·심볼 내 과거 패턴 통계로 LONG/SHORT/PASS를 결정하는 트레이딩 시스템.

## Problem
재량적 트레이딩에서 진입 판단의 일관성이 부족하다. 과거 유사 패턴의 통계적 근거 없이 감에 의존하는 의사결정을 제거하기 위해, 전략 정의 이벤트를 벡터화하고 L2 유사 검색으로 통계 기반 의사결정을 수행하는 시스템이 필요하다.

## Target users
- 크립토 선물 트레이딩 전략을 TypeScript로 개발하고 운영하는 개인 트레이더

### Glossary
- **이벤트**: 전략이 캔들 데이터를 평가하여 산출한 피처(feature) 집합. 벡터화의 입력.
- **벡터화**: 이벤트의 피처를 정규화하여 [0,1] 범위의 고정 차원 벡터로 변환하는 과정.
- **L2 유사 검색**: 유클리드 거리 기반으로 현재 벡터와 유사한 과거 벡터를 찾는 pgvector 검색.
- **레이블링**: 이벤트 발생 후 미래 캔들을 추적하여 TP/SL/TIME_EXIT 결과를 기록하는 과정.
- **피처**: 전략이 산출하는 수치 지표 (예: RSI, 거래량 비율, 볼린저 밴드 위치 등).

## Jobs to be done
- 캔들이 닫히면 1초 이내에 전략 조건을 평가하고 진입 판단을 내려줘야 한다
- TypeScript로 전략을 작성하면 시스템이 자동으로 백테스트, 벡터 생성, 실시간 운영까지 해줘야 한다
- 과거 유사 패턴의 승률/기대수익을 기반으로 통계적으로 진입 여부를 결정해줘야 한다
- 3년치 과거 데이터로 전략을 백테스트하고 벡터를 생성해줘야 한다
- Slack 알람과 자동매매를 단계적으로 지원해줘야 한다
- 전략 버전이 바뀌면 새 벡터 테이블을 생성하고 재벡터화해줘야 한다

## Core pipeline
```
캔들 close(0초) → 전략 조건 평가 → 이벤트 생성 → 벡터화([0,1]) → L2 유사 검색 → 통계 → 판단 → 알람/매매
```

## Core capabilities

### 1. Dynamic strategy system
- TypeScript로 전략 작성, DB에 저장, 런타임 샌드박스에서 실행
- Pine Script 수준 API: 캔들 데이터 접근, 기술지표 함수(SMA/EMA/BB/RSI/MACD/ATR 등), 멀티 타임프레임 접근
- 전략 코드 출력물: event_condition, features[], entry/exit conditions (선택)

### 2. Event vectorization
- 전략 정의 features[] → [0,1] 정규화 → pgvector 저장
- 정규화 규칙: 비율(/100), 변화율(sigmoid), 거래량(rolling percentile), 카운트(min-max), boolean(0/1)

### 3. Similarity search & statistics
- L2 유사 검색, top_k=50, similarity_threshold=√d×0.3
- 동일 전략 + 동일 버전 + 동일 심볼 격리
- 통계: winrate, expectancy, avg_win, avg_loss

#### Similarity threshold rationale
For [0,1]-normalized vectors in d dimensions, the expected L2 distance between two random vectors is `√(d/6) ≈ 0.408√d`. The threshold `√d × 0.3` is ~73% of this random baseline — only patterns significantly closer than random chance are considered similar. This is a mathematically grounded initial value; fine-tuning against recall@10 > 95% is planned for EP03-M2.

#### Filtering logic
1. Query pgvector: `ORDER BY embedding <-> query_vector LIMIT top_k` (top_k=50)
2. Filter: discard results where `distance > √d × 0.3`
3. Remaining results = valid similar patterns
4. If valid count < `min_samples` (30) → PASS (insufficient evidence)
5. If valid count ≥ 30 → calculate winrate, expectancy from valid set only

### 4. Statistical decision engine
- 유효 샘플 ≥ 30 AND winrate ≥ 55% AND expectancy > 0 → 진입
- expectancy = (winrate × avg_win) − ((1 − winrate) × avg_loss), where avg_loss is the absolute value of the average loss (always positive)
- 미충족 → PASS

#### Decision confidence tiers

The min_samples threshold (30) follows CLT minimum, but confidence varies significantly with sample size. The system calculates and displays a 95% confidence interval for win rate using the Wilson score interval.

```
CI_95 = winrate ± z × sqrt(winrate × (1 - winrate) / n)
where z = 1.96 (95% confidence)
```

| Samples | Example CI (winrate=55%) | Tier | UI indicator |
|---------|--------------------------|------|-------------|
| 30–59 | 55% ± 18% (37%–73%) | Low | Yellow dot + "Low confidence" |
| 60–149 | 55% ± 13% (42%–68%) | Medium | Default (no extra indicator) |
| 150–299 | 55% ± 8% (47%–63%) | High | Blue dot + "High confidence" |
| ≥ 300 | 55% ± 6% (49%–61%) | Very High | Green dot + "Very high confidence" |

Rules:
- All tiers are eligible for entry (min_samples = 30 is the hard gate)
- Confidence tier is informational — displayed in decision detail, dashboard, and journal
- Decision record stores: `sample_count`, `winrate`, `ci_lower`, `ci_upper`, `confidence_tier`
- Backtest reports aggregate performance by confidence tier (e.g., "High confidence trades: 62% winrate vs Low: 51%")
- Users can optionally filter by confidence tier in alert/execution settings (e.g., "Only execute High+ confidence signals")

### 5. Result labeling
- max_hold_bars 동안 순회: TP 먼저 → WIN, SL 먼저 → LOSS, 동시 → LOSS, 시간 만료 → TIME_EXIT
- 기록: result_type, pnl_pct, mfe_pct, mae_pct, hold_bars, exit_price, sl_hit_first

### 6. Backtesting
- 3년치 과거 데이터로 전략 검증
- 백테스트 중 벡터 생성 및 통계 축적

### 7. Execution modes
- 분석 모드: 데이터 수집, 이벤트 감지, 패턴 분석
- 알람 모드: Slack 알람 발송
- 모의매매 모드: 실시간 데이터 + 가상 체결 (실전 투입 전 검증)
- 자동매매 모드: Binance/OKX 주문 실행

### Execution modes detail

| Mode | Description |
|------|-------------|
| Analysis (`analysis`) | Evaluate strategies and record decisions. No alerts, no orders. |
| Alert (`alert`) | Same as analysis + send Slack notifications on LONG/SHORT signals. |
| Paper (`paper`) | Real-time market data with simulated order fills. Tracks virtual balance, simulated positions, and PnL without real funds. Produces same journal entries and statistics as live mode. Testing path before going live. |
| Live (displayed as "Auto-Trade" in UI, stored as `live` in DB) | Real order execution on exchanges via CCXT. Requires kill switch + daily loss limit configuration. Gated by readiness score ≥ 70. |

### Readiness score (Paper → Live gate)

Live trading requires a composite readiness score ≥ 70/100. The score is calculated automatically per strategy and displayed in the UI.

#### Score composition

```
Readiness Score =
  Backtest Validation (35)
  + Paper Validation (35)
  + Risk Setup (20)
  + Manual Confirmation (10)
```

#### 1. Backtest Validation (35 points)

| Criterion | Points | Detail |
|-----------|--------|--------|
| Min trades ≥ 100 | 10 | Statistical significance for pattern matching |
| Expectancy > 0 over full backtest period | 10 | (winrate × avg_win) − ((1 − winrate) × avg_loss) > 0 |
| Sharpe ratio > 1.0 (annualized, √365) | 10 | Risk-adjusted return; √365 for 24/7 crypto markets |
| Max drawdown < 20% | 5 | Peak-to-trough equity drawdown |

#### 2. Paper Validation (35 points)

| Criterion | Points | Detail |
|-----------|--------|--------|
| Duration ≥ 7 calendar days | 8 | Must include a full weekly cycle |
| Trades ≥ 10 | 7 | Minimum sample size for statistical testing |
| Win rate z-test pass (p < 0.05) | 12 | No statistically significant degradation vs backtest |
| Daily loss limit breach = 0 | 8 | No limit breaches during paper period |

Win rate z-test formula:
```
z = (paper_winrate - backtest_winrate) / sqrt(backtest_winrate × (1 - backtest_winrate) / n_paper_trades)
Pass condition: z ≥ -1.645 (one-sided, 95% confidence)
```

If trades < 10 after 7 days, paper period auto-extends to 14 days.

#### 3. Risk Setup (20 points)

| Criterion | Points | Detail |
|-----------|--------|--------|
| Daily loss limit configured | 5 | Per-strategy and global limits set |
| Position sizing configured | 5 | Max position size defined |
| Kill switch test within 24h | 5 | Activated and deactivated successfully |
| Exchange credentials valid + balance check | 5 | Encrypted, active, sufficient balance |

#### 4. Manual Confirmation (10 points)

| Criterion | Points | Detail |
|-----------|--------|--------|
| Risk acknowledgment checkbox | 5 | User confirms understanding of risks |
| Type "go live" text confirmation | 5 | Prevents accidental activation |

Live confirmation expires after 24 hours — must re-confirm.

#### Gate thresholds

| Score | State | Behavior |
|-------|-------|----------|
| 0–69 | LOCKED | Live button disabled |
| 70–89 | CAUTION | Enabled with warning banner + extra confirmation |
| 90–100 | READY | Enabled with standard confirmation |

#### Reset conditions

- Daily loss limit breach OR kill switch triggered during paper → score resets to 0, minimum 7 additional paper days required
- Strategy code change → backtest score resets (must re-backtest)
- Paper win rate z-test failure → flag "Strategy drift detected", paper continues

### 8. Strategy versioning
- 새 버전 = 새 벡터 테이블 생성 + 과거 데이터 재벡터화

### 9. Risk management (See EP09)
- **Kill switch**: Manual toggle to halt all trading instantly. Automatic activation on critical errors (see below). Must halt within 1 second.
- **Daily loss limit**: Configurable per-strategy and global limits. Auto-trade suspended when breached. Manual re-enablement required.
- **Position sizing**: Risk-based position sizing with configurable maximum exposure.

#### Kill switch automatic activation triggers

The kill switch activates automatically when the system detects conditions that could cause uncontrolled financial loss. Each trigger has a defined scope (per-strategy, per-exchange, or global) and grace period.

**Financial triggers (immediate — no grace period):**

| Trigger | Scope | Condition |
|---------|-------|-----------|
| Daily loss limit breach | Per-strategy / Global | Already defined above |
| Balance deviation > 5% | Global | `abs(actual - expected) / expected > 0.05` — hack, liquidation, or external interference |
| Untracked position detected | Global | Exchange reports a position not created by the system |
| Order rejected 3× consecutive | Per-strategy | Insufficient margin, invalid params, or exchange-side rejection |

**Infrastructure triggers (with grace period — only when positions are open):**

| Trigger | Scope | Grace | Condition |
|---------|-------|-------|-----------|
| Exchange API unreachable | Per-exchange | 30s | Cannot manage SL/TP on open positions |
| DB connection lost | Global | 15s | Cannot read state or persist decisions |
| Execution worker unresponsive | Global | 60s | Order pipeline broken |
| Strategy worker unresponsive | Per-strategy | 60s | Strategy evaluation halted |

Infrastructure triggers only fire when there are open positions in the affected scope. Without open positions, the system blocks new entries instead of activating the kill switch.

**Sandbox triggers (immediate, per-strategy):**

| Trigger | Scope | Condition |
|---------|-------|-----------|
| Sandbox OOM | Per-strategy | Memory > 128MB limit |
| Sandbox timeout | Per-strategy | Execution > 500ms limit |
| Sandbox crash 3× consecutive | Per-strategy | Same strategy crashes 3 times in a row |

**Data integrity triggers (immediate — only when positions are open):**

| Trigger | Scope | Condition |
|---------|-------|-----------|
| Candle gap ≥ 3 consecutive | Per-symbol | Decisions based on stale data |
| Vector search timeout 3× consecutive | Per-strategy | Decision pipeline broken |

**Re-activation rules:**
- All automatic kills require **manual re-activation** (no auto-recovery)
- Financial triggers additionally require **cause acknowledgment** (UI shows cause, user must confirm)
- Sandbox triggers require strategy code fix or manual restart
- All kill events recorded in `kill_switch_events` audit table with positions snapshot

### 10. Trade journal
- Automatic journal entry creation for every trade (open → close)
- Entry context snapshot: captures strategy state, indicator values, vector search results, and market conditions at decision time
- PnL tracking: gross PnL, fees, funding costs, net PnL (all in Decimal precision)
- User-added notes and tags for review
- Auto-tagging based on trade characteristics (e.g., trend-following, mean-reversion, duration bucket)
- Pattern drift detection: compare live trade statistics against backtest expectations

### 11. Funding rate tracking
- Funding rates collected alongside candle data for perpetual futures
- Factored into net PnL calculations (gross PnL - fees - funding)
- Available in trade journal entries and backtest results

## Strategy definition spec
```
strategy_id, version, name
symbols, timeframe, direction (LONG|SHORT)

# 이벤트
event_condition          — 발생 조건 (TypeScript 코드)

# 벡터
features[]               — feature 목록 + 정규화 방식
dimension                — features 길이

# 검색
similarity_metric        — L2 (기본)
top_k                    — 50
similarity_threshold     — √d × 0.3
min_samples              — 30

# 결과 판정
tp_pct, sl_pct, max_hold_bars

# 의사결정 (기본값, 전략에서 오버라이드 가능)
min_winrate              — 55%
min_expectancy           — > 0
```

### Access control
- All API endpoints require JWT authentication (except health, login, token refresh)
- Exchange API credentials encrypted at rest with AES-256-GCM
- Single-user system (multi-user RBAC is a non-goal)

## Non-goals
- 멀티유저 / SaaS
- 현물(Spot) 거래
- 소셜 / 카피 트레이딩
- 전략 마켓플레이스
- 규제 준수 자동화는 범위 외. 운영자가 해당 관할권의 암호화폐 선물 거래 관련 규제를 직접 확인할 책임이 있음.

## Success metrics
- 캔들 close → 알람/매매 신호 발생: < 1초
- 3년치 1전략 백테스트 완료: < 5분
- 전략 코드에서 Pine Script 수준 API 사용 가능
- features[] → [0,1] 정규화 → L2 벡터 검색 정상 작동
- 의사결정 기준(≥30, ≥55%, >0) 통과 시 진입 신호 발생
- Slack 알람 정상 발송
- Binance/OKX 자동매매 주문 실행
- 전략 버전 변경 시 재벡터화 정상 수행
- 시스템 가동률: 99%+ (24/7 운영 기준)
- 캔들 데이터 연속성: 갭 발생률 < 0.1%
- 라이브 승률 vs 백테스트 승률 편차: ±10% 이내

## Constraints
- 캔들 close → 알람/매매: 1초 이내
- 3년치 백테스트: 5분 이내
- 동시 운영 전략/심볼 수: 실용적 범위 내 확장 지원 (동적 벡터 테이블 상한 1,000개/배포)
- 24/7 무중단 (초기: 로컬 노트북)
- 벡터 격리: 전략 간·심볼 간 교차 검색 금지
- 전략 코드: DB 저장 + 샌드박스 실행
- All monetary calculations (PnL, fees, balances, position sizing) use exact decimal arithmetic (Decimal.js). No native floating-point for financial values.

## Assumptions
- PostgreSQL + pgvector 확장 사용 가능
- 거래소 API 키는 운영자가 사전 설정
- CCXT가 거래소별 프로토콜 차이 처리
- Bun 런타임이 프로젝트 전반에 충분 (API, workers, scripts)
- 초기 배포는 로컬; 클라우드 마이그레이션은 추후
- Tauri 앱은 Next.js 웹 UI를 래핑하여 코드베이스 공유 극대화 (공통 API 레이어 + 공유 UI)
- 전략 샌드박스는 V8 isolates (`isolated-vm`) 사용 — Bun worker threads 대비 보안 격리 우위로 선택됨 (2026-03-22 결정)

## Resolved questions
- ~~전략 샌드박스 보안 모델 (격리 수준, 리소스 제한)~~ → V8 isolates (`isolated-vm`) 선택 (2026-03-22). Bun worker threads 대비 heap-level 격리, 메모리/CPU 강제 제한 가능. 128MB 메모리, 500ms 타임아웃. See ARCHITECTURE.md §Strategy evaluation concurrency.
- ~~Tauri/Next.js 코드 공유 전략~~ → `packages/ui/` 공통 컴포넌트 라이브러리 채택. `apps/web/`(SSR)과 `apps/desktop/`(Static Export) 모두 `packages/ui/`에서 import. 플랫폼 분기는 `PlatformProvider` + `usePlatform()` 훅으로 런타임 감지. EP08-M0에서 PoC 검증 예정.
- ~~자동매매 리스크 관리 수준~~ → EP09에서 킬스위치(M1), 손실 한도(M2), 포지션 사이징(M3), 포지션 모니터링(M4) 구현 예정.
- ~~캔들 데이터 소스 조합~~ → EP01에서 REST(히스토리컬) + WebSocket(실시간) 조합으로 결정. REST 백필 + WS 실시간 병행.
- ~~전략 코드 에디터 UI 사양~~ → EP08-M5에서 Monaco Editor + Strategy API 타입 힌트 구현 예정.
