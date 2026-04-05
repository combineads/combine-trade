# 문제 해결

## 10.1 데몬이 시작되지 않음

| 증상 | 원인 | 해결 |
|------|------|------|
| `DB connection failed` | DATABASE_URL 잘못됨 또는 PostgreSQL 미실행 | `.env` 확인, `pg_isready` 실행 |
| `pgvector extension not found` | pgvector 미설치 | `CREATE EXTENSION vector;` 실행 |
| `Migration failed` | 스키마 불일치 | `bun run migrate` 재실행 |
| `No exchange adapters` | API 키 미설정 | `.env`에 거래소 API 키 설정 |
| `Port already in use` | 이전 프로세스 미종료 | `lsof -i :<port>` 로 확인 후 종료 |
| `Module not found` | 의존성 미설치 | `bun install` 재실행 |

### DB 연결 확인

```bash
# PostgreSQL 실행 상태
pg_isready -h localhost -p 5432

# 직접 연결 테스트
psql "$DATABASE_URL" -c "SELECT 1;"

# pgvector 확장 확인
psql "$DATABASE_URL" -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

## 10.2 주문이 실행되지 않음

| 증상 | 원인 | 해결 |
|------|------|------|
| 신호는 뜨는데 주문 안 됨 | `execution_mode = analysis` | `live`로 변경 |
| `Loss limit triggered` | 손실 한도 도달 | 다음 주기까지 대기 또는 한도 초기화 |
| `Insufficient balance` | 잔고 부족 | 거래소에서 잔고 확인 및 입금 |
| `Rate limit exceeded` | API 호출 제한 | 자동 재시도 대기 |
| `Invalid API key` | API 키 만료/변경 | 거래소에서 재발급 후 `.env` 업데이트 |
| `Margin insufficient` | 레버리지/마진 부족 | 거래소 마진 설정 확인 |
| `Economic calendar block` | 고위험 경제 이벤트로 거래 차단 | `trade_block` 확인, 이벤트 종료 대기 또는 오탐 시 수동 삭제 ([DB 관리](./08-database.md#88-트레이드-블록-조회-및-관리) 참고) |
| `Slippage abort` | 진입 시 슬리피지 초과로 주문 중단 | `SLIPPAGE` 설정 확인, 일시적 현상이면 다음 신호 대기 |

### 실행 모드 확인

```sql
SELECT symbol, execution_mode, position_state
FROM symbol_state;
```

### 손실 한도 상태 확인

```sql
-- 오늘의 거래 결과
SELECT symbol, direction, pnl_usdt, closed_at
FROM ticket
WHERE closed_at >= CURRENT_DATE
ORDER BY closed_at DESC;
```

## 10.3 WebSocket 연결 불안정

### 증상

- 캔들 데이터 갭 발생
- 빈번한 재연결 로그
- 신호 지연

### 확인 방법

```bash
# 재연결 이벤트 수 확인 (로그 파일 사용 시)
cat daemon.log | jq 'select(.event == "ws_reconnect")' | wc -l

# 최근 재연결 시각
cat daemon.log | jq 'select(.event == "ws_reconnect") | .timestamp' | tail -5
```

### 해결

| 원인 | 해결 |
|------|------|
| 네트워크 불안정 | 네트워크 연결 확인, 유선 연결 사용 |
| 거래소 점검 | 거래소 상태 페이지 확인 |
| VPN/프록시 간섭 | VPN 비활성화 또는 화이트리스트 설정 |
| DNS 문제 | DNS 서버 변경 (8.8.8.8 등) |

## 10.4 Reconciliation 불일치

### 불일치 유형

| 상태 | 의미 | 자동 대응 |
|------|------|----------|
| DB=HAS_POSITION, 거래소=없음 | 거래소에서 비정상 청산됨 | IDLE로 변경, 로그 기록 |
| DB=IDLE, 거래소=있음 | DB에 기록되지 않은 포지션 | 긴급 청산(panic close) |

### 수동 확인

```sql
-- DB의 열린 포지션 확인
SELECT symbol, exchange, position_state, execution_mode
FROM symbol_state
WHERE position_state = 'HAS_POSITION';
```

거래소 웹사이트에서도 포지션을 직접 확인하세요.

### 불일치 원인

- 수동으로 거래소에서 포지션 청산 (DB에 반영 안 됨)
- 거래소의 강제 청산 (liquidation)
- 네트워크 장애로 주문 결과가 DB에 기록되지 않음
- API 키 권한 변경

> Reconciliation 워커는 불일치 해소 시 `symbol_state.fsm_state`를 명시적으로 갱신합니다. DB에서 상태가 여전히 `HAS_POSITION`으로 남아 있다면 Reconciliation 워커가 정상 실행되지 않은 것입니다 — 데몬 로그에서 `reconciliation` 이벤트를 확인하세요.

## 10.5 성능 문제

### 파이프라인 지연 (캔들 → 주문 > 1.2초)

```bash
# 지표 연산 벤치마크
bun scripts/bench-indicators.ts
```

| 원인 | 해결 |
|------|------|
| 지표 연산 느림 | 벤치마크로 병목 식별 |
| DB 쿼리 느림 | pgvector 인덱스 상태 확인, VACUUM 실행 |
| 네트워크 지연 | 거래소 근접 서버 사용 |
| 메모리 부족 | `bun --smol` 또는 서버 RAM 증설 |

### DB 성능 확인

```sql
-- pgvector 인덱스 상태
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'trade_vector';

