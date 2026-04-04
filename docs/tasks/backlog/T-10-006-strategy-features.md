# T-10-006 전략 피처 12개 정의 교체 + VECTOR_SPEC.md 문서화

## Goal
`src/vectors/features.ts`의 time_session 카테고리(12개)를 strategy 카테고리(12개)로 교체하고, `docs/specs/VECTOR_SPEC.md`에 전체 202개 피처 공식과 가중치를 문서화한다.

## Why
현재 time_session 12개 피처(hour_sin, dow_cos, is_asia_session 등)는 시간 인코딩으로 전략 판단에 기여도가 낮다. PRD에서 정의한 전략 피처(bb20_position, bb4_position, ma_ordering 등)로 교체하면 KNN 유사 패턴 검색에서 전략 맥락이 직접 반영되어 신호 품질이 향상된다. VECTOR_SPEC.md 문서화는 EP-05에서 부실했던 피처 명세를 확정하여 이후 교정 태스크(T-10-007~010)의 기반이 된다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M2 전략 피처 12개 목록, 가중치 명세
- `src/vectors/features.ts` — 현재 202차원 피처 정의 (time_session 12개 포함)
- `docs/PRODUCT.md` — PRD 전략 피처 정의

## Dependencies
- 없음 (독립 태스크)

## Expected Outputs
- `src/vectors/features.ts` — time_session 카테고리 → strategy 카테고리로 교체 (12개 피처)
- `docs/specs/VECTOR_SPEC.md` — 전체 202개 피처 공식, 가중치, 카테고리 문서
- `src/vectors/weights.ts` (신규 또는 features.ts 내) — STRATEGY_WEIGHT_MAP export

## Deliverables
- `src/vectors/features.ts`
- `docs/specs/VECTOR_SPEC.md`

## Constraints
- 총 차원수 202 유지 (190 캔들 + 12 전략) — VECTOR_DIM = 202 불변
- 전략 피처 12개 목록 (순서 고정):
  1. `bb20_position` — (close - bb20_lower) / (bb20_upper - bb20_lower)
  2. `bb4_position` — (close - bb4_lower) / (bb4_upper - bb4_lower), 가중치 2.0
  3. `ma_ordering` — sma20 > sma60 > sma120 정렬 점수 [-3, 3]
  4. `ma20_slope` — (sma20[0] - sma20[1]) / sma20[1]
  5. `atr_separation` — atr14 / bb20_bandwidth
  6. `pivot_distance` — (close - nearest_pivot) / atr14, 가중치 1.5
  7. `rsi_normalized` — (rsi14 - 50) / 50
  8. `rsi_extreme_count` — 최근 5봉 중 RSI > 70 또는 < 30인 봉 수 / 5
  9. `breakout_intensity` — (close - bb20_upper) / atr14 (양수=상방돌파)
  10. `disparity_divergence` — (close/sma20 - 1) - (close/sma60 - 1)
  11. `daily_open_distance` — (close - daily_open) / atr14, 가중치 1.5
  12. `session_box_position` — (close - session_low) / (session_high - session_low), 가중치 1.5
- 가중치 맵: bb4_position=2.0, pivot_distance/daily_open_distance/session_box_position=1.5, 나머지=1.0
- FEATURE_CATEGORIES에서 key를 `time_session` → `strategy`로 변경
- FEATURE_NAMES 배열에서 마지막 12개가 전략 피처로 교체
- 기존 190개 캔들 피처(price_position~time_series)는 변경 금지

## Steps
1. `src/vectors/features.ts`에서 TIME_SESSION 상수 배열을 STRATEGY 배열로 교체
2. 전략 피처 12개의 이름과 공식 주석 작성
3. FEATURE_CATEGORIES에서 `time_session` → `strategy` 키 변경
4. FEATURE_NAMES 배열에서 `...TIME_SESSION` → `...STRATEGY` 교체
5. STRATEGY_WEIGHT_MAP 상수 정의 (피처명 → 가중치)
6. `docs/specs/VECTOR_SPEC.md` 신규 작성: 6개 카테고리 × 피처 목록, 각 공식, 가중치
7. typecheck + lint 통과 확인

## Acceptance Criteria
- FEATURE_NAMES.length === 202
- 전략 피처 12개가 FEATURE_NAMES의 마지막 12개 (인덱스 190~201)
- FEATURE_CATEGORIES.strategy 에 12개 피처명 존재
- STRATEGY_WEIGHT_MAP에서 bb4_position=2.0, pivot_distance=1.5, daily_open_distance=1.5, session_box_position=1.5, 나머지=1.0
- `docs/specs/VECTOR_SPEC.md` 파일이 존재하고 12개 전략 피처 공식 모두 포함
- 기존 190개 캔들 피처 이름/순서 불변
- `bun run typecheck && bun run lint` 통과

## Test Scenarios
- FEATURE_NAMES.length === 202 검증
- FEATURE_NAMES 마지막 12개가 전략 피처명과 일치
- FEATURE_CATEGORIES.strategy.length === 12
- FEATURE_CATEGORIES에 time_session 키가 없음
- STRATEGY_WEIGHT_MAP["bb4_position"] === 2.0
- STRATEGY_WEIGHT_MAP["pivot_distance"] === 1.5
- 기존 190개 피처 (FEATURE_NAMES[0]~[189]) 가 변경 전과 동일

## Validation
```bash
bun test -- --grep "features|strategy"
bun run typecheck
bun run lint
```

## Out of Scope
- vectorizer.ts 내 전략 피처 계산 로직 구현 (별도 태스크)
- 캔들 피처 분모 교정 (T-10-007)
- 정규화 교정 (T-10-008)
