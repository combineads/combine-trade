# T-15-013 calculateTransferable() 수익 기반 재작성 + getDailyProfit() 구현

## Metadata
- modules: [transfer]
- primary: transfer

## Goal
이체 계산을 잉여 잔고 기반에서 PRD §7.20의 당일 수익 기반으로 전환하고, getDailyProfit() 함수를 신규 구현한다.

## Why
현재 calculateTransferable()는 `available = balance - margin - reserve`의 일정 비율을 이체한다. PRD §7.20은 `amount = max(0, dailyProfit) × transferPct / 100`으로 당일 실현 수익 기반 이체를 요구한다.

## Inputs
- `src/transfer/balance.ts` (현재 calculateTransferable)
- `src/transfer/scheduler.ts`
- PRD §7.20

## Dependencies
- T-15-002 (TRANSFER seed 확인)

## Expected Outputs
- 재작성된 calculateTransferable()
- 신규 getDailyProfit() 함수

## Deliverables
- `src/transfer/balance.ts` — calculateTransferable() 수익 기반 재작성
- `src/transfer/scheduler.ts` — getDailyProfit() 신규 구현
- `src/transfer/executor.ts` — EventLog data에 daily_profit 필드 추가
- `tests/transfer/transfer-balance.test.ts` — 전면 재작성
- `tests/transfer/transfer-getDailyProfit.test.ts` — getDailyProfit 테스트 신규 추가

## Constraints
- 모든 계산 Decimal.js
- TransferableParams에 dailyProfit 필드 추가 (breaking change)
- reserve = max(balance × riskPct × reserveMultiplier, 50 USDT) 유지
- 안전장치: balance - amount < margin + reserve → skip

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/transfer/scheduler.ts`에 getDailyProfit() 구현:
   - `SUM(ticket.pnl) WHERE closed_at >= today UTC 00:00 AND exchange = ?`
4. `src/transfer/balance.ts` calculateTransferable() 재작성:
   - amount = max(0, dailyProfit) × transferPct / 100
   - amount < min_transfer_usdt → skip
   - balance - amount < margin + reserve → skip
5. TransferableParams 타입에 dailyProfit 추가
6. executor.ts EventLog에 daily_profit 기록
7. Run tests — confirm all pass (GREEN phase)
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- 이체 = max(0, dailyProfit) × transferPct / 100
- 손실일(dailyProfit ≤ 0) → 이체 없음
- 안전장치: 이체 후 잔고 < margin + reserve → skip
- getDailyProfit() UTC 00:00 기준 당일 수익 합산
- EventLog에 daily_profit 기록
- 모든 계산 Decimal.js
- `bun run typecheck` 통과

## Test Scenarios
- calculateTransferable() with dailyProfit=100, transferPct=50 → amount=50
- calculateTransferable() with dailyProfit=-50 → skip (no transfer on loss day)
- calculateTransferable() with dailyProfit=0 → skip (no profit)
- calculateTransferable() with amount < min_transfer_usdt → skip
- calculateTransferable() safety: balance - amount < margin + reserve → skip
- getDailyProfit() with 3 closed tickets today (pnl: +100, -30, +50) → returns 120
- getDailyProfit() with no tickets today → returns 0

## Validation
- `bun test -- --grep "calculateTransferable|getDailyProfit|transfer"`
- `bun run typecheck`

## Out of Scope
- CCXT transfer() 호출 로직 변경
- 스케줄러 타이밍 변경 (UTC 00:30 유지)
- 멀티 거래소 이체 실행 (Slack 알림은 기존 유지)

## Implementation Notes

### 접근 방식
TDD (RED → GREEN → REFACTOR) 순서로 진행.

### 주요 변경 사항

**`src/transfer/balance.ts`**
- `TransferableParams`에 `dailyProfit: Decimal` 필드 추가 (breaking change)
- `TransferableResult`에서 `available: Decimal` 필드 제거 → `dailyProfit: Decimal`로 교체
- `calculateTransferable()` 공식 변경:
  - 구: `available = balance - margin - reserve; amount = available × pct/100`
  - 신: `amount = max(0, dailyProfit) × pct/100` + skip 우선순위 정렬
- skip 조건 순서: ① dailyProfit ≤ 0 (no_daily_profit) → ② amount < minTransfer (below_min_transfer_usdt) → ③ 잔고 안전장치 (safety_check)

**`src/transfer/scheduler.ts`**
- `getDailyProfit(db, exchange, date?)` 신규 구현
- Drizzle ORM: `ticketTable.pnl` SUM, `closed_at >= todayUtc` AND `exchange = ?` 필터
- null pnl 행 무시, 빈 결과 → Decimal("0")

**`src/transfer/executor.ts`**
- TRANSFER_SKIP / TRANSFER_SUCCESS / TRANSFER_FAILED 이벤트 모두에 `daily_profit` 필드 추가
- `available` 참조 제거

**`scripts/transfer-now.ts`**
- dry-run 및 normal 모드 모두에서 `getDailyProfit()` 호출 추가
- `dailyProfit` 파라미터 전달

**영향 받은 테스트 파일 수정**
- `tests/transfer/transfer-balance.test.ts` — 전면 재작성
- `tests/transfer/transfer-getDailyProfit.test.ts` — 신규 추가 (6개 시나리오)
- `tests/transfer/transfer-executor.test.ts` — makeParams에 dailyProfit 추가, skip 시나리오 변경
- `tests/transfer/transfer-scheduler.test.ts` — TransferableResult 목업에 dailyProfit 추가
- `tests/transfer/transfer-e2e.test.ts` — makeTransferParams에 dailyProfit 추가, available 제거
- `tests/transfer/transfer-now.test.ts` — 목업 업데이트
- `tests/api/routes/transfers.test.ts` — available → dailyProfit 교체
- `tests/api/e2e.test.ts` — available → dailyProfit 교체

## Outputs

- 수정 파일:
  - `/Users/combine/projects/combine/combine-trade/src/transfer/balance.ts`
  - `/Users/combine/projects/combine/combine-trade/src/transfer/scheduler.ts`
  - `/Users/combine/projects/combine/combine-trade/src/transfer/executor.ts`
  - `/Users/combine/projects/combine/combine-trade/scripts/transfer-now.ts`
  - `/Users/combine/projects/combine/combine-trade/tests/transfer/transfer-balance.test.ts`
  - `/Users/combine/projects/combine/combine-trade/tests/transfer/transfer-executor.test.ts`
  - `/Users/combine/projects/combine/combine-trade/tests/transfer/transfer-scheduler.test.ts`
  - `/Users/combine/projects/combine/combine-trade/tests/transfer/transfer-e2e.test.ts`
  - `/Users/combine/projects/combine/combine-trade/tests/transfer/transfer-now.test.ts`
  - `/Users/combine/projects/combine/combine-trade/tests/api/routes/transfers.test.ts`
  - `/Users/combine/projects/combine/combine-trade/tests/api/e2e.test.ts`
- 신규 파일:
  - `/Users/combine/projects/combine/combine-trade/tests/transfer/transfer-getDailyProfit.test.ts`
- 테스트: 96 pass / 0 fail (transfer 모듈 전체)
- typecheck: 통과
