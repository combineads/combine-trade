# T-212 alert-worker process bootstrap

## Goal
`workers/alert-worker/src/db.ts` (5개 Drizzle 함수)와 `workers/alert-worker/src/index.ts` (기존 `startAlertWorker` 래핑 + SlackWebhookClient 와이어링)를 구현한다.

## Why
alert-worker는 `entry.ts`에 `startAlertWorker(deps)`가 있지만 프로세스 부트스트랩이 없다. 이 워커 없이는 Slack 알림이 발송되지 않는다.

## Inputs
- `workers/alert-worker/src/entry.ts` — 기존 `startAlertWorker(deps)`
- `workers/alert-worker/src/handler.ts` — AlertHandler 도메인 로직
- `packages/core/alert/` — AlertWorkerDeps 인터페이스
- `db/index.ts` — Drizzle 싱글턴
- `packages/shared/slack/` — SlackWebhookClient
- T-211 패턴 참조

## Dependencies
T-211

## Expected Outputs
- `workers/alert-worker/src/db.ts` — 5개 Drizzle 함수
- `workers/alert-worker/src/index.ts` — 프로세스 부트스트랩

## Deliverables
- `workers/alert-worker/src/db.ts`:
  - `loadExecutionMode(strategyId)`
  - `isAlertSent(eventId)`
  - `saveAlert(alert)`
  - `loadAlertContext(eventId)`
  - `loadDecisionResult(eventId)`
- `workers/alert-worker/src/index.ts`:
  - env 검증 → db → event bus → `SlackWebhookClient(SLACK_WEBHOOK_URL)` → `startAlertWorker(deps)` → SIGTERM shutdown
  - `SLACK_WEBHOOK_URL` 없으면 경고 출력 (analysis 모드에서는 불필요)

## Constraints
- T-211 패턴 그대로 적용
- `SLACK_WEBHOOK_URL` 미설정 시 경고만 출력 (종료하지 않음)

## Steps
1. `alert-worker/src/` 코드 읽기
2. `AlertWorkerDeps` 인터페이스 확인
3. `db.ts` 5개 함수 구현
4. `index.ts` 부트스트랩 구현
5. `bun run typecheck`

## Acceptance Criteria
- `"Alert worker started"` 출력
- `bun run typecheck` 통과
- SIGTERM 5초 이내 종료

## Validation
```bash
bun run typecheck
timeout 3 bun run workers/alert-worker/src/index.ts 2>&1 | head -5 || true
```

## Out of Scope
Slack 메시지 포맷팅 (handler.ts에 이미 구현), execution mode 전환 UI
