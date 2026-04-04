# T-04-002 Binance Public Data ZIP 다운로드 & CSV 파싱 + CCXT REST fallback

## Goal
Binance public data (data.binance.vision)에서 히스토리 캔들 ZIP 파일을 다운로드하고 CSV를 파싱하여 Candle 객체 배열로 변환하는 모듈을 구현한다. Binance public data 실패 시 CCXT REST API fallback도 포함한다.

## Why
3년치 히스토리 캔들 데이터가 KNN 학습과 백테스트에 필수적이다. REST API 대비 레이트리밋 없이 대량 다운로드 가능한 Binance public data를 주 소스로 사용하며, 장애 시 CCXT REST API를 fallback으로 제공한다.

## Inputs
- `docs/exec-plans/04-market-data.md` — M1 히스토리 로더 요구사항
- `src/core/types.ts` — Candle, Exchange, Timeframe 타입
- `src/core/decimal.ts` — Decimal 래퍼
- `src/core/ports.ts` — ExchangeAdapter.fetchOHLCV() (REST fallback용)

## Dependencies
- 없음 (네트워크 다운로드 + 파싱 모듈이므로 DB 불필요)

## Expected Outputs
- `src/candles/history-loader.ts`:
  - `downloadCandles(symbol, exchange, timeframe, from, to): Promise<NewCandle[]>` — Binance public data ZIP 다운로드 & 파싱
  - `fetchCandlesViaREST(adapter, symbol, timeframe, since, limit): Promise<NewCandle[]>` — CCXT REST fallback
  - `NewCandle` 타입 = `Omit<Candle, 'id' | 'created_at'>` (DB 삽입 전 타입)
- Monthly ZIP + Daily ZIP 2단계 다운로드 전략

## Deliverables
- `src/candles/history-loader.ts`

## Constraints
- 다운로드 URL 패턴:
  - Monthly: `https://data.binance.vision/data/futures/um/monthly/klines/{SYMBOL}/{INTERVAL}/{SYMBOL}-{INTERVAL}-{YYYY}-{MM}.zip`
  - Daily: `https://data.binance.vision/data/futures/um/daily/klines/{SYMBOL}/{INTERVAL}/{SYMBOL}-{INTERVAL}-{YYYY}-{MM}-{DD}.zip`
- CSV 컬럼 순서: open_time, open, high, low, close, volume, close_time, quote_volume, count, taker_buy_volume, taker_buy_quote_volume, ignore (open_time + OHLCV만 사용, 나머지 6개 무시)
- 가격/볼륨은 Decimal.js로 변환 (number 금지)
- `exchange` 파라미터: `downloadCandles`는 반환 객체에 전달된 exchange 값을 설정 (Phase 1은 'binance'로 호출)
- Monthly ZIP = 과거 완결 월, Daily ZIP = 현재 월 전일까지
- ZIP 다운로드 실패 시 개별 파일 skip (전체 중단 아님)
- 타임프레임 문자열 매핑: 1D→1d, 1H→1h, 5M→5m, 1M→1m (Binance 소문자)
- ZIP 추출: `fflate` 라이브러리 사용 (경량, Bun 호환). TECH_STACK.md에 없으면 구현자가 추가
- CCXT REST fallback: `ExchangeAdapter.fetchOHLCV()` 호출 → NewCandle 타입으로 매핑

## Steps
1. `NewCandle` 타입 정의 (`Omit<Candle, 'id' | 'created_at'>`)
2. Binance public data URL 빌더 함수 구현 (monthly/daily)
3. ZIP 다운로드 함수 구현 (fetch → ArrayBuffer → fflate unzipSync → CSV 텍스트 추출)
4. CSV 파싱 함수 구현 (컬럼 매핑, Decimal 변환, open_time → Date, exchange 필드 설정)
5. `downloadCandles(symbol, exchange, timeframe, from, to)` 메인 함수:
   - from~to 구간을 monthly/daily로 분할
   - 과거 완결 월은 monthly ZIP, 나머지는 daily ZIP
   - 각 ZIP 다운로드 → 파싱 → 병합
6. 에러 처리: 404(해당 기간 데이터 없음), 네트워크 실패 → skip + 로그
7. `fetchCandlesViaREST(adapter, symbol, timeframe, since, limit)` 구현:
   - adapter.fetchOHLCV() 호출 → NewCandle 타입으로 변환
8. 단위 테스트 작성

## Acceptance Criteria
- Monthly + Daily 2단계 URL 생성이 올바른 경로 생성
- CSV 파싱이 12개 컬럼 중 필요한 6개(open_time, OHLCV)를 올바르게 매핑
- 가격/볼륨이 Decimal.js 인스턴스
- open_time이 Date 객체 (UTC)
- 반환 객체의 exchange 필드가 파라미터로 전달된 값과 일치
- 다운로드 실패 시 해당 파일 skip, 나머지 계속 진행
- is_closed = true (히스토리 데이터는 항상 마감됨)
- CCXT REST fallback이 adapter.fetchOHLCV() 결과를 NewCandle로 올바르게 매핑

## Test Scenarios
- buildMonthlyUrl("BTCUSDT", "5m", 2024, 1) → 올바른 URL 문자열
- buildDailyUrl("BTCUSDT", "1h", 2024, 3, 15) → 올바른 URL 문자열
- parseCSV() with valid CSV row → NewCandle 객체 (Decimal 필드, Date open_time, exchange 설정됨)
- parseCSV() with empty/malformed row → skip (에러 아닌 무시)
- downloadCandles() with date range spanning 2 months → monthly ZIP 2개 호출
- downloadCandles() with current month → daily ZIP만 호출
- downloadCandles() with 404 response for one ZIP → 해당 파일 skip, 나머지 성공
- timeframe 매핑: "1D"→"1d", "5M"→"5m" 변환 정확
- fetchCandlesViaREST() with valid adapter response → NewCandle[] 매핑 성공 (id/created_at 없음)
- fetchCandlesViaREST() with adapter failure → 에러 전파

## Validation
```bash
bun test -- --grep "history-loader"
bun run typecheck
```

## Out of Scope
- DB 삽입 (T-04-003)
- 동기화 오케스트레이션 (T-04-004)
