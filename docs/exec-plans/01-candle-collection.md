# 01-candle-collection

## Objective
거래소에서 캔들 데이터를 수집·저장하고 연속성을 보장하는 데이터 기반 레이어를 구축한다. 모든 다운스트림 모듈(전략, 벡터, 라벨, 백테스트)이 이 데이터에 의존한다.

## Scope
- `packages/exchange/` — CCXT 기반 거래소 어댑터 (Binance, OKX)
- `packages/candle/` — 캔들 모델, 저장, 연속성 검증, 갭 복구
- `workers/candle-collector/` — 실시간 캔들 수집 워커
- DB schema: `candles` 테이블
- Event bus: `candle_closed` NOTIFY

## Non-goals
- 주문 실행 (06-alert-execution에서 처리)
- 차트 UI 렌더링

## Prerequisites (milestone-level)
- M1 (Exchange adapter): EP00-M2
- M2 (Candle storage): EP00-M3, EP00-M4
- M3 (Continuity validation): EP01-M2
- M4 (Candle-collector worker): EP00-M5, EP00-M6, EP01-M2, EP01-M3
- M5 (Multi-symbol & multi-exchange): EP01-M4
- M6 (OHLCV data quality validation & exchange rate limiting): EP01-M1
- M7 (Multi-TF aggregation): EP01-M4

## Milestones

### M1 — Exchange adapter layer
- Deliverables:
  - `packages/exchange/types.ts` — 전체 표준 인터페이스 정의 (fetchOHLCV, watchOHLCV, createOrder, cancelOrder, fetchOrder, fetchPositions, fetchBalance — 구현은 OHLCV만, 나머지는 06에서 구현)
  - `packages/exchange/binance/` — Binance USDT-M Futures 어댑터
  - `packages/exchange/okx/` — OKX Futures 어댑터
  - CCXT 의존성 격리 (어댑터 내부에만 CCXT 임포트)
- Acceptance criteria:
  - Binance/OKX에서 BTCUSDT 1m 캔들 REST 조회 성공
  - 어댑터 인터페이스가 거래소 독립적
  - CCXT가 packages/exchange 외부로 누출 안 됨
- Validation:
  ```bash
  bun test -- --filter "exchange"
  ```

### M2 — Candle model & repository
- Deliverables:
  - `packages/candle/model.ts` — 캔들 도메인 모델
  - `packages/candle/repository.ts` — DrizzleORM 기반 저장소
  - Upsert 로직: `unique(exchange, symbol, timeframe, open_time)`
  - `is_closed` 플래그 관리
- Acceptance criteria:
  - 캔들 upsert가 멱등적 (동일 키 재삽입 시 업데이트)
  - `is_closed=true`만 다운스트림에 노출
- Validation:
  ```bash
  bun test -- --filter "candle"
  ```

### M3 — Continuity validation & gap repair
- Deliverables:
  - 연속성 검증: `open_time(i+1) = open_time(i) + timeframe_ms`
  - 갭 감지 서비스
  - REST 기반 자동 갭 복구
  - 복구 실패 시 WARNING 로그
- Acceptance criteria:
  - 의도적 갭 삽입 시 갭 감지 및 복구 시도
  - 복구 후 연속성 검증 통과
- Validation:
  ```bash
  bun test -- --filter "continuity|gap"
  ```

### M4 — Candle collector worker
- Deliverables:
  - `workers/candle-collector/` — WebSocket 실시간 수집
  - **Startup recovery sequence** (gap-aware, uses 3-tier backfill):
    1. Query DB for last `open_time` per (exchange, symbol, timeframe)
    2. Calculate gap duration: `now - last_open_time`
    3. **Gap > 1 day**: use Binance Vision daily archives for bulk recovery (Tier 2, T-1까지 가용)
    4. **Gap ≤ 1 day**: use REST API `fetchOHLCV()` to fill remaining gap (Tier 3)
    5. Run continuity validation (M3) on recovered range
    6. Switch to WebSocket for real-time collection
    - OKX: REST API only for all gap sizes (no Vision archives)
    - Recovery writes are silent (no `NOTIFY candle_closed`)
  - **New symbol addition**: when a new symbol is added to the watch list:
    1. Check if historical data exists in DB
    2. If no data: trigger full 3-tier backfill (EP05-M1 loader) for configured lookback period
    3. After backfill complete: start real-time WS collection
    4. Log symbol addition event with backfill status
  - `NOTIFY candle_closed` on confirmation
  - 재연결 로직 (exponential backoff)
  - 워커 헬스 체크
