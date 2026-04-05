# 자금 이체

수익금을 선물 지갑에서 현물 지갑으로 이체하는 기능입니다.

## 6.1 자동 이체

설정에 따라 스케줄 기반으로 자동 실행됩니다.

### 기본 설정

| 항목 | 기본값 | 설명 |
|------|--------|------|
| `transfer_enabled` | `false` | 기본 비활성 (안전 기본값) |
| `transfer_schedule` | `daily` | 매일 실행 |
| `transfer_time_utc` | `00:30` | UTC 00:30에 실행 (KST 09:30) |
| `transfer_pct` | `50` | 이체 가능 잔고의 50% |
| `min_transfer_usdt` | `10` | 최소 10 USDT 이상만 이체 |
| `reserve_multiplier` | `10` | 마진 요구량의 10배를 예비금으로 유지 |

### 자동 이체 활성화

```sql
UPDATE common_code
SET value = 'true'::jsonb
WHERE group_code = 'TRANSFER' AND code = 'transfer_enabled';
```

### 자동 이체 비활성화

```sql
UPDATE common_code
SET value = 'false'::jsonb
WHERE group_code = 'TRANSFER' AND code = 'transfer_enabled';
```

## 6.2 수동 이체

CLI 스크립트로 즉시 이체를 실행할 수 있습니다.

### 이체 시뮬레이션 (dry-run)

실제 이체 없이 이체 가능 금액을 확인합니다:

```bash
bun scripts/transfer-now.ts --dry-run
```

출력 예시:

```
[transfer-now] exchange=binance dry-run=true

[transfer-now] Dry-run result:
  walletBalance:  15000.00 USDT
  openMargin:     2000.00 USDT
  reserve:        6000.00 USDT
  dailyProfit:    500.00 USDT
  transferAmount: 250.00 USDT
  skip:           false
```

### 실제 이체 실행

```bash
# Binance (기본)
bun scripts/transfer-now.ts

# 특정 거래소 지정
bun scripts/transfer-now.ts --exchange okx
bun scripts/transfer-now.ts --exchange bitget
```

### 거래소별 dry-run

```bash
bun scripts/transfer-now.ts --exchange okx --dry-run
```

## 6.3 이체 계산 로직

```
이체 가능 금액 = (지갑 잔고 - 오픈 마진 - 예비금) × transfer_pct%

예비금 = 오픈 마진 × reserve_multiplier × risk_pct
```

### 이체 건너뛰기 조건

아래 조건 중 하나라도 해당하면 이체를 건너뜁니다:

| 조건 | 이유 |
|------|------|
| 일일 수익 < 0 | 손실 일에는 이체하지 않음 |
| 이체 가능 금액 < `min_transfer_usdt` | 최소 이체 금액 미달 |
| 사용 가능 잔고 부족 | 예비금 확보 우선 |

### 이체 설정 변경 예시

```sql
-- 이체 비율을 30%로 변경
UPDATE common_code SET value = '30'::jsonb
WHERE group_code = 'TRANSFER' AND code = 'transfer_pct';

-- 최소 이체 금액을 50 USDT로 변경
UPDATE common_code SET value = '"50"'::jsonb
WHERE group_code = 'TRANSFER' AND code = 'min_transfer_usdt';

-- 예비금 배율을 15로 변경
UPDATE common_code SET value = '15'::jsonb
WHERE group_code = 'TRANSFER' AND code = 'reserve_multiplier';

-- 이체 시간을 UTC 06:00으로 변경 (KST 15:00)
UPDATE common_code SET value = '"06:00"'::jsonb
WHERE group_code = 'TRANSFER' AND code = 'transfer_time_utc';
```

## 6.4 이체 기록

모든 이체는 `event_log` 테이블에 기록됩니다.

```sql
-- 최근 이체 기록 조회
SELECT event_type, data, created_at
FROM event_log
WHERE event_type LIKE 'TRANSFER%'
ORDER BY created_at DESC
LIMIT 10;
```

이체 완료 시 Slack으로도 알림이 발송됩니다.
