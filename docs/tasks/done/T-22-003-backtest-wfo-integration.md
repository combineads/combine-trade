# T-22-003: WFO 모드 캔들 로딩 + 전략 연결

## Goal

`src/backtest/cli.ts`의 WFO 모드에서도 T-22-001/002와 동일하게 캔들 로딩과 전략 콜백을 연결하여 Walk-Forward Optimization이 정상 동작하도록 한다.

## Why

WFO 모드도 동일한 스텁 문제를 가지고 있다 (line ~295: `async () => []`, line ~297: no-op callback). "FAIL:no_valid_windows" 오류의 근본 원인이다.

## Inputs

- `src/backtest/cli.ts` — 수정 대상 (line ~295, ~297)
- `src/backtest/wfo.ts` — `runWfo`, `WfoDeps`, `WfoConfig`
- T-22-001에서 구현한 `loadCandles` 함수
- T-22-002에서 구현한 전략 콜백

## Dependencies

- T-22-001 (캔들 로딩)
- T-22-002 (전략 콜백)

## Expected Outputs

- WFO 모드에서 각 윈도우별로 캔들 로딩 + 전략 실행
- IS(In-Sample) 구간에서 거래 발생 → 파라미터 최적화
- OOS(Out-of-Sample) 구간에서 검증 → efficiency 계산
- valid windows > 0

## Deliverables

- `src/backtest/cli.ts` WFO 관련 코드 수정:
  - `BacktestRunner` 생성 시 실제 `loadCandles` 전달
  - `runner.run()` 호출 시 실제 전략 콜백 전달
  - `runBacktestWindow` 함수에 T-22-001/002 로직 적용
  - `makeAdapter`에 윈도우별 캔들 전달

## Constraints

- WFO 윈도우별로 캔들 범위가 다르므로 `loadCandles`가 윈도우의 start/end를 정확히 반영해야 함
- IS/OOS 구간별 독립적 MockAdapter 인스턴스 필요
- 기존 WFO gate 로직(expectancy > 0, efficiency > 0.5) 수정 금지

## Steps

1. T-22-001의 `loadCandles` 로직을 WFO의 `runBacktestWindow`에 적용
2. T-22-002의 전략 콜백을 WFO의 `runner.run()`에 적용
3. `makeAdapter`가 윈도우별 캔들을 받도록 수정 (기존 `_startDate` 파라미터 활용)
4. WFO `searchParams` 콜백에서 파라미터별 백테스트가 실제 전략을 실행하는지 확인
5. 기존 테스트 통과 확인

## Acceptance Criteria

- [ ] WFO 모드에서 `loadCandles`가 윈도우별 날짜 범위로 캔들 조회
- [ ] 각 윈도우에서 전략 콜백 실행 → 거래 발생
- [ ] IS 구간에서 expectancy > 0인 윈도우 존재
- [ ] `bun run backtest -- --mode wfo --symbol BTCUSDT --start 2023-01-01 --end 2024-01-01` 실행 시 valid windows > 0
- [ ] gate 결과가 "FAIL:no_valid_windows" 아닌 실제 판정
- [ ] `bun test` 통과
- [ ] `bun run typecheck` 통과

## Validation

```bash
bun run typecheck
bun test
bun run backtest -- --mode wfo --symbol BTCUSDT --start 2023-01-01 --end 2024-01-01
# valid windows > 0 확인
# overall efficiency 값 출력 확인
```

## Implementation Plan

**수정 파일:** `src/backtest/cli.ts` (WFO 섹션만)

1. WFO 모드도 DB 필수 처리 (backtest 모드와 동일)
2. `runBacktestWindow` 수정:
   - `createLoadCandles(db)`로 윈도우별 캔들 로딩
   - 로딩된 캔들을 `makeAdapter(candles)`에 전달
   - `createBacktestStrategy(config.symbol)`로 전략 콜백 생성 (윈도우마다 독립 인스턴스)
   - `BacktestRunner`에 실제 loadCandles 전달
3. TODO 주석 제거

## Out of Scope

- WFO 알고리즘 자체 수정
- 파라미터 공간 확장
- 멀티심볼 WFO

## Implementation Notes

**Date:** 2025-04-06

**Files changed:**
- `src/backtest/cli.ts` — WFO 섹션 수정

**Approach:**
1. WFO 모드도 DB 필수 처리 (backtest 모드와 대칭)
2. `runBacktestWindow` 내부에서:
   - `createLoadCandles(db)`로 윈도우별 날짜 범위 캔들 로딩
   - 로딩된 캔들을 `makeAdapter(candles)`에 전달
   - `createBacktestStrategy(config.symbol)`로 독립 전략 인스턴스 생성 (윈도우마다 새로 생성하여 상태 격리)
   - `BacktestRunner`에 `async () => candles` 전달
3. TODO 주석 제거

**Validation results:**
- `bun run typecheck` — PASS
- `bun test` — 3080 pass, 0 fail
