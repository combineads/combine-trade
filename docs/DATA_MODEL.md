# Data Model

> MRT(Master-Reference-Transaction) 프레임워크 기반 논리 데이터 모델
> 2M + 1R + 10T = 13개 엔티티

## 비즈니스 문장

1. "**운영자**가 **심볼**(M)에 대해 여러 **거래소**에서 자동매매 데몬을 **실행**한다."
2. "각 거래소에서 **캔들**(T)을 **수집**하고, **주문**(T)도 해당 거래소로 보낸다."
3. "1일봉 마감 시 일간방향필터가 **방향**(LONG_ONLY/SHORT_ONLY/NEUTRAL)을 **결정**한다."
4. "**거래차단**(T)이 경제이벤트/펀딩/장개장/수동으로 거래를 **차단**한다."
5. "1시간봉 마감 시 **감시세션**(T)을 **시작**하고, 전제 붕괴 시 **종료**한다."
6. "5분/1분봉에서 Evidence Gate가 BB4 터치를 **감지**하여 **시그널**(T)을 **생성**한다."
7. "시그널의 관측값은 **시그널상세**(T)에 key-value로 **기록**한다."
8. "시그널에서 202차원 **벡터**(T)를 **생성**하고 KNN이 유사도 검색 결과를 **반환**한다."
9. "포지션사이저가 리스크/레버리지를 역산하여 **티켓**(T)을 **생성**, 거래소에 **주문**(T)한다."
10. "TP1→50% 청산+본절+트레일링 시작, TP2→25% 청산, 잔여→트레일링 계속."
11. "포지션 종료 시 **티켓**(T)에 결과(WIN/LOSS/TIME_EXIT)와 PnL을 **확정**한다."
12. "**백테스트**(T)가 동일 파이프라인을 실행하고 결과를 **기록**한다."
13. "모든 설정은 **공통코드**(R)에서 관리하고, 시작 시 메모리 캐시한다."
14. "상태 변경/운영 이벤트는 **이벤트로그**(T)에 append-only로 **기록**한다."

## MRT 분류

| 엔티티 | 역할 | 설명 |
|--------|------|------|
| Symbol | **Master** | 거래소별 심볼. PK=(symbol, exchange). Binance BTCUSDT와 OKX BTCUSDT는 별개 행 |
| SymbolState | **Master** | 심볼의 현재 운영 상태 (FSM, 방향, 손실 카운터). Symbol과 1:1 |
| CommonCode | **Reference** | 공통 코드 테이블. 전략 파라미터/설정을 group_code+code 키로 관리 |
| TradeBlock | **Transaction** | 거래 차단 기간. 고정 반복 패턴과 일회성 이벤트 모두 관리 |
| Candle | **Transaction** | OHLCV 시계열 (심볼×타임프레임, append-only) |
| WatchSession | **Transaction** | 감시 세션. 1H 마감 시 시작 → 진입 기회 탐색 → 전제 붕괴 시 종료. 생명주기가 있는 이력 |
| Signal | **Transaction** | 파이프라인 산출 시그널. 핵심 판단 컬럼만 보유 |
| SignalDetail | **Transaction** | 시그널 관측값 key-value. 관측 항목 추가 시 행만 늘어남 |
| Vector | **Transaction** | 202차원 특징 벡터 + KNN 학습 라벨/등급 |
| Ticket | **Transaction** | 포지션 티켓 FSM + 거래 결과 (Label 흡수) |
| Order | **Transaction** | 거래소 주문 기록 (체결 상세) |
| Backtest | **Transaction** | 백테스트/WFO 실행 결과 |
| EventLog | **Transaction** | 범용 이벤트 이력 (상태 변경, 운영 이벤트, 대조 결과 등) |

> **SymbolState**는 심볼당 1행 upsert 패턴이며, 전형적 Transaction(append)과 다릅니다.

## 엔티티 상세

### Master 데이터

#### Symbol
- `symbol` (text, not null) — 'BTCUSDT', 'XAUTUSDT'
- `exchange` (text, not null) — 'binance', 'okx', 'bitget', 'mexc'
- PRIMARY KEY (symbol, exchange)
- `name` (text, not null) — 표시명
- `base_asset` (text, not null) — BTC, XAU
- `quote_asset` (text, not null) — USDT
- `is_active` (boolean, default true)
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)
- CRUD: 시스템 설정 시 생성. 거래소 추가 시 같은 symbol에 새 exchange 행 추가
- Projections: 모든 모듈에서 읽기 — in-process 메모리 캐시

> **복합 PK 근거:** 같은 BTCUSDT라도 거래소마다 tick size, 수수료, 최소 주문 크기가 다름. 거래소 추가 시 INSERT 한 줄로 자연스럽게 확장. 거래소별 메타데이터(수수료, 레이트리밋 등)는 CommonCode `EXCHANGE` 그룹에서 관리.

