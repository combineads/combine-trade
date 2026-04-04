# T-08-005 Slack 웹훅 알림

## Goal
Slack 웹훅으로 거래/운영 이벤트를 알림하는 클라이언트와 이벤트별 메시지 템플릿을 구현한다.

## Why
단일 운영자가 24/7 모니터링할 수 없으므로, 중요 이벤트(주문 체결, SL 실패, 대조 불일치, 손실 제한)를 Slack으로 즉시 알림해야 한다. 웹훅 실패가 트레이딩을 방해하면 안 되므로 fire-and-forget 방식으로 구현한다.

## Inputs
- `src/core/logger.ts` — createLogger() (로컬 로그 fallback)
- `docs/ARCHITECTURE.md` — notifications L7
- `docs/DATA_MODEL.md` — CommonCode NOTIFICATION 그룹

## Dependencies
- 없음 (EP-01 core만 사용, EventLog와 독립)

## Expected Outputs
- `src/notifications/slack.ts` — sendSlackAlert(), SlackEventType, 메시지 템플릿
- 대조 워커(T-08-004)와 데몬(EP-09)이 이 함수 호출

## Deliverables
- `src/notifications/slack.ts`
- `tests/notifications/slack.test.ts`
- `src/notifications/index.ts` barrel export 업데이트

## Constraints
- **fire-and-forget**: 웹훅 실패 시 로컬 로그만, 에러 throw 금지
- 웹훅 URL: `process.env.SLACK_WEBHOOK_URL` 우선, CommonCode NOTIFICATION.slack_webhook_url fallback
- URL 미설정 시 로그만 남기고 조용히 반환 (비활성화 허용)
- Slack Block Kit 형식 메시지
- 각 이벤트 유형별 색상: 성공=green, 경고=orange, 위험=red

## Steps
1. SlackEventType enum 정의 (ORDER_FILLED, SL_REGISTERED, SL_FAILED, RECONCILIATION_MISMATCH, LOSS_LIMIT_HIT, DAEMON_START, DAEMON_STOP, CRASH_RECOVERY)
2. `getWebhookUrl(db?) → string | null` — env 우선, DB fallback
3. `formatMessage(eventType, details) → SlackPayload` — Block Kit 형식
   - header: 이벤트 유형 + 이모지
   - fields: symbol, exchange, price, size 등 상세
   - color: 유형별 (green/orange/red)
   - timestamp
4. `sendSlackAlert(eventType, details, db?) → void` (fire-and-forget)
   - URL 없으면 로그만 반환
   - fetch(url, { method: 'POST', body: JSON.stringify(payload) })
   - 에러 시 catch → 로컬 로그, 절대 throw 안 함
5. 테스트 작성 후 구현 (TDD) — fetch mock

## Acceptance Criteria
- 웹훅 URL env 우선, DB fallback
- URL 미설정 → 조용히 반환 (에러 없음)
- 웹훅 실패 → 로컬 로그만, 에러 throw 없음
- 각 이벤트 유형별 메시지 템플릿 존재
- Block Kit 형식 (header, fields, color)
- 타임스탬프 포함

## Test Scenarios
- sendSlackAlert() with valid URL → fetch called with POST, correct payload
- sendSlackAlert() with no URL configured → returns without error, no fetch call
- sendSlackAlert() fetch throws → no error propagated, logger.warn called
- sendSlackAlert() fetch returns non-200 → no error, logger.warn called
- formatMessage() ORDER_FILLED → green color, includes symbol/price/size fields
- formatMessage() RECONCILIATION_MISMATCH → red color, includes action/count
- formatMessage() LOSS_LIMIT_HIT → orange color, includes violation type
- getWebhookUrl() env set → returns env value
- getWebhookUrl() env not set, DB has value → returns DB value
- getWebhookUrl() neither set → returns null
- All event types have a message template (no missing formatter)

## Validation
```bash
bun test -- --grep "slack"
bun run typecheck
bun run lint
```

## Out of Scope
- Slack App (OAuth, 대화형) — 웹훅만 사용
- 메시지 큐/배치 전송 — 즉시 전송
- 이벤트 필터링 (어떤 이벤트를 보낼지는 호출자가 결정)
