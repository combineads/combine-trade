# 02-indicators

## Objective
기술적 지표 계산 엔진을 구현한다. BB20, BB4, MA, RSI, ATR 등 파이프라인 전체에서 사용되는 지표를 Decimal.js 기반으로 정확하게 계산한다.

## Scope
- `src/indicators/` (L2): 볼린저밴드(BB20, BB4), 이동평균(MA20/60/120), RSI, ATR 계산
- 순수 함수 — DB 접근 없이 캔들 배열을 입력받아 지표값 반환

## Non-goals
- 캔들 수집/저장 (EP-04)
- 시그널 판단 로직 (EP-05)
- 실시간 스트리밍 계산 (배치 계산 우선)

## Prerequisites
- EP-01 M1 (core/types, core/decimal) 완료

## Milestones

### M1 — 볼린저밴드 (BB20, BB4) + 성능 기준선
- Deliverables:
  - `src/indicators/bollinger.ts` — calcBB20(), calcBB4()
  - BB 결과 타입: { upper, middle, lower, bandwidth, percentB }
  - BB20 성능 벤치마크 (Decimal.js 기반, 120개 캔들 1000회 반복)
- Acceptance criteria:
  - BB20(20, 2σ), BB4(4, 4σ) 파라미터 하드코딩 (constants.ts 참조)
  - Decimal.js로 모든 계산 수행
  - 캔들 부족 시 null 반환 (BB20: 최소 20개, BB4: 최소 4개)
  - TradingView 값과 오차 0.01% 이내
  - **M1 완료 시 벤치마크 결과 기록** — 10ms 예산의 50% 이내(BB만)면 pass, 아니면 최적화 전략 결정
- Validation:
  - `bun test -- --grep "bollinger"`
  - 알려진 캔들 데이터로 결과 검증 테스트
  - 벤치마크 스크립트 실행

### M2 — 이동평균 & RSI & ATR
- Deliverables:
  - `src/indicators/ma.ts` — calcSMA(), calcEMA() (기간: 20/60/120)
  - `src/indicators/rsi.ts` — calcRSI(14)
  - `src/indicators/atr.ts` — calcATR(14)
- Acceptance criteria:
  - MA 기간은 constants.ts에서 참조
  - RSI 0-100 범위 보장
  - ATR은 양수 보장
  - 모든 계산 Decimal.js 기반
- Validation:
  - `bun test -- --grep "indicators"`

### M3 — 지표 통합 API & 스퀴즈 감지
- Deliverables:
  - `src/indicators/squeeze.ts` — BB20 bandwidth 기반 스퀴즈 감지
  - `src/indicators/index.ts` — 통합 공개 API (`calcAllIndicators()`)
- Acceptance criteria:
  - 단일 캔들 배열로 모든 지표 계산 가능
  - 스퀴즈 상태(squeeze/expansion) 판별 정확
  - 불필요한 재계산 없이 효율적
- Validation:
  - `bun test -- --grep "indicators"`
  - `bun run typecheck`

## Task candidates
- T-02-001: indicators/bollinger.ts — BB20 계산 (20, 2σ) + 성능 벤치마크
- T-02-002: indicators/bollinger.ts — BB4 계산 (4, 4σ)
- T-02-003: indicators/ma.ts — SMA/EMA 계산 (20/60/120)
- T-02-004: indicators/rsi.ts — RSI(14) 계산
- T-02-005: indicators/atr.ts — ATR(14) 계산
- T-02-006: indicators/squeeze.ts — BB20 bandwidth 스퀴즈 감지
- T-02-007: indicators/index.ts — 통합 API
- T-02-008: 전체 지표 파이프라인 성능 벤치마크 (< 10ms 검증)
- T-02-009: TradingView 검증 데이터 기반 지표 정확도 테스트

## Risks
- **Decimal.js 성능**: 고빈도 지표 계산에서 성능 저하 가능. 파이프라인 레이턴시 예산 < 10ms 준수 필요. 대안: 핫패스에서 벤치마크 후 최적화.
- **부동소수점 기준값**: TradingView와 정확히 같은 값을 내기 어려울 수 있음 (소수점 반올림 차이). 허용 오차 정의 필요.

## Decision log
- BB20, BB4는 별도 함수로 구현하지만 내부 로직 공유 (calcBB 공통 함수)
- MA 기간(20/60/120)은 constants.ts에서 관리하되 함수 인자로도 받음 (백테스트 유연성)
- RSI/ATR 기간(14)은 업계 표준 고정

## Consensus Log
- Round 1-2: EP-01~EP-11 전체 컨센서스 — 상세 로그는 01-foundation.md 참조
- Verdict: 2라운드 만에 컨센서스 달성

## Progress notes
- (작업 전)
