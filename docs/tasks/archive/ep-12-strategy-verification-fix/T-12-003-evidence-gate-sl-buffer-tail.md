# T-12-003 Evidence Gate — SL 버퍼 공식 교정 (꼬리길이×15%)

## Goal
`calcSlPrice()`를 ATR×0.5 기반에서 꼬리 바깥 + 꼬리길이×15% 버퍼 공식으로 교정한다.

## Why
PRD는 SL을 "진입 캔들의 꼬리 바깥 + 꼬리길이의 15% 버퍼"로 명세하지만, 현재 코드는 ATR×0.5를 사용. ATR 기반은 최근 변동성에 연동되지만 캔들 형태와 무관하여 SL이 너무 넓거나 좁을 수 있다.

## Inputs
- `src/signals/evidence-gate.ts` — 현재 `calcSlPrice()` (라인 39-47)
- PRD 공식: LONG: low - (min(open,close) - low) × 0.15, SHORT: high + (high - max(open,close)) × 0.15

## Dependencies
없음 (독립 태스크)

## Expected Outputs
- `calcSlPrice()` 함수가 꼬리 길이 기반 SL 계산
- atr 파라미터 제거 (더 이상 사용하지 않음)

## Deliverables
- `src/signals/evidence-gate.ts` — `calcSlPrice()` 수정

## Constraints
- LONG: SL = low - tailLength × 0.15, tailLength = min(open, close) - low
- SHORT: SL = high + tailLength × 0.15, tailLength = high - max(open, close)
- tailLength = 0 (doji) → fallback: range × 0.15 (high - low 기반)
- Decimal.js 사용 필수

## Steps
1. `calcSlPrice()` 시그니처에서 `atr: Decimal | null` 제거
2. LONG: `tailLength = min(open, close) - low`, `sl = low - tailLength × 0.15`
3. SHORT: `tailLength = high - max(open, close)`, `sl = high + tailLength × 0.15`
4. tailLength = 0 방어: `fallback = (high - low) × 0.15`
5. 호출부(`checkEvidence()` 라인 114) 업데이트: `calcSlPrice(candle, touchDirection)` — atr 제거
6. 테스트 작성

## Acceptance Criteria
- LONG SL = low - (min(open,close) - low) × 0.15
- SHORT SL = high + (high - max(open,close)) × 0.15
- doji (tailLength=0) → range × 0.15 fallback
- ATR 파라미터 불필요 (제거됨)
- **호출자 확인**: `checkEvidence()` 내부에서 수정된 `calcSlPrice()` 호출

## Test Scenarios
- calcSlPrice() LONG 일반 캔들(open=100, close=105, low=98, high=106) → SL = 98 - (100-98)×0.15 = 97.7
- calcSlPrice() SHORT 일반 캔들(open=105, close=100, high=106, low=98) → SL = 106 + (106-105)×0.15 = 106.15
- calcSlPrice() LONG doji(open=close=100, low=99, high=101) → tailLength=1, SL = 99 - 1×0.15 = 98.85
- calcSlPrice() LONG 완전 doji(open=close=high=low=100) → range=0, tailLength=0 → SL = 100 (방어)
- checkEvidence() 통합: BB4 터치 시 SL이 꼬리 기반으로 계산됨

## Validation
```bash
bun test -- tests/signals/evidence-gate
bun run typecheck && bun run lint
```

## Out of Scope
- a_grade 로직 변경 → T-12-004 범위
- 기타 evidence-gate 로직 변경

## Implementation Notes
- `calcSlPrice()` now exported (was private) to enable direct unit testing.
- Signature changed from `(candle, direction, atr)` to `(candle, direction)`.
- `Decimal.min()` / `Decimal.max()` used for bodyBottom/bodyTop — no float arithmetic.
- Pre-existing DB test `createSignal works for SHORT direction` was broken: used default positive MA20 slope with SHORT ONE_B (slope filter added in T-10-003). Fixed by adding explicit negative slope indicators.
- All 47 tests pass; typecheck and lint clean.
