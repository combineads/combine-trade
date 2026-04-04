# T-12-008 Exit Checker — TP2 청산 비율 교정 (DIVISOR 3→2)

## Goal
TP2 도달 시 청산 수량을 remaining/3에서 remaining/2로 변경하여 PRD 명세(잔여의 50%)에 맞춘다.

## Why
PRD는 TP2 시 "잔여의 절반"을 청산하도록 명세. 현재 코드는 DIVISOR=3 (잔여의 33%). 수익 확정 비율이 PRD보다 낮아 리스크 노출이 과도함.

## Inputs
- `src/exits/checker.ts` — `TP2_CLOSE_DIVISOR = "3"` (라인 23)

## Dependencies
없음 (독립 태스크)

## Expected Outputs
- TP2_CLOSE_DIVISOR가 "2"로 변경됨

## Deliverables
- `src/exits/checker.ts` — 상수값 변경 + 주석 갱신

## Constraints
- Decimal.js 연산이므로 문자열 "2" 사용
- TP1은 변경하지 않음 (TP1_CLOSE_RATIO = "0.5" 유지)
- 전체 흐름: 진입 100% → TP1에서 50% 청산(잔여 50%) → TP2에서 잔여의 50%=25% 청산(잔여 25%) → 트레일링

## Steps
1. TP2_CLOSE_DIVISOR: `"3"` → `"2"` 변경
2. 주석 갱신: "TP2 closes 1/3 of remaining size" → "TP2 closes 1/2 of remaining size"
3. 기존 테스트 기대값 갱신
4. 검증

## Acceptance Criteria
- TP2 도달 시 잔여 수량의 50% 청산
- 전체 비율: TP1=50%, TP2=25%, trailing=25%
- 기존 테스트 통과 (기대값 갱신)

## Test Scenarios
- checkExit() TP2 도달 + remaining=100 → closeSize=50
- checkExit() TP2 도달 + remaining=1 → closeSize=0.5 (Decimal 정밀)
- checkExit() TP1 단계(TP2 미도달) → TP2 비율 무관
- checkExit() 이미 TP2 처리된 상태 → NONE

## Validation
```bash
bun test -- tests/exits/
bun run typecheck && bun run lint
```

## Out of Scope
- TP1 비율 변경
- trailing stop 로직 변경

## Implementation Notes
- 완료일: 2026-04-04
- `src/exits/checker.ts` line 23: `TP2_CLOSE_DIVISOR = "3"` → `"2"`, 상수 주석 갱신
- `src/exits/checker.ts` calcCloseSize JSDoc: "remaining_size × (1/3)" → "remaining_size × (1/2)"
- `tests/exits/checker.test.ts`: TP2 테스트 2개 기대값 갱신 (d("...").dividedBy(d("3")) → d("2"))
- `tests/exits/exits-labeling-e2e.test.ts`: E2E lifecycle 테스트 TP2 기대값 + 주석 갱신
- 검증: 89 pass / 0 fail, typecheck OK, lint OK
