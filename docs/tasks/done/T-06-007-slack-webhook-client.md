# T-06-007 Implement Slack webhook client

## Goal
Implement a Slack incoming webhook HTTP client for alert delivery.

## Why
EP06 M1/M2 — alert-worker handler already formats messages and calls `sendSlackWebhook`, but no HTTP client implementation exists.

## Inputs
- `packages/alert/types.ts` (SlackMessage type)
- `workers/alert-worker/src/handler.ts` (AlertWorkerDeps.sendSlackWebhook signature)

## Dependencies
None

## Expected Outputs
- `sendSlackWebhook(webhookUrl, message)` function
- Handles HTTP errors (non-2xx → throw)
- Timeout: 5 seconds

## Deliverables
- `packages/alert/slack.ts` (webhook client)
- `packages/alert/__tests__/slack.test.ts`
- Update `packages/alert/index.ts` barrel export

## Constraints
- Use native `fetch()` (Bun built-in) — no axios or node-fetch
- Webhook URL from environment variable SLACK_WEBHOOK_URL
- Content-Type: application/json
- Timeout: 5 seconds (AbortController)
- Non-2xx response → throw with status code and body
- Do not log the webhook URL (secret)

## Steps
1. Write tests with fetch mock
2. Implement sendSlackWebhook: POST to webhook URL with SlackMessage body
3. Handle timeout via AbortController
4. Handle non-2xx responses
5. Export from barrel

## Acceptance Criteria
- POST request with correct Content-Type and JSON body
- 5-second timeout with AbortController
- Non-2xx → descriptive error thrown
- Webhook URL never logged

## Validation
```bash
bun test packages/alert/__tests__/slack.test.ts
bun run typecheck
```

## Out of Scope
- Retry logic (handled by T-06-004 alert-worker handler)
- Channel routing
- Rate limiting

## Implementation Notes
- **Date**: 2026-03-22
- **Files changed**: `packages/alert/slack.ts` (new), `packages/alert/__tests__/slack.test.ts` (new — 6 tests), `packages/alert/index.ts` (added export)
- **Approach**: TDD. Native fetch with `new Request()` for clean signal attachment. AbortController with 5s timeout, clearTimeout in finally block.
- **Validation**: 6/6 tests pass, typecheck clean.

## Outputs
- `sendSlackWebhook(webhookUrl: string, message: SlackMessage, timeoutMs?: number): Promise<void>`
