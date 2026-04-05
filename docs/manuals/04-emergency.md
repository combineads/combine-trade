# 긴급 대응

## 4.1 Kill Switch (긴급 전체 정지)

**모든 포지션을 즉시 청산하고 거래를 중단**해야 할 때 사용합니다.

```bash
bun scripts/kill-switch.ts
```

### 실행 순서

1. 모든 거래소에서 보유 포지션 조회
2. 각 포지션에 대해 `emergencyClose` (시장가 청산) 실행
3. 모든 미체결 주문 취소
4. 전체 심볼의 `execution_mode`를 `analysis`로 변경
5. `KILL_SWITCH` 이벤트 로그 기록
6. Slack "KILL SWITCH ACTIVATED" 알림 발송

### 종료 코드

- `0`: 전체 성공
- `1`: 부분 실패 (일부 거래소 오류 — 로그에서 상세 내용 확인)

### Kill Switch 후 거래 재개

1. 원인 분석 완료
2. 필요 시 설정/코드 수정
3. `symbol_state` 테이블에서 `execution_mode`를 `alert` 또는 `live`로 변경

```sql
UPDATE symbol_state SET execution_mode = 'alert' WHERE symbol = 'BTCUSDT';
```

4. 데몬 재시작: `bun run daemon`

> **주의**: Kill Switch는 데몬과 독립적으로 실행됩니다.
> 데몬이 실행 중이든 아니든 사용할 수 있습니다.

## 4.2 데몬 크래시 복구

데몬이 비정상 종료(OOM, segfault, 강제 kill 등)된 후 재시작하면 **자동으로** 크래시 복구가 실행됩니다.

### 복구 순서

1. 모든 거래소에서 보유 포지션 조회
2. DB 티켓과 매칭
3. **매칭된 포지션**: `HAS_POSITION` 상태 복원, SL 거래소 등록 확인 (미등록 시 재등록)
4. **거래소에만 있는 포지션** (DB에 없음): **긴급 청산** (panic close)
5. **DB에만 있는 티켓** (거래소에 없음): `IDLE` 상태로 변경, 이상 로그 기록
6. 다음 1H 캔들 종가에서 WATCHING 재개

### 핵심 안전 원칙

> SL은 항상 거래소에 등록되어 있으므로, **데몬이 꺼져 있어도 포지션은 SL로 보호**됩니다.
> 단, TP와 Trailing Stop은 데몬이 실행 중일 때만 작동합니다.

## 4.3 거래소 연결 장애

### WebSocket 끊김

자동 복구 메커니즘이 작동합니다:

- **재연결**: 지수 백오프 (1s → 2s → 4s → 8s → 최대 30s)
- **갭 감지**: 마지막 캔들 타임스탬프와 예상 타임스탬프 비교
- **갭 복구**: REST API로 누락 캔들 자동 보충

로그에서 재연결 상태를 확인할 수 있습니다:

```bash
# WebSocket 재연결 이벤트 확인
cat daemon.log | jq 'select(.event == "ws_reconnect")'
```

### 거래소 API 다운

- 주문/취소 실패 시 지수 백오프로 재시도
- Reconciliation이 불일치를 감지하여 알림 발송
- 장시간 지속 시 해당 거래소 상태 페이지 확인

### 수동 대응이 필요한 경우

- 거래소 점검이 장시간 지속될 때: `execution_mode`를 `analysis`로 변경
- 특정 거래소만 문제일 때: 해당 거래소 심볼만 모드 변경

## 4.4 DB 연결 장애

| 상황 | 시스템 동작 |
|------|-----------|
| DB 미연결 < 30초 | 재시도, 정상 운영 |
| DB 미연결 >= 30초 | 신규 진입 중단 (기존 SL은 거래소에서 유지) |
| DB 복구 후 | Reconciliation 패스 실행 → 정상 거래 재개 |

### DB 장애 시 확인 사항

```bash
# PostgreSQL 상태 확인
pg_isready -h localhost -p 5432

# PostgreSQL 로그 확인
tail -f /var/log/postgresql/postgresql-18-main.log

# 연결 수 확인
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'combine_trade';"
```

## 4.5 SL 등록 실패

SL 등록은 시스템의 **가장 중요한 안전 규칙**입니다.

### SL 등록 절차

1. 진입 체결 후 **2초 이내** SL 등록 시도
2. 실패 시 최대 **3회 재시도**
3. 3회 모두 실패 시: **즉시 포지션 청산** (시장가)

### SL 실패 원인별 대응

| 원인 | 대응 |
|------|------|
| 거래소 일시 장애 | 자동 재시도 대기 |
| 잘못된 SL 가격 | 로그 확인 후 지표/신호 로직 점검 |
| API 키 권한 부족 | 거래소에서 선물 거래 권한 확인 |
| 레이트 리밋 | 자동 백오프 대기 |

## 4.6 긴급 대응 의사결정 흐름

```
이상 감지
  │
  ├─ 포지션이 보호되지 않는 상황 (SL 미등록 등)
  │   └─ Kill Switch 즉시 실행
  │
  ├─ 포지션은 보호되나 시스템 이상
  │   ├─ 특정 심볼만 문제 → 해당 심볼 analysis 모드 전환
  │   └─ 전체 시스템 문제 → 전체 analysis 모드 전환
  │
  └─ 일시적 장애 (네트워크, 거래소 점검)
      └─ 로그 모니터링하며 자동 복구 대기
```

> **원칙**: 포지션이 SL로 보호되고 있다면 즉각적인 청산보다 원인 분석을 우선하세요.
> Kill Switch는 **보호되지 않는 포지션이 존재할 때** 사용합니다.
