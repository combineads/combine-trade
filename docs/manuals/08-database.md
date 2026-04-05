# 데이터베이스 관리

## 8.1 주요 테이블

| 테이블 | 용도 | 분류 |
|--------|------|------|
| `common_code` | 시스템 설정 (CommonCode) | Reference |
| `symbol_state` | 심볼별 상태 (execution_mode, FSM 상태) | Master |
| `candle` | OHLCV 캔들 데이터 | Transaction |
| `ticket` | 거래 티켓 (포지션 라이프사이클) | Transaction |
| `order` | 주문 기록 | Transaction |
| `trade_vector` | 202차원 피처 벡터 (pgvector) | Transaction |
| `event_log` | 시스템 이벤트 로그 | Transaction |
| `trade_block` | 거래 차단 기록 (슬리피지, 경제 캘린더 등) | Transaction |

> 분류는 MRT(Master/Reference/Transaction) 기준입니다.
> 상세 데이터 모델은 [DATA_MODEL.md](../DATA_MODEL.md)를 참고하세요.

## 8.2 마이그레이션

### 마이그레이션 실행

```bash
bun run migrate
```

Drizzle ORM 기반으로, `drizzle/` 디렉토리의 SQL 파일을 순차 적용합니다.

### 새 마이그레이션 생성

스키마(`src/db/schema.ts`)를 수정한 후:

```bash
# 마이그레이션 SQL 자동 생성
bunx drizzle-kit generate

# 생성된 파일 확인
ls drizzle/

# 마이그레이션 적용
bun run migrate
```

## 8.3 백업

### 전체 백업

```bash
# 전체 DB 백업
pg_dump combine_trade > backup_$(date +%Y%m%d_%H%M%S).sql

# 압축 백업
pg_dump combine_trade | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### 부분 백업

```bash
# 설정만 백업
pg_dump combine_trade -t common_code > config_backup.sql

# 거래 기록만 백업
pg_dump combine_trade -t ticket -t order > trades_backup.sql

# 캔들 데이터 제외 백업 (캔들은 거래소에서 재수집 가능)
pg_dump combine_trade --exclude-table=candle > backup_no_candles.sql
```

### 복원

```bash
# 전체 복원
psql combine_trade < backup_20260405_120000.sql

# 압축 파일 복원
gunzip -c backup_20260405_120000.sql.gz | psql combine_trade
```

### 백업 권장 주기

| 대상 | 주기 | 이유 |
|------|------|------|
| 전체 DB | 주 1회 | 재해 복구 |
| `common_code` | 설정 변경 전 | 롤백 대비 |
| `ticket` + `order` | 일 1회 | 거래 기록 보존 |
| `candle` | 불필요 | 거래소에서 재수집 가능 |

## 8.4 캔들 데이터 관리

캔들 데이터는 시간이 지나면 용량이 커집니다.
1분봉 데이터는 특히 증가가 빠르므로 주기적 정리가 필요합니다.

### 데이터 크기 확인

```sql
-- 테이블별 크기 확인
SELECT
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS data_size,
  pg_size_pretty(pg_indexes_size(relid)) AS index_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- 캔들 테이블 타임프레임별 행 수
SELECT timeframe, count(*) AS row_count
FROM candle
GROUP BY timeframe
ORDER BY row_count DESC;
```

### 오래된 데이터 정리

```sql
-- 6개월 이전 1분봉 삭제 (1D/1H/5M은 보관)
DELETE FROM candle
WHERE timeframe = '1M'
AND timestamp < NOW() - INTERVAL '6 months';

-- 3개월 이전 5분봉 삭제
DELETE FROM candle
WHERE timeframe = '5M'
AND timestamp < NOW() - INTERVAL '3 months';

-- 정리 후 테이블 VACUUM
VACUUM ANALYZE candle;
```

### 캔들 보관 권장 기간

| 타임프레임 | 권장 보관 기간 | 이유 |
|-----------|-------------|------|
| 1D | 무기한 | 용량 적음, 방향 필터 참조 |
| 1H | 2년 이상 | KNN 과거 패턴 참조 |
| 5M | 3~6개월 | 진입 신호 검증 |
| 1M | 1~3개월 | 주문 실행 정밀도 |

## 8.5 pgvector 인덱스 관리

KNN 검색 성능을 위해 `trade_vector` 테이블에 HNSW 인덱스가 사용됩니다.

```sql
-- pgvector 인덱스 상태 확인
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'trade_vector';

-- 벡터 테이블 행 수 확인
SELECT count(*) FROM trade_vector;
```

> 벡터 데이터가 크게 증가한 경우 인덱스를 재구축할 수 있습니다:
>
> ```sql
> REINDEX INDEX trade_vector_embedding_idx;
> ```

## 8.6 연결 풀 모니터링

```sql
-- 활성 연결 확인
SELECT
  pid, usename, application_name, client_addr,
  state, query_start, query
FROM pg_stat_activity
WHERE datname = 'combine_trade'
ORDER BY query_start DESC;

-- 유휴 연결 수
SELECT state, count(*)
FROM pg_stat_activity
WHERE datname = 'combine_trade'
GROUP BY state;
```

## 8.7 이벤트 로그 조회

```sql
-- 최근 이벤트 10건
SELECT event_type, data, created_at
FROM event_log
ORDER BY created_at DESC
LIMIT 10;

-- 특정 이벤트 타입 조회
SELECT data, created_at
FROM event_log
WHERE event_type = 'KILL_SWITCH'
ORDER BY created_at DESC;

-- 슬리피지 관련 이벤트 조회
SELECT event_type, data, created_at
FROM event_log
WHERE event_type IN ('SLIPPAGE_ABORT', 'SLIPPAGE_CLOSE')
ORDER BY created_at DESC
LIMIT 20;

-- 경제 캘린더 필터 실패 이벤트 조회
SELECT data, created_at
FROM event_log
WHERE event_type = 'ECONOMIC_CALENDAR_FAILED'
ORDER BY created_at DESC
LIMIT 20;

-- 특정 날짜 이벤트
SELECT event_type, data, created_at
FROM event_log
WHERE created_at >= '2026-04-05'
AND created_at < '2026-04-06'
ORDER BY created_at;
```

## 8.8 트레이드 블록 조회 및 관리

`trade_block` 테이블은 슬리피지 이상, 경제 캘린더 이벤트 등으로 인한 일시적 거래 차단 기록을 보관합니다.

### 활성 블록 조회

```sql
-- 현재 유효한 차단 목록
SELECT symbol, exchange, reason, blocked_until, created_at
FROM trade_block
WHERE blocked_until > NOW()
ORDER BY blocked_until DESC;

-- 차단 원인별 집계
SELECT reason, count(*) AS cnt, max(blocked_until) AS latest_expiry
FROM trade_block
WHERE blocked_until > NOW()
GROUP BY reason
ORDER BY cnt DESC;
```

### 오탐(false-positive) 24시간 블록 삭제

경제 캘린더가 오탐으로 24시간 블록을 걸었을 경우, 수동으로 해제할 수 있습니다.

```sql
-- 특정 심볼의 경제 캘린더 블록 삭제
DELETE FROM trade_block
WHERE symbol = 'BTCUSDT'
  AND reason = 'ECONOMIC_CALENDAR'
  AND blocked_until > NOW();

-- 전체 경제 캘린더 블록 삭제 (전체 심볼)
DELETE FROM trade_block
WHERE reason = 'ECONOMIC_CALENDAR'
  AND blocked_until > NOW();
```

> 삭제 후 데몬이 다음 사이클에 자동으로 거래를 재개합니다. 재시작은 필요하지 않습니다.