- Acceptance criteria:
  - WS 연결 후 실시간 캔들 수신·저장
  - WS 끊김 시 자동 재연결
  - **Startup recovery**: 12시간 갭 → REST로 복구 후 WS 전환, 연속성 검증 통과
  - **Startup recovery**: 7일 갭 → Vision daily로 6일분 복구 + REST로 당일분 → WS 전환
  - **New symbol**: 추가 시 백필 트리거 후 실시간 수집 시작
  - `candle_closed` 알림이 `is_closed=true` 시에만 발생
  - 백필/복구 writes는 NOTIFY 미발생
- Validation:
  ```bash
  bun test -- --filter "collector"
  # manual: 워커 시작 후 Binance BTCUSDT 1m 캔들 수신 확인
  # manual: 워커 재시작 시 갭 자동 복구 확인
  ```

### M5 — Multi-symbol & multi-exchange support
- Deliverables:
  - 심볼 목록 동적 구성 (BTCUSDT, ETHUSDT, SOLUSDT)
  - 거래소별 독립 워커 인스턴스 또는 멀티플렉싱
  - 심볼별 장애 격리 (한 심볼 실패가 다른 심볼 차단 안 함)
- Acceptance criteria:
  - 3개 심볼 × 2개 거래소 동시 수집
  - 개별 심볼 에러가 다른 심볼에 전파 안 됨
- Validation:
  ```bash
  bun test -- --filter "multi"
  ```

### M6 — OHLCV data quality validation & exchange rate limiting
- Deliverables:
  - 캔들 데이터 품질 검증:
    - 이상치 감지: high < low, volume < 0, OHLC 범위 비정상 (이전 캔들 대비 ±50% 이상 변동)
    - 빈 캔들 처리: 거래량 0인 캔들 (open=high=low=close) 정상 처리
    - 타임스탬프 정합성: UTC 기준, 타임프레임 경계 정렬
  - 거래소 rate limit 관리:
    - 거래소별 rate limit 프로파일 (Binance: 1200 req/min, OKX: 60 req/2s)
    - Token bucket 또는 sliding window rate limiter
    - rate limit 접근 시 자동 throttle (429 응답 전 선제 제한)
    - rate limit 위반 시 exponential backoff + WARNING 로그
  - 데이터 품질 메트릭: 이상치 비율, 갭 비율 추적
- Acceptance criteria:
  - high < low 캔들 감지 → WARNING + 해당 캔들 마킹
  - rate limit 위반 없이 연속 API 호출 정상 처리
  - rate limiter가 거래소별 독립 동작
- Validation:
  ```bash
  bun test -- --filter "data-quality|rate-limit"
  ```

### M7 — Multi-timeframe candle aggregation
- Deliverables:
  - `packages/candle/aggregator.ts` — 1m 캔들에서 상위 타임프레임 합성
  - 지원 타임프레임: 1m (원본), 3m, 5m, 15m, 1h (합성)
  - 합성 규칙: N개 1m 캔들 → 1개 상위 타임프레임 캔들
    - open: 첫 번째 1m의 open
    - high: N개 중 최고 high
    - low: N개 중 최저 low
    - close: 마지막 1m의 close
    - volume: N개의 volume 합계
  - 합성 캔들도 candles 테이블에 저장 (timeframe 구분)
  - 1m 캔들 close 시 해당 상위 타임프레임 캔들 업데이트
  - 상위 타임프레임 캔들 close 시 `NOTIFY candle_closed` 발행
