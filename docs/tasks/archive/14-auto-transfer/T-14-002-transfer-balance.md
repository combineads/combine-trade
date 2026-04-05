# T-14-002 이체 가능 잔고 계산 (transfer/balance.ts)

## Goal
선물 계좌의 가용 잔고에서 증거금과 동적 reserve를 차감하여 이체 가능 금액을 계산하는 순수 함수를 구현한다.

## Why
이체 금액을 잘못 계산하면 증거금 부족으로 마진콜이 발생한다. reserve를 `balance × risk_pct × reserve_multiplier`로 동적 계산하여 시드 크기와 리스크 설정에 비례하는 안전 버퍼를 확보해야 한다.

## Inputs
- `docs/exec-plans/14-auto-transfer.md` M1 — 잔고 계산 공식
- T-14-001에서 추가한 TRANSFER CommonCode 설정값

## Dependencies
- T-14-001

## Expected Outputs
- `calculateTransferable()` 함수 — 이체 가능 금액 반환
- `TransferableResult` 타입 — 계산 결과 상세 (reserve, available, transferAmount, skip 여부)

## Deliverables
- `src/transfer/balance.ts`
- `src/transfer/index.ts` (모듈 배럴 export)

## Constraints
- 모든 계산은 Decimal.js — `number` 사용 금지
- reserve 최소 하한 50 USDT 하드코딩
- 이체액 floor(내림) 처리 — 절대 반올림 금지
- L7 레이어 규칙 준수: core, db, config만 import 가능

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/transfer/balance.ts` 파일 생성
4. `TransferableResult` 타입 정의:
   ```typescript
   type TransferableResult = {
     walletBalance: Decimal;
     openMargin: Decimal;
     reserve: Decimal;
     available: Decimal;
     transferAmount: Decimal;
     skip: boolean;
     skipReason?: string;
   };
   ```
5. `calculateTransferable(params)` 구현:
   - reserve = max(walletBalance × risk_pct × reserve_multiplier, 50)
   - available = walletBalance - openMargin - reserve
   - transferAmount = max(0, available) × transfer_pct / 100
   - transferAmount를 소수점 2자리 floor 처리
   - transferAmount < min_transfer_usdt 이면 skip=true
6. `src/transfer/index.ts` 배럴 export 생성
7. Run tests — confirm all pass (GREEN phase)
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- reserve = max(walletBalance × risk_pct × reserve_multiplier, 50) 공식 정확
- 오픈 포지션 증거금이 이체 대상에서 제외됨
- risk_pct 변경 시 reserve 자동 조정 (3%→1% 전환 대응)
- 이체액이 min_transfer_usdt 미만이면 skip=true 반환
- 이체액 floor 처리 (소수점 이하 내림)
- 모든 계산이 Decimal.js

## Test Scenarios
- calculateTransferable() with walletBalance=1000, openMargin=200, risk_pct=0.03, reserve_multiplier=10, transfer_pct=50, min_transfer=10 → reserve=300, available=500, transferAmount=250
- calculateTransferable() with walletBalance=200, risk_pct=0.03, reserve_multiplier=10 → reserve=max(60,50)=60
- calculateTransferable() with walletBalance=100, risk_pct=0.01, reserve_multiplier=10 → reserve=max(10,50)=50 (최소 하한 적용)
- calculateTransferable() with available < 0 (walletBalance < openMargin + reserve) → transferAmount=0, skip=true
- calculateTransferable() with transferAmount=8, min_transfer=10 → skip=true, skipReason contains "min_transfer"
- calculateTransferable() with transferAmount=55.789 → floor to 55.78 (소수점 2자리 내림)
- calculateTransferable() with walletBalance=0 → transferAmount=0, skip=true

## Validation
```bash
bun test -- --grep "transfer-balance"
bun run typecheck
bun run lint
```

## Out of Scope
- 실제 거래소 API 호출
- EventLog 기록
- 스케줄링

## Implementation Notes

- TDD: tests written first (RED), then implementation (GREEN). All 8 tests pass.
- `src/transfer/balance.ts`: pure function `calculateTransferable()` with `TransferableParams` / `TransferableResult` types.
- `src/transfer/index.ts`: barrel re-export of the public API.
- `RESERVE_FLOOR` constant (`new Decimal("50")`) defined at module level to avoid re-allocation.
- Floor applied via `toDecimalPlaces(2, Decimal.ROUND_DOWN)` — no rounding up possible.
- Skip logic unified: any case where `transferAmount < minTransferUsdt` (covers negative available, zero balance, and below-minimum scenarios) sets `skip=true, skipReason="below min_transfer_usdt"`.
- Layer compliance: only `@/core/decimal` imported — no exchanges, notifications, or L2+ imports.
- Pre-existing lint errors in `src/backtest/` are unrelated to this task; new files pass `biome check` cleanly.

## Outputs
- `src/transfer/balance.ts` (created)
- `src/transfer/index.ts` (created)
- `tests/transfer/transfer-balance.test.ts` (created, 8 tests)
