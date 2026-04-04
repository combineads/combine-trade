# T-10-008 정규화 교정 (lookback/clamp/[0,1]/NaN 기본값)

## Goal
`src/vectors/normalizer.ts`의 정규화 로직을 PRD 명세에 맞게 교정한다. lookback=60 윈도우 적용, clamp(-3,3), [0,1] 출력 스케일링, NaN/Infinity→0.5, IQR=0→0.5 기본값을 구현한다.

## Why
현재 정규화는 전체 학습 데이터를 사용하여 파라미터를 산출하고, IQR=0일 때 0.0을 반환하며, 출력 범위가 제한되지 않는다. 이는 (1) 오래된 데이터가 최근 패턴을 희석하고, (2) 상수 피처를 0.0으로 처리하면 KNN 거리에서 편향이 발생하며, (3) 극단값이 거리 계산을 왜곡한다. lookback=60으로 최근 데이터만 사용하고, clamp/[0,1] 스케일링으로 안정적인 거리 계산을 보장하며, 결측값을 중립값 0.5로 처리한다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M2 정규화 교정 명세
- `src/vectors/normalizer.ts` — 현재 Median/IQR 정규화 구현
- `src/vectors/features.ts` — VECTOR_DIM (202)

## Dependencies
- 없음 (독립 태스크)

## Expected Outputs
- `src/vectors/normalizer.ts` — 교정된 normalize() 및 computeNormParams()
- `tests/vectors/normalizer.test.ts` — 교정 검증 테스트

## Deliverables
- `src/vectors/normalizer.ts`
- `tests/vectors/normalizer.test.ts`

## Constraints
- computeNormParams() 변경:
  - lookback=60 파라미터 추가: 최근 60개 벡터만 사용하여 median/IQR 산출
  - 벡터 수가 60 미만이면 전체 사용 (기존 동작 유지)
- normalize() 변경:
  - 기존: `normalized[i] = (raw[i] - median[i]) / iqr[i]`
  - 교정: `z = (raw[i] - median[i]) / iqr[i]` → `clamped = clamp(z, -3, 3)` → `scaled = (clamped + 3) / 6` → 출력 [0, 1]
  - IQR=0 → 0.5 (기존 0.0에서 변경)
  - NaN → 0.5 (기존 0.0에서 변경)
  - Infinity / -Infinity → 0.5 (기존 0.0에서 변경)
- 출력 벡터의 모든 값은 [0, 1] 범위 보장
- NormParams 타입은 변경 없음 ({ median: number; iqr: number }[])
- computeNormParams의 lookback 파라미터 기본값 = 60

## Steps
1. computeNormParams()에 lookback 파라미터 추가 (기본값 60)
2. 벡터 배열이 lookback보다 길면 마지막 lookback개만 사용
3. normalize()에서 z-score 계산 후 clamp(-3, 3) 적용
4. clamp된 값을 [0, 1]로 스케일링: (clamped + 3) / 6
5. IQR=0 → 0.5 반환 (기존 0.0에서 변경)
6. NaN/Infinity 체크 → 0.5 반환 (기존 0.0에서 변경)
7. 기존 테스트 업데이트 + 교정 검증 테스트 추가
8. typecheck + lint 통과 확인

## Acceptance Criteria
- normalize() 출력의 모든 값이 [0, 1] 범위
- IQR=0인 피처 → 0.5
- NaN 입력 → 0.5
- Infinity 입력 → 0.5
- clamp: z > 3 → 1.0, z < -3 → 0.0, z = 0 → 0.5
- computeNormParams(vectors, lookback=60) → 최근 60개 벡터만 사용
- computeNormParams() lookback 미지정 시 기본값 60 적용
- `bun run typecheck && bun run lint` 통과

## Test Scenarios
- normalize() with 유효 값 → 출력이 [0, 1] 범위
- normalize() with NaN 입력 → 0.5
- normalize() with Infinity 입력 → 0.5
- normalize() with -Infinity 입력 → 0.5
- normalize() with IQR=0 → 해당 피처 0.5
- clamp 검증: z-score = 4.0 → clamped 3.0 → scaled 1.0
- clamp 검증: z-score = -4.0 → clamped -3.0 → scaled 0.0
- clamp 검증: z-score = 0.0 → scaled 0.5 (정확한 중앙)
- computeNormParams() with 100개 벡터, lookback=60 → 마지막 60개만 사용
- computeNormParams() with 30개 벡터, lookback=60 → 전체 30개 사용

## Validation
```bash
bun test -- --grep "normalizer"
bun run typecheck
bun run lint
```

## Out of Scope
- 벡터 피처 정의 변경 (T-10-006)
- 캔들 피처 분모 교정 (T-10-007)
- KNN 파라미터 교정 (T-10-009)
- Vector DB 저장/조회 로직 변경
