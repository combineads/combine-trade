# T-21-001 journal-worker process bootstrap (EP21 reference pattern)

## Goal
`workers/journal-worker/src/db.ts` (JournalStorage Drizzle 구현)와 `workers/journal-worker/src/index.ts` (프로세스 부트스트랩)를 구현한다. 이 태스크는 EP21 전체의 표준 패턴을 확립한다.

## Why
journal-worker는 도메인 로직(`journal-event-handler.ts`)은 있지만 프로세스 진입점이 없다. 가장 단순한 워커(채널 1개 구독 + DB write 1개)로 EP21 표준 패턴을 확립한다.

## Inputs
- `workers/journal-worker/src/journal-event-handler.ts` — 기존 도메인 로직
- `packages/core/journal/` — JournalStorage 인터페이스
- `db/index.ts` — Drizzle 싱글턴
- `packages/shared/event-bus/` — PgEventSubscriber, PgEventPublisher
- `db/schema/trade-journals.ts` — 테이블 스키마

## Dependencies
T-18-009

## Expected Outputs
- `workers/journal-worker/src/db.ts` — JournalStorage Drizzle 구현
- `workers/journal-worker/src/index.ts` — 프로세스 부트스트랩

## Deliverables
- `workers/journal-worker/src/db.ts`:
  - `createJournalStorage(db): JournalStorage`
  - `save(journal)` → `db.insert(tradeJournals).values(journal)`
- `workers/journal-worker/src/index.ts`:
  1. `DATABASE_URL` env 검증
  2. `db` import (`db/index.ts`)
  3. `PgEventSubscriber` 생성 + `.connect()`
  4. `PgEventPublisher` 생성
  5. `JournalEventHandler(eventBus, storage).start()`
  6. SIGTERM/SIGINT → `unsubscribe()` + `subscriber.close()`
  - 시작 시 `"Journal worker started"` 출력

## Constraints
- `DATABASE_URL` 없으면 에러 출력 후 종료
- SIGTERM 5초 이내 graceful shutdown
- 하드코딩된 connection string 금지

## Steps
1. `workers/journal-worker/src/` 기존 코드 읽기
2. `JournalStorage` 인터페이스 확인
3. `db.ts` 구현
4. `index.ts` 부트스트랩 구현
5. `bun run typecheck`
6. 수동 테스트: 워커 시작 → "started" 출력 확인 → SIGTERM

## Acceptance Criteria
- `DATABASE_URL=... bun run workers/journal-worker/src/index.ts` → `"Journal worker started"` 출력
- `label_ready` 채널 구독
- SIGTERM 5초 이내 종료
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
timeout 3 bun run workers/journal-worker/src/index.ts 2>&1 | head -5 || true
```

## Out of Scope
저널 리포트 생성, LLM 레트로스펙티브, 메트릭 수집
