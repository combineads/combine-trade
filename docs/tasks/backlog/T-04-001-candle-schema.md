# T-04-001 Candle 테이블 Drizzle 스키마 & 마이그레이션

## Goal
`src/db/schema.ts`에 Candle 테이블 Drizzle 스키마를 추가하고 마이그레이션을 생성한다.

## Why
EP-04의 모든 후속 태스크(히스토리 로더, 수집기, 갭 복구)가 Candle 테이블에 의존한다. EP-01에서는 Master/Reference 테이블만 생성했으므로, 첫 Transaction 테이블인 Candle을 이 태스크에서 추가한다.

## Inputs
- `docs/DATA_MODEL.md` — Candle 엔티티 정의, 인덱스 전략
- `src/db/schema.ts` — 기존 Symbol/SymbolState/CommonCode 스키마
- `src/core/types.ts` — `Candle` 타입 (이미 정의됨)
- `drizzle/0000_dark_stardust.sql` — 기존 마이그레이션

## Dependencies
- T-04-000 (DB 테스트 인프라)

## Expected Outputs
- `src/db/schema.ts`에 `candleTable` export 추가
- `CandleRow`, `NewCandleRow` 타입 export
- `drizzle/` 폴더에 새 마이그레이션 SQL 파일 생성

## Deliverables
- `src/db/schema.ts` — candleTable 정의 추가

## Constraints
- DATA_MODEL.md의 Candle 엔티티와 정확히 일치해야 함
- 금액/가격 컬럼은 반드시 `numeric` 타입 (float 금지)
- FK: (symbol, exchange) → Symbol 테이블 (RESTRICT)
- UNIQUE: (symbol, exchange, timeframe, open_time)
- CHECK: timeframe IN ('1D', '1H', '5M', '1M')
- 인덱스: (symbol, exchange, timeframe, open_time DESC) — 최근 캔들 조회용
- `drizzle-kit generate`로 마이그레이션 생성
- 통합 테스트: test-db 헬퍼로 실제 PostgreSQL에서 마이그레이션 실행 및 제약조건 검증

## Steps
1. `docs/DATA_MODEL.md`에서 Candle 엔티티 필드, 제약조건, 인덱스 확인
2. `src/db/schema.ts`에 `candleTable` pgTable 정의 추가
3. FK, UNIQUE, CHECK, 인덱스 제약조건 모두 반영
4. `CandleRow`, `NewCandleRow` 타입 export
5. `bunx drizzle-kit generate` 실행하여 마이그레이션 SQL 생성
6. 생성된 SQL 파일 검토 — CREATE TABLE, 인덱스, 제약조건 확인
7. 통합 테스트 작성 (test-db 헬퍼): 실제 DB에 마이그레이션 실행 → candles 테이블 생성 확인 → 제약조건 동작 검증
8. typecheck 통과 확인

## Acceptance Criteria
- candleTable이 DATA_MODEL.md Candle 엔티티와 필드/타입/제약조건 일치
- UNIQUE (symbol, exchange, timeframe, open_time) 제약 존재
- FK (symbol, exchange) → Symbol 테이블 RESTRICT 존재
- CHECK timeframe IN ('1D', '1H', '5M', '1M') 존재
- 가격 컬럼(open, high, low, close, volume)이 모두 numeric 타입
- 마이그레이션 SQL 파일이 drizzle/ 폴더에 생성됨
- `bun run typecheck` 통과

## Test Scenarios
- candleTable 스키마 정의가 모든 DATA_MODEL.md 필드를 포함하는지 확인 → 누락 없음
- UNIQUE 제약: 동일 (symbol, exchange, timeframe, open_time) 중복 삽입 시 → DB 에러
- FK 제약: 존재하지 않는 symbol/exchange 조합으로 삽입 시 → FK 위반 에러
- CHECK 제약: 잘못된 timeframe ('15M') 삽입 시 → CHECK 위반 에러
- is_closed 기본값: 삽입 시 is_closed 미지정 → false로 설정됨
- CandleRow/NewCandleRow 타입이 core/types.ts의 Candle 타입과 호환
- [DB] 마이그레이션 실행 → 실제 PostgreSQL에서 candles 테이블 생성됨
- [DB] UNIQUE 제약: 동일 (symbol, exchange, timeframe, open_time) INSERT 2회 → 중복 에러
- [DB] FK 제약: 존재하지 않는 symbol/exchange INSERT → FK 위반 에러
- [DB] CHECK 제약: timeframe='15M' INSERT → CHECK 위반 에러
- [DB] is_closed 기본값: INSERT 시 미지정 → DB에서 false로 저장 확인

## Validation
```bash
bun test -- --grep "candle-schema"
bun run typecheck
bunx drizzle-kit generate 2>&1 | tail -5
ls drizzle/*.sql | wc -l  # 2개 이상 (기존 + 새 마이그레이션)
```

## Out of Scope
- Candle 데이터 삽입/조회 로직 (T-04-003)
- 다른 Transaction 테이블 (WatchSession, Signal 등은 해당 에픽에서)
