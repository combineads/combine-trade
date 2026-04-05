# Combine Trade PRD v2.0

**버전**: v2.0 | **작성일**: 2026-04-04
**전략**: 김직선 Double-BB 매매법 | **설계**: 병화

---

## 1. 개요

크립토 선물 자동매매 시스템. 김직선 트레이더의 Double-BB(더블비) 전략을 통계적으로 시스템화한다. 일봉/1시간봉으로 방향과 맥락을 잡고, 5분봉/1분봉 BB4 터치에서 진입하며, 과거 유사 패턴 KNN 통계로 최종 LONG/SHORT/PASS를 결정한다.

**심볼:** BTCUSDT, XAUTUSDT
**거래소:** Binance, OKX, Bitget, MEXC
**기본 전제:** 같은 심볼이라도 거래소마다 독립 파이프라인. (BTCUSDT, binance)와 (BTCUSDT, okx)는 별개.

**설계 철학:**
- 김직선의 룰이 방향과 안전을 결정하고, KNN이 확률적 유효성을 검증하는 하이브리드 구조
- 봇은 김직선 직관의 70~80%를 담는 확률적 집행관
- 인간의 감정을 배제한 기계적 자금 관리
- 실행 가능한 가장 간단한 아키텍처 (KISS)
- "기다리는 것이 가장 훌륭한 전략이다"
- "출금하지 않으면 절대 내 돈이 아니다"

---

## 2. 멀티 타임프레임 구조

```
1D  → 방향 필터 (LONG_ONLY / SHORT_ONLY)
1H  → 감시 세션(WatchSession) 시작 + 목표가(TP) + 트레일링 스탑
5M  → 메인 진입 트리거
1M  → 정밀 진입 (3중 안전장치 하에 허용)
```

- SL은 진입 타임프레임(5M/1M) 캔들 꼬리 기준 → 극도로 타이트
- TP는 1H 기준(MA20, 반대편 BB20) → 큰 추세를 먹는다
- 이 비대칭이 손익비를 폭발시키는 핵심

---

## 3. 설정 관리

**config.json 파일 없음.** 모든 설정은 DB CommonCode 테이블에서 관리하고, 데몬 시작 시 메모리 캐시한다. 웹 UI에서 런타임 수정 가능, 데몬 재시작 불필요.

### 3.1 구조적 앵커 (CommonCode `ANCHOR` 그룹, WFO 변경 금지)

| 항목 | code | value |
|---|---|---|
| BB20 | bb20 | `{ length: 20, stddev: 2, source: "close" }` |
| BB4 | bb4 | `{ length: 4, stddev: 4, source: "open" }` |
| 정규화 | normalization | `{ method: "median_iqr", lookback: 60 }` |
| 벡터 차원 | vector_dim | `202` |

### 3.2 튜닝 파라미터

