# T-15-002 FEATURE_WEIGHT 시드 갱신 + ANCHOR 확인 + 스키마 수정

## Metadata
- modules: [config, vectors]
- primary: config

## Goal
PRD §3.2의 FEATURE_WEIGHT 개별 피처 가중치를 CommonCode 시드에 반영하고, features.ts의 FEATURE_WEIGHTS 상수를 갱신한다.

## Why
현재 FEATURE_WEIGHTS에는 bb4_position(2.0), pivot_distance(1.5), daily_open_distance(1.5), session_box_position(1.5) 4개만 있다. PRD §3.2는 upperWick(1.5), lowerWick(1.5), default(1.0)도 요구한다. 또한 ANCHOR normalization 설정이 PRD §3.1과 일치하는지 확인해야 한다.

## Inputs
- PRD §3.1 (ANCHOR 그룹), §3.2 (FEATURE_WEIGHT)
- `src/config/seed.ts`
- `src/config/schema.ts`
- `src/vectors/features.ts` (FEATURE_WEIGHTS, 347-352행)

## Dependencies
- T-15-001 (pgvector 가중 거리 전략이 결정되어야 pre-multiply 여부에 따라 가중치 적용 방식 확정)

## Expected Outputs
- 갱신된 `src/config/seed.ts` — FEATURE_WEIGHT 시드
- 갱신된 `src/config/schema.ts` — 새 키 수용
- 갱신된 `src/vectors/features.ts` — FEATURE_WEIGHTS 상수

## Deliverables
- `src/config/seed.ts` — FEATURE_WEIGHT 그룹에 upperWick, lowerWick, default 추가
- `src/config/schema.ts` — FEATURE_WEIGHT 스키마 수정
- `src/vectors/features.ts` — FEATURE_WEIGHTS에 upperWick:1.5, lowerWick:1.5 추가

## Constraints
- Decimal.js 불필요 (가중치는 정수/소수 설정값)
- ANCHOR 그룹은 변경 금지 (확인만)
- FEATURE_WEIGHTS 기존 4개 키 값 유지

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. PRD §3.1 ANCHOR 그룹과 현재 seed.ts 대조 — normalization: { method: "median_iqr", lookback: 60 } 확인
4. PRD §3.2 FEATURE_WEIGHT 전체 키 목록과 현재 seed.ts 대조
5. `src/config/seed.ts`에 FEATURE_WEIGHT 그룹 시드 갱신:
   - upperWick: 1.5, lowerWick: 1.5 추가
   - default: 1.0 추가
6. `src/config/schema.ts`에 새 키 수용하도록 스키마 수정
7. `src/vectors/features.ts` FEATURE_WEIGHTS에 upperWick:1.5, lowerWick:1.5 추가
8. Run tests — confirm all pass (GREEN phase)
9. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- FEATURE_WEIGHT 시드가 PRD §3.2와 일치 (6개 키 + default)
- ANCHOR normalization이 PRD §3.1과 일치 확인
- `bun run typecheck` 통과

## Test Scenarios
- FEATURE_WEIGHTS에 upperWick 키 존재 → 값 1.5
- FEATURE_WEIGHTS에 lowerWick 키 존재 → 값 1.5
- FEATURE_WEIGHTS에 bb4_position 키 존재 → 값 2.0 (기존 유지)
- FEATURE_WEIGHTS에 pivot_distance 키 존재 → 값 1.5 (기존 유지)
- FEATURE_WEIGHTS에 daily_open_distance 키 존재 → 값 1.5 (기존 유지)
- FEATURE_WEIGHTS에 session_box_position 키 존재 → 값 1.5 (기존 유지)
- FEATURE_WEIGHTS의 모든 키가 유효한 FEATURE_NAMES에 속함

## Validation
- `bun test -- --grep "FEATURE_WEIGHTS"`
- `bun run typecheck`

## Out of Scope
- 벡터 추출기 코드 변경 (M2)
- normalizer.ts 변경 (이미 PRD 일치)
- KNN 엔진 가중치 적용 (M4)

## Implementation Notes

### ANCHOR normalization 확인 결과
- `src/core/constants.ts`: `NORMALIZATION_METHOD = "MEDIAN_IQR"` (대문자)
- `src/config/seed.ts` ANCHOR normalization entry: `{ method: NORMALIZATION_METHOD }` → `{ method: "MEDIAN_IQR" }`
- PRD §3.1 (VECTOR_SPEC.md §Normalization): `{ method: "median_iqr", lookback: 60 }`
- **차이점**: 대소문자 차이(`MEDIAN_IQR` vs `median_iqr`) + `lookback` 필드 누락
- 태스크 제약 "ANCHOR 그룹은 변경 금지"에 따라 수정하지 않음. 후속 태스크(M2 normalizer) 범위로 처리 예정.

### schema.ts 변경 불필요
- `FeatureWeightConfigSchema = z.number()`로 이미 모든 숫자 값 수용. 신규 키(upperWick, lowerWick, default)도 동일 스키마로 통과.

### seed.ts FEATURE_WEIGHT 그룹 수정 내용
- 제거: `wick_ratio` (잘못된 키 — PRD §3.2에 없음)
- 추가: `pivot_distance:1.5`, `daily_open_distance:1.5`, `session_box_position:1.5` (features.ts에는 있었으나 seed에 누락되어 있었음)
- 추가: `upperWick:1.5`, `lowerWick:1.5` (PRD §3.2 요구)
- 추가: `default:1.0` (PRD §3.2 요구)

### upperWick/lowerWick 키의 논리적 의미
- 현재 features.ts(202차원)에는 `upper_wick_5m`, `upper_wick_1m`, `lower_wick_5m`, `lower_wick_1m` 형태의 이름 사용
- PRD §3.2 / VECTOR_SPEC.md §3.2는 `upperWick`, `lowerWick`을 논리적 그룹 키로 사용 (indices 1, 6, 11, ..., 186 적용)
- 테스트 `all FEATURE_WEIGHTS keys are valid FEATURE_NAMES`를 `…or PRD §3.2 logical group keys`로 수정하여 이 논리적 키를 허용

## Outputs

| 파일 | 변경 내용 |
|------|----------|
| `src/vectors/features.ts` | FEATURE_WEIGHTS에 `upperWick:1.5`, `lowerWick:1.5` 추가 (기존 4개 키 유지) |
| `src/config/seed.ts` | FEATURE_WEIGHT 그룹: `wick_ratio` 제거 → `pivot_distance`, `daily_open_distance`, `session_box_position`, `upperWick`, `lowerWick`, `default` 추가 (총 7개 엔트리) |
| `src/config/schema.ts` | 변경 없음 (기존 `z.number()` 스키마로 충분) |
| `src/vectors/features.test.ts` | `upperWick has weight 1.5`, `lowerWick has weight 1.5` 테스트 추가; 기존 키 검증 테스트 논리적 그룹 키 허용으로 수정 |

### 검증 결과
- `bun run typecheck` → 통과 (에러 없음)
- `bun test src/vectors/features.test.ts` → 18 pass, 0 fail
