# T-10-004 Safety Gate 임계값 교정 — wick_ratio TF 분리, 박스권 MA20, 비정상 배수 2.0

## Goal
`src/signals/safety-gate.ts`의 임계값 3건을 PRD 명세와 일치시킨다: (1) WICK_RATIO_THRESHOLD를 TF별 분리 (5M=0.1, 1M=1.0), (2) BOX_MARGIN_RATIO를 MA20 midpoint + range_20 x 0.15 기반으로 변경, (3) ABNORMAL_CANDLE_MULTIPLE을 3.0에서 2.0으로 하향 조정.

## Why
현재 Safety Gate의 임계값이 PRD 수치와 불일치한다. wick_ratio가 TF 구분 없이 단일값(0.6)이라 5M에서 너무 관대하고 1M에서 너무 엄격하다. 박스 범위 기준이 단순 비율(0.3)이라 MA20 중심 기반 판정이 누락되었다. 비정상 캔들 배수가 3.0으로 너무 관대하여 이상 캔들이 통과한다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M1 Safety Gate 임계값 교정 요구사항
- `docs/PRODUCT.md` — Safety Gate 임계값 PRD 명세
- `src/signals/safety-gate.ts` — 현재 구현 (WICK_RATIO_THRESHOLD=0.6, BOX_MARGIN_RATIO=0.3, ABNORMAL_CANDLE_MULTIPLE=3.0)

## Dependencies
- 없음 (독립 태스크)

## Expected Outputs
- `src/signals/safety-gate.ts` — 임계값 3건 교정
- `tests/signals/safety-gate.test.ts` — 교정된 임계값 테스트 케이스

## Deliverables
- `src/signals/safety-gate.ts`
- `tests/signals/safety-gate.test.ts`

## Constraints
- **wick_ratio 임계값 TF별 분리**:
  - 기존: WICK_RATIO_THRESHOLD = 0.6 (단일값)
  - 변경: 5M → 0.1, 1M → 1.0
  - checkSafety에 timeframe 파라미터가 필요할 수 있음 (기존 인터페이스 확인)
  - TF별 맵 또는 함수로 구현
- **박스 범위 기준 변경**:
  - 기존: BOX_MARGIN_RATIO = 0.3 (단순 비율)
  - 변경: MA20 midpoint 기준, ±(range_20 x 0.15) 범위 내인지 판정
  - MA20 값과 range_20 (최근 20봉 고저 범위)을 indicators에서 참조
- **비정상 캔들 배수 하향**:
  - 기존: ABNORMAL_CANDLE_MULTIPLE = 3.0
  - 변경: ABNORMAL_CANDLE_MULTIPLE = 2.0
- Decimal.js로 모든 비교/계산
- CommonCode 조회 패턴 유지 (fail-safe 기본값)

## Steps
1. safety-gate.ts에서 WICK_RATIO_THRESHOLD 상수를 TF별 맵으로 변경
2. checkWickRatio 함수에 timeframe 파라미터 추가
3. BOX_MARGIN_RATIO 상수를 제거하고 MA20 midpoint + range_20 x 0.15 로직으로 교체
4. checkBoxRange 함수에 ma20, range_20 파라미터 추가
5. ABNORMAL_CANDLE_MULTIPLE을 3.0 → 2.0으로 변경
6. checkSafety 통합 함수의 파라미터/인터페이스 조정
7. 기존 테스트 업데이트 (임계값 변경으로 기존 테스트 데이터 조정 필요)
8. 새 경계값 테스트 추가
9. typecheck + lint 통과 확인

## Acceptance Criteria
- 5M wick_ratio > 0.1 → safety_passed=false
- 1M wick_ratio > 1.0 → safety_passed=false
- 5M wick_ratio <= 0.1 → 이 조건 통과
- 1M wick_ratio <= 1.0 → 이 조건 통과
- 박스 범위: 진입가가 MA20 midpoint ± (range_20 x 0.15) 범위 내 → 통과
- 박스 범위: 진입가가 범위 밖 → safety_passed=false
- 비정상 캔들: 크기 > ATR x 2.0 → safety_passed=false
- 비정상 캔들: 크기 <= ATR x 2.0 → 이 조건 통과
- 기존 1M 노이즈 필터 동작 변경 없음

## Test Scenarios
- 5M + wick_ratio 0.15 (> 0.1) → passed=false, reason 'wick_ratio_exceeded'
- 5M + wick_ratio 0.05 (< 0.1) → 이 조건 통과
- 1M + wick_ratio 1.2 (> 1.0) → passed=false, reason 'wick_ratio_exceeded'
- 1M + wick_ratio 0.8 (< 1.0) → 이 조건 통과
- 진입가 MA20 midpoint에서 range_20 x 0.1 거리 → 범위 내, 통과
- 진입가 MA20 midpoint에서 range_20 x 0.2 거리 → 범위 밖, passed=false
- 캔들 크기 ATR x 2.5 → passed=false, reason 'abnormal_candle'
- 캔들 크기 ATR x 1.5 → 이 조건 통과

## Validation
```bash
bun test -- --grep "safety-gate"
bun run typecheck
bun run lint
```

## Out of Scope
- Evidence Gate 수정 (T-10-003)
- Safety Gate의 1M 노이즈 필터 로직 변경 (기존 유지)
- CommonCode 시드 데이터 변경 (기본값만 코드 수정)
- KNN 결정 로직 (M2 범위)