#### SymbolState
- `id` (PK, uuid)
- `symbol` (text, not null)
- `exchange` (text, not null)
- FOREIGN KEY (symbol, exchange) REFERENCES Symbol
- UNIQUE (symbol, exchange) — 심볼×거래소당 1행
- `fsm_state` (text, not null) — CHECK (IDLE / WATCHING / HAS_POSITION)
- `execution_mode` (text, not null, default 'analysis') — CHECK (analysis / alert / live)
- `daily_bias` (text) — CHECK (LONG_ONLY / SHORT_ONLY / NEUTRAL), nullable (1D 마감 전)
- `daily_open` (numeric) — 오늘 일봉 시가 (UTC 00:00)
- `session_box_high` (numeric) — 미장 시가봉 고가
- `session_box_low` (numeric) — 미장 시가봉 저가
- `losses_today` (numeric, default 0) — 오늘 누적 손실 금액
- `losses_session` (integer, default 0) — 현재 세션(장) 손절 횟수
- `losses_this_1h_5m` (integer, default 0) — 현재 1시간 내 5M 진입 손절 횟수 (max 2)
- `losses_this_1h_1m` (integer, default 0) — 현재 1시간 내 1M 진입 손절 횟수 (max 1)
- `updated_at` (timestamptz, not null)
- CRUD: 이벤트마다 갱신, upsert (심볼×거래소당 1행)

**손실 카운터 리셋 규칙:**
- `losses_today`: UTC 00:00에 0으로 리셋
- `losses_session`: 거래차단(장 개장) 시작 시 0으로 리셋 (세션 = 아시아/유럽/미국장 단위)
- `losses_this_1h_5m`, `losses_this_1h_1m`: 매 정시(HH:00)에 0으로 리셋
- **계좌 수준 일간 한도**: `SELECT SUM(losses_today) FROM symbol_state` (전체 합산)

**동시 접근 규칙:**
- SymbolState 변경은 반드시 단일 SQL 트랜잭션 내에서 수행
- 포지션 대조 시 `SELECT ... FOR UPDATE`로 행 잠금 후 읽기

### Reference 데이터

#### CommonCode
- `group_code` (text, not null) — 그룹 분류
- `code` (text, not null) — 개별 코드
- `value` (jsonb, not null) — 값 (타입 자유)
- `description` (text) — 설명
- `sort_order` (integer, default 0) — 정렬 순서
- `is_active` (boolean, default true)
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)
- PRIMARY KEY (group_code, code)
- CRUD: 시드 데이터로 초기 삽입, 웹 UI에서 수정 가능
- Projections: 시작 시 1회 전체 로드 → in-process 메모리 캐시, 변경 시 캐시 즉시 갱신

**그룹 정의:**

| group_code | 용도 | 예시 code | 예시 value |
|------------|------|-----------|-----------|
| `EXCHANGE` | 거래소 메타데이터 | `binance` | `{ name, adapter_type, supports_one_step_order, supports_edit_order, rate_limit_per_min, min_order_size, priority }` |
| `TIMEFRAME` | 타임프레임 정의 | `1D` | `{ duration_seconds: 86400, display_name: "1일" }` |
| `SYMBOL_CONFIG` | 심볼별 설정 | `BTCUSDT` | `{ risk_pct: 0.03, max_leverage: 38 }` |
| `KNN` | KNN 파라미터 | `top_k` | `50` — 기타: distance_metric="cosine", min_winrate=0.55, threshold=4.26, min_samples=30, commission_pct=0.08 |
| `POSITION` | 포지션 관리 | `max_pyramid_count` | `2` |
| `LOSS_LIMIT` | 손실 제한 | `max_daily_loss_pct` | `0.10` |
| `SLIPPAGE` | 슬리피지 임계치 | `max_spread_pct` | `0.05` |
| `FEATURE_WEIGHT` | 벡터 가중치 | `bb4_position` | `2.0` |
| `TIME_DECAY` | 시간 감쇠 | `1_month` | `1.0` |
| `WFO` | WFO 설정 | `in_sample_months` | `6` |
| `ANCHOR` | 구조적 앵커 (불변) | `bb20` | `{ length: 20, stddev: 2, source: "close" }` |
| `TRANSFER` | 자동 이체 설정 | `transfer_enabled` | `false` — 이체액 = 당일 실현 수익 × transfer_pct(50%) |
| `NOTIFICATION` | 알림 설정 | `slack_webhook` | Slack 알림 관련 설정 (채널, 포맷 등) |

> **config.json 제거:** 모든 설정이 CommonCode에 저장되므로 config.json 파일이 불필요합니다.