| group_code | code | value | 비고 |
|---|---|---|---|
| SYMBOL_CONFIG | BTCUSDT | `{ risk_pct: 0.03, max_leverage: 38 }` | 시드 3천만원 시 risk_pct → 0.01 |
| SYMBOL_CONFIG | XAUTUSDT | `{ risk_pct: 0.03, max_leverage: 38 }` | 동일 |
| KNN | distance_metric | `"cosine"` | L2 옵션 |
| KNN | top_k | `50` | |
| KNN | threshold | `4.26` | |
| KNN | min_samples | `30` | |
| KNN | min_winrate | `0.55` | WFO 튜닝 대상 |
| POSITION | max_hold_bars_1h | `60` | |
| POSITION | max_pyramid_count | `2` | 향후 4까지 확장 |
| POSITION | entry_timeframe | `"5M"` | |
| LOSS_LIMIT | max_per_1h_5m | `2` | |
| LOSS_LIMIT | max_per_1h_1m | `1` | |
| LOSS_LIMIT | max_per_session | `3` | |
| LOSS_LIMIT | max_daily_loss_pct | `0.10` | |
| SLIPPAGE | max_spread_pct | `0.05` | |
| SLIPPAGE | max_slippage_pct | `0.1` | |
| FEATURE_WEIGHT | bb4_position | `2.0` | WFO 튜닝 대상 |
| FEATURE_WEIGHT | upperWick | `1.5` | |
| FEATURE_WEIGHT | lowerWick | `1.5` | |
| FEATURE_WEIGHT | daily_open_distance | `1.5` | |
| FEATURE_WEIGHT | session_box_position | `1.5` | |
| FEATURE_WEIGHT | pivot_distance | `1.5` | |
| FEATURE_WEIGHT | default | `1.0` | |
| TIME_DECAY | 1_month | `1.0` | |
| TIME_DECAY | 3_months | `0.7` | |
| TIME_DECAY | older | `0.2` | |
| WFO | in_sample_months | `6` | |
| WFO | out_sample_months | `2` | |
| WFO | roll_months | `1` | |
| WFO | optimize_params | `["max_risk_pct","min_winrate","knn_threshold","feature_weights"]` | |
| WFO | never_touch | `["BB20","BB4","MA periods"]` | |
| TRANSFER | transfer_enabled | `false` | 기본 비활성 |
| TRANSFER | transfer_schedule | `"daily"` | daily / weekly |
| TRANSFER | transfer_time_utc | `"00:30"` | |
| TRANSFER | transfer_pct | `50` | 당일 실현 수익의 50% |
| TRANSFER | min_transfer_usdt | `10` | 미만 시 skip |
| TRANSFER | reserve_multiplier | `10` | 안전장치: reserve = balance × risk_pct × 10 |

### 3.3 거래소 메타데이터 (CommonCode `EXCHANGE` 그룹)

| code | value |
|---|---|
| binance | `{ name: "Binance", adapter_type: "binance", supports_one_step_order: true, supports_edit_order: true, rate_limit_per_min: 1200, priority: 1 }` |
| okx | `{ name: "OKX", adapter_type: "okx", supports_one_step_order: true, supports_edit_order: true, rate_limit_per_min: 1800, priority: 2 }` |
| bitget | `{ name: "Bitget", adapter_type: "bitget", supports_one_step_order: true, supports_edit_order: true, rate_limit_per_min: 1200, priority: 3 }` |
| mexc | `{ name: "MEXC", adapter_type: "mexc", supports_one_step_order: false, supports_edit_order: false, rate_limit_per_min: 1200, priority: 4 }` |

### 3.4 히스토리 데이터

| TF | 기간 | 비고 |
|---|---|---|
| 1D / 1H / 5M | 3년 | 거래소별 수집 |
| 1M | 6개월 | rolling 갱신 |

---

## 4. 멀티 거래소

### 4.1 거래소별 독립 파이프라인

같은 BTCUSDT라도 거래소마다 가격이 다르다. 거래소별로 캔들을 수집하고, 해당 거래소 캔들로 모든 판단을 수행한다.

```
(BTCUSDT, binance): 독립 캔들 → 독립 WatchSession → 독립 KNN → 독립 주문
(BTCUSDT, okx):     독립 캔들 → 독립 WatchSession → 독립 KNN → 독립 주문
```

### 4.2 ExchangeAdapter

```typescript
interface ExchangeAdapter {
  createEntryWithSL(params: EntryParams): Promise<OrderResult>
  editStopLoss(orderId: string, newPrice: number): Promise<void>
  closePartial(symbol: string, pct: number): Promise<void>
  fetchPositions(): Promise<Position[]>
  fetchOrderBook(): Promise<OrderBook>
  getMinOrderSize(symbol: string): number
  transfer(currency: string, amount: number, from: string, to: string): Promise<void>
}
```

### 4.3 ⚠️ 개발 시 반드시 주의

