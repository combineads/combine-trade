# T-05-002 Signal, SignalDetail 테이블 Drizzle 스키마 & 마이그레이션

## Goal
`src/db/schema.ts`에 Signal과 SignalDetail 테이블 Drizzle 스키마를 추가하고 마이그레이션을 생성한다.

## Why
Evidence Gate(T-05-007)가 Signal 레코드를 생성하고 SignalDetail에 관측값을 기록한다. Signal은 WatchSession FK를 가지므로 T-05-001(WatchSession 테이블) 이후에 생성해야 한다.

## Inputs
- `docs/DATA_MODEL.md` — Signal, SignalDetail 엔티티 정의
- `src/db/schema.ts` — 기존 스키마 + T-05-001에서 추가된 watchSessionTable
- `src/core/types.ts` — Signal, SignalDetail, SignalType, VectorTimeframe, Direction, KnnDecision 타입

## Dependencies
- T-05-001 (WatchSession 테이블 — Signal.watch_session_id FK)

## Expected Outputs
- `src/db/schema.ts`에 `signalTable`, `signalDetailTable` export 추가
- `SignalRow`, `NewSignalRow`, `SignalDetailRow`, `NewSignalDetailRow` 타입 export
- `drizzle/` 폴더에 새 마이그레이션 SQL 파일

## Deliverables
- `src/db/schema.ts` — signalTable, signalDetailTable 정의 추가

## Constraints
- DATA_MODEL.md Signal/SignalDetail 정의와 정확히 일치
- Signal: FK (symbol, exchange) → Symbol RESTRICT, FK watch_session_id → WatchSession RESTRICT, FK vector_id → Vector (nullable, 이 시점에 Vector 테이블 미존재 — 마이그레이션에서 ALTER ADD FK는 T-05-003에서)
- Signal: CHECK timeframe IN ('5M','1M'), CHECK signal_type/direction/knn_decision
- Signal.knn_decision: nullable (Evidence Gate에서 null로 생성, KNN에서 업데이트)
- Signal.vector_id: nullable FK → 이 태스크에서는 컬럼만 추가, FK는 T-05-003에서 Vector 테이블 생성 후 추가
- SignalDetail: FK signal_id → Signal CASCADE, UNIQUE (signal_id, key)
- 금액 컬럼(entry_price, sl_price, value) → numeric
- DB 통합 테스트: test-db 헬퍼 사용

## Steps
1. DATA_MODEL.md에서 Signal, SignalDetail 필드/제약/인덱스 확인
2. src/db/schema.ts에 signalTable pgTable 정의 추가
3. src/db/schema.ts에 signalDetailTable pgTable 정의 추가
4. FK, CHECK, UNIQUE 제약조건 반영
5. Signal.vector_id는 uuid 컬럼으로만 추가 (FK는 T-05-003에서)
6. Row/NewRow 타입 export
7. `bunx drizzle-kit generate`로 마이그레이션 SQL 생성
8. 통합 테스트 작성
9. typecheck 통과 확인

## Acceptance Criteria
- signalTable이 DATA_MODEL.md Signal과 필드/타입/제약 일치
- signalDetailTable이 DATA_MODEL.md SignalDetail과 필드/타입/제약 일치
- Signal.watch_session_id FK → WatchSession RESTRICT 존재
- SignalDetail UNIQUE (signal_id, key) 존재
- SignalDetail.signal_id FK → Signal CASCADE 존재
- Signal.vector_id는 uuid nullable 컬럼 (FK는 미설정)
- 마이그레이션 SQL 생성
- `bun run typecheck` 통과

## Test Scenarios
- signalTable 스키마가 DATA_MODEL.md의 모든 Signal 필드를 포함 → 누락 없음
- signalDetailTable 스키마가 DATA_MODEL.md의 모든 SignalDetail 필드를 포함 → 누락 없음
- [DB] Signal FK 제약: 존재하지 않는 watch_session_id INSERT → FK 위반 에러
- [DB] Signal CHECK 제약: timeframe='15M' → CHECK 위반 에러
- [DB] Signal CHECK 제약: signal_type='INVALID' → CHECK 위반 에러
- [DB] Signal knn_decision 기본값: INSERT 시 미지정 → null
- [DB] Signal a_grade 기본값: INSERT 시 미지정 → false
- [DB] SignalDetail UNIQUE 제약: 같은 signal_id+key 중복 INSERT → 유니크 위반 에러
- [DB] SignalDetail CASCADE: Signal 삭제 시 → SignalDetail도 삭제됨
- [DB] Signal entry_price/sl_price가 numeric으로 정확히 저장/조회

## Validation
```bash
bun test -- --grep "schema-signals"
bun run typecheck
bunx drizzle-kit generate 2>&1 | tail -5
```

## Out of Scope
- Vector 테이블 및 Signal.vector_id FK (T-05-003)
- Signal 생성 로직 (T-05-007)
- SignalDetail 생성 로직 (T-05-007)