> **ANCHOR 그룹:** 구조적 앵커(BB20, BB4, MA 기간, 정규화)는 WFO가 변경하는 것을 금지합니다 (애플리케이션 레벨 보호).

### Transaction 데이터

#### TradeBlock
- `id` (PK, uuid)
- `block_type` (text, not null) — CHECK (ECONOMIC / FUNDING / MANUAL / MARKET_OPEN)
- `start_time` (timestamptz, not null) — 차단 시작
- `end_time` (timestamptz, not null) — 차단 종료
- `reason` (text) — 사유 설명 ("FOMC 금리 결정", "아시아장 오픈" 등)
- `is_recurring` (boolean, not null, default false) — true: 매일 반복 패턴, false: 일회성
- `recurrence_rule` (jsonb) — 반복 규칙 (is_recurring=true 시). `{ utc_hour, duration_min }` 또는 `{ utc_hours: [0,8,16], duration_min: 30 }`
- `source_data` (jsonb) — 외부 API 원본 데이터 보존 (ECONOMIC 타입 시)
- `created_at` (timestamptz, not null)
- CRUD: 시드 데이터(고정 패턴) + 런타임 생성(경제이벤트/수동)

**고정 패턴 시드 데이터:**
```
(MARKET_OPEN, '00:00', '02:00', '아시아장 오픈', recurring, { utc_hour: 0, duration_min: 120 })
(MARKET_OPEN, '07:00', '09:00', '유럽장 오픈',   recurring, { utc_hour: 7, duration_min: 120 })
(MARKET_OPEN, '13:30', '15:30', '미국장 오픈(S)', recurring, { utc_hour: 13.5, duration_min: 120 })
(MARKET_OPEN, '14:30', '16:30', '미국장 오픈(W)', recurring, { utc_hour: 14.5, duration_min: 120 })
(FUNDING,     '23:45', '00:15', '펀딩 0시',       recurring, { utc_hours: [0,8,16], duration_min: 30 })
```

**거래차단 판단 로직:**
```typescript
function isTradeBlocked(now: Date): boolean {
  // 1) 반복 패턴: is_recurring=true 행에서 recurrence_rule 기반 시간 계산
  // 2) 일회성: is_recurring=false AND start_time <= now <= end_time
  // 두 조건 중 하나라도 true면 거래차단
}
```

> **EconomicEvent 테이블 제거 근거:** 경제이벤트는 외부 API에서 읽어와 수집하는 데이터일 뿐, TradeBlock.reason + source_data로 충분. 별도 테이블과 FK 관계가 불필요.

#### Candle
- `id` (PK, uuid)
- `symbol` (text, not null)
- `exchange` (text, not null)
- FOREIGN KEY (symbol, exchange) REFERENCES Symbol
- `timeframe` (text, not null) — CHECK ('1D' / '1H' / '5M' / '1M')
- `open_time` (timestamptz, not null) — 캔들 시작 시각
- `open` (numeric, not null)
- `high` (numeric, not null)
- `low` (numeric, not null)
- `close` (numeric, not null)
- `volume` (numeric, not null)
- `is_closed` (boolean, default false)
- `created_at` (timestamptz, not null)
- UNIQUE (symbol, exchange, timeframe, open_time)
- CRUD: WebSocket 수집, append-only, 고빈도

> **거래소별 캔들:** Symbol이 (symbol, exchange)이므로 거래소 추가 시 자연스럽게 해당 거래소의 캔들도 수집됨.

#### WatchSession
- `id` (PK, uuid)
- `symbol` (text, not null)
- `exchange` (text, not null)
- FOREIGN KEY (symbol, exchange) REFERENCES Symbol
- `detection_type` (text, not null) — CHECK (SQUEEZE_BREAKOUT / SR_CONFLUENCE / BB4_TOUCH)
- `direction` (text, not null) — CHECK (LONG / SHORT)
- `tp1_price` (numeric) — 1H MA20 (TP1 목표가, 1H close마다 갱신)
- `tp2_price` (numeric) — 1H 반대편 BB20 (TP2 목표가, 1H close마다 갱신)
- `detected_at` (timestamptz, not null) — 감지 시각
- `invalidated_at` (timestamptz) — 종료 시각 (null = 활성)
- `invalidation_reason` (text) — 종료 사유
- `context_data` (jsonb) — 감지 시점 BB값, S/R 레벨, 스퀴즈 상태 스냅샷
- `created_at` (timestamptz, not null)
- CRUD: 1H 마감 시 생성, 전제 붕괴 시 무효화
- **심볼×거래소당 활성 1개 제약**: `invalidated_at IS NULL`인 행은 최대 1개. 새 감시 세션 시작 시 기존 활성 세션을 먼저 종료.

> **WatchSession 명명 근거:** "State"는 현재값 1행(SymbolState처럼)을 연상시키지만, 이 엔티티는 시작→활성→종료 생명주기가 있는 이력. "Session"이 이 생명주기를 정확히 표현. `openWatchSession()`, `invalidateWatchSession()`.