1. **1단계 주문 미지원 거래소**: MEXC 등에서 진입+SL 동시 등록 불가 시 2단계 필요. 진입~SL 등록 사이 크래시 위험 → Reconciliation이 더 중요. 각 거래소 API 실제 테스트 후 확정.
2. **Rate Limit**: 거래소마다 다름. WebSocket 스트림 수 관리 필요.
3. **분할 청산 API**: 거래소마다 호출 방식 다름. 거래소별 테스트 필수.
4. **XAUT 페어**: 4개 거래소 전부에서 XAUTUSDT 선물 존재 여부 확인.

---

## 5. 시스템 구성

단일 Bun 프로세스. 심볼×거래소별 독립 파이프라인.

```
bun daemon
  ├── WebSocket: 거래소별, 심볼별 1D+1H+5M+1M 캔들 수집
  ├── 경제지표 API (Investing.com): 별3개 자동 거래차단
  │
  ├── [(symbol, exchange)별 독립]
  │   ├── 1H close:
  │   │     ├── 거래차단 / Loss Limit
  │   │     ├── 일봉 방향 필터 갱신
  │   │     ├── OPEN → 트레일링 상향 (TP1 이후에만)
  │   │     ├── WATCHING → 전제 재평가
  │   │     └── IDLE → WatchSession 평가
  │   │
  │   ├── 5M close:
  │   │     ├── WATCHING 아님 → 스킵
  │   │     ├── 재진입/Loss Limit 초과 → 스킵
  │   │     ├── Evidence Gate → Safety Gate → KNN → 주문
  │   │     └── OPEN → TP1/TP2 체크
  │   │
  │   └── 1M close:
  │         ├── 5M MA20 노이즈 필터
  │         ├── 재진입/Loss Limit 초과 → 스킵
  │         ├── Evidence Gate → Safety Gate → KNN → 주문
  │         └── OPEN → TP1/TP2 체크
  │
  ├── Reconciliation Worker (1분 주기, 거래소별)
  ├── Transfer Scheduler (매일 UTC 00:30, 거래소별)
  ├── Slack 알람
  └── Bun.serve() (REST API + React)
```

---

## 6. 포지션 FSM

```
SymbolState.fsm_state:

IDLE → [1H] WatchSession 조건 충족 → WATCHING
WATCHING → [5M/1M] 진입 조건 충족 → HAS_POSITION
WATCHING → [1H] 전제 붕괴 → IDLE
HAS_POSITION → 전량 청산 → IDLE

Ticket.state (진입 체결 후에만 존재):

INITIAL → TP1 도달 → TP1_HIT
TP1_HIT → TP2 도달 → TP2_HIT
어느 단계에서든 → CLOSED (SL/PANIC_CLOSE/TIME_EXIT/MANUAL)
```

---

## 7. 기능 요구사항

### 7.1 캔들 수집

- 거래소별 WebSocket: 심볼별 1D + 1H + 5M + 1M
- 히스토리 데이터 다운로드 (거래소별)
- 재연결 및 갭 복구

### 7.2 일봉 방향 필터

```
daily_open = 일봉 시가 (UTC 00:00)

LONG_ONLY  = daily_MA20 >= 전일_MA20 AND price > daily_open
SHORT_ONLY = daily_MA20 <= 전일_MA20 AND price < daily_open
NEUTRAL    = 둘 다 미충족 → 매매 금지
```

### 7.3 거래차단 (TradeBlock)

| 종류 | 방식 | 시간 |
|---|---|---|
| 장 개장 | DB seed (반복 패턴) | 120분 |
| 경제지표 별3개 | Investing.com API → DB 일회성 생성 | 120분 |
| 펀딩비 정산 | DB seed (반복 패턴, UTC 0/8/16) | 30분 |
| 수동 이벤트 | 웹 UI → DB 일회성 생성 | 수동 |

거래차단 중 기존 포지션 관리(TP/SL 체크)는 계속됨. 신규 진입만 차단.

### 7.4 감시 세션 시작 (WatchSession, 1H close)