- Acceptance criteria:
  - 1m 캔들 입력 → 3m/5m/15m/1h 캔들 정확히 합성
  - 합성 캔들의 OHLCV가 수학적으로 정확
  - 상위 타임프레임 close 시점에 NOTIFY 발행
  - 전략 sandbox에서 `timeframe('15m')` 등으로 접근 가능한 데이터 준비
- Validation:
  ```bash
  bun test -- --filter "aggregat"
  ```

## Task candidates
- T-011: Define exchange adapter full interface (OHLCV + order methods)
- T-012: Implement Binance Futures adapter with CCXT
- T-013: Implement OKX Futures adapter with CCXT
- T-014: Create candle domain model and DrizzleORM repository
- T-015: Implement candle upsert with idempotency and is_closed logic
- T-016: Implement candle continuity validation service
- T-017: Implement REST-based gap repair service
- T-018: Build candle-collector worker with WS + gap-aware startup recovery (3-tier backfill)
- T-018a: Implement new symbol addition workflow (detect → backfill → start WS)
- T-019: Add NOTIFY candle_closed on candle confirmation (via shared event bus)
- T-020: Implement WS reconnect with exponential backoff
- T-021: Add multi-symbol concurrent collection
- T-022: Add multi-exchange parallel collection
- T-023: Integration test: full candle ingestion pipeline
- T-023a: Implement OHLCV data quality validator (outlier detection, timestamp alignment)
- T-023b: Implement exchange-specific rate limiter (token bucket, per-exchange profiles)
- T-023c: Implement rate limit auto-throttle with exponential backoff
- T-023d: Implement 1m → 3m/5m/15m/1h candle aggregation engine
- T-023e: Implement aggregated candle NOTIFY on higher-timeframe close
- T-023f: Test: aggregation correctness (OHLCV math verification)

## Risks
- CCXT WebSocket API 안정성이 거래소별로 다를 수 있음
- Binance/OKX rate limit 정책 차이로 백필 속도 제약
- 타임프레임별 캔들 볼륨 (1m × 3심볼 × 2거래소 = 분당 6건)
- 타임프레임 합성 시 1m 캔들 갭이 있으면 상위 캔들 정확도 저하
- 거래소 rate limit 정책 변경 시 프로파일 업데이트 필요
- OHLCV 이상치가 전략 지표 계산에 전파되어 오신호 발생 가능
- Exchange maintenance windows: detected via CCXT exchange status API. During maintenance, candle-collector pauses collection and logs WARNING. Resumes automatically with gap backfill on maintenance end.

### Decimal precision for candle prices
- Candle OHLCV prices are stored as TEXT in PostgreSQL (ARCHITECTURE.md policy for monetary values)
- Application layer uses Decimal.js for price comparisons and calculations
- Volume may use native float (non-monetary, used for indicators only)

## Decision log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | 초기 거래소 API key는 환경변수(.env)에서 로드. EP10 이후 DB 암호화 저장으로 마이그레이션 | EP01-EP09는 .env로 충분. DB 암호화는 EP10에서 구현 |
| 2026-03-21 | CCXT를 exchange 패키지 내부에 격리 | 도메인 레이어에서 거래소 의존성 제거 |
| 2026-03-21 | NOTIFY는 live confirmed closes에만 발생 | 백필 시 downstream fan-out 방지 |
| 2026-03-21 | 심볼별 독립 에러 핸들링 | 한 심볼 장애가 전체 시스템 차단 방지 |
| 2026-03-21 | 1m에서 상위 타임프레임 합성 (거래소별 수집 아님) | 거래소 부하 최소화, 일관성 보장 |
| 2026-03-21 | exchange adapter에 전체 인터페이스 정의 (구현은 단계적) | 06에서 확장 시 인터페이스 변경 불필요 |
| 2026-03-22 | 워커 재시작 시 3-tier 백필 활용 (Vision daily → REST) | 장기 다운타임 후에도 REST rate limit 없이 빠른 갭 복구 가능 |
| 2026-03-22 | 새 심볼 추가 시 자동 백필 트리거 | 운영 중 심볼 추가 시 수동 개입 없이 히스토리 확보 |

## Progress notes
- Pending implementation.