#### Signal
- `id` (PK, uuid)
- `symbol` (text, not null)
- `exchange` (text, not null)
- FOREIGN KEY (symbol, exchange) REFERENCES Symbol
- `watch_session_id` (FK → WatchSession, not null) — 감시 세션이 항상 선행
- `timeframe` (text, not null) — CHECK ('5M' / '1M'). 진입 타임프레임
- `signal_type` (text, not null) — CHECK (DOUBLE_B / ONE_B)
- `direction` (text, not null) — CHECK (LONG / SHORT)
- `entry_price` (numeric, not null) — 예상 진입가
- `sl_price` (numeric, not null) — 예상 SL가
- `safety_passed` (boolean, not null) — Safety Gate 통과 여부
- `knn_decision` (text) — CHECK (PASS / FAIL / SKIP)
- `a_grade` (boolean, not null, default false) — A등급 시그널 (1H+5M/1M BB4 동시). A급 시 KNN 완화: min_winrate→50%, min_samples→20
- `vector_id` (FK → Vector, nullable) — 생성된 벡터 참조
- `created_at` (timestamptz, not null)
- CRUD: 파이프라인 산출, append-only

> **Signal 최소화 근거:** 핵심 판단 컬럼(entry/sl/safety/knn/grade)만 Signal에 유지. 나머지 관측값은 SignalDetail로 분리하여 관측 항목 추가 시 스키마 변경 없이 행만 추가.

#### SignalDetail
- `id` (PK, uuid)
- `signal_id` (FK → Signal, not null)
- `key` (text, not null) — 관측 항목명
- `value` (numeric) — 수치값
- `text_value` (text) — 텍스트값 (value가 null인 경우)
- UNIQUE (signal_id, key)
- CRUD: Signal 생성 시 함께 INSERT, append-only

**예시 데이터:**
```
(signal_1, 'bb4_touch_price',     85432.50, null)
(signal_1, 'wick_ratio',          0.35,     null)
(signal_1, 'session_box_pos',     0.72,     null)
(signal_1, 'daily_bias',          null,     'LONG_ONLY')
(signal_1, 'knn_score',           4.83,     null)
(signal_1, 'knn_winrate',         0.62,     null)
(signal_1, 'knn_expectancy',      1.45,     null)
(signal_1, 'knn_sample_count',    47,       null)
(signal_1, 'safety_reject_reason',null,     null)  -- 통과 시 null
```

> **jsonb 대신 key-value 테이블 선택 근거:** jsonb는 쿼리/집계가 어렵고, 스키마 없이 아무 값이나 들어감. key-value 테이블은 (1) 특정 관측값으로 필터링 가능 `WHERE key='knn_winrate' AND value > 0.55`, (2) 관측 항목 추가 시 INSERT만, (3) 어떤 관측값들이 있는지 `SELECT DISTINCT key`로 파악 가능.

#### Vector
- `id` (PK, uuid)
- `candle_id` (FK → Candle, unique, not null)
- `symbol` (text, not null)
- `exchange` (text, not null)
- `timeframe` (text, not null) — CHECK ('5M' / '1M')
- `embedding` (vector(202), not null) — pgvector HNSW
- `label` (text) — CHECK (WIN / LOSS / TIME_EXIT), nullable (미확정)
- `grade` (text) — CHECK (A / B / C), nullable (미확정)
- `labeled_at` (timestamptz) — label 확정 시각
- `created_at` (timestamptz, not null)
- CRUD: 캔들 마감 시 생성 (label=null), Ticket 종료 시 label/grade 확정

> **TrainingExample 제거 → Vector 흡수 근거:** 이전에 "동일 벡터를 여러 Signal이 참조하면 label 충돌" 우려로 분리했으나, 실제로는 캔들 1개당 벡터 1개이고 진입은 1개 시그널에서만 발생. label 충돌이 현실적으로 발생하지 않으므로 Vector에 직접 label/grade를 기록. 라벨링 출처는 Signal.vector_id 역방향 조회(`SELECT s.id FROM signal s WHERE s.vector_id = ?`)로 추적.

> **Vector.symbol/exchange — FK 없음:** 비정규화 컬럼이므로 Symbol FK를 걸지 않음. Candle → Vector CASCADE가 참조 무결성을 보장하고, symbol/exchange 값은 코드에서 Candle 값을 복사. 3.8M행 append-only 테이블에 추가 FK 체크는 불필요.

**벡터 생성 대상:** 5M, 1M 타임프레임만.

**예상 볼륨 (3년, 심볼당, 거래소당):**
- 5M: ~315K, 1M: ~1.58M → 합계: ~3.8M (2심볼 × 1거래소 기준)

