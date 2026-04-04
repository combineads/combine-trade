# T-05-012 시간 감쇠 가중치

## Goal
`src/knn/time-decay.ts`에 KNN 이웃 벡터에 대한 시간 감쇠 가중치를 계산하는 로직을 구현한다.

## Why
최근 데이터가 오래된 데이터보다 현재 시장 상황을 더 잘 반영한다. 시간 감쇠로 최근 벡터에 높은 가중치를 부여하여 KNN 결정의 정확도를 높인다.

## Inputs
- `docs/PRODUCT.md` — 시간 감쇠 규칙
- `src/core/types.ts` — CommonCodeGroup (TIME_DECAY 그룹)
- `docs/DATA_MODEL.md` — CommonCode TIME_DECAY 그룹 정의

## Dependencies
- 없음 (순수 수학 함수, DB 의존 없음)

## Expected Outputs
- `src/knn/time-decay.ts` exports:
  - `TimeDecayConfig` 타입: { halfLifeDays: number }
  - `calcTimeDecay(neighborCreatedAt: Date, now: Date, config: TimeDecayConfig) → number` (0~1 사이 가중치)
  - `applyTimeDecay(neighbors: KnnNeighbor[], now: Date, config: TimeDecayConfig) → WeightedNeighbor[]`
  - `WeightedNeighbor`: KnnNeighbor & { weight: number }
  - `loadTimeDecayConfig(db) → TimeDecayConfig` (CommonCode에서 설정 로드)

## Deliverables
- `src/knn/time-decay.ts`

## Constraints
- 시간 감쇠 수식: weight = exp(-λ × daysSinceCreation)
  - λ = ln(2) / halfLifeDays
  - halfLifeDays는 CommonCode.TIME_DECAY.half_life_days에서 조회 (기본값: 90일)
- 가중치 범위: 0 < weight ≤ 1
- 매우 오래된 벡터도 최소 가중치 유지 (0에 수렴하지만 0이 되진 않음)
- 같은 날짜의 벡터 → weight = 1.0
- 순수 함수 (DB 의존은 loadTimeDecayConfig만)

## Steps
1. PRODUCT.md, DATA_MODEL.md에서 시간 감쇠 규칙 확인
2. src/knn/time-decay.ts 작성
   - calcTimeDecay: 지수 감쇠 함수
   - applyTimeDecay: 이웃 배열에 가중치 적용
   - loadTimeDecayConfig: CommonCode 조회 + 기본값 fallback
3. knn/index.ts barrel export 업데이트
4. 단위 테스트 (순수 함수)

## Acceptance Criteria
- calcTimeDecay() with 같은 날짜 → weight ≈ 1.0
- calcTimeDecay() with halfLife 경과 → weight ≈ 0.5
- calcTimeDecay() with 2×halfLife 경과 → weight ≈ 0.25
- 가중치가 항상 0 < weight ≤ 1
- applyTimeDecay() → 각 이웃에 weight 필드 추가
- CommonCode 조회 실패 시 기본값 사용

## Test Scenarios
- calcTimeDecay() with 0일 경과 → weight = 1.0
- calcTimeDecay() with halfLifeDays(90일) 경과 → weight ≈ 0.5
- calcTimeDecay() with 180일 경과 (2×halfLife) → weight ≈ 0.25
- calcTimeDecay() with 1000일 경과 → weight > 0 (0이 아님)
- calcTimeDecay() with 미래 날짜 (now < createdAt) → weight = 1.0 (안전 처리)
- applyTimeDecay() with 3개 이웃 → 각각 다른 weight 부여
- loadTimeDecayConfig() with CommonCode 존재 → 설정값 반환
- loadTimeDecayConfig() with CommonCode 없음 → 기본값 { halfLifeDays: 90 }

## Validation
```bash
bun test -- --grep "time-decay"
bun run typecheck
bun run lint
```

## Out of Scope
- KNN 검색 (T-05-011)
- PASS/FAIL/SKIP 결정 (T-05-013)