```
전제: 일봉 필터 통과 + 거래차단 아님 + Loss Limit 미초과

다음 중 하나 이상:
(A) 스퀴즈 돌파: BB20_width 확장 + close 밴드 밖 + wick_ratio < 0.5
(B) 지지/저항 겹침 ≥ 2: |close - 레벨| < ATR14 × 0.3
(C) 1H BB4 터치

해제:
- 1H close가 MA20 반대 마감
- 일봉 방향 NEUTRAL 전환
- 일봉 방향이 WatchSession.direction과 반대 전환

심볼×거래소당 활성 WatchSession 최대 1개.
```

### 7.5 Evidence Gate (5M/1M)

```
BB4(4, 4, open). WatchSession 활성 시에만.
더블비 = BB4 + BB20 동시 → 무조건
원비 = BB4만 → MA20 방향 일치 시
```

### 7.6 Safety Gate

```
금지 1: wick_ratio < threshold(5m:0.1, 1m:1.0) AND 역추세 → PASS
금지 2: |close - mid_20| < range_20 × 0.15 → PASS
금지 3: range > avg_range_5 × 2.0 AND 역추세 → PASS
```

### 7.7 1M 전용 노이즈 필터

```
5M_MA20 방향 ≠ 일봉 방향 → PASS
```

### 7.8 벡터화 (202차원)

**캔들 190차원** (38봉 × 5: body, upperWick×1.5, lowerWick×1.5, range, ret). 거래량 미사용.
**전략 12차원:** bb20_pos, bb4_pos(×2.0), ma_ordering, ma20_slope, atr_separation, pivot_distance(×1.5), rsi_normalized, rsi_extreme_count, breakout_intensity, disparity_divergence, daily_open_distance(×1.5), session_box_position(×1.5).
**정규화:** Median/IQR, lookback=60봉, clamp(-3,3) → [0,1].

### 7.9 KNN 의사결정

```
Cosine (기본) / L2. top_k=50.
samples ≥ 30, winrate ≥ 55%, net_expectancy > 0 (수수료 0.08% 차감)
A급 (1H+5M/1M BB4 동시): winrate → 50%, samples → 20
Time Decay: 1M=1.0, 1~3M=0.7, 3M+=0.2
```

### 7.10 슬리피지 방어

```
주문 전: spread > max_spread_pct → ABORT
체결 후: |slippage| > max_slippage_pct → 즉시 청산
```

### 7.11 포지션 사이징

**리스크 금액 고정, 포지션/레버리지 역산. 고정 계약 수 절대 금지.**

```
고정: 1회 최대 손실 = balance × risk_pct
변동: position_size = risk_amount / |entry - sl|
변동: leverage = position_size / balance (max_leverage 상한)

SL = 캔들 꼬리 바깥 + 꼬리 × 15% 버퍼
Decimal.js 필수.
```

**risk_pct 티어:**
- 시드 30만원: 3% (1회 최대 손실 9,000원)
- 시드 3천만원: 1% (1회 최대 손실 30만원)

### 7.12 진입

```
캔들 close 확정 → 시장가 진입
SL → 거래소 즉시 등록 (reduceOnly: true)
  → 1단계 지원 거래소: 진입+SL 동시
  → 미지원 거래소: 체결 후 즉시 SL 등록 (2단계)
  → SL 등록 실패 시 즉시 청산
TP는 거래소에 안 건다 (데몬 관리)
```

### 7.13 청산 (3단계, 티켓별 독립)

```
[TP1] MA20_1H: 50% 청산 + SL 본절 + 트레일링 시작
[TP2] BB20_1H: 25% 청산, 잔여 25% 트레일링 계속
[트레일링] TP1 이후, 매 1H close: new_sl = entry + max_profit × 0.50 (상향만)
[최대 보유] 60시간 초과 → 전량 청산
```

초기 SL과 본절 SL은 항상 거래소에 등록. 데몬 다운 시 SL이 계좌 보호.

### 7.14 피라미딩 (불타기만, 물타기 없음)

