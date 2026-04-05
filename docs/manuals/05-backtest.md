# 백테스트

## 5.1 기본 사용법

```bash
bun run backtest
```

백테스트 CLI는 `src/backtest/cli.ts`를 통해 실행됩니다.

## 5.2 백테스트 원칙

### 코드 경로 동일성

백테스트는 라이브와 **동일한 코드 경로**를 사용합니다.
전략 로직에 `if (isBacktest)` 같은 분기가 존재하지 않습니다.

- `PipelineDeps` 의존성 주입(DI)으로 어댑터만 교체
- 지표 계산, 신호 판단, 포지션 사이징 로직은 100% 동일
- `MockExchangeAdapter`가 `ExchangeAdapter` 인터페이스를 완전 구현

### 선행 편향(Lookahead Bias) 방지

`MockExchangeAdapter`는 **시간 순서를 강제**합니다:

- `fetchOHLCV`는 `currentTimestamp` 이하의 캔들만 반환
- 미래 데이터에 접근할 수 없음
- 이 규칙은 코드 레벨에서 강제됨

### 데이터 저장 방식

- 개별 거래 기록: **메모리에만** 수집 (DB에 저장하지 않음)
- 집계 결과 (기대값, MDD, 승률 등): DB에 저장

## 5.3 Walk-Forward Optimization (WFO)

과적합(overfitting)을 방지하기 위해 WFO를 지원합니다.

### 기본 파라미터

| 항목 | 기본값 | 설명 |
|------|--------|------|
| In-sample 기간 | 6개월 | 최적화에 사용하는 과거 데이터 기간 |
| Out-of-sample 기간 | 2개월 | 검증에 사용하는 미래 데이터 기간 |
| 롤링 간격 | 1개월 | 윈도우 이동 간격 |

### WFO 파라미터 변경

```sql
-- In-sample 기간을 9개월로 변경
UPDATE common_code SET value = '9'::jsonb
WHERE group_code = 'WFO' AND code = 'in_sample_months';

-- Out-of-sample 기간을 3개월로 변경
UPDATE common_code SET value = '3'::jsonb
WHERE group_code = 'WFO' AND code = 'out_sample_months';
```

### 성공 기준

| 지표 | 기준 |
|------|------|
| OOS 기대값 | > 0 (양수) |
| WFO 효율성 | > 0.5 |
| MDD | 허용 범위 이내 |

> OOS(Out-of-Sample) 기대값이 음수이면 전략이 과적합되었을 가능성이 높습니다.
> WFO 효율성이 0.5 미만이면 In-sample 성과 대비 실제 성과가 너무 낮습니다.

## 5.4 백테스트 결과 해석

백테스트 완료 후 리포터가 아래 지표를 출력합니다:

| 지표 | 설명 |
|------|------|
| Total trades | 총 거래 횟수 |
| Win rate | 승률 (%) |
| Expectancy | 거래당 평균 기대 수익 |
| Max drawdown | 최대 낙폭 |
| Profit factor | 총 수익 / 총 손실 |
| Sharpe ratio | 위험 조정 수익률 |

## 5.5 캔들 데이터 준비

백테스트에는 충분한 과거 캔들 데이터가 필요합니다.

```bash
# 과거 캔들 데이터 시드
bun scripts/seed.ts
```

> 지표 계산을 위해 최소 120봉 이상의 선행 데이터가 필요합니다 (MA120 기준).
