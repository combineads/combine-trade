# T-15-007 KNN 가중 거리 개별 피처 가중치 적용

## Metadata
- modules: [knn, vectors]
- primary: knn

## Goal
KNN 엔진에 개별 피처 가중치를 적용하여 PRD §7.8의 가중 거리 계산을 구현한다.

## Why
PRD §7.8은 특정 피처에 가중치를 부여한다 (upperWick×1.5, bb4_pos×2.0 등). 현재 knn/engine.ts는 pgvector의 native 거리 연산자만 사용하며 피처별 가중치를 적용하지 않는다.

## Inputs
- T-15-001의 pgvector 가중 거리 전략 결정 (pre-multiply vs post-rerank)
- T-15-002의 FEATURE_WEIGHTS
- `src/knn/engine.ts` (현재 코드)

## Dependencies
- T-15-001 (pgvector 전략 결정)
- T-15-006 (새 vectorizer — 가중치 적용 방식에 따라 벡터 저장 시 pre-multiply 필요)

## Expected Outputs
- 수정된 `src/knn/engine.ts` — 가중 거리 적용

## Deliverables
- `src/knn/engine.ts` — 가중 거리 계산 구현
- pre-multiply 방식 시: vectorizer에서 sqrt(weight) 적용하여 저장
- post-rerank 방식 시: searchKnn 후 앱 코드에서 가중 거리 재계산 + 재정렬
- 테스트 업데이트

## Constraints
- T-15-001에서 결정된 전략을 따름
- pgvector HNSW 인덱스 구조 변경 불가
- VECTOR_DIM=202 유지

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. T-15-001 Decision log에서 pgvector 전략 확인
4. 선택한 전략에 따라 구현:
   - pre-multiply: vectorizer의 Float32Array 출력 전 sqrt(weight) 적용
   - post-rerank: searchKnn 결과에 가중 거리 재계산 함수 추가
5. FEATURE_WEIGHTS를 인덱스→가중치 매핑으로 변환하는 유틸 함수 구현
6. Run tests — confirm all pass (GREEN phase)
7. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- KNN 거리 계산이 피처별 가중치를 반영
- upperWick, lowerWick (1.5×), bb4_position (2.0×) 등 가중치 적용 확인
- 기본 가중치 1.0인 피처는 변경 없음
- `bun run typecheck` 통과

## Test Scenarios
- KNN distance with uniform weights (all 1.0) → same as unweighted distance
- KNN distance with bb4_position weight=2.0 → bb4_position dimension contributes 4× to squared distance
- KNN distance with upperWick weight=1.5 → upperWick dimension contributes 2.25× to squared distance
- Weight index mapping from FEATURE_WEIGHTS → correct index-to-weight map for all 202 dims
- Features without explicit weight → default weight 1.0 applied
- searchKnn() returns neighbors sorted by weighted distance (not raw distance)

## Validation
- `bun test -- --grep "knn"`
- `bun run typecheck`

## Out of Scope
- A-grade 분기 (T-15-008)
- 수수료 CommonCode화 (T-15-009)

## Implementation Notes

### D-005 pre-multiply 전략 확인
T-15-001 D-005 결정을 코드에서 확인:
- `candle-features.ts`: `extractBarFeatures()` 내에서 `upperWick × 1.5`, `lowerWick × 1.5` 직접 곱셈
- `strategy-features.ts`: `bb4_pos × 2.0`, `pivot_distance × 1.5`, `daily_open_distance × 1.5`, `session_box_position × 1.5` 직접 곱셈
- `vectorizer.ts`: `PRE_MULTIPLY_TABLE`이 모두 1.0 (이중 적용 방지)

따라서 pgvector 네이티브 거리 연산자가 이미 가중 거리를 계산하므로 engine.ts에서 post-rerank 불필요.

### 변경 사항
1. `src/knn/engine.ts` 모듈 헤더에 D-005 pre-multiply 전략 설명 추가
2. `buildWeightIndexMap()` 함수 추가: FEATURE_NAMES 인덱스 → 가중치 Float32Array(202) 반환 (디버깅/검증용)
3. `src/knn/engine.test.ts` 신규 생성: 20개 테스트

### 가중 거리 수학적 등가
- weight=2.0 피처 pre-multiply: squared distance 기여 4× (weight^2)
- weight=1.5 피처 pre-multiply: squared distance 기여 2.25× (weight^2)
- weight=1.0 피처: 변환 없음 (1.0^2 = 1.0)

### upperWick/lowerWick 논리 그룹 키
FEATURE_NAMES에 직접 존재하지 않는 논리 그룹 키. candle-features.ts에서 각 봉의 upperWick(i*5+1), lowerWick(i*5+2) 인덱스에 가중치가 직접 적용된다. buildWeightIndexMap()에서는 1.0으로 표시되나 실제 pre-multiply는 extractBarFeatures 내에서 처리됨.

## Outputs
- `src/knn/engine.ts` — D-005 문서화 + `buildWeightIndexMap()` 추가
- `src/knn/engine.test.ts` — 신규 (20개 테스트: buildWeightIndexMap 10개, pre-multiply 수학 검증 5개, 논리 그룹 키 4개, 기본값 1개)
- `bun test --grep "knn"`: 113 pass, 0 fail
- `bun run typecheck`: 통과
