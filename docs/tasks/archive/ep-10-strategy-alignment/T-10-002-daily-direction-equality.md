# T-10-002 일봉 필터 등호 허용 (> → >=, < → <=)

## Goal
`src/filters/daily-direction.ts`에서 일봉 방향 판정 시 strict 비교(`greaterThan`, `lessThan`)를 non-strict 비교(`greaterThanOrEqualTo`, `lessThanOrEqualTo`)로 변경하여 경계값(close == open)을 허용한다.

## Why
PRD에서 일봉 필터의 경계 조건(close == open)은 해당 방향에 포함되어야 하지만, 현재 코드는 strict 비교를 사용하여 정확히 같은 경우를 제외한다. 이로 인해 close == open인 캔들에서 NEUTRAL로 판정되어 유효한 시그널을 놓칠 수 있다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M1 등호 허용 요구사항
- `docs/PRODUCT.md` — 일봉 방향 판정 규칙
- `src/filters/daily-direction.ts` — 현재 구현 (greaterThan / lessThan 사용)

## Dependencies
- 없음 (독립 태스크)

## Expected Outputs
- `src/filters/daily-direction.ts` — 비교 연산자 변경
- `tests/filters/daily-direction.test.ts` — 경계값 테스트 케이스 추가

## Deliverables
- `src/filters/daily-direction.ts`
- `tests/filters/daily-direction.test.ts`

## Constraints
- `greaterThan()` → `greaterThanOrEqualTo()` 변경
- `lessThan()` → `lessThanOrEqualTo()` 변경
- slope == 0인 경우의 기존 동작(NEUTRAL)은 변경하지 않음
- Decimal.js 메서드 사용 (number 비교 금지)
- 다른 필터 파일 수정 금지

## Steps
1. `src/filters/daily-direction.ts`에서 `greaterThan` 호출부를 `greaterThanOrEqualTo`로 변경
2. `lessThan` 호출부를 `lessThanOrEqualTo`로 변경
3. 기존 테스트가 통과하는지 확인 (strict 비교 케이스는 non-strict에서도 동일 결과)
4. 경계값 테스트 추가: close == open + slope > 0 → LONG_ONLY
5. 경계값 테스트 추가: close == open + slope < 0 → SHORT_ONLY
6. slope == 0 테스트가 여전히 NEUTRAL인지 확인
7. typecheck + lint 통과 확인

## Acceptance Criteria
- close > open + slope > 0 → LONG_ONLY (기존 동작 유지)
- close == open + slope > 0 → LONG_ONLY (새로 허용)
- close < open + slope < 0 → SHORT_ONLY (기존 동작 유지)
- close == open + slope < 0 → SHORT_ONLY (새로 허용)
- slope == 0 → NEUTRAL (변경 없음)
- 기존 테스트 전부 통과 (회귀 없음)

## Test Scenarios
- slope > 0 + close > open → LONG_ONLY (기존 동작 회귀 테스트)
- slope > 0 + close == open → LONG_ONLY (경계값 — 새 테스트)
- slope < 0 + close < open → SHORT_ONLY (기존 동작 회귀 테스트)
- slope < 0 + close == open → SHORT_ONLY (경계값 — 새 테스트)
- slope == 0 → NEUTRAL (변경 없음 확인)
- slope > 0 + close < open → 기존 동작 유지 확인
- slope < 0 + close > open → 기존 동작 유지 확인

## Validation
```bash
bun test -- --grep "daily-direction"
bun run typecheck
bun run lint
```

## Out of Scope
- 다른 필터 (trade-block, session 등) 수정
- slope 계산 로직 자체 변경
- NEUTRAL 판정 로직 변경
