# T-19-001 AllIndicators sma20/RSI 히스토리 확장

## Metadata
- modules: [indicators]
- primary: indicators
- epic: EP-19
- milestone: M1
- prd-refs: §7.8 L276-277

## Goal
`AllIndicators` 타입에 `sma20History: Decimal[]` (최근 4값, 현재 포함) 와
`rsiHistory: number[]` (최근 14값) 를 추가하고, `calcAllIndicators()` 가 이를
캔들 히스토리에서 계산하여 채우도록 한다.

## Why
T-19-002의 `ma20_slope` 3봉 기울기와 `rsi_extreme_count` 14봉 히스토리 계산은
현재 `AllIndicators`에 없는 히스토리 데이터에 의존한다. 현재 `strategy-features.ts`
L108-116의 주석이 직접 인정하듯 "1봉 근사"로 동작 중이며, 1봉 기울기는 PRD
§7.8 L276-277의 3봉 기울기와 다르다. 이 파운데이션 없이는 T-19-002를 정확히
구현할 수 없다.

## Inputs
- `src/indicators/types.ts` — `AllIndicators` 타입 정의 (현재 37줄)
- `src/indicators/index.ts` — `calcAllIndicators()` 구현 (현재 69줄)
- `src/indicators/ma.ts` — `calcSMASeries()` 사용 가능
- `src/indicators/rsi.ts` — `calcRSISeries()` 사용 가능
- PRD §7.8 L276: `ma20_slope = (sma20[0] − sma20[3]) / sma20[3]` (3봉 슬라이딩)
- PRD §7.8 L277: `rsi_extreme_count = count(RSI>70 or RSI<30) in last 14 bars / 14`

## Dependencies
- 없음 (파운데이션 태스크)

## Expected Outputs
- `src/indicators/types.ts`: `AllIndicators`에 `sma20History`, `rsiHistory` 필드 추가
- `src/indicators/index.ts`: `calcAllIndicators()` 가 두 히스토리를 populate
- 신규 테스트: `src/indicators/indicators.test.ts` (또는 기존 파일 갱신)

## Deliverables
- `AllIndicators.sma20History: Decimal[]` — `calcSMASeries` 마지막 4값 (4개 미만이면 있는 만큼)
- `AllIndicators.rsiHistory: number[]` — `calcRSISeries` 마지막 14값 (14개 미만이면 있는 만큼), number[] (Decimal 아님 — 소비자 편의)
- `calcAllIndicators()`: `sma20History`는 `calcSMASeries(closes, 20).slice(-4)`, `rsiHistory`는 `calcRSISeries(closes).map(d => d.toNumber()).slice(-14)` 로 채움
- 기존 필드(`sma20`, `prevSma20`, `rsi14` 등) 변경 없음
- 기존 소비자 코드 무변경 — 새 필드는 additive

## Constraints
- 기존 `AllIndicators` 소비자(`safety-gate.ts`, `watching.ts`, `evidence-gate.ts` 등)를 수정하지 않음
- `prevSma20` 필드 유지 — 제거하지 않음 (기존 소비자 사용 중)
- `sma20History` 최대 크기: 4 (T-19-002 요구사항 이상 저장 불필요)
- `rsiHistory` 최대 크기: 14
- number[] vs Decimal[]: `rsiHistory`는 `number[]` — RSI 비교는 70/30 임계값이며 Decimal 정밀도 불필요

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/indicators/types.ts`: `AllIndicators`에 `sma20History: Decimal[]`와 `rsiHistory: number[]` 추가
4. `src/indicators/index.ts`: `calcSMASeries` 임포트 추가 (이미 있는지 확인), `calcRSISeries` 임포트 추가
5. `calcAllIndicators()`: `sma20History`와 `rsiHistory` 계산 후 반환 객체에 포함
6. Run tests — confirm all pass (GREEN phase)
7. `bun run typecheck` — 타입 에러 없음 확인
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [ ] `calcAllIndicators(candles)` 결과에 `sma20History` 필드 존재
- [ ] `calcAllIndicators(candles)` 결과에 `rsiHistory` 필드 존재
- [ ] 30개 캔들 → `sma20History.length === 4`
- [ ] 30개 캔들 → `rsiHistory.length === 14`
- [ ] 22개 캔들(SMA20 series 3개만) → `sma20History.length === 3`
- [ ] 14개 캔들(RSI series 0개) → `rsiHistory.length === 0`
- [ ] `sma20History[sma20History.length - 1]` === `sma20` (현재값과 일치)
- [ ] `rsiHistory[rsiHistory.length - 1]` ≈ `rsi14.toNumber()` (현재값과 일치)
- [ ] 기존 `prevSma20` 필드 유지됨 (값 불변)
- [ ] 기존 소비자 코드 수정 불필요 — `bun run typecheck` PASS

## Test Scenarios
- calcAllIndicators() with 30 candles → sma20History has exactly 4 elements
- calcAllIndicators() with 30 candles → sma20History[3] equals current sma20 value
- calcAllIndicators() with 30 candles → sma20History[0] equals sma20 from 3 bars ago
- calcAllIndicators() with 30 candles → rsiHistory has exactly 14 elements
- calcAllIndicators() with 30 candles → rsiHistory[13] ≈ rsi14.toNumber() (last element matches current)
- calcAllIndicators() with 22 candles (SMA20 series yields 3 values) → sma20History.length === 3
- calcAllIndicators() with 14 candles (RSI series empty) → rsiHistory.length === 0
- calcAllIndicators() with 30 candles → prevSma20 unchanged (equals sma20Series[n-2])
- AllIndicators type: sma20History and rsiHistory properties exist and are typed correctly
- calcAllIndicators() with 1000 candles → sma20History.length capped at 4
- calcAllIndicators() with 1000 candles → rsiHistory.length capped at 14

## Validation
```bash
bun test src/indicators/
bun run typecheck
bun run lint
```

## Out of Scope
- `ma20_slope` / `rsi_extreme_count` 전략 피처 수정 → T-19-002
- `bandwidthHistory` 추가 → T-19-003
- 기존 벡터 DB 재구축 (미실행 애플리케이션)
