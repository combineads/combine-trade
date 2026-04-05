# T-14-006 이체 Slack 알림 템플릿 추가

## Goal
이체 성공/실패/skip 및 미지원 거래소 잉여 잔고 알림을 위한 SlackEventType과 메시지 템플릿을 notifications/slack.ts에 추가한다.

## Why
이체 결과를 Slack으로 알림받아야 운영자가 실시간으로 이체 상태를 모니터링할 수 있다. 특히 이체 실패는 긴급 알림이 필요하고, 이체 미지원 거래소의 잉여 잔고는 수동 이체를 유도해야 한다.

## Inputs
- `docs/exec-plans/14-auto-transfer.md` M3 — Slack 알림 스펙
- `src/notifications/slack.ts` — 기존 SlackEventType, 색상/이모지 매핑

## Dependencies
- T-14-001

## Expected Outputs
- 4개 새 SlackEventType: TRANSFER_SUCCESS, TRANSFER_FAILED, TRANSFER_SKIP, TRANSFER_SURPLUS_ALERT
- 색상/이모지 매핑 추가
- formatMessage()가 새 이벤트 타입을 정상 처리

## Deliverables
- `src/notifications/slack.ts` 수정

## Constraints
- 기존 SlackEventType 및 매핑 변경 금지 — 추가만
- TRANSFER_SUCCESS: 녹색, TRANSFER_FAILED: 빨간색 (긴급)
- TRANSFER_SKIP: debug 로그만 (Slack 미발송) — 이 로직은 daemon에서 처리하므로 여기서는 타입만 정의
- TRANSFER_SURPLUS_ALERT: 주황색 (미지원 거래소 잉여 잔고)
- L7 레이어 규칙 준수 (notifications는 core, db만 import)

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `SlackEventType` 객체에 4개 항목 추가:
   - `TRANSFER_SUCCESS: "TRANSFER_SUCCESS"`
   - `TRANSFER_FAILED: "TRANSFER_FAILED"`
   - `TRANSFER_SKIP: "TRANSFER_SKIP"`
   - `TRANSFER_SURPLUS_ALERT: "TRANSFER_SURPLUS_ALERT"`
4. `EVENT_COLORS`에 매핑 추가:
   - TRANSFER_SUCCESS → COLOR_GREEN
   - TRANSFER_FAILED → COLOR_RED
   - TRANSFER_SKIP → COLOR_ORANGE
   - TRANSFER_SURPLUS_ALERT → COLOR_ORANGE
5. `EVENT_EMOJIS`에 매핑 추가:
   - TRANSFER_SUCCESS → `:money_with_wings:`
   - TRANSFER_FAILED → `:rotating_light:`
   - TRANSFER_SKIP → `:fast_forward:`
   - TRANSFER_SURPLUS_ALERT → `:mega:`
6. Run tests — confirm all pass (GREEN phase)
7. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- SlackEventType에 4개 새 타입 존재
- formatMessage("TRANSFER_SUCCESS", details)가 녹색 Slack 블록 반환
- formatMessage("TRANSFER_FAILED", details)가 빨간색 Slack 블록 반환
- formatMessage("TRANSFER_SURPLUS_ALERT", details)가 주황색 Slack 블록 반환
- 기존 이벤트 타입 동작 변화 없음

## Test Scenarios
- formatMessage(TRANSFER_SUCCESS, { amount: "250", exchange: "binance" }) → payload with color GREEN and money_with_wings emoji
- formatMessage(TRANSFER_FAILED, { error: "insufficient_balance" }) → payload with color RED and rotating_light emoji
- formatMessage(TRANSFER_SURPLUS_ALERT, { exchange: "okx", amount: "500" }) → payload with color ORANGE and mega emoji
- SlackEventType.TRANSFER_SUCCESS === "TRANSFER_SUCCESS" (type value correctness)
- Existing SlackEventType.ORDER_FILLED still works unchanged (regression check)

## Validation
```bash
bun test -- --grep "slack"
bun run typecheck
bun run lint
```

## Out of Scope
- 실제 Slack 전송 로직 (기존 sendSlackAlert 재사용)
- daemon에서 이체 결과→알림 호출 와이어링

## Implementation Notes

- TDD: wrote `tests/notifications/transfer-slack.test.ts` first (10 tests, all RED), then modified `src/notifications/slack.ts` to go GREEN.
- Added 4 entries to `SlackEventType` const object: TRANSFER_SUCCESS, TRANSFER_FAILED, TRANSFER_SKIP, TRANSFER_SURPLUS_ALERT.
- Added matching entries to `EVENT_COLORS` (GREEN/RED/ORANGE/ORANGE) and `EVENT_EMOJIS` (:money_with_wings:/:rotating_light:/:fast_forward:/:mega:).
- `formatMessage()` required no changes — it already handles any event type via the lookup maps.
- `as const` on SlackEventType preserved; existing 8 entries untouched.
- Lint check on modified/new files: clean. Pre-existing lint errors in backtest/* are unrelated to this task.
- Final: 29 slack tests pass (19 existing + 10 new), typecheck clean.
