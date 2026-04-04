# T-07-002 트레일링 스탑 순수 함수

## Goal
트레일링 스탑의 SL 위치를 계산하는 순수 함수를 구현한다. LONG/SHORT 방향별 로직을 포함한다.

## Why
트레일링 스탑은 TP1 달성 후 수익을 보호하는 핵심 메커니즘이다. 순수 함수로 구현하여 백테스트와 동일 로직을 공유한다.

## Inputs
- `src/core/decimal.ts` — Decimal.js 래퍼
- `src/core/types.ts` — Direction
- `docs/PRODUCT.md` — 트레일링 공식: new_sl = entry ± max_profit × 0.50

## Dependencies
- 없음 (순수 함수, EP-01 core만 사용)

## Expected Outputs
- `src/exits/trailing.ts` — `calculateTrailingSl()`, `shouldUpdateTrailingSl()`
- exit manager(T-07-003)가 이 함수를 호출

## Deliverables
- `src/exits/trailing.ts`
- `tests/exits/trailing.test.ts`
- `src/exits/index.ts` barrel export 업데이트

## Constraints
- **순수 함수 — DB import 절대 금지**
- 모든 계산 Decimal.js
- SL은 유리한 방향으로만 이동 (불리한 방향 금지)
- LONG: new_sl = entry + max_profit × ratio (SL 상향)
- SHORT: new_sl = entry - max_profit × ratio (SL 하향)
- 기본 ratio = 0.50 (CommonCode에서 향후 조정 가능)

## Steps
1. TrailingParams, TrailingResult 타입 정의
2. `calculateTrailingSl(entryPrice, maxProfit, direction, ratio) → Decimal` 구현
   - LONG: entry + max_profit × ratio
   - SHORT: entry - max_profit × ratio
3. `shouldUpdateTrailingSl(currentSl, newSl, direction) → boolean` 구현
   - LONG: newSl > currentSl → true (상향만)
   - SHORT: newSl < currentSl → true (하향만)
4. `calcMaxProfit(entryPrice, currentPrice, direction) → Decimal` 구현
   - LONG: max(0, current - entry)
   - SHORT: max(0, entry - current)
5. 테스트 작성 후 구현 (TDD)

## Acceptance Criteria
- LONG: new_sl = entry + max_profit × 0.50, 항상 entry 이상
- SHORT: new_sl = entry - max_profit × 0.50, 항상 entry 이하
- SL이 유리한 방향으로만 이동 (shouldUpdate 검증)
- max_profit = 0 → new_sl = entry (본절)
- 음수 max_profit 불가 (max(0, ...))
- 모든 계산 Decimal.js

## Test Scenarios
- calculateTrailingSl() LONG with positive profit → SL above entry
- calculateTrailingSl() SHORT with positive profit → SL below entry
- calculateTrailingSl() with zero profit → SL equals entry (breakeven)
- calculateTrailingSl() with custom ratio (0.30) → correct proportional SL
- shouldUpdateTrailingSl() LONG new > current → true
- shouldUpdateTrailingSl() LONG new < current → false (never move SL down)
- shouldUpdateTrailingSl() LONG new === current → false (no change)
- shouldUpdateTrailingSl() SHORT new < current → true
- shouldUpdateTrailingSl() SHORT new > current → false (never move SL up)
- calcMaxProfit() LONG price above entry → positive
- calcMaxProfit() LONG price below entry → zero (clamped)
- calcMaxProfit() SHORT price below entry → positive
- All return values are Decimal instances

## Validation
```bash
bun test -- --grep "trailing"
bun run typecheck
bun run lint
```

## Out of Scope
- 거래소 SL 주문 이동 (T-07-003 manager)
- DB 갱신 (manager)
- 트레일링 시작 조건 판단 (checker에서 TP1 달성 시 trailing_active 설정)