#### Ticket
- `id` (PK, uuid)
- `symbol` (text, not null)
- `exchange` (text, not null)
- FOREIGN KEY (symbol, exchange) REFERENCES Symbol
- `signal_id` (FK → Signal, unique, not null) — 시그널 1개당 티켓 0~1개
- `parent_ticket_id` (FK → Ticket, nullable) — 피라미딩: 2차→1차 참조
- `timeframe` (text, not null) — CHECK ('5M' / '1M'). 진입 타임프레임
- `direction` (text, not null) — CHECK (LONG / SHORT)
- `state` (text, not null) — CHECK (INITIAL / TP1_HIT / TP2_HIT / CLOSED)
- `entry_price` (numeric, not null) — 실제 체결 진입가
- `sl_price` (numeric, not null) — 초기 SL가
- `current_sl_price` (numeric, not null) — 현재 SL (본절 이동 후)
- `size` (numeric, not null) — 총 포지션 크기
- `remaining_size` (numeric, not null) — 잔여 크기
- `leverage` (integer, not null)
- `tp1_price` (numeric) — MA20
- `tp2_price` (numeric) — 반대편 BB20
- `trailing_active` (boolean, default false)
- `trailing_price` (numeric)
- `max_profit` (numeric, default 0) — 최대 수익폭
- `pyramid_count` (integer, default 0)
- `opened_at` (timestamptz, not null) — 진입 체결 시각
- `closed_at` (timestamptz) — 전량 청산 시각
- `close_reason` (text) — CHECK (SL / TP1 / TP2 / TRAILING / TIME_EXIT / PANIC_CLOSE / MANUAL)
- `result` (text) — CHECK (WIN / LOSS / TIME_EXIT), nullable (CLOSED 시 확정)
- `pnl` (numeric) — 누적 실현 PnL
- `pnl_pct` (numeric) — 수익률
- `max_favorable` (numeric) — MFE
- `max_adverse` (numeric) — MAE
- `hold_duration_sec` (integer) — 보유 시간
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)
- CRUD: 진입 체결 시 생성, 상태 전이, 종료 시 CLOSED + result/pnl 확정

> **Ticket FSM**: INITIAL → TP1_HIT → TP2_HIT → CLOSED
> Ticket은 진입 체결 후에만 존재. IDLE/WATCHING은 SymbolState.fsm_state.

> **Label 테이블 제거 → Ticket 흡수 근거:** Label은 Ticket과 1:1이고, 결국 Ticket의 거래 결과를 기록하는 것. 별도 테이블로 분리할 이유가 없음. Ticket이 CLOSED 되면 result, pnl, pnl_pct, max_favorable, max_adverse, hold_duration_sec이 확정됨.

#### Order
- `id` (PK, uuid)
- `ticket_id` (FK → Ticket, nullable) — Panic Close(Ticket 없는 포지션 강제 청산) 시 null
- `exchange` (text, not null) — CHECK ('binance' / 'okx' / 'bitget' / 'mexc')
- `order_type` (text, not null) — CHECK (ENTRY / SL / TP1 / TP2 / TRAILING / PYRAMID / PANIC_CLOSE / TIME_EXIT)
- `status` (text, not null) — CHECK (PENDING / FILLED / PARTIALLY_FILLED / CANCELLED / FAILED)
- `side` (text, not null) — CHECK (BUY / SELL)
- `price` (numeric) — 지정가 (시장가는 null)
- `expected_price` (numeric) — 기대 체결가
- `size` (numeric, not null)
- `filled_price` (numeric) — 실제 체결가
- `filled_size` (numeric) — 실제 체결량
- `exchange_order_id` (text) — 거래소 주문 ID
- `intent_id` (text, not null) — 논리적 주문 의도 ID
- `idempotency_key` (text, not null) — per-attempt
- UNIQUE (exchange, idempotency_key)
- `slippage` (numeric) — filled_price - expected_price
- `error_message` (text)
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)
- CRUD: 주문 실행 시 생성, 체결/취소 시 갱신

> **Order.exchange 정합성:** Ticket이 있는 Order는 반드시 `Order.exchange === Ticket.exchange`여야 함. DB 레벨 cross-column CHECK는 복잡하므로 **애플리케이션에서 검증**. Panic Close(ticket_id=null)는 거래소에서 발견된 포지션이므로 해당 거래소 값 사용.

#### Backtest
- `id` (PK, uuid)
- `run_type` (text, not null) — CHECK (BACKTEST / WFO)
- `symbol` (text, not null)
- `exchange` (text, not null)
- FOREIGN KEY (symbol, exchange) REFERENCES Symbol
- `start_date` (timestamptz, not null)
- `end_date` (timestamptz, not null)
- `config_snapshot` (jsonb, not null) — 실행 시점 설정
- `results` (jsonb, not null) — 실행 결과
- `parent_id` (FK → Backtest, nullable) — WFO 구간이 소속된 상위 WFO 실행
- `window_index` (integer) — WFO 구간 번호 (run_type=WFO 시)
- `created_at` (timestamptz, not null)
- CRUD: 실행당 1건, append-only