```
전제: 1차 TP1 달성 → 무위험(SL 본절)
조건: 새 BB4 타점 + Evidence/Safety/KNN 통과 + max_pyramid_count 미초과
2차: 새 캔들 기준 SL + 현재 잔고 × risk_pct 사이징
     1차와 동일한 3단계 청산 독립 적용
max_pyramid_count: 2 (향후 4까지 확장)
```

### 7.15 Loss Limit

```
일일: SUM(losses_today) ≥ balance × 10% → 당일 전체 중단
세션: losses_session ≥ 3 → 다음 세션 대기
1H: losses_this_1h_5m ≥ 2 / losses_this_1h_1m ≥ 1 → 다음 1H 대기
```

### 7.16 5M/1M 동시 신호

```
1M 우선 (SL 타이트 → 손익비 유리). 1H BB4 터치 → A급 가중치.
```

### 7.17 Reconciliation

```
1분 주기, 거래소별.
DB=OPEN, 거래소=없음 → IDLE
DB=IDLE, 거래소=있음 → Panic Close
```

### 7.18 크래시 복구

```
재기동 → 거래소별 fetchPositions()
  없음 → IDLE
  있음 + DB 티켓 있음 → OPEN 복원, SL 재확인
  있음 + DB 티켓 없음 → Panic Close
WatchSession → 다음 1H close 재평가
```

### 7.19 레이블링

Ticket CLOSED 시 확정. 별도 Label 테이블 없음.

```
Ticket 확정 컬럼: result(WIN/LOSS/TIME_EXIT), pnl, pnl_pct,
                 max_favorable, max_adverse, hold_duration_sec
Vector.label/grade 동시 갱신 (단일 트랜잭션)
```

### 7.20 자동 이체 (선물 → 현물)

**"출금하지 않으면 절대 내 돈이 아니다."** 수익을 선물 계좌에 방치하면 한 번의 블랙스완에 전부 날린다.

```
주기: 매일 UTC 00:30
비율: 당일 실현 수익의 50% (시드 크기 무관, 30만원이든 3천만원이든 동일)

계산:
  daily_profit = SUM(당일 실현 PnL)  — Ticket.pnl WHERE closed_at >= today UTC start
  amount = max(0, daily_profit) × transfer_pct / 100
  amount < min_transfer_usdt → skip

  // 안전장치: 이체 후 잔고가 증거금 + reserve 미만이면 skip
  reserve = max(balance × risk_pct × reserve_multiplier, 50 USDT)
  if balance - amount < openPositionMargin + reserve → skip

실행:
  CCXT transfer(USDT, floor(amount), future, spot)  — floor(내림) 필수
  실패 시 3회 재시도 (지수 백오프)
  결과는 EventLog에 기록 (별도 Transfer 테이블 없음)

멀티 거래소:
  Phase 1: Binance만 자동 이체
  OKX/Bitget/MEXC: 잉여 잔고 > min_transfer_usdt 시 Slack 알림
    "📢 OKX 잉여 잔고 500 USDT — 수동 이체 필요"
```

### 7.21 실행 모드

| 모드 | 동작 |
|---|---|
| `analysis` | 신호 기록만 |
| `alert` | 실제 주문 + Slack 알람 |
| `live` | 실제 주문 |

SymbolState.execution_mode, 웹 UI에서 전환, 데몬 재시작 불필요.

### 7.22 Slack 알람

- 진입: 심볼, 거래소, 방향, signal_type, entry_tf, winrate, expectancy, pyramid_level
- 청산: TP1/TP2/SL/트레일링, pnl_pct
- 연속 패배 갱신: `⚠️ 전략 점검 필요`
- 슬리피지 ABORT
- Daily Loss Limit: `🛑 당일 매매 중단`
- 자동 이체 성공: `💸 이체 완료: {amount} USDT → 현물 (잔여: {remaining} USDT)`
- 자동 이체 실패: `🚨 이체 실패 — 수동 확인 필요`
- 미지원 거래소 잉여: `📢 {exchange} 잉여 잔고 {amount} USDT — 수동 이체 필요`

