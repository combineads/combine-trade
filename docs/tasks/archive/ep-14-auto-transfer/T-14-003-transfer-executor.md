# T-14-003 이체 실행기 (transfer/executor.ts)

## Goal
CCXT `transfer()` API를 통해 선물→현물 내부 이체를 실행하고, 결과를 EventLog에 기록하는 TransferExecutor를 구현한다. ExchangeAdapter 포트에 `transfer()` 메서드를 추가한다.

## Why
수익을 선물 계좌에 방치하면 파산 확률이 높아진다. 실현 수익을 현물 지갑으로 이체하여 확정해야 한다. 이체 실패는 비치명적이지만 반드시 기록되어야 다음 스케줄에서 재시도할 수 있다.

## Inputs
- `docs/exec-plans/14-auto-transfer.md` M2 — 이체 실행기 스펙
- `src/core/ports.ts` — ExchangeAdapter 인터페이스
- `src/transfer/balance.ts` — calculateTransferable() (T-14-002)

## Dependencies
- T-14-002

## Expected Outputs
- `ExchangeAdapter.transfer()` 메서드 (포트 확장)
- `TransferExecutor` — 이체 실행 + EventLog 기록
- `TransferResult` 타입

## Deliverables
- `src/core/ports.ts` 수정 — `transfer()` 메서드 추가
- `src/transfer/executor.ts` 생성
- `src/exchanges/binance.ts` 수정 — `transfer()` 구현
- MockExchangeAdapter에 `transfer()` 추가 (backtest용)

## Constraints
- 이체 금액 floor(내림) — 거래소 최소 단위 준수
- 실패 시 3회 재시도 (지수 백오프: 1s, 2s, 4s)
- EventLog event_type: `TRANSFER_SUCCESS` | `TRANSFER_FAILED` | `TRANSFER_SKIP`
- 이체 중 포지션 개시 이벤트와 비차단 (이체는 별도 작업)
- fromAccount: `"future"`, toAccount: `"spot"`, currency: `"USDT"`
- L7 레이어 규칙: core, db, config, exchanges (via ports) import 가능

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/core/ports.ts`의 `ExchangeAdapter`에 `transfer()` 메서드 추가:
   ```typescript
   transfer(currency: string, amount: Decimal, fromAccount: string, toAccount: string): Promise<{ id: string; status: string }>;
   ```
4. `src/exchanges/binance.ts`에 `transfer()` 구현 (CCXT `this.exchange.transfer()` 호출)
5. MockExchangeAdapter에 `transfer()` stub 추가
6. `src/transfer/executor.ts` 생성:
   - `TransferResult` 타입 정의
   - `executeTransfer(adapter, params)` 함수:
     - calculateTransferable() 호출
     - skip이면 EventLog TRANSFER_SKIP 기록 후 반환
     - adapter.transfer() 호출 (3회 재시도, 지수 백오프)
     - 성공 시 EventLog TRANSFER_SUCCESS, 실패 시 TRANSFER_FAILED 기록
   - balance_before, balance_after 기록을 위해 이체 전후 fetchBalance() 호출
7. Run tests — confirm all pass (GREEN phase)
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- ExchangeAdapter 인터페이스에 transfer() 메서드 존재
- 이체 성공 시 EventLog에 TRANSFER_SUCCESS 기록 (amount, balance_before, balance_after, reserve)
- 이체 실패 시 EventLog에 TRANSFER_FAILED + error_message 기록
- 잔고 부족(skip) 시 EventLog에 TRANSFER_SKIP 기록
- 실패 시 3회 재시도 후 최종 실패 기록
- 이체 금액 floor 처리

## Test Scenarios
- executeTransfer() with sufficient balance → calls adapter.transfer() once, records TRANSFER_SUCCESS EventLog
- executeTransfer() with skip (balance < min) → does NOT call adapter.transfer(), records TRANSFER_SKIP EventLog
- executeTransfer() with adapter.transfer() throwing once then succeeding → retries and records TRANSFER_SUCCESS
- executeTransfer() with adapter.transfer() throwing 3 times → records TRANSFER_FAILED with error_message
- executeTransfer() TRANSFER_SUCCESS EventLog data contains { exchange, currency, amount, from, to, balance_before, balance_after, reserve }
- executeTransfer() return value includes transferAmount as Decimal (not number)
- MockExchangeAdapter.transfer() → resolves with { id, status: "ok" }

## Validation
```bash
bun test -- --grep "transfer-executor"
bun run typecheck
bun run lint
bun run check-layers
```

## Out of Scope
- 스케줄링 (T-14-004)
- Slack 알림 발송 (T-14-006, daemon이 결과 받아 호출)
- OKX/Bitget/MEXC adapter 구현 (Phase 2)

## Implementation Notes

**2026-04-05 — Implementation complete**

### Files changed
- `src/core/ports.ts` — `ExchangeAdapter` 타입에 `transfer()` 메서드 추가
- `src/exchanges/base.ts` — `BaseExchangeAdapter` 추상 클래스에 `transfer()` abstract 메서드 추가
- `src/exchanges/binance.ts` — CCXT `this.ccxt.transfer()` 호출로 구현, `withRetry` 활용
- `src/exchanges/okx.ts`, `bitget.ts`, `mexc.ts` — `ExchangeNotImplementedError` stub 추가 (Phase 2 대상)
- `src/backtest/mock-adapter.ts` — `MockExchangeAdapter.transfer()` 구현: `{ id: "mock-transfer-id", status: "ok" }` 반환
- `src/transfer/executor.ts` — 신규 생성
- `src/transfer/index.ts` — executor 타입과 함수 barrel export 추가
- `tests/transfer/transfer-executor.test.ts` — 9개 테스트 (TDD, RED→GREEN)
- 기존 테스트 30개 파일 — `ExchangeAdapter` 인터페이스 준수를 위해 `transfer` mock 추가

### Key decisions
- `executeTransfer(deps, exchange)` — DI 패턴, `TransferExecutorDeps`로 어댑터·파라미터 제공자·이벤트 로거 주입
- 재시도는 `withRetry` 헬퍼로 분리 (1s→2s→4s 지수 백오프), `**` 연산자 사용
- `balance_before` fetch는 `fetchBalance().total` (futures 계좌 기준)
- `balance_after` fetch는 이체 성공 후 즉시 호출
- 이체 금액 floor는 `calculateTransferable()`에서 이미 처리됨 (2dp ROUND_DOWN)
- L7 레이어 규칙 준수: `core`, `ports` 경유 어댑터만 import

### Test results
- 9 pass, 0 fail
- typecheck: 통과
- lint: 신규 파일 무위반 (기존 backtest/ 파일 18개 위반은 사전 존재)
- check-layers: 위반 없음
