# 02-indicators

## Objective
기술적 지표 계산 엔진을 구현한다. BB20, BB4, MA, RSI, ATR 등 파이프라인 전체에서 사용되는 지표를 `@ixjb94/indicators` 라이브러리 기반으로 계산하고, 결과를 Decimal로 래핑하여 반환한다.

## Scope
- `src/indicators/` (L2): 볼린저밴드(BB20, BB4), 이동평균(MA20/60/120), RSI, ATR 계산
- 순수 함수 — DB 접근 없이 캔들 배열을 입력받아 지표값 반환
- `@ixjb94/indicators` (IndicatorsSync) 를 내부 계산 엔진으로 사용
- 결과 타입은 Decimal 필드로 정의 (소비측에서 Decimal 비교 가능)

## Non-goals
- 캔들 수집/저장 (EP-04)
- 시그널 판단 로직 (EP-05)
- 실시간 스트리밍/증분 계산 (배치 계산 우선)
- Decimal.js로 내부 수학 연산 수행 (Float64로 계산 → 결과만 Decimal 변환)

## Prerequisites
- EP-01 완료 ✅
  - `core/types.ts` — Candle 타입 (Decimal 필드)
  - `core/constants.ts` — BB20_CONFIG, BB4_CONFIG, MA_PERIODS
  - `core/decimal.ts` — d() 팩토리, Decimal 타입

## Milestones

### M1 — 지표 결과 타입 + 볼린저밴드 (BB20, BB4)
- Deliverables:
  - `src/indicators/types.ts` — BollingerResult, MAResult, RSIResult, ATRResult, SqueezeState, AllIndicators 타입 정의
  - `src/indicators/bollinger.ts` — calcBB(closes, length, stddev), calcBB20(closes), calcBB4(closes)
  - 내부: `@ixjb94/indicators` IndicatorsSync.bbands() 사용
  - 결과: `BollingerResult = { upper: Decimal, middle: Decimal, lower: Decimal, bandwidth: Decimal, percentB: Decimal }`
- Acceptance criteria:
  - BB20(20, 2σ), BB4(4, 4σ) 파라미터는 constants.ts에서 참조
  - 캔들 배열 입력 → 배열 마지막 캔들 기준 BB값 반환 (또는 전체 시리즈 반환)
  - 캔들 부족 시 null 반환 (BB20: 최소 20개, BB4: 최소 4개)
  - bandwidth = (upper - lower) / middle
  - percentB = (close - lower) / (upper - lower)
  - 알려진 데이터로 계산 정확도 검증 (오차 0.01% 이내)
- Validation:
  - `bun test --grep "bollinger"`
  - `bun run typecheck`

### M2 — 이동평균 + RSI + ATR
- Deliverables:
  - `src/indicators/ma.ts` — calcSMA(source, period), calcEMA(source, period)
  - `src/indicators/rsi.ts` — calcRSI(closes, period=14)
  - `src/indicators/atr.ts` — calcATR(highs, lows, closes, period=14)
  - 내부: IndicatorsSync.sma(), .ema(), .rsi(), .atr() 사용
- Acceptance criteria:
  - SMA/EMA 결과는 Decimal 배열
  - RSI 0-100 범위 보장, 캔들 부족 시 null
  - ATR 양수 보장, 캔들 부족 시 null
  - MA 기간(20/60/120)은 인자로 받되 constants.ts 값을 기본값으로
- Validation:
  - `bun test --grep "indicators"`

### M3 — 스퀴즈 감지 + 통합 API + 성능 검증
- Deliverables:
  - `src/indicators/squeeze.ts` — detectSqueeze(bb20Results) → SqueezeState
  - `src/indicators/index.ts` — calcAllIndicators(candles) 통합 API
  - `scripts/bench-indicators.ts` — 성능 벤치마크 (120개 캔들 × 1000회)
- Acceptance criteria:
  - 스퀴즈 상태: squeeze (bandwidth 수축) / expansion (bandwidth 확장) / normal 판별
  - calcAllIndicators() 로 BB20, BB4, SMA(20/60/120), EMA(20/60/120), RSI(14), ATR(14) 한 번에 계산
  - 전체 지표 계산 < 10ms (120개 캔들 기준, 단일 호출)
  - 레이어 검증: `bun scripts/check-layers.ts` 위반 0건
- Validation:
  - `bun test --grep "indicators"`
  - `bun run typecheck && bun run lint`
  - `bun scripts/bench-indicators.ts`
  - `bun scripts/check-layers.ts`

## Task candidates
- T-02-001: indicators/types.ts — 지표 결과 타입 정의 (BollingerResult, MAResult, etc.)
- T-02-002: indicators/bollinger.ts — BB 공통 함수 + calcBB20() + calcBB4() (IndicatorsSync.bbands 래핑)
- T-02-003: indicators/ma.ts — calcSMA() + calcEMA() (IndicatorsSync.sma/ema 래핑)
- T-02-004: indicators/rsi.ts — calcRSI(14) (IndicatorsSync.rsi 래핑)
- T-02-005: indicators/atr.ts — calcATR(14) (IndicatorsSync.atr 래핑)
- T-02-006: indicators/squeeze.ts — BB20 bandwidth 기반 스퀴즈 감지
- T-02-007: indicators/index.ts — calcAllIndicators() 통합 API + 성능 벤치마크
- T-02-008: 빌드 통합 검증 (typecheck, lint, test, check-layers)

## Risks
- **@ixjb94/indicators 정확도**: 라이브러리 내부 구현이 TradingView와 미세하게 다를 수 있음. 허용 오차 0.01% 정의. 불일치 시 해당 지표만 자체 구현.
- **Float64 → Decimal 변환 정밀도**: 부동소수점 계산 후 Decimal 변환 시 반올림 차이 발생 가능. toFixed() 후 d() 변환으로 제어 가능한 수준.
- **라이브러리 API 변경**: @ixjb94/indicators 1.2.4 pin. 메이저 업데이트 시 래퍼만 수정.

## Decision log
- **내부 계산은 Float64, 출력은 Decimal**: @ixjb94/indicators가 number[] 기반이므로 내부는 네이티브 float 사용. 결과를 Decimal로 변환하여 반환. 지표 계산 자체는 "금액 산술"이 아니라 "통계 연산"이므로 Float64 정밀도로 충분. 최종 가격 비교/포지션 사이징은 Decimal로 수행 (EP-05, EP-06).
- BB20, BB4는 공통 calcBB(closes, length, stddev) 함수로 내부 로직 공유, calcBB20/calcBB4는 파라미터 바인딩 편의 함수
- MA 기간(20/60/120)은 constants.ts에서 관리하되 함수 인자로도 받음 (백테스트 유연성)
- RSI/ATR 기간(14)은 업계 표준 고정
- 캔들 입력은 Candle[] 타입 (Decimal 필드) → 함수 내부에서 number[]로 변환하여 라이브러리에 전달
- T-02-001 + T-02-002를 기존 plan에서 분리했던 BB20/BB4를 타입+BB 통합으로 재구성

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성
- EP-02 update: @ixjb94/indicators 활용으로 Decimal.js 내부계산 → Float64+Decimal래핑으로 전략 변경

## Progress notes
- EP-01 완료 (2026-04-03) — 모든 prerequisite 충족
- 태스크 생성 완료 (2026-04-03) — T-02-001~T-02-008, 8개 태스크 → docs/tasks/backlog/