### 7.23 웹 UI (3개 화면)

**스택:** React + Vite + Zustand + TanStack Query
**인증:** 단일 사용자 패스워드 → JWT (HttpOnly 쿠키)
**데이터:** 3~5초 폴링
**빌드:** `bun run build` (outDir: './public') → Bun.serve()

**① 로그인**
- 비밀번호 입력

**② 대시보드**
- 심볼×거래소별 FSM 상태 (IDLE/WATCHING/HAS_POSITION)
- 활성 포지션 (1차/2차 티켓 상태, 진입가, 현재 SL, 미실현 PnL)
- 오늘 실현 PnL + Loss Limit 잔여
- 실행 모드 전환 (analysis/alert/live)
- 거래차단 수동 토글
- 킬스위치 (전체 즉시 중단)
- 일봉 방향
- 최근 신호 (PASS/FAIL/SKIP)
- 최근 이체 카드

**③ 트레이드 히스토리**
- 완료 거래 테이블 (날짜, 심볼, 거래소, 방향, 진입/청산가, PnL)
- 필터: 심볼, 거래소, 기간, 결과
- 요약 통계: winrate, expectancy, MDD, 최대 연속 손실, 손익비

### 7.24 백테스트

```bash
bun run backtest
```

- 라이브와 동일 코드 경로
- 심볼×거래소별 분리 실행
- 개별 Signal/Ticket/Order는 메모리 처리, 집계만 DB(Backtest)에 기록
- WFO 포함

### 7.25 WFO

```
튜닝 대상: risk_pct, min_winrate, knn_threshold, feature_weights
절대 불변: ANCHOR 그룹
6개월 in-sample → 2개월 out-sample → 1개월 rolling
OOS expectancy > 0 AND WFO efficiency > 0.5 → 통과
최적값 → CommonCode UPDATE → ConfigStore 즉시 갱신
```

### 7.26 이벤트 로깅 (EventLog)

append-only. 웹 UI에서 "왜 그때 그 판단을 했는가" 조회.

| event_type | 용도 |
|---|---|
| BIAS_CHANGE | 일간 방향 변경 |
| WATCHING_START / WATCHING_END | 감시 세션 시작/종료 |
| STATE_CHANGE | FSM 상태 전이 |
| RECONCILIATION | 포지션 대조 결과 |
| CRASH_RECOVERY | 데몬 재시작 복구 |
| SLIPPAGE_ABORT / SLIPPAGE_CLOSE | 슬리피지 이벤트 |
| SL_REGISTERED / SL_MOVED | SL 등록/이동 |
| TRANSFER_SUCCESS / TRANSFER_FAILED / TRANSFER_SKIP | 자동 이체 |

---

## 8. 데이터 모델 (13개 엔티티)

별도 문서 `DATA_MODEL.md` 참조.

```
Master (2):     Symbol (PK=symbol+exchange), SymbolState
Reference (1):  CommonCode
Transaction (10): TradeBlock, Candle, WatchSession, Signal, SignalDetail,
                  Vector, Ticket, Order, Backtest, EventLog
```

---

## 9. 런타임 KPI

| KPI | 경고 기준 |
|---|---|
| MDD | 10% 초과 |
| 최대 연속 손실 | 역대 최대 갱신 시 Slack |
| 최근 30건 expectancy | 음수 전환 |
| 실행 일치율 (Reconciliation) | 99% 미만 |

---

## 10. 배포

| 단계 | 기간 | 내용 | 통과 기준 |
|---|---|---|---|
| 백테스트 | — | 심볼×거래소별 WFO 검증 | expectancy > 0, MDD 감당 가능 |
| analysis | 2주+ | 30만원, 신호 기록만 | 빈도·비율 백테스트와 유사 |
| alert 최소자본 | 2주+ | 30만원/3%, 실제 주문 | 10건+ 완결 거래 정상 |
| 자본 확대 | — | 3천만원, risk_pct 1%로 하향, pyramid_count 확장 | KPI 지속 양호 |

