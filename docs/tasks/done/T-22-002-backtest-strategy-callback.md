# T-22-002: 백테스트 전략 콜백 구현

## Goal

`src/backtest/cli.ts`의 no-op 전략 콜백(`async (_candle, _adapter, _addTrade) => {}`)을 실제 Double-BB 시그널 파이프라인으로 교체하여 백테스트에서 거래가 발생하도록 한다.

## Why

캔들이 로딩되더라도(T-22-001) 전략 콜백이 빈 함수이면 시그널 감지 → 주문 실행이 일어나지 않아 거래 0건이 유지된다.

## Inputs

- `src/backtest/cli.ts` — 수정 대상 (line ~261)
- `src/indicators/index.ts` — `calcAllIndicators(candles: Candle[]): AllIndicators`
- `src/signals/watching.ts` — `detectWatching(candle, indicators, dailyBias, symbolState?): WatchingResult | null`
- `src/signals/evidence-gate.ts` — `checkEvidence(candle, indicators, watchSession): EvidenceResult | null`
- `src/signals/safety-gate.ts` — `checkSafety(candle, indicators, signal, symbolState, recentCandles?): SafetyResult`
- `src/backtest/engine.ts` — `OnCandleClose: (candle, adapter, addTrade) => Promise<void>`
- `src/backtest/mock-adapter.ts` — `createOrder`, `checkPendingOrders`, `fetchPositions`

## Dependencies

- T-22-001 (캔들 로딩 완료 필수)

## Expected Outputs

- 전략 콜백이 캔들마다 인디케이터 계산 → 시그널 감지 → 주문 실행 수행
- 백테스트 실행 시 유효 시그널 구간에서 거래 발생
- `addTrade`로 완료된 거래 기록

## Deliverables

- `src/backtest/cli.ts` 수정:
  - 전략 콜백 함수 구현 (또는 별도 파일로 분리)
  - 인디케이터 윈도우 관리 (최근 N개 캔들 유지)
  - 워칭 세션 상태 관리 (in-memory)

## Constraints

- 라이브 트레이딩과 동일한 코드 패스 사용 (AGENTS.md 규칙: "Backtest must use identical code paths as live trading")
- Decimal.js 필수
- 구조적 앵커(BB20, BB4, MA periods) 하드코딩 유지 — 튜닝 불가
- SL 주문은 진입 직후 반드시 등록 (`adapter.createOrder({ type: "stop_market" })`)
- MockExchangeAdapter의 temporal ordering 위반 금지

## Steps

1. 전략 콜백에 필요한 상태 변수 정의:
   - `recentCandles: Candle[]` — 인디케이터 계산용 윈도우 (최소 120개)
   - `watchSession: WatchSession | null` — 현재 워칭 세션
   - `dailyBias: DailyBias` — 일봉 기준 방향성
   - `hasPosition: boolean` — 현재 포지션 유무
2. 콜백 함수 구현:
   ```
   a. recentCandles에 현재 캔들 추가 (윈도우 크기 초과 시 shift)
   b. calcAllIndicators(recentCandles) 호출
   c. 포지션 없고 워칭 세션 없으면 → detectWatching()
   d. 워칭 세션 있으면 → checkEvidence()
   e. 에비던스 통과 → checkSafety()
   f. 세이프티 통과 → adapter.createOrder(진입) + adapter.createOrder(SL)
   g. 포지션 있으면 → adapter.checkPendingOrders(candle)로 SL 체크
   h. 포지션 종료 시 → addTrade(trade) 호출
   ```
3. dailyBias 계산 로직 추가 (1D 캔들 기반 또는 SMA 기반)
4. 기존 테스트 통과 확인

## Acceptance Criteria

- [ ] 전략 콜백이 `detectWatching` → `checkEvidence` → `checkSafety` 파이프라인 실행
- [ ] 유효 시그널 시 `adapter.createOrder`로 진입 + SL 주문 생성
- [ ] 포지션 종료 시 `addTrade`로 거래 기록
- [ ] `bun run backtest -- --symbol BTCUSDT --start 2023-01-01 --end 2023-07-01` 실행 시 총 거래 > 0
- [ ] 모든 금액 계산이 Decimal.js 사용
- [ ] `bun test` 통과
- [ ] `bun run typecheck` 통과

## Validation

```bash
bun run typecheck
bun test
bun run backtest -- --symbol BTCUSDT --start 2023-01-01 --end 2023-07-01
# 총 거래 > 0 확인
# MDD, 샤프 비율 등 메트릭이 유효한 값인지 확인
```

## Implementation Plan

**수정 파일:** `src/backtest/strategy.ts` (신규), `src/backtest/cli.ts` (import + 콜백 교체)

**접근:**
1. `src/backtest/strategy.ts`에 `createBacktestStrategy` 팩토리 함수를 별도 파일로 분리
   - 라이브와 동일한 순수 함수 사용: `calcAllIndicators`, `detectWatching`, `checkEvidence`, `checkSafety`, `determineDailyBias`, `calculateSize`, `getRiskPct`
   - 타임프레임별 캔들 윈도우 관리 (Map<Timeframe, Candle[]>)
   - in-memory 워칭 세션 (pipeline-adapter.ts 패턴 참고)
   - SL 감시: `adapter.checkPendingOrders(candle)` 매 캔들
   - 파이프라인 흐름: 1D→bias, 1H→watching, 5M/1M→entry, all→SL check
2. `cli.ts`에서 no-op 콜백을 `createBacktestStrategy(config)` 반환값으로 교체

**리스크:**
- 인디케이터 윈도우가 충분히 쌓이기 전 초반 캔들에서는 시그널 미감지 (정상 동작)
- 1H 캔들 없이 5M/1M만 있는 기간에서는 watch session이 생성 안 됨

## Out of Scope

- 캔들 로딩 (T-22-001에서 처리)
- WFO 모드 (T-22-003에서 처리)
- KNN 파라미터 최적화
- 전략 로직 자체 수정 (기존 시그널 모듈 그대로 사용)

## Implementation Notes

**Date:** 2025-04-06

**Files changed:**
- `src/backtest/strategy.ts` — 신규 생성
- `src/backtest/cli.ts` — 전략 콜백 교체

**Approach:**
1. `createBacktestStrategy(symbol)` 팩토리 함수를 별도 파일로 분리
2. 라이브 파이프라인과 동일한 순수 함수 사용:
   - `calcAllIndicators` — 인디케이터 계산
   - `determineDailyBias` — 1D 바이어스 판정
   - `detectWatching` / `checkInvalidation` — 1H 워칭 세션
   - `checkEvidence` / `checkSafety` — 5M/1M 진입 시그널
   - `calculateSize` / `getRiskPct` — 포지션 사이징
3. 타임프레임별 캔들 윈도우(Map<Timeframe, Candle[]>, 200개)
4. in-memory 워칭 세션 (pipeline-adapter.ts 패턴)
5. SL 감시: `adapter.checkPendingOrders(candle)` 매 캔들 호출
6. 진입 시 market order → 즉시 stop_market SL 등록

**Validation results:**
- `bun run typecheck` — PASS
- `bun test` — 3080 pass, 0 fail
- E2E 백테스트 실행은 DB + Binance 캔들 로딩 후 검증 필요

## Outputs

- `createBacktestStrategy(symbol)`: OnCandleClose 콜백 반환 (T-22-003 WFO에서 재사용)
