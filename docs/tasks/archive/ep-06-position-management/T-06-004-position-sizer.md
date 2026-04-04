# T-06-004 리스크 역산 포지션 사이저

## Goal
리스크 역산 방식으로 포지션 크기와 레버리지를 계산하는 순수 함수를 구현한다.

## Why
김직선 전략의 핵심 원칙: "1회 최대 손실 = 잔고 × risk_pct"로 고정. SL 폭에 따라 포지션 크기와 레버리지를 역산하여 어떤 진입에서든 손실 금액이 동일하게 유지된다. 고정 계약 수/고정 금액 진입은 절대 금지.

## Inputs
- `src/core/decimal.ts` — Decimal.js 래퍼
- `src/core/types.ts` — Direction 타입
- `src/core/ports.ts` — ExchangeSymbolInfo (tickSize, minOrderSize, maxLeverage, contractSize)
- `docs/PRODUCT.md` — risk_pct 티어 (300K→3%, 30M→1%), max leverage 38x

## Dependencies
- 없음 (순수 함수, EP-01의 core 모듈만 사용)

## Expected Outputs
- `src/positions/sizer.ts` — `calculateSize()` 순수 함수
- SizeResult 타입: { size, leverage, riskAmount, maxLoss, adjustedForLevCap }

## Deliverables
- `src/positions/sizer.ts`
- `tests/positions/sizer.test.ts`
- `src/positions/index.ts` barrel export 업데이트

## Constraints
- **순수 함수 — DB import 절대 금지** (백테스트 재사용을 위해)
- 모든 계산 Decimal.js (number 연산 금지)
- 고정 계약 수/고정 금액 진입 절대 금지 — 코드에 하드코딩된 크기 값이 없어야 함
- 레버리지 max 38x 하드캡 — 초과 시 포지션 크기 축소 (레버리지 캡 우선)
- 거래소 최소 주문 크기(minOrderSize)와 tick size 반영

## Steps
1. SizeResult 타입 정의
2. `getRiskPct(balance) → Decimal` — 시드 규모별 risk_pct 결정 (300K→3%, 30M→1%, 선형 보간 또는 티어)
3. `calculateSize(params) → SizeResult` 구현
   - riskAmount = balance × riskPct
   - slDistance = |entryPrice - slPrice|
   - rawSize = riskAmount / slDistance
   - rawLeverage = (rawSize × entryPrice) / balance
   - if rawLeverage > maxLeverage: size = (balance × maxLeverage) / entryPrice, riskAmount 재계산
   - size를 tickSize로 반올림, minOrderSize 미달 시 거부
   - leverage를 정수로 올림
4. `validateSizeResult(result, exchangeInfo) → void` — 최종 검증
5. 테스트 작성 후 구현 (TDD)

## Acceptance Criteria
- 1회 손실 = balance × riskPct로 고정 (SL 폭 무관)
- SL이 타이트할 때 포지션 커짐, 넓을 때 작아짐 — 손실 금액은 동일
- 레버리지 38x 초과 시 포지션 크기 축소 (adjustedForLevCap = true)
- tickSize 단위로 포지션 크기 반올림
- minOrderSize 미만 시 거부 (에러 또는 null 반환)
- 피라미딩 2차 진입도 동일 riskPct 적용 (잔고 기준 재계산)
- DB import 없음 — 순수 함수만

## Test Scenarios
- calculateSize() with standard params (balance=10M, risk=1%, SL=100 ticks) → correct size and leverage
- calculateSize() with tight SL (10 ticks) → larger position, higher leverage, same riskAmount
- calculateSize() with wide SL (500 ticks) → smaller position, lower leverage, same riskAmount
- calculateSize() with leverage exceeding 38x → size reduced, adjustedForLevCap = true
- calculateSize() with very small balance (300K) → riskPct = 3%
- calculateSize() with large balance (30M) → riskPct = 1%
- calculateSize() resulting size < minOrderSize → returns null or throws MinSizeError
- calculateSize() size rounded to tickSize → exact multiple of tickSize
- calculateSize() all return values are Decimal instances (not number)
- getRiskPct() with boundary values → correct tier selection
- LONG entry: SL below entry → correct slDistance calculation
- SHORT entry: SL above entry → correct slDistance calculation

## Validation
```bash
bun test -- --grep "sizer"
bun run typecheck
bun run lint
```

## Out of Scope
- DB 저장 (ticket-manager가 담당)
- 주문 실행 (T-06-005)
- CommonCode 로드 (daemon이 호출 시 전달)
- 피라미딩 조건 판단 (EP-07)
