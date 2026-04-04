# T-10-010 지수 감쇠 → 3단계 이산 감쇠

## Goal
`src/knn/time-decay.ts`의 지수(exponential) 감쇠 함수를 PRD 명세의 3단계 이산 감쇠로 교체한다. 30일 이내=1.0, 31~90일=0.7, 91일 이상=0.2.

## Why
지수 감쇠는 연속적으로 가중치가 감소하여 1개월 전 벡터도 상당히 할인된다. PRD는 시장 레짐 변화를 반영하여 3단계 이산 모델을 정의한다: 최근 1개월은 현재 시장 상태로 간주하여 풀 가중치(1.0), 1~3개월은 유사 레짐으로 감쇠(0.7), 3개월 초과는 다른 레짐으로 최소 가중치(0.2). 이산 모델이 해석이 명확하고, 레짐 경계에서의 갑작스러운 변화를 반영한다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M2 Time Decay 3단계 이산 감쇠 명세
- `src/knn/time-decay.ts` — 현재 지수 감쇠 구현 (calcTimeDecay, TimeDecayConfig)

## Dependencies
- 없음 (독립 태스크)

## Expected Outputs
- `src/knn/time-decay.ts` — 3단계 이산 감쇠로 교체
- `tests/knn/time-decay.test.ts` — 이산 감쇠 검증 테스트

## Deliverables
- `src/knn/time-decay.ts`
- `tests/knn/time-decay.test.ts`

## Constraints
- 3단계 이산 감쇠 규칙:
  - 0~30일 (daysSince <= 30) → weight = 1.0
  - 31~90일 (31 <= daysSince <= 90) → weight = 0.7
  - 91일 이상 (daysSince > 90) → weight = 0.2
- 날짜 계산은 기존 UTC 일 기준 유지 (MS_PER_DAY = 86_400_000)
- 미래 날짜 / 같은 날 → 1.0 유지 (기존 daysSince <= 0 처리 유지)
- TimeDecayConfig 타입 변경:
  - 기존: `{ halfLifeDays: number }` → 이산 모델에서는 halfLife 개념 불필요
  - 교체: `{ recentDays: number; midDays: number; recentWeight: number; midWeight: number; oldWeight: number }` 또는 3단계 구조체
  - 기본값: recentDays=30, midDays=90, recentWeight=1.0, midWeight=0.7, oldWeight=0.2
- applyTimeDecay() 인터페이스는 유지 (WeightedNeighbor[] 반환)
- loadTimeDecayConfig()도 새 타입에 맞게 업데이트
- DEFAULT_HALF_LIFE_DAYS 상수 제거, 새 기본값 상수로 교체

## Steps
1. TimeDecayConfig 타입을 3단계 이산 구조로 변경
2. calcTimeDecay()를 3단계 이산 로직으로 교체
3. 기본값 상수 교체 (DEFAULT_HALF_LIFE_DAYS → DEFAULT_DISCRETE_DECAY_CONFIG)
4. applyTimeDecay() 내부에서 새 calcTimeDecay() 호출 확인
5. loadTimeDecayConfig()를 새 타입에 맞게 업데이트
6. 기존 테스트를 이산 모델 기반으로 전면 교체
7. typecheck + lint 통과 확인

## Acceptance Criteria
- calcTimeDecay: 10일 전 벡터 → weight 1.0
- calcTimeDecay: 30일 전 벡터 → weight 1.0 (경계값 포함)
- calcTimeDecay: 31일 전 벡터 → weight 0.7
- calcTimeDecay: 60일 전 벡터 → weight 0.7
- calcTimeDecay: 90일 전 벡터 → weight 0.7 (경계값 포함)
- calcTimeDecay: 91일 전 벡터 → weight 0.2
- calcTimeDecay: 120일 전 벡터 → weight 0.2
- calcTimeDecay: 미래 날짜 → weight 1.0
- calcTimeDecay: 같은 날 → weight 1.0
- TypeDecayConfig 타입이 이산 모델 구조
- `bun run typecheck && bun run lint` 통과

## Test Scenarios
- calcTimeDecay: daysSince=0 (같은 날) → weight 1.0
- calcTimeDecay: daysSince=10 → weight 1.0
- calcTimeDecay: daysSince=30 (경계값) → weight 1.0
- calcTimeDecay: daysSince=31 (경계값) → weight 0.7
- calcTimeDecay: daysSince=60 → weight 0.7
- calcTimeDecay: daysSince=90 (경계값) → weight 0.7
- calcTimeDecay: daysSince=91 (경계값) → weight 0.2
- calcTimeDecay: daysSince=120 → weight 0.2
- calcTimeDecay: daysSince=365 → weight 0.2
- calcTimeDecay: 미래 날짜 (daysSince < 0) → weight 1.0
- applyTimeDecay: 3개 neighbor (10일, 60일, 120일) → weights [1.0, 0.7, 0.2]

## Validation
```bash
bun test -- --grep "time-decay"
bun run typecheck
bun run lint
```

## Out of Scope
- KNN decision 임계값 교정 (T-10-009)
- 벡터 피처/정규화 교정 (T-10-006~008)
- CommonCode DB에 새 설정 seed (loadTimeDecayConfig 구조만 변경)
