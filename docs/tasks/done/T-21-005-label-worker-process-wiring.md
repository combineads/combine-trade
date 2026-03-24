# T-21-005 label-worker process bootstrap

## Goal
`workers/label-worker/src/db.ts` (LabelScanner deps Drizzle 구현)와 `workers/label-worker/src/index.ts` (LISTEN `strategy_event_created` + 시작 시 catch-up poll)를 구현한다.

## Why
label-worker는 전략 이벤트에 WIN/LOSS/TIME_EXIT 라벨을 붙이는 핵심 워커다. 이 워커 없이는 벡터에 라벨이 없어 kNN 통계 산출이 불가능하다. 다운타임 중 누락된 이벤트를 복구하는 catch-up 로직이 필요하다.

## Inputs
- `workers/label-worker/src/scanner.ts` — 기존 LabelScanner 도메인 로직
- `packages/core/label/` — LabelScannerDeps 인터페이스
- `db/index.ts` — Drizzle 싱글턴
- T-21-001 패턴 참조

## Dependencies
T-21-001

## Expected Outputs
- `workers/label-worker/src/db.ts` — 4개 Drizzle 함수
- `workers/label-worker/src/index.ts` — LISTEN + catch-up poll

## Deliverables
- `workers/label-worker/src/db.ts`:
  - `findUnlabeledEvents(limit: number)`
  - `findCandlesForward(symbol, timeframe, fromTime, count)`
  - `saveLabel(eventId, label)`
  - `createPublisher()`
- `workers/label-worker/src/index.ts`:
  - 시작 시: `findUnlabeledEvents` → 누락 이벤트 처리 (catch-up)
  - LISTEN `strategy_event_created` → `LabelScanner.scan()`
  - SIGTERM shutdown

## Constraints
- 중복 라벨 처리 없음 (멱등성 — 이미 라벨 있으면 스킵)
- catch-up poll은 시작 시 1회만 실행

## Steps
1. `label-worker/src/scanner.ts` + `LabelScannerDeps` 읽기
2. `db.ts` 4개 함수 구현
3. `index.ts` (LISTEN + catch-up) 구현
4. `bun run typecheck`

## Acceptance Criteria
- `"Label worker started"` 출력
- `strategy_event_created` 채널 구독
- `bun run typecheck` 통과
- SIGTERM 5초 이내 종료

## Validation
```bash
bun run typecheck
timeout 3 bun run workers/label-worker/src/index.ts 2>&1 | head -5 || true
```

## Out of Scope
라벨 재계산 (EP05-M4), 라벨 통계 API
