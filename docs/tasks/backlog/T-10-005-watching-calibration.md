# T-10-005 WATCHING 감지 교정 — 스퀴즈 wick_ratio, S/R ATR 거리, NEUTRAL 해제, tp1/tp2 갱신

## Goal
`src/signals/watching.ts`의 WATCHING 감지 조건 4건을 PRD 명세와 일치시킨다: (1) 스퀴즈 돌파(A)에 wick_ratio < 0.5 체크 추가, (2) S/R 겹침(B)에 ATR14 x 0.3 거리 기준 적용, (3) NEUTRAL 전환 시 활성 세션 해제 조건 명시, (4) tp1/tp2를 1H close마다 갱신하는 로직 추가.

## Why
WATCHING 세션의 진입 조건과 유지 조건이 PRD와 불일치한다. 스퀴즈 돌파 시 wick_ratio가 높은 캔들은 페이크 브레이크아웃 가능성이 높아 필터링이 필요하다. S/R 겹침의 거리 기준이 없으면 먼 지지/저항을 잘못 참조한다. NEUTRAL 전환 시 세션 유지 여부가 불명확하고, tp1/tp2가 고정되어 시장 변화를 반영하지 못한다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M1 WATCHING 교정 요구사항
- `docs/PRODUCT.md` — WATCHING 조건 A/B/C, NEUTRAL 해제, tp 갱신 규칙
- `src/signals/watching.ts` — 현재 구현 (detectWatching, WatchingResult)
- `src/indicators/` — ATR14, squeeze 관련 함수

## Dependencies
- 없음 (독립 태스크)

## Expected Outputs
- `src/signals/watching.ts` — 4건 교정 적용
- `tests/signals/watching.test.ts` — 교정된 로직 테스트 케이스

## Deliverables
- `src/signals/watching.ts`
- `tests/signals/watching.test.ts`

## Constraints
- **스퀴즈 돌파(A) wick_ratio 체크**:
  - 돌파 캔들의 wick_ratio < 0.5여야 유효
  - wick_ratio = (상방윅 또는 하방윅, 방향에 따라) / 전체 범위
  - wick_ratio >= 0.5 → 스퀴즈 돌파 미인정 (WatchSession 생성하지 않음)
- **S/R 겹침(B) ATR 거리 기준**:
  - 현재가와 S/R 레벨 간 거리 <= ATR14 x 0.3 이내여야 S/R 겹침으로 인정
  - 거리 > ATR14 x 0.3 → S/R 겹침 미인정
- **NEUTRAL 전환 해제**:
  - daily_bias가 NEUTRAL로 전환되면 활성 WatchSession을 invalidate
  - invalidate된 세션은 Evidence Gate에서 사용하지 않음
  - 기존 LONG_ONLY/SHORT_ONLY 세션의 direction과 NEUTRAL은 불일치로 처리
- **tp1/tp2 1H close 갱신**:
  - 1H 캔들 close마다 tp1, tp2를 재계산
  - 재계산 로직: 기존 tp 산출 공식 동일, 최신 1H 데이터 기반
  - WatchSession의 tp1/tp2 필드를 업데이트하는 함수 추가
- Decimal.js 정밀도 유지
- detectWatching의 반환 타입(WatchingResult) 확장 시 하위 호환 유지

## Steps
1. watching.ts에서 스퀴즈 돌파 감지 로직 확인, wick_ratio 체크 추가
2. S/R 겹침 감지 로직에 ATR14 x 0.3 거리 기준 추가
3. NEUTRAL 전환 시 활성 세션 해제 로직 추가 (invalidateWatchSession 또는 유사 함수)
4. tp1/tp2 갱신 함수 추가 (refreshTargetPrices 또는 유사)
5. 기존 테스트 확인 (회귀 없음)
6. 스퀴즈 돌파 wick_ratio 경계값 테스트 추가
7. S/R 거리 경계값 테스트 추가
8. NEUTRAL 해제 테스트 추가
9. tp1/tp2 갱신 테스트 추가
10. typecheck + lint 통과 확인

## Acceptance Criteria
- 스퀴즈 돌파 + wick_ratio < 0.5 → WatchSession 생성
- 스퀴즈 돌파 + wick_ratio >= 0.5 → WatchSession 미생성
- S/R 겹침 + 거리 <= ATR14 x 0.3 → WatchSession 생성
- S/R 겹침 + 거리 > ATR14 x 0.3 → WatchSession 미생성
- daily_bias NEUTRAL → 활성 WatchSession invalidate
- 1H close 발생 시 tp1/tp2 재계산 + WatchSession 업데이트
- 기존 테스트 전부 통과 (회귀 없음)

## Test Scenarios
- 스퀴즈 돌파 + wick_ratio 0.3 → WatchSession 생성 (통과)
- 스퀴즈 돌파 + wick_ratio 0.6 → WatchSession 미생성 (필터)
- 스퀴즈 돌파 + wick_ratio 0.5 (경계) → WatchSession 미생성 (>= 0.5)
- S/R 겹침 + 거리 ATR14 x 0.2 → WatchSession 생성 (범위 내)
- S/R 겹침 + 거리 ATR14 x 0.4 → WatchSession 미생성 (범위 밖)
- NEUTRAL 전환 → 기존 LONG_ONLY 활성 세션 invalidate
- tp1/tp2 갱신: 1H close 후 tp1/tp2 값이 최신 데이터 기반으로 업데이트

## Validation
```bash
bun test -- --grep "watching"
bun run typecheck
bun run lint
```

## Out of Scope
- Evidence Gate 로직 변경 (T-10-003)
- Safety Gate 임계값 변경 (T-10-004)
- 데몬 파이프라인의 1H close 이벤트 발행 (EP-09 범위)
- S/R 레벨 자체의 계산 로직 변경
