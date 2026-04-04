# T-13-014 백테스트 정확성 검증 (수동 계산 대비)

## Goal
알려진 시나리오에서 백테스트 결과가 수동 계산과 일치하는지 검증하는 통합 테스트를 작성한다.

## Why
백테스트 엔진의 신뢰도 최종 검증. 개별 컴포넌트 테스트만으로는 통합 시 발생하는 오류를 잡을 수 없음. 잘못된 백테스트 결과는 잘못된 전략 판단으로 이어짐.

## Inputs
- `src/backtest/engine.ts` — BacktestRunner
- `src/backtest/metrics.ts` — calcFullMetrics
- 수동 계산 시나리오 (이 태스크에서 정의)

## Dependencies
- T-13-005, T-13-006, T-13-007

## Expected Outputs
- `tests/backtest/accuracy.test.ts` — 정확성 검증 통합 테스트

## Deliverables
- `tests/backtest/accuracy.test.ts`

## Constraints
- 테스트용 캔들 데이터를 fixture로 준비 (DB 의존 최소화)
- 수동 계산 결과를 테스트 기대값으로 하드코딩
- 오차 허용: Decimal 소수점 6자리까지 일치
- 최소 3개 시나리오: (1) 단순 롱 1회, (2) 롱+숏 혼합, (3) SL 히트 시나리오

## Steps
1. 테스트 시나리오별 캔들 fixture 데이터 생성
2. 각 시나리오의 예상 결과 수동 계산 (진입가, 청산가, PnL, 메트릭)
3. 통합 테스트 작성: fixture → BacktestRunner → 결과 vs 수동 계산
4. 시나리오 1: 단순 LONG 1회 — BB4 터치 → 진입 → TP1 → 본절SL → 트레일링 청산
5. 시나리오 2: LONG+SHORT 혼합 — 2개 거래, 1 WIN + 1 LOSS
6. 시나리오 3: SL 히트 — 진입 직후 SL → LOSS
7. 메트릭 검증: 총 거래 수, 승률, PnL 합계, MDD

## Acceptance Criteria
- 3개 이상 시나리오에서 백테스트 결과가 수동 계산과 소수점 6자리까지 일치
- PnL, 승률, MDD 모두 검증
- 테스트가 CI에서 안정적으로 통과 (flaky 없음)

## Test Scenarios
- 시나리오 1 (LONG 1회 WIN): 진입가 100, TP1=105, 청산가=108 → PnL = 수동계산값과 일치
- 시나리오 2 (혼합 2회): 1 WIN(+5%) + 1 LOSS(-2%) → 승률=0.5, expectancy = 수동계산값
- 시나리오 3 (SL 히트): 진입가 100, SL=97, 체결=97 → PnL = -3% × size, result=LOSS
- 슬리피지 적용 시나리오: slippagePct=0.1 → 체결가에 반영, PnL 차이 = 수동계산값
- MDD 검증: 알려진 equity curve → MDD = 수동계산값

## Validation
```bash
bun test -- --grep "accuracy"
```

## Out of Scope
- WFO 정확성 (별도)
- 성능 벤치마크
- 라이브 대비 결과 비교 (아직 라이브 데이터 없음)
