# T-06-006 슬리피지 체크 & ABORT

## Goal
주문 체결 후 슬리피지를 검사하는 순수 함수를 구현한다. 임계치 초과 시 ABORT 판정을 반환한���.

## Why
실시간 체결에서 예상가와 실제 체결가의 차이(슬리피지)가 임계치를 초과하면 전략 기대값이 훼손된다. 즉시 ABORT하여 손실을 최소화해야 한다.

## Inputs
- `src/core/decimal.ts` — Decimal.js 래퍼
- `docs/DATA_MODEL.md` — CommonCode SLIPPAGE.max_spread_pct (기본 0.05 = 5%)

## Dependencies
- 없음 (순수 함수)

## Expected Outputs
- `src/orders/slippage.ts` — `checkSlippage()` 순수 함수, `SlippageResult` 타입
- executor.ts에서 import하여 사용

## Deliverables
- `src/orders/slippage.ts`
- `tests/orders/slippage.test.ts`
- `src/orders/index.ts` barrel export 업데이트

## Constraints
- 순수 함수 — DB import 금지
- 모든 계산 Decimal.js
- 슬리피지 = |filledPrice - expectedPrice| / expectedPrice
- 결과는 passed/aborted + 수치 반환 (판단은 호출자가)

## Steps
1. SlippageResult 타입 정의: { passed: boolean, slippage: Decimal, slippagePct: Decimal, expectedPrice: Decimal, filledPrice: Decimal }
2. `checkSlippage(expectedPrice, filledPrice, maxSpreadPct) → SlippageResult` 구현
   - slippage = filledPrice - expectedPrice (부호 있는 값)
   - slippagePct = |slippage| / expectedPrice
   - passed = slippagePct <= maxSpreadPct
3. `loadSlippageConfig(db) → { maxSpreadPct: Decimal }` — CommonCode에서 임계치 로드 (이 함수만 DB 접근)
4. 테스트 작성 후 구현 (TDD)

## Acceptance Criteria
- 슬리피지 = |체결가 - 예상가| / 예상가 로 정확 계산
- maxSpreadPct 이하 → passed = true
- maxSpreadPct 초과 → passed = false
- LONG 진입: 체결가 > 예상가 → 양수 슬리피지 (불리)
- SHORT 진입: 체결가 < 예상가 → 양수 슬리피지 (불리)
- 체결가 === 예상가 → slippage = 0, passed = true
- Decimal.js로 모든 계산

## Test Scenarios
- checkSlippage() with exact fill (expected=filled) → passed=true, slippage=0
- checkSlippage() with slippage below threshold → passed=true
- checkSlippage() with slippage at exact threshold → passed=true (경계값)
- checkSlippage() with slippage above threshold → passed=false
- checkSlippage() LONG entry filled higher → positive slippage (불리)
- checkSlippage() SHORT entry filled lower → positive slippage (불리)
- checkSlippage() favorable slippage (better price) → passed=true, negative raw slippage
- checkSlippage() with very small expectedPrice → no division by zero, correct pct
- All return values are Decimal instances
- loadSlippageConfig() reads CommonCode.SLIPPAGE.max_spread_pct → Decimal

## Validation
```bash
bun test -- --grep "slippage"
bun run typecheck
bun run lint
```

## Out of Scope
- ABORT 실행 (강제 청산) — executor.ts가 결과 보고 처리
- 슬리피지 이벤트 로깅 (EP-08 EventLog)