**results jsonb 구조 (BACKTEST):**
```json
{ "total_trades": 150, "win_rate": 0.62, "expectancy": 1.45,
  "max_drawdown": 0.08, "sharpe_ratio": 1.82, "profit_factor": 2.1 }
```

**results jsonb 구조 (WFO 구간):**
```json
{ "is_expectancy": 1.45, "oos_expectancy": 1.12, "wfo_efficiency": 0.77 }
```

> **BacktestRun + WfoRun 통합 근거:** 두 테이블 모두 "실행 결과 저장"이라는 같은 목적. run_type으로 구분하고, WFO 구간은 parent_id로 상위 실행에 연결. results를 jsonb로 두어 메트릭 종류가 늘어나도 스키마 변경 없음.

> **데이터 처리 방식:** 백테스트는 개별 Signal/Ticket/Order를 DB에 저장하지 않고 메모리에서 실행. 집계 결과만 Backtest에 기록.

#### EventLog
- `id` (PK, uuid)
- `event_type` (text, not null) — 이벤트 유형 (자유 텍스트, 규약으로 관리)
- `symbol` (text) — 관련 심볼 (nullable: 시스템 전체 이벤트)
- `exchange` (text) — 관련 거래소 (nullable)
- `ref_id` (uuid) — 관련 엔티티 ID (ticket_id, signal_id 등)
- `ref_type` (text) — 관련 엔티티 유형 ('ticket', 'signal', 'order' 등)
- `data` (jsonb) — 이벤트 상세 데이터
- `created_at` (timestamptz, not null)
- CRUD: append-only, 삭제 없음

**event_type 규약:**

| event_type | 용도 | data 예시 |
|------------|------|-----------|
| `BIAS_CHANGE` | 일간 방향 변경 | `{ from: "LONG_ONLY", to: "NEUTRAL", candle_open_time: "..." }` |
| `WATCHING_START` | WATCHING 감지 | `{ detection_type, direction, context: { bb_values, sr_levels } }` |
| `WATCHING_END` | WATCHING 무효화 | `{ reason: "bias_changed", duration_sec: 3600 }` |
| `RECONCILIATION` | 포지션 대조 결과 | `{ matched: 2, mismatched: 0, action: "NONE" }` |
| `CRASH_RECOVERY` | 데몬 재시작 복구 | `{ positions_found: 1, panic_closed: 0, sl_re_registered: 1 }` |
| `SLIPPAGE_ABORT` | 슬리피지 ABORT | `{ expected_price, spread, threshold }` |
| `SLIPPAGE_CLOSE` | 슬리피지 강제청산 | `{ expected_price, actual_price, slippage_amount }` |
| `STATE_CHANGE` | FSM 상태 전이 | `{ from: "IDLE", to: "WATCHING", trigger: "1h_close" }` |
| `SL_REGISTERED` | SL 거래소 등록 | `{ order_id, sl_price }` |
| `SL_MOVED` | SL 본절 이동 | `{ from_price, to_price, reason: "tp1_hit" }` |
| `TRANSFER_SUCCESS` | 자동 이체 성공 | `{ exchange, currency, amount, from: "future", to: "spot", balance_before, balance_after, reserve }` |
| `TRANSFER_FAILED` | 자동 이체 실패 | `{ exchange, currency, amount, error_message }` |
| `TRANSFER_SKIP` | 이체 건너뜀 (잔고 부족) | `{ exchange, available, min_transfer, reserve }` |
| `CONSECUTIVE_LOSS_RECORD` | 연속 손실 역대 최대 갱신 | `{ count, previous_max, symbols }` |
| `MDD_WARNING` | MDD 10% 초과 경고 | `{ mdd_pct, peak_balance, current_balance }` |
| `EXPECTANCY_WARNING` | 최근 30건 expectancy 음수 | `{ expectancy, sample_count, recent_trades }` |

> **DailyBiasLog, WatchingState, ReconciliationLog, CrashRecoveryLog, SlippageEvent 제거 → EventLog 통합 근거:** 이들은 모두 "무슨 일이 있었는지 기록"하는 이력 테이블. 각각 별도 스키마를 정의하면 테이블만 늘어나고, 새로운 이벤트 유형이 생길 때마다 마이그레이션이 필요. EventLog 하나로 통합하면 event_type + data(jsonb)로 어떤 이벤트든 기록 가능.