-- 느린 쿼리 확인 (pg_stat_statements 필요)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 테이블 VACUUM 상태
SELECT relname, last_vacuum, last_autovacuum, n_dead_tup
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

### VACUUM 실행

```sql
-- 특정 테이블
VACUUM ANALYZE candle;
VACUUM ANALYZE trade_vector;

-- 전체
VACUUM ANALYZE;
```

## 10.6 디스크 공간 부족

```bash
# 디스크 사용량 확인
df -h

# PostgreSQL 데이터 디렉토리 크기
du -sh /var/lib/postgresql/
```

### 정리 방법

1. 오래된 캔들 데이터 삭제 — [데이터베이스 관리](./08-database.md#84-캔들-데이터-관리) 참고
2. 오래된 로그 파일 삭제
3. 오래된 백업 파일 삭제
4. PostgreSQL VACUUM FULL 실행 (디스크 회수, 주의: 테이블 잠금)

```sql
-- 디스크 회수 (테이블 잠금 발생 — 데몬 정지 후 실행 권장)
VACUUM FULL candle;
```

## 10.7 API 키 관련 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| `AuthenticationError` | API 키 틀림 | `.env` 확인 |
| `PermissionDenied` | 권한 부족 | 거래소에서 선물 거래 권한 확인 |
| `IPRestricted` | IP 화이트리스트 불일치 | 거래소에서 현재 IP 추가 |
| `KeyExpired` | API 키 만료 | 거래소에서 재발급 |

### API 키 교체

```bash
# 1. 데몬 정지
kill -TERM $(pgrep -f "bun run daemon")

# 2. .env 파일에서 키 교체
vi .env

# 3. 데몬 재시작
bun run daemon
```

> 데몬 정지 중에도 SL은 거래소에서 유지됩니다.
> API 키 교체를 위한 짧은 다운타임은 안전합니다.

## 10.8 자주 묻는 질문

### 데몬이 꺼지면 포지션은 어떻게 되나요?

SL이 거래소에 등록되어 있으므로 **손절은 보호**됩니다.
다만 TP와 Trailing Stop은 작동하지 않으므로, 빠른 재시작이 필요합니다.

### Kill Switch와 데몬 정지의 차이는?

- **데몬 정지**: 포지션 유지, SL 보호, 미체결 주문 취소
- **Kill Switch**: 모든 포지션 **즉시 청산**, 모든 주문 취소, 거래 중단

### 여러 거래소를 동시에 사용할 수 있나요?

네. `.env`에 여러 거래소의 API 키를 설정하면 됩니다.
각 거래소별로 독립적으로 캔들 수집 및 주문이 실행됩니다.

### 설정 변경 후 데몬을 반드시 재시작해야 하나요?

네. 설정은 데몬 시작 시 메모리 캐시로 로드되므로,
변경 사항을 적용하려면 재시작이 필요합니다.

### WFO 실행 후 설정이 바뀌었습니다. 의도한 것인가요?

네. WFO 자동 튜닝은 최적화된 파라미터를 `common_code`에 직접 기록합니다.
영향을 받는 그룹은 `KNN`, `FEATURE_WEIGHT`, `SYMBOL_CONFIG.risk_pct`입니다.
변경 이전 값으로 되돌리려면 [WFO 자동 파라미터 업데이트 롤백 방법](./07-configuration.md#wfo-자동-파라미터-업데이트)을 참고하세요.

### 경제 캘린더가 오탐으로 24시간 거래를 막고 있습니다. 어떻게 해제하나요?

`trade_block` 테이블에서 해당 블록을 직접 삭제하면 즉시 해제됩니다.
재시작 없이 다음 사이클부터 거래가 재개됩니다.

```sql
DELETE FROM trade_block
WHERE symbol = 'BTCUSDT'
  AND reason = 'ECONOMIC_CALENDAR'
  AND blocked_until > NOW();
```

자세한 내용은 [트레이드 블록 조회 및 관리](./08-database.md#88-트레이드-블록-조회-및-관리)를 참고하세요.
