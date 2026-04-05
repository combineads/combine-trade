# 설정 관리

## 7.1 설정 구조

모든 운영 설정은 DB `common_code` 테이블에 저장됩니다.
데몬 시작 시 메모리 캐시로 로드되며, 12개 그룹으로 분류됩니다.

| 그룹 | 설명 | 조정 가능 |
|------|------|----------|
| `EXCHANGE` | 거래소 어댑터 설정 | O |
| `TIMEFRAME` | 캔들 타임프레임 | X |
| `SYMBOL_CONFIG` | 심볼별 risk_pct, max_leverage | O |
| `KNN` | top_k, min_samples, commission_pct | O |
| `POSITION` | 기본 레버리지, 최대 피라미딩 | O |
| `LOSS_LIMIT` | 손실 한도 (일일, 세션, 시간별) | O |
| `SLIPPAGE` | 스프레드/슬리피지 허용치 | O |
| `FEATURE_WEIGHT` | KNN 피처 가중치 | O |
| `TIME_DECAY` | 시간 감쇠 팩터 | O |
| `WFO` | Walk-Forward 윈도우 크기 | O |
| `ANCHOR` | **구조적 앵커 (변경 금지)** | **X** |
| `NOTIFICATION` | Slack 웹훅 설정 | O |
| `TRANSFER` | 자동 이체 설정 | O |

## 7.2 변경 불가 항목 (구조적 앵커)

아래 항목은 Double-BB 전략의 근간이므로 **절대 변경하지 마세요**.
코드에 상수로 고정되어 있으며, DB 값은 참조용입니다.

| 앵커 | 값 | 의미 |
|------|------|------|
| BB20 | length=20, stddev=2 | 외부 볼린저밴드 |
| BB4 | length=4, stddev=4 | 내부 볼린저밴드 |
| MA 기간 | 20, 60, 120 | 이동평균선 기간 |
| 정규화 | min-max | 벡터 정규화 방법 |
| 벡터 차원 | 202 | KNN 피처 벡터 크기 |

## 7.3 설정 조회

```sql
-- 전체 설정 조회
SELECT group_code, code, value, description
FROM common_code
WHERE is_active = true
ORDER BY group_code, sort_order;

-- 특정 그룹 조회
SELECT code, value, description
FROM common_code
WHERE group_code = 'SYMBOL_CONFIG' AND is_active = true
ORDER BY sort_order;
```

## 7.4 주요 설정 변경 예시

### 리스크 관리

```sql
-- BTCUSDT 리스크 비율 변경 (3% → 1%)
UPDATE common_code
SET value = '{"risk_pct": "0.01", "max_leverage": 38}'::jsonb
WHERE group_code = 'SYMBOL_CONFIG' AND code = 'BTCUSDT';

-- 일일 최대 손실 한도 변경 (10% → 5%)
UPDATE common_code
SET value = '"0.05"'::jsonb
WHERE group_code = 'LOSS_LIMIT' AND code = 'max_daily_loss_pct';

-- 세션 연속 손실 한도 변경 (3회 → 2회)
UPDATE common_code
SET value = '2'::jsonb
WHERE group_code = 'LOSS_LIMIT' AND code = 'max_session_losses';
```

### KNN 파라미터

```sql
-- KNN 이웃 수 변경 (50 → 30)
UPDATE common_code
SET value = '30'::jsonb
WHERE group_code = 'KNN' AND code = 'top_k';

-- 최소 샘플 수 변경 (30 → 50)
UPDATE common_code
SET value = '50'::jsonb
WHERE group_code = 'KNN' AND code = 'min_samples';

-- 수수료율 변경
UPDATE common_code
SET value = '0.001'::jsonb
WHERE group_code = 'KNN' AND code = 'commission_pct';
```

### 포지션 파라미터

```sql
-- 기본 레버리지 변경 (20x → 10x)
UPDATE common_code
SET value = '10'::jsonb
WHERE group_code = 'POSITION' AND code = 'default_leverage';

-- 최대 피라미딩 횟수 변경 (2 → 1)
UPDATE common_code
SET value = '1'::jsonb
WHERE group_code = 'POSITION' AND code = 'max_pyramid_count';
```

### 슬리피지 허용치

```sql
-- 최대 스프레드 허용 (5% → 3%)
UPDATE common_code
SET value = '"0.03"'::jsonb
WHERE group_code = 'SLIPPAGE' AND code = 'max_spread_pct';
```

### KNN 피처 가중치

```sql
-- BB4 포지션 가중치 변경 (2.0 → 2.5)
UPDATE common_code
SET value = '2.5'::jsonb
WHERE group_code = 'FEATURE_WEIGHT' AND code = 'bb4_position';
```

### 시간 감쇠 팩터

KNN이 과거 패턴을 참조할 때, 오래된 데이터일수록 가중치를 낮추는 설정입니다.
1.0이면 100% 반영, 0.3이면 30%만 반영합니다.

```sql
-- 기본 감쇠 설정:
-- 1개월 이내: 1.0 (100% 반영)
-- 1~3개월:   0.8 (80% 반영)
-- 3~6개월:   0.6 (60% 반영)
-- 6~12개월:  0.3 (30% 반영)

-- 3개월 이내 데이터 감쇠 변경 (0.8 → 0.9)
UPDATE common_code
SET value = '0.9'::jsonb
WHERE group_code = 'TIME_DECAY' AND code = '3_months';
```

### WFO 파라미터

WFO(Walk-Forward Optimization)의 학습/검증 윈도우 크기를 설정합니다.
WFO에 대한 상세 설명은 [백테스트 매뉴얼](./05-backtest.md#54-wfo-walk-forward-optimization-상세)을 참고하세요.

```sql
-- In-sample(학습) 기간 변경 (6개월 → 9개월)
-- 늘리면: 학습 데이터가 많아져 안정적이지만, 최근 시장 변화에 둔감
UPDATE common_code SET value = '9'::jsonb
WHERE group_code = 'WFO' AND code = 'in_sample_months';

-- Out-of-sample(검증) 기간 변경 (2개월 → 3개월)
-- 늘리면: 검증이 더 엄격해지지만, 윈도우 수가 줄어듦
UPDATE common_code SET value = '3'::jsonb
WHERE group_code = 'WFO' AND code = 'out_sample_months';

-- 롤링 간격 변경 (1개월 → 2개월)
-- 늘리면: 윈도우 수가 줄어 실행이 빨라지지만, 검증 해상도가 낮아짐
UPDATE common_code SET value = '2'::jsonb
WHERE group_code = 'WFO' AND code = 'roll_months';
```

## 7.5 설정 변경 적용

> 설정 변경 후 **데몬을 재시작**하면 새 설정이 메모리 캐시에 로드됩니다.
>
> ```bash
> # 데몬 재시작
> kill -TERM $(pgrep -f "bun run daemon")
> bun run daemon
> ```

## 7.6 설정 초기화

시드 스크립트는 `ON CONFLICT DO NOTHING`으로 동작하므로,
기존 값을 덮어쓰지 않습니다.

설정을 초기값으로 되돌리려면:

```sql
-- 특정 설정 삭제 후 시드 재실행
DELETE FROM common_code WHERE group_code = 'KNN';
```

```bash
bun run seed
```

전체 초기화:

```sql
DELETE FROM common_code;
```

```bash
bun run seed
```
