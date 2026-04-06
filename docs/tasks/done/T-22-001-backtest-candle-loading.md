# T-22-001: 백테스트 캔들 로딩 + MockAdapter 연결

## Goal

`src/backtest/cli.ts`의 `loadCandles` 스텁(`async () => []`)을 실제 DB 조회로 교체하고, 로딩된 캔들을 MockExchangeAdapter에 전달하여 백테스트가 실제 시장 데이터로 실행되도록 한다.

## Why

현재 백테스트 실행 시 캔들이 0건 로딩되어 전략이 한 번도 실행되지 않는다. 캔들 인프라(history-loader, repository, sync)는 모두 구현 완료되었으나 CLI에서 호출하지 않고 있다.

## Inputs

- `src/backtest/cli.ts` — 수정 대상 (line ~234, ~257)
- `src/candles/repository.ts` — `getCandles(db, symbol, exchange, timeframe, from, to, limit?)`
- `src/candles/sync.ts` — `syncCandles(options: SyncOptions)`
- `src/backtest/engine.ts` — `LoadCandles` type: `(symbol, exchange, startDate, endDate) => Promise<Candle[]>`
- `src/backtest/mock-adapter.ts` — `MockExchangeAdapter({ candles: Candle[] })`

## Dependencies

- 없음 (첫 번째 태스크)

## Expected Outputs

- `loadCandles` 콜백이 DB에서 캔들을 조회하여 반환
- DB에 캔들이 없으면 `syncCandles()`로 Binance에서 자동 다운로드 후 조회
- MockExchangeAdapter가 로딩된 캔들을 받아 `fetchOHLCV`, `getCurrentCandle` 정상 동작

## Deliverables

- `src/backtest/cli.ts` 수정:
  - `loadCandles` 콜백: DB 조회 → 없으면 sync → 재조회
  - `makeAdapter`: 로딩된 캔들을 `candles` 파라미터로 전달

## Constraints

- `getCandles` 반환 타입(`CandleRow[]`)과 `BacktestRunner`가 기대하는 `Candle[]` 타입 매핑 필요
- Decimal.js 사용 필수 (float 금지)
- 캔들 정렬: `open_time ASC` (engine이 자체 정렬하므로 순서 무관할 수 있으나 확인 필요)
- 타임프레임: CLI args에서 받거나 기본값 사용 (현재 config에 어떻게 설정되는지 확인)

## Steps

1. `cli.ts`에서 `getCandles`, `syncCandles` import
2. `loadCandles` 콜백 구현:
   ```
   a. getCandles(db, symbol, exchange, timeframe, startDate, endDate) 호출
   b. 결과가 빈 배열이면 syncCandles({ symbols: [symbol], exchange, timeframes: [timeframe] }) 실행
   c. 재조회하여 반환
   d. CandleRow → Candle 타입 변환 (필요시)
   ```
3. `makeAdapter` 수정: `candles` 파라미터에 로딩된 캔들 전달
   - `makeAdapter`가 `loadCandles` 결과를 받을 수 있도록 호출 순서 조정
4. 기존 테스트 통과 확인

## Acceptance Criteria

- [ ] `loadCandles`가 DB에서 캔들을 조회하여 `Candle[]` 반환
- [ ] DB에 데이터 없을 때 `syncCandles` 자동 호출 후 재조회
- [ ] MockExchangeAdapter가 로딩된 캔들로 초기화
- [ ] `bun run backtest -- --symbol BTCUSDT --start 2023-01-01 --end 2023-03-01` 실행 시 totalCandles > 0
- [ ] `bun test` 통과
- [ ] `bun run typecheck` 통과

## Validation

```bash
bun run typecheck
bun test
bun run backtest -- --symbol BTCUSDT --start 2023-01-01 --end 2023-03-01
# "총 거래" 행 위의 캔들 수가 0보다 큰지 확인 (전략 미연결이므로 거래는 아직 0일 수 있음)
```

## Implementation Plan

**수정 파일:** `src/backtest/cli.ts`

1. `candleRowToCandle` 변환 함수 추가: `CandleRow` → `Candle` (numeric string → Decimal)
2. `loadCandlesFromDb` 함수 추가:
   - 4개 타임프레임(1D, 1H, 5M, 1M) 모두 로딩하여 합산
   - DB에 캔들이 없으면 symbol upsert → `syncCandles()` → 재조회
   - `CandleRow[]` → `Candle[]` 변환하여 반환
3. backtest 모드: `loadCandles` 스텁을 `loadCandlesFromDb`로 교체
4. `makeAdapter`: 로딩된 캔들을 받도록 수정 (candles 파라미터 교체)
   - 캔들은 `loadCandles` 콜백 내에서 BacktestRunner가 호출하므로, adapter에도 동일 캔들 전달 필요
   - adapter 생성 시점을 loadCandles 이후로 변경하거나, adapter.candles를 후속 설정
5. WFO 모드는 T-22-003 범위 — 이번에는 미수정

**리스크:**
- symbolTable FK: candle insert 전에 symbol 존재 필요 → upsert로 해결
- 타입 호환: CandleRow.is_closed가 `boolean | null` → `?? false`

## Out of Scope

- 전략 콜백 구현 (T-22-002)
- WFO 모드 수정 (T-22-003)
- 캔들 인프라 자체 수정 (이미 구현 완료)

## Implementation Notes

**Date:** 2025-04-06

**Files changed:**
- `src/backtest/cli.ts` — 주요 수정

**Approach:**
1. `candleRowToCandle()` 변환 함수 추가: CandleRow(string numerics) → Candle(Decimal)
2. `loadCandlesFromDb()` 함수 추가: 4개 타임프레임(1D, 1H, 5M, 1M) 모두 DB 조회, 없으면 syncCandles 자동 호출
3. `createLoadCandles()` factory 함수로 DB 인스턴스 바인딩
4. `makeAdapter` 시그니처를 `(_startDate: Date)` → `(candles: Candle[])` 로 변경
5. backtest 모드에서 캔들을 선행 로딩 후 adapter와 runner 양쪽에 전달
6. DB 없으면 backtest 모드 실행 불가하도록 명시적 에러 처리
7. WFO 모드는 `makeAdapter([])` 임시 처리 (T-22-003 범위)

**Validation results:**
- `bun run typecheck` — PASS
- `bun test` — 3080 pass, 0 fail
- 실제 백테스트 실행 (DB + Binance 연동)은 E2E 검증 필요

**Discovered work:**
- WFO 모드도 동일한 패턴 적용 필요 → T-22-003

## Outputs

- `candleRowToCandle()`: CandleRow → Candle 변환 함수 (T-22-003에서 재사용)
- `createLoadCandles(db)`: LoadCandles 콜백 factory (T-22-003에서 재사용)
- `makeAdapter(candles: Candle[])`: 캔들 기반 adapter 생성기 (T-22-002/003에서 사용)