> **EventLog는 앱 로직이 아니라 감사 추적:** 이 테이블은 앱이 "무슨 일을 했는지" 기록하는 것. 데이터 모델이 아니라 로깅이지만, 구조화된 이벤트를 DB에 넣으면 웹 UI에서 "왜 그때 그 판단을 했는가"를 조회할 수 있음.

## 관계

| # | 관계 | 카디널리티 | FK 위치 | CASCADE | 제약 |
|---|------|-----------|---------|---------|------|
| 1 | Symbol → SymbolState | 1:1 | SymbolState.(symbol, exchange) | CASCADE | UNIQUE, NOT NULL |
| 2 | Symbol → Candle | 1:N | Candle.(symbol, exchange) | RESTRICT | NOT NULL |
| 3 | Symbol → WatchSession | 1:N | WatchSession.(symbol, exchange) | RESTRICT | NOT NULL |
| 4 | Symbol → Signal | 1:N | Signal.(symbol, exchange) | RESTRICT | NOT NULL |
| 5 | Symbol → Ticket | 1:N | Ticket.(symbol, exchange) | RESTRICT | NOT NULL |
| 6 | Candle → Vector | 1:0..1 | Vector.candle_id | CASCADE | UNIQUE |
| 7 | WatchSession → Signal | 1:N | Signal.watch_session_id | RESTRICT | NOT NULL |
| 8 | Signal → SignalDetail | 1:N | SignalDetail.signal_id | CASCADE | NOT NULL |
| 9 | Signal → Ticket | 1:0..1 | Ticket.signal_id | RESTRICT | UNIQUE |
| 10 | Signal → Vector (KNN) | N:0..1 | Signal.vector_id | SET NULL | nullable |
| 11 | Ticket → Order | 1:N | Order.ticket_id | SET NULL | nullable |
| 12 | Ticket → Ticket (피라미딩) | N:1 | Ticket.parent_ticket_id | SET NULL | nullable |
| 13 | Symbol → Backtest | 1:N | Backtest.(symbol, exchange) | RESTRICT | NOT NULL |
| 14 | Backtest → Backtest (WFO) | N:1 | Backtest.parent_id | CASCADE | nullable |

**CASCADE 정책:**
- **RESTRICT**: 거래 기록 삭제 불가 (감사 추적)
- **CASCADE**: SymbolState(부모 소멸 시 무의미), Vector(Candle 삭제 시), SignalDetail(Signal 삭제 시), WFO 구간(상위 삭제 시)
- **SET NULL**: Order.ticket_id(Panic Close), Ticket.parent_ticket_id(1차 삭제해도 2차 유지)

> **EventLog는 FK 없음:** EventLog.ref_id는 논리적 참조만. FK를 걸면 모든 엔티티에 대한 FK가 필요해지고, 삭제 제약이 복잡해짐. 대신 (ref_type, ref_id)로 어떤 엔티티를 참조하는지 기록.

## Projection Contract

### Symbol
- **Owner**: core
- **Allowed fields**: symbol, exchange, name, base_asset, quote_asset, is_active
- **Refresh**: 시작 시 1회 로드 → in-process 메모리 캐시
- **Delete/merge**: soft delete (is_active=false) → SymbolState.fsm_state IDLE 강제

### CommonCode
- **Owner**: core
- **Allowed fields**: group_code, code, value, is_active
- **Refresh**: 시작 시 1회 전체 로드, 변경 시 즉시 캐시 갱신
- **WFO 자동 튜닝**: WFO가 최적값을 찾으면 CommonCode UPDATE. `ANCHOR` 그룹은 변경 금지

## 컬럼 레벨 Enum

**CHECK 제약조건:**

| 대상 | 값 |
|------|---|
| SymbolState.fsm_state | IDLE / WATCHING / HAS_POSITION |
| SymbolState.execution_mode | analysis / alert / live |
| SymbolState.daily_bias | LONG_ONLY / SHORT_ONLY / NEUTRAL |
| Candle.timeframe | 1D / 1H / 5M / 1M |
| Vector.timeframe | 5M / 1M |
| Vector.label | WIN / LOSS / TIME_EXIT |
| Vector.grade | A / B / C |
| WatchSession.detection_type | SQUEEZE_BREAKOUT / SR_CONFLUENCE / BB4_TOUCH |
| WatchSession.direction | LONG / SHORT |
| Signal.timeframe | 5M / 1M |
| Signal.signal_type | DOUBLE_B / ONE_B |
| Signal.direction | LONG / SHORT |
| Signal.knn_decision | PASS / FAIL / SKIP |
| Ticket.timeframe | 5M / 1M |
| Ticket.direction | LONG / SHORT |
| Ticket.state | INITIAL / TP1_HIT / TP2_HIT / CLOSED |
| Ticket.close_reason | SL / TP1 / TP2 / TRAILING / TIME_EXIT / PANIC_CLOSE / MANUAL |
| Ticket.result | WIN / LOSS / TIME_EXIT |
| Ticket.exchange | binance / okx / bitget / mexc |
| Order.exchange | binance / okx / bitget / mexc |
| Order.order_type | ENTRY / SL / TP1 / TP2 / TRAILING / PYRAMID / PANIC_CLOSE / TIME_EXIT |
| Order.status | PENDING / FILLED / PARTIALLY_FILLED / CANCELLED / FAILED |
| Order.side | BUY / SELL |
| TradeBlock.block_type | ECONOMIC / FUNDING / MANUAL / MARKET_OPEN |
| Backtest.run_type | BACKTEST / WFO |

