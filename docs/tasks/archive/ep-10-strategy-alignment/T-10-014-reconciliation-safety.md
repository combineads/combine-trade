# T-10-014 Reconciliation FOR UPDATE 잠금 + Panic Close Slack 연결

## Goal
Reconciliation worker에서 SymbolState 조회 시 SELECT ... FOR UPDATE 잠금을 적용하고, unmatched position에 대한 panic close 후 sendSlackAlert()를 호출하여 실시간 알림을 발송한다.

## Why
현재 reconciliation worker가 SymbolState를 조회하고 조치를 취하는 사이에 다른 프로세스가 동일 행을 변경하면 race condition이 발생할 수 있다. FOR UPDATE 잠금으로 조회~조치 구간의 원자성을 보장해야 한다. 또한 panic close는 긴급 상황이므로 Slack 알림이 즉시 발송되어야 하나, 현재 emergencyClose 후 sendSlackAlert 호출이 연결되어 있지 않다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M3 FOR UPDATE + Panic Close Slack 요구사항
- `src/reconciliation/worker.ts` — runOnce() 현재 구현 (deps.emergencyClose, deps.insertEvent)
- `src/reconciliation/comparator.ts` — comparePositions() (참고용)
- `src/notifications/slack.ts` — sendSlackAlert(), SlackEventType (RECONCILIATION_MISMATCH 이미 정의됨)
- `src/core/ports.ts` — ExchangeAdapter 인터페이스

## Dependencies
- 없음 (독립 태스크)

## Expected Outputs
- `src/reconciliation/worker.ts` — ReconciliationDeps에 sendSlackAlert 추가, unmatched panic close 후 sendSlackAlert 호출, getActiveTickets에 FOR UPDATE 힌트 전달 메커니즘
- `tests/reconciliation/reconciliation-safety.test.ts` — FOR UPDATE + Slack 알림 테스트

## Deliverables
- `src/reconciliation/worker.ts`
- `tests/reconciliation/reconciliation-safety.test.ts`

## Constraints
- ReconciliationDeps는 이미 DI 패턴으로 설계되어 있으므로, sendSlackAlert도 DI로 주입
- FOR UPDATE는 getActiveTickets 또는 별도 쿼리 함수의 구현에서 적용 — worker.ts에서는 DI 인터페이스에 `forUpdate?: boolean` 힌트를 전달하거나, 항상 FOR UPDATE를 사용하는 별도 DI 함수로 교체
- sendSlackAlert 실패 시 non-blocking — reconciliation 자체는 계속 진행 (fire-and-forget)
- SlackEventType.RECONCILIATION_MISMATCH가 이미 정의되어 있으므로 그대로 사용
- 기존 runOnce() 로직 흐름(snapshot → fetch → compare → act)은 유지

## Steps
1. ReconciliationDeps에 `sendSlackAlert` 함수 시그니처 추가: `(eventType: string, details: Record<string, string | number | boolean | undefined>) => Promise<void>`
2. ReconciliationDeps.getActiveTickets에 FOR UPDATE 지원: 구현체에서 `SELECT ... FOR UPDATE` SQL 적용을 보장하도록 타입 주석/문서 명시 (worker.ts 자체는 SQL을 생성하지 않음)
3. runOnce()의 unmatched 처리 루프에서 emergencyClose 성공 후 sendSlackAlert 호출 추가
4. sendSlackAlert 호출 시 details에 symbol, exchange, size, side 포함
5. sendSlackAlert 실패를 catch하여 로그만 남기고 continue (non-blocking)
6. 테스트 파일 작성: mock deps로 sendSlackAlert 호출 여부 검증, FOR UPDATE SQL 포함 여부 검증
7. typecheck + lint 통과 확인

## Acceptance Criteria
- ReconciliationDeps에 sendSlackAlert 함수가 포함됨
- unmatched position의 panic close 성공 후 sendSlackAlert가 RECONCILIATION_MISMATCH 타입으로 호출됨
- sendSlackAlert에 symbol, exchange, size, side 정보가 포함됨
- sendSlackAlert 실패 시 reconciliation은 중단되지 않고 계속 진행
- getActiveTickets 구현체가 FOR UPDATE를 사용하도록 인터페이스/문서에 명시됨
- FOR UPDATE가 적용된 경우 결과 없음(0행)에서도 에러 없음
- 기존 reconciliation 테스트 전부 통과 (회귀 없음)

## Test Scenarios
- unmatched position 1개 → emergencyClose 성공 → sendSlackAlert 1회 호출, details에 symbol/exchange/size/side 포함
- unmatched position 2개 → emergencyClose 각 성공 → sendSlackAlert 2회 호출
- sendSlackAlert가 Error throw → reconciliation 계속 진행 (actionErrors 증가하지 않음, 별도 로그만)
- unmatched 없음 (matched만) → sendSlackAlert 호출 안 됨
- getActiveTickets에서 FOR UPDATE가 적용된 쿼리가 실행되는지 검증 (SQL 문자열에 FOR UPDATE 포함 확인)
- FOR UPDATE 쿼리 결과 0행 → 에러 없이 빈 배열 반환

## Validation
```bash
bun test -- --grep "reconciliation"
bun run typecheck
bun run lint
```

## Out of Scope
- Slack webhook 설정/인프라 (이미 EP-08에서 구현됨)
- sendSlackAlert 함수 자체 수정 (기존 구현 그대로 사용)
- 새로운 SlackEventType 추가 (RECONCILIATION_MISMATCH 이미 존재)
- comparator.ts 로직 변경
- 다른 M3 안전장치 (FSM 가드, spread 사전 체크, 계좌 일일 손실 등)
