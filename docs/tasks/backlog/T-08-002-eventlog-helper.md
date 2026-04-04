# T-08-002 EventLog 저장/조회 헬퍼

## Goal
EventLog 테이블에 이벤트를 기록하고 조회하는 헬퍼 함수를 구현한다.

## Why
대조 워커, Slack 알림, 데몬 등 여러 모듈이 EventLog에 이벤트를 기록한다. 공통 헬퍼로 일관된 저장/조회 인터페이스를 제공한다.

## Inputs
- `src/db/schema.ts` — eventLogTable (T-08-001 산출물)
- `docs/DATA_MODEL.md` — EventLog event_type 규약 (10개 유형)

## Dependencies
- T-08-001 (EventLog 스키마)

## Expected Outputs
- `src/db/event-log.ts` — insertEvent(), queryEvents(), EVENT_TYPES 상수
- reconciliation worker(T-08-004)와 Slack(T-08-005)이 이 헬퍼 사용

## Deliverables
- `src/db/event-log.ts`
- `tests/db/event-log.test.ts`
- `src/db/index.ts` barrel export 업데이트 (있으면)

## Constraints
- L1 모듈 (db/) — core만 import 가능
- append-only: insertEvent만, deleteEvent 없음
- queryEvents: event_type별, symbol별, ref_type+ref_id별 필터
- 모든 타임스탬프 UTC

## Steps
1. EVENT_TYPES 상수 정의 (RECONCILIATION, CRASH_RECOVERY, SLIPPAGE_ABORT, STATE_CHANGE 등 10개)
2. `insertEvent(db, params) → EventLogRow` 구현
   - params: event_type, symbol?, exchange?, ref_id?, ref_type?, data?
3. `queryEvents(db, filters) → EventLogRow[]` 구현
   - filters: event_type?, symbol?, exchange?, ref_type?, ref_id?, since?, until?, limit?
   - ORDER BY created_at DESC
4. 테스트 작성 후 구현 (TDD)

## Acceptance Criteria
- insertEvent: 모든 필드 정확 저장, created_at 자동 설정
- queryEvents: event_type 필터 동작
- queryEvents: symbol+exchange 필터 동작
- queryEvents: ref_type+ref_id 필터 동작
- queryEvents: since/until 시간 범위 필터 동작
- queryEvents: limit 기본값 100, ORDER BY created_at DESC
- EVENT_TYPES 상수에 DATA_MODEL.md 10개 유형 포함

## Test Scenarios
- insertEvent() with all fields → row created, all fields match
- insertEvent() with minimal fields (event_type only) → success, nullables are null
- insertEvent() created_at auto-set → timestamp within last second
- queryEvents() by event_type → only matching type returned
- queryEvents() by symbol+exchange → filtered correctly
- queryEvents() by ref_type+ref_id → returns related events
- queryEvents() with since/until → time range filter works
- queryEvents() default limit 100 → returns max 100
- queryEvents() empty result → empty array (not null)
- queryEvents() ordered by created_at DESC → newest first
- EVENT_TYPES includes all 10 DATA_MODEL.md types

## Validation
```bash
bun test -- --grep "event-log"
bun run typecheck
bun run lint
```

## Out of Scope
- EventLog 삭제/아카이빙 (운영 정책)
- core/logger.ts 연동 (호출자가 logger + insertEvent 동시 호출)
