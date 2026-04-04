# T-08-006 대조 워커 + 알림 E2E 통합 테스트

## Goal
대조 워커의 매칭/불일치/고아 처리 + EventLog 기록 + Slack 알림 전체 플로우를 E2E 통합 테스트로 검증한다.

## Why
개별 모듈 단위 테스트로는 모듈 간 통합 정합성을 보장할 수 없다. EP-05/06/07 E2E 패턴을 따라 실제 DB + mock exchange adapter로 전체 흐름을 검증한다.

## Inputs
- `src/reconciliation/comparator.ts` (T-08-003)
- `src/reconciliation/worker.ts` (T-08-004)
- `src/db/event-log.ts` (T-08-002)
- `src/notifications/slack.ts` (T-08-005)
- `src/orders/executor.ts` — emergencyClose (EP-06)
- `tests/helpers/test-db.ts` — DB 테스트 인프라

## Dependencies
- T-08-002 (event-log 헬퍼)
- T-08-004 (reconciliation worker)
- T-08-005 (slack notifier)

## Expected Outputs
- `tests/reconciliation/safety-net-e2e.test.ts` — 5+ E2E 시나리오

## Deliverables
- `tests/reconciliation/safety-net-e2e.test.ts`

## Constraints
- 실제 PostgreSQL DB (mock DB 금지)
- ExchangeAdapter는 mock (fetchPositions 응답 조작)
- Slack fetch는 mock (실제 웹훅 호출 금지)
- 각 시나리오 독립적

## Steps
1. Mock ExchangeAdapter: fetchPositions() 응답 조작
2. Mock fetch: Slack 웹훅 호출 캡처
3. 시드 데이터: Symbol, SymbolState(HAS_POSITION), Ticket(INITIAL), CommonCode
4. 시나리오별 테스트 작성
5. DB 상태 검증 (EventLog, SymbolState, Order)

## Acceptance Criteria
- 5개 이상 E2E 시나리오 통과
- 실제 DB에서 EventLog 레코드 검증
- 불일치 시 emergencyClose + EventLog PANIC_CLOSE 확인
- 고아 시 SymbolState IDLE + EventLog ORPHAN_IDLE 확인
- Slack 알림 함수 호출 확인

## Test Scenarios
- 정상 매칭: 거래소 1포지션 + DB 1티켓 → matched, EventLog RECONCILIATION(MATCHED)
- 불일치 → 패닉 클로즈: 거래소 포지션 있으나 DB 티켓 없음 → emergencyClose 호출, Order(PANIC_CLOSE) 생성, EventLog 기록
- 고아 → IDLE: DB 티켓 있으나 거래소 포지션 없음 → SymbolState.fsm_state=IDLE, EventLog 기록
- PENDING 안전장치: PENDING 주문 있는 심볼 → 불일치 판정 제외, 패닉 클로즈 안 함
- 거래소 API 실패: mock throws → 해당 거래소 스킵, 다른 거래소 계속, EventLog 에러 기록
- Slack 알림 연동: 불일치 시 sendSlackAlert(RECONCILIATION_MISMATCH) 호출 확인
- 복합 시나리오: 2거래소 × 2심볼 → 1 matched, 1 unmatched, 1 orphaned → 각각 올바르게 처리

## Validation
```bash
bun test -- --grep "safety-net-e2e"
bun run typecheck
bun run lint
```

## Out of Scope
- setTimeout 체인 타이밍 테스트 (단위 테스트에서 처리)
- 실제 Slack 메시지 전송
- 크래시 복구 (EP-09)