---

## 11. 스택

| 영역 | 기술 |
|---|---|
| 런타임 | Bun + TypeScript |
| DB | PostgreSQL + pgvector (HNSW) |
| 거래소 | CCXT (Binance, OKX, Bitget, MEXC) |
| 알람 | Slack Webhook |
| 경제지표 | Investing.com API |
| 웹 서버 | Bun.serve() + REST API |
| 웹 UI | React + Vite + Zustand + TanStack Query |
| 금액 계산 | Decimal.js |

---

## 12. 범위 외

멀티 유저. 그 외 없음. 백로그 0건.

---

## Appendix A: 김직선 매매법 매핑 (더캔이지추격깨)

| 요소 | 시스템 구현 |
|---|---|
| **더** (Double-BB) | Evidence Gate + bb20/bb4 position |
| **캔** (캔들) | 38봉×5피처 + wick_weight 1.5× + Safety Gate |
| **이** (이평선) | ma_ordering(MA20/60/120) + 5M MA20 노이즈 필터 |
| **지** (지지저항) | pivot_distance + daily_open_distance + session_box_position |
| **추** (추세) | 일봉 방향 필터 + WatchSession 전제 + ma20_slope |
| **격** (다이버전스) | rsi_normalized + rsi_extreme_count + disparity_divergence |
| **깨** (돌파) | breakout_intensity + Safety Gate 금지 룰 |

## Appendix B: 타임프레임별 차이

| | 5M | 1M |
|---|---|---|
| Safety Gate wick_ratio | 0.1 | **1.0** |
| 노이즈 필터 | 없음 | **5M MA20 방향 필수** |
| 재진입 (1H당) | 2회 | **1회** |
| 데이터 | 3년 | **6개월 rolling** |
| 동시 신호 시 | — | **1M 우선** |

## Appendix C: 거래소별 주의사항

| 항목 | 개발 시 확인 |
|---|---|
| 1단계 주문 | MEXC 미지원 시 2단계 fallback |
| editOrder | MEXC 미지원 시 cancel+create |
| 분할 청산 | 거래소별 reduceOnly + 수량 방식 차이 |
| XAUT 페어 | 4개 거래소 존재 여부, 대안 페어 |
| Rate Limit | Binance 1200/min, OKX 60/2s, Bitget/MEXC 20/s |
| 최소 주문 | 심볼별, 거래소별 최소 수량/금액 |
| 내부 이체 | CCXT transfer() 지원 여부 (테스트넷 사전 검증) |

## Appendix D: v1.2 → v2.0 변경 사항

| 항목 | v1.2 | v2.0 |
|---|---|---|
| Symbol PK | `id` (text) | `(symbol, exchange)` 복합 PK |
| 캔들 수집 | primary_exchange만 | **거래소별 독립 수집** |
| 설정 관리 | config.json + DB 혼재 | **DB CommonCode만** |
| 데이터 모델 | 20개 엔티티 | **13개 엔티티** |
| WATCHING | WatchingState | **WatchSession** |
| 블랙아웃 | BlackoutWindow + EconomicEvent | **TradeBlock** |
| 레이블링 | Label 테이블 (1:1) | **Ticket에 흡수** |
| 시그널 관측값 | Signal 컬럼 | **SignalDetail key-value** |
| 백테스트 | BacktestRun + WfoRun | **Backtest** (run_type+parent_id) |
| 운영 로그 | 전용 테이블 5개 | **EventLog** (범용) |
| 벡터 라벨 | TrainingExample | **Vector에 직접** |
| 포지션 사이징 | (미명시) | **리스크 역산 명시, 고정 계약 수 금지** |
| 자동 이체 | 없음 | **매일 50% 현물 이체** |
| 웹 UI | 기능 나열 | **3개 화면 확정** |
| risk_pct 티어 | 3% 고정 | **30만원→3%, 3천만원→1%** |
| reserve | 없음 | **동적 (risk_pct × multiplier)** |
