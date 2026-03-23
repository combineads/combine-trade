# T-208 Double-BB realtime pipeline end-to-end verification

## Goal
Double-BB 전략이 실시간 파이프라인(candle close → strategy → vector → decision → alert)에서 정상 동작하는지 검증한다. p99 latency < 1초.

## Why
백테스트(T-207)가 완료되어도 실시간 파이프라인 연동이 검증되지 않으면 실제 트레이딩에 사용할 수 없다. 워커 프로세스 와이어링(EP21)이 완료된 후 최초 end-to-end 검증이 필요하다.

## Inputs
- T-207: 백테스트 완료 (벡터 + 라벨 존재)
- T-221: 모든 워커 프로세스 실행 가능 상태
- `workers/` — 모든 워커 index.ts 구현 완료
- `scripts/supervisor.ts` — 워커 수퍼바이저

## Dependencies
T-207, T-221

## Expected Outputs
- 실시간 파이프라인 full cycle 동작 확인 (candle → strategy → vector → decision → alert)
- Slack 알림 정상 수신 확인
- p99 latency < 1s 측정값

## Deliverables
- `workers/__tests__/pipeline-e2e.test.ts` — end-to-end 통합 테스트:
  - 테스트 DB에 BTCUSDT 1m 캔들 삽입 → `candle_closed` NOTIFY 발행
  - strategy-worker: Double-BB 패턴 감지 → `strategy_event_created` NOTIFY
  - vector-worker: 벡터 저장 + kNN 검색 → `decision_completed` NOTIFY
  - alert-worker: Slack 알림 전송 (SLACK_WEBHOOK_URL mock)
  - 각 단계 timing 측정 → 총 latency < 1초 검증
  - 단일 전략 에러가 타 전략에 영향 없음 검증 (에러 격리)

## Constraints
- Slack webhook은 테스트에서 mock (실제 전송 금지)
- 테스트는 실제 DB 필요 (in-memory 불가 — pgvector 사용)
- p99 latency 측정: 최소 10회 반복

## Steps
1. 기존 워커 코드 구조 파악 (T-221 완료 후)
2. `workers/__tests__/pipeline-e2e.test.ts` 작성
3. 캔들 삽입 → NOTIFY 발행 helper 구현
4. 각 단계 timing 측정 로직 추가
5. Slack webhook mock 구현
6. 10회 반복 실행 → p99 측정
7. `bun test workers/__tests__/pipeline-e2e.test.ts`

## Acceptance Criteria
- full cycle 동작 (candle → alert까지 모든 NOTIFY 수신)
- p99 latency < 1초
- Slack mock 알림 수신 확인 (LONG/SHORT 신호)
- 단일 워커 에러가 타 워커에 전파되지 않음
- execution mode 전환 (analysis → alert) 정상

## Validation
```bash
bun run typecheck
bun test workers/__tests__/pipeline-e2e.test.ts
```

## Out of Scope
Paper trading 실행 (T-209), live 배포 (T-210), 성능 최적화
