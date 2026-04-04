# T-05-001 TradeBlock, WatchSession 테이블 Drizzle 스키마 & 마이그레이션

## Goal
`src/db/schema.ts`에 TradeBlock과 WatchSession 테이블 Drizzle 스키마를 추가하고 마이그레이션을 생성한다.

## Why
EP-05의 필터/시그널 도메인 기반 테이블. T-05-005(거래차단)가 TradeBlock 테이블에, T-05-006(WATCHING)이 WatchSession 테이블에 의존한다. FK 의존성상 이 두 테이블이 Signal보다 먼저 존재해야 한다 (Signal.watch_session_id → WatchSession).

## Inputs
- `docs/DATA_MODEL.md` — TradeBlock, WatchSession 엔티티 정의
- `src/db/schema.ts` — 기존 Symbol/SymbolState/CommonCode/Candle 스키마
- `src/core/types.ts` — TradeBlock, WatchSession, BlockType, DetectionType, Direction 타입

## Dependencies
- 없음 (EP-01 foundation 완료 전제)

## Expected Outputs
- `src/db/schema.ts`에 `tradeBlockTable`, `watchSessionTable` export 추가
- `TradeBlockRow`, `NewTradeBlockRow`, `WatchSessionRow`, `NewWatchSessionRow` 타입 export
- `drizzle/` 폴더에 새 마이그레이션 SQL 파일

## Deliverables
- `src/db/schema.ts` — tradeBlockTable, watchSessionTable 정의 추가

## Constraints
- DATA_MODEL.md의 TradeBlock, WatchSession 엔티티와 정확히 일치
- TradeBlock: CHECK block_type IN ('ECONOMIC','FUNDING','MANUAL','MARKET_OPEN'), jsonb 컬럼(recurrence_rule, source_data)
- WatchSession: FK (symbol, exchange) → Symbol RESTRICT, CHECK detection_type/direction, partial index (invalidated_at IS NULL)
- WatchSession 활성 세션 제약: 심볼×거래소당 invalidated_at IS NULL인 행 최대 1개 (부분 유니크 인덱스)
- 금액 컬럼(tp1_price, tp2_price) → numeric (float 금지)
- `drizzle-kit generate`로 마이그레이션 생성
- DB 통합 테스트: test-db 헬퍼 사용

## Steps
1. DATA_MODEL.md에서 TradeBlock, WatchSession 필드/제약/인덱스 확인
2. src/db/schema.ts에 tradeBlockTable pgTable 정의 추가
3. src/db/schema.ts에 watchSessionTable pgTable 정의 추가
4. FK, CHECK, 인덱스 제약조건 반영 (WatchSession 활성 세션 부분 유니크 인덱스 포함)
5. Row/NewRow 타입 export
6. `bunx drizzle-kit generate`로 마이그레이션 SQL 생성
7. 통합 테스트 작성: 테이블 생성 확인, CHECK/FK/UNIQUE 제약 동작 검증
8. typecheck 통과 확인

## Acceptance Criteria
- tradeBlockTable이 DATA_MODEL.md TradeBlock과 필드/타입/제약 일치
- watchSessionTable이 DATA_MODEL.md WatchSession과 필드/타입/제약 일치
- WatchSession 부분 유니크 인덱스: (symbol, exchange) WHERE invalidated_at IS NULL
- 마이그레이션 SQL이 drizzle/ 폴더에 생성
- `bun run typecheck` 통과
- DB 통합 테스트 통과

## Test Scenarios
- tradeBlockTable 스키마가 DATA_MODEL.md의 모든 TradeBlock 필드를 포함 → 누락 없음
- watchSessionTable 스키마가 DATA_MODEL.md의 모든 WatchSession 필드를 포함 → 누락 없음
- [DB] TradeBlock CHECK 제약: block_type='INVALID' INSERT → CHECK 위반 에러
- [DB] TradeBlock is_recurring 기본값: INSERT 시 미지정 → false
- [DB] WatchSession FK 제약: 존재하지 않는 symbol/exchange INSERT → FK 위반 에러
- [DB] WatchSession CHECK 제약: detection_type='INVALID' → CHECK 위반 에러
- [DB] WatchSession CHECK 제약: direction='INVALID' → CHECK 위반 에러
- [DB] WatchSession 부분 유니크: 같은 symbol+exchange에서 활성 세션 2개 INSERT → 유니크 위반 에러
- [DB] WatchSession 부분 유니크: 같은 symbol+exchange에서 비활성(invalidated_at != null) 여러 행 → 허용
- [DB] WatchSession tp1_price/tp2_price가 numeric 타입으로 저장/조회 정상

## Validation
```bash
bun test -- --grep "schema-filters"
bun run typecheck
bunx drizzle-kit generate 2>&1 | tail -5
```

## Out of Scope
- Signal, SignalDetail 테이블 (T-05-002)
- Vector 테이블 (T-05-003)
- TradeBlock 시드 데이터 (T-05-005에서 처리)