## Physical Design Guide

| MRT 역할 | 저장 전략 | Drizzle 패턴 |
|----------|----------|-------------|
| Master | Composite PK (Symbol) / uuid PK (SymbolState) | pgTable, in-process 캐시 |
| Reference | Composite PK, jsonb value | pgTable, ConfigStore 캐시 |
| Transaction | Append 위주, 시간 인덱스, uuid PK | pgTable, timestamptz 인덱스 |

### 금액/가격 컬럼
모든 금액/가격 컬럼은 `numeric` (PostgreSQL) → Decimal.js 매핑. **절대 `float`/`real`/`double precision` 사용 금지.**

### pgvector 설정
- 컬럼: `vector(202)`
- 인덱스: HNSW (`ef_construction=200, m=16, cosine`)
- 벡터 생성 대상: 5M/1M 타임프레임만

### 인덱스 전략

| 테이블 | 인덱스 | 용도 |
|--------|--------|------|
| Candle | UNIQUE (symbol, exchange, timeframe, open_time) | 중복 삽입 방지 |
| Candle | (symbol, exchange, timeframe, open_time DESC) | 최근 캔들 조회 |
| Vector | HNSW on embedding (cosine) | KNN 검색 |
| Vector | (symbol, exchange, timeframe) | 벡터 필터 |
| SignalDetail | UNIQUE (signal_id, key) | 시그널당 key 중복 방지 |
| SignalDetail | (key, value) | 특정 관측값 필터링 |
| WatchSession | (symbol, exchange, invalidated_at) WHERE invalidated_at IS NULL | 활성 감시 세션 |
| Ticket | (symbol, exchange, state) WHERE state != 'CLOSED' | 활성 티켓 |
| Order | UNIQUE (exchange, idempotency_key) | 멱등성 |
| Order | (ticket_id, created_at) | 티켓별 주문 이력 |
| Order | (intent_id) | 동일 intent 조회 |
| EventLog | (event_type, created_at DESC) | 이벤트 유형별 조회 |
| EventLog | (symbol, exchange, created_at DESC) | 심볼별 이벤트 |
| EventLog | (ref_type, ref_id) | 관련 엔티티 조회 |
| TradeBlock | (is_recurring) WHERE is_recurring = true | 반복 패턴 조회 |
| TradeBlock | (start_time, end_time) WHERE is_recurring = false | 일회성 거래차단 |
| CommonCode | PK (group_code, code) | 별도 인덱스 불필요 |

### 데이터 보존/아카이빙 정책
| 테이블 | 보존 기간 | 비고 |
|--------|----------|------|
| Candle | 무기한 | 3년 이상은 cold storage 고려 |
| Vector | 무기한 | time decay로 가중치 감소 |
| Order | 무기한 | 재무 감사 트레일 |
| EventLog | 1년 | 1년 이상은 아카이빙/삭제 |

### 동시 접근 규칙
- **SymbolState**: 변경은 단일 SQL 트랜잭션. 포지션 대조 시 `FOR UPDATE` 잠금
- **Vector label 확정**: Ticket CLOSED + Vector.label/grade 확정은 단일 트랜잭션
- **단일 프로세스**: Bun 이벤트 루프 + DB 트랜잭션으로 보호

## Migration Rules

- **초기 스키마**: 모두 `expand` class (안전, 추가 전용)
- **향후 변경 시**:

| Class | 설명 | 예시 |
|-------|------|------|
| **Expand** | 새 컬럼/테이블 추가 | ADD COLUMN, CREATE TABLE |
| **Backfill** | 기존 데이터 채우기 | UPDATE ... SET new_col = ... |
| **Cutover** | 코드 전환 | old_col → new_col |
| **Contract** | 이전 컬럼/테이블 제거 | DROP COLUMN |

- **Contract**는 롤백 계획 + 호환 기간 (최소 1주) 필수
- **24/7 운영** 중 스키마 변경은 expand → backfill → cutover → contract 순서

## MRT Change Log

> 상세 변경 이력: [changelogs/DATA_MODEL_CHANGELOG.md](changelogs/DATA_MODEL_CHANGELOG.md)
