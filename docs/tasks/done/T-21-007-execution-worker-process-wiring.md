# T-21-007 execution-worker process bootstrap

## Goal
`workers/execution-worker/src/db.ts` (RiskGate + OrderBuilder + 자격증명 복호화 + 거래소 어댑터 와이어링)와 `workers/execution-worker/src/index.ts` (기존 `startExecutionWorker` 래핑)를 구현한다.

## Why
execution-worker는 실제 Binance 주문을 제출하는 워커다. 자격증명 복호화 → BinanceFuturesAdapter 생성 → 주문 제출 체인이 완전히 와이어링되어야 live 트레이딩이 가능하다.

## Inputs
- `workers/execution-worker/src/entry.ts` — 기존 `startExecutionWorker(deps)`
- `packages/core/risk/` — RiskGate
- `packages/execution/` — OrderBuilder, BinanceFuturesAdapter
- `packages/shared/crypto/` — AES-256-GCM 복호화 유틸
- `db/index.ts` — Drizzle 싱글턴
- T-21-001, T-21-006 패턴 참조

## Dependencies
T-21-006

## Expected Outputs
- `workers/execution-worker/src/db.ts` — ExecutionWorkerEntryDeps 전체 구현
- `workers/execution-worker/src/index.ts` — 프로세스 부트스트랩

## Deliverables
- `workers/execution-worker/src/db.ts`:
  - `loadExecutionMode(strategyId)`
  - `isOrderExists(eventId)`
  - `validateRiskGate(order)` — RiskGate from packages/core/risk
  - `buildAndSaveOrder(decision)` — OrderBuilder from packages/execution
  - `saveOrderResult(orderId, result)`
  - `loadDecisionResult(eventId)` — decisions 테이블
  - `submitOrder(order)` — `loadCredential(userId)` → 복호화 (`packages/shared/crypto`) → `BinanceFuturesAdapter.createOrder()`
- `workers/execution-worker/src/index.ts`:
  - env 검증 (`DATABASE_URL`, `MASTER_ENCRYPTION_KEY`)
  - `MASTER_ENCRYPTION_KEY`로 복호화 검증 (시작 시 round-trip 테스트)
  - `startExecutionWorker(deps)` 호출
  - SIGTERM shutdown

## Constraints
- **필수**: `MASTER_ENCRYPTION_KEY` 시작 시 복호화 round-trip 검증 (잘못된 키면 에러 후 종료)
- 자격증명은 메모리에 캐시하지 않음 (주문당 1회 복호화)
- 자격증명 절대 로그에 노출 금지

## Steps
1. `execution-worker/src/entry.ts` + `ExecutionWorkerEntryDeps` 읽기
2. `packages/shared/crypto/` 복호화 API 확인
3. `BinanceFuturesAdapter` 인터페이스 확인
4. `db.ts` 구현 (특히 `submitOrder` 복호화 체인)
5. `index.ts` 구현 (MASTER_ENCRYPTION_KEY 검증 포함)
6. `bun run typecheck`

## Acceptance Criteria
- `"Execution worker started"` 출력
- `MASTER_ENCRYPTION_KEY` 없거나 잘못된 경우 명확한 에러 + 종료
- `bun run typecheck` 통과
- SIGTERM 5초 이내 종료

## Validation
```bash
bun run typecheck
timeout 3 bun run workers/execution-worker/src/index.ts 2>&1 | head -5 || true
```

## Out of Scope
자격증명 교체/로테이션, 멀티 유저 실행, 주문 상태 추적 UI
