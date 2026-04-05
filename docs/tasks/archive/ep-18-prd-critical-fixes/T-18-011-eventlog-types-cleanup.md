# T-18-011 EventLog EVENT_TYPES 비규약 타입 정리

## Metadata
- modules: [db, daemon]
- primary: db

## Goal
pipeline.ts에서 사용 중인 비규약 이벤트 타입(PIPELINE_LATENCY, DAILY_BIAS_MISMATCH)을 EVENT_TYPES 상수에 추가한다.

## Why
event_log.ts의 EVENT_TYPES 상수 목록에 없는 타입이 pipeline에서 사용됨. 컬럼이 string이라 런타임 에러는 없지만 DATA_MODEL.md의 이벤트 타입 계약 위반.

## Inputs
- src/db/event-log.ts:11-22 (EVENT_TYPES)
- src/daemon/pipeline.ts (PIPELINE_LATENCY, DAILY_BIAS_MISMATCH 사용처)

## Dependencies
- 없음

## Expected Outputs
- 갱신된 EVENT_TYPES 상수

## Deliverables
- event-log.ts EVENT_TYPES에 PIPELINE_LATENCY, DAILY_BIAS_MISMATCH 추가
- 필요시 TRANSFER_SUCCESS, TRANSFER_FAILED, TRANSFER_SKIP도 추가 (PRD §7.26 규약)

## Constraints
- 기존 이벤트 타입 제거 금지
- append-only 정책 유지

## Steps
1. event-log.ts 읽기
2. pipeline.ts에서 insertEvent 호출부 grep
3. 누락된 타입을 EVENT_TYPES에 추가
4. typecheck 확인

## Acceptance Criteria
- [ ] PIPELINE_LATENCY가 EVENT_TYPES에 포함
- [ ] DAILY_BIAS_MISMATCH가 EVENT_TYPES에 포함

## Test Scenarios
N/A — constant definition update

## Validation
```bash
bun run typecheck
```

## Out of Scope
- event_type 컬럼을 enum으로 변경
- EventLog 쿼리 변경
