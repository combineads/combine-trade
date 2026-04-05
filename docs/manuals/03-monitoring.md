# 모니터링 및 알림

## 3.1 Slack 알림

시스템은 아래 이벤트 발생 시 Slack으로 알림을 보냅니다:

| 이벤트 | 알림 내용 |
|--------|----------|
| 진입 신호 | 심볼, 방향, 가격, KNN 결과 |
| 포지션 오픈 | 진입 가격, 레버리지, 사이즈 |
| 포지션 클로즈 | 청산 가격, PnL, 청산 사유 |
| SL 등록 | SL 가격, 거래소 주문 ID |
| 손실 한도 트리거 | 일일/세션/시간 한도 도달 상세 |
| Reconciliation 불일치 | DB↔거래소 상태 불일치 상세 |
| 데몬 시작 | 시작 시각, 크래시 복구 결과 |
| 데몬 종료 | 종료 시각, 종료 사유 |
| Kill Switch 발동 | 청산 포지션 수, 취소 주문 수 |
| 이체 완료 | 이체 금액, 잔고 변동 |
| KPI 경고 | MDD, 연속 손실, 기대값 음수 전환 |

### Slack 설정

1. Slack 워크스페이스에서 Incoming Webhook 생성
2. `.env`에 웹훅 URL 설정:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
```

3. DB에서 알림 활성화:

```sql
UPDATE common_code
SET value = '{"webhook_url": "https://hooks.slack.com/services/...", "channel": "#trading-alerts", "enabled": true}'::jsonb
WHERE group_code = 'NOTIFICATION' AND code = 'slack_webhook';
```

## 3.2 KPI 자동 감시

시스템이 자동으로 감시하는 핵심 지표:

| KPI | 경고 임계값 | 확인 주기 | Slack 메시지 |
|-----|-----------|----------|-------------|
| MDD (최대 낙폭) | > 10% | 1시간 | `⚠️ MDD {pct}% — 10% 초과` |
| 연속 손실 | 역대 최대 갱신 시 | 티켓 종료 시 | `⚠️ 전략 점검 필요: 연속 {n}회 손실 (역대 최대)` |
| 최근 30건 기대값 | 음수 전환 시 | 티켓 종료 시 | `⚠️ 최근 30건 expectancy 음수 전환: {value}` |
| Reconciliation 일치율 | < 99% | Reconciliation 후 | `⚠️ Reconciliation 일치율 {pct}%` |

### KPI 경고 시 대응

- **MDD > 10%**: 전략 점검 필요. `alert` 모드로 전환 고려.
- **연속 손실 역대 최대**: 시장 환경 변화 가능성. 백테스트 재검증.
- **기대값 음수 전환**: 직근 30건 기준이므로 일시적일 수 있으나, 지속 시 거래 중단 고려.
- **Reconciliation < 99%**: 즉시 원인 확인. [긴급 대응](./04-emergency.md) 참고.

## 3.3 로그 형식

로그는 JSON Lines 형식으로 stdout에 출력됩니다:

```json
{
  "timestamp": "2026-04-05T12:00:00.123Z",
  "level": "info",
  "module": "daemon",
  "event": "candle_close",
  "symbol": "BTCUSDT",
  "exchange": "binance",
  "details": { "timeframe": "1H" }
}
```

### 로그 필드

| 필드 | 설명 |
|------|------|
| `timestamp` | ISO 8601 타임스탬프 (밀리초 포함) |
| `level` | `debug`, `info`, `warn`, `error` |
| `module` | 소스 모듈 (daemon, reconciliation, orders 등) |
| `symbol` | 거래 심볼 (해당 시) |
| `exchange` | 거래소 (해당 시) |
| `event` | 이벤트 이름 |
| `details` | 추가 데이터 (객체) |

### 반드시 기록되는 이벤트

- 주문 실행 (진입, SL, TP, 청산)
- SL 등록/수정
- Reconciliation 불일치
- 크래시 복구 결과
- WebSocket 연결/재연결/해제
- 손실 한도 트리거
- Kill Switch 발동

### 로그 레벨 설정

```bash
# .env에서 설정
LOG_LEVEL=info    # 기본값 — 운영에 필요한 정보
LOG_LEVEL=debug   # 디버깅 — 파이프라인 상세 포함, 매우 상세
LOG_LEVEL=warn    # 경고/에러만 — 조용한 운영
LOG_LEVEL=error   # 에러만
```

### 로그 검색 예시

```bash
# 특정 심볼의 주문 이벤트 필터링
cat daemon.log | jq 'select(.module == "orders" and .symbol == "BTCUSDT")'

# 에러 로그만 보기
cat daemon.log | jq 'select(.level == "error")'

# Reconciliation 불일치 확인
cat daemon.log | jq 'select(.module == "reconciliation" and .level == "warn")'

# 특정 시간대 로그
cat daemon.log | jq 'select(.timestamp >= "2026-04-05T09:00:00" and .timestamp <= "2026-04-05T10:00:00")'
```

## 3.4 웹 대시보드

데몬 실행 시 API 서버가 함께 시작되며, 웹 UI를 통해 아래 정보를 확인할 수 있습니다:

- 실시간 포지션 상태
- 거래 내역
- 계좌 잔고
- 시스템 상태

웹 UI는 3~5초 주기로 폴링하여 데이터를 갱신합니다.
