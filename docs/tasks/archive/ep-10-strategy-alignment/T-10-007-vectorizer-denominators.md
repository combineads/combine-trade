# T-10-007 캔들 피처 분모 교정

## Goal
`src/vectors/vectorizer.ts`의 캔들 피처 분모를 PRD 명세에 맞게 교정한다. body는 close→open, wick는 atr14→H, range는 close→L로 변경하고, wick 피처에 가중치 1.5를 적용한다.

## Why
현재 벡터라이저의 분모 선택이 PRD와 불일치한다. body를 close로 나누면 양봉/음봉 방향성이 희석되고, wick를 atr14로 나누면 변동성 중복 의존이 발생하며, range를 close로 나누면 가격 수준에 과도하게 영향받는다. PRD 기준 분모(open, H, L)로 교정하면 각 피처가 독립적인 정보를 전달하여 KNN 거리 계산 품질이 향상된다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M2 캔들 피처 분모 교정 명세
- `src/vectors/vectorizer.ts` — 현재 extractVolatility() 구현
- `src/vectors/features.ts` — FEATURE_NAMES 피처 정의

## Dependencies
- T-10-006 (전략 피처 정의 — features.ts 변경이 vectorizer에 영향 가능)

## Expected Outputs
- `src/vectors/vectorizer.ts` — extractVolatility() 내 4개 피처 분모 교정 완료
- `tests/vectors/vectorizer.test.ts` — 분모 교정 검증 테스트

## Deliverables
- `src/vectors/vectorizer.ts`
- `tests/vectors/vectorizer.test.ts`

## Constraints
- 변경 대상 피처 및 수식 (5M + 1M 각각 적용):
  - `body_size`: `|close - open| / close` → `|close - open| / open`
  - `upper_wick`: `(high - max(open, close)) / atr14` → `(high - max(open, close)) / high × 1.5`
  - `lower_wick`: `(min(open, close) - low) / atr14` → `(min(open, close) - low) / high × 1.5`
  - `high_low_range`: `(high - low) / close` → `(high - low) / low`
- wick 피처 가중치 1.5는 계산 결과에 직접 곱셈
- 0-division 방어: open=0, high=0, low=0인 경우 → 0.0
- 5M과 1M 양쪽 모두 동일하게 변경 (인덱스 72~77, 85~90 범위)
- vectorize() 출력 길이 = 202 유지
- 다른 피처(price_position, momentum, trend, time_series)는 변경 금지
- NaN/Infinity → 0.0 방어 유지

## Steps
1. extractVolatility()에서 body_size_5m/1m 분모를 close → open으로 변경
2. upper_wick_5m/1m 분모를 atr14 → high로 변경하고 결과에 ×1.5 가중치 적용
3. lower_wick_5m/1m 분모를 atr14 → high로 변경하고 결과에 ×1.5 가중치 적용
4. high_low_range_5m/1m 분모를 close → low로 변경
5. 0-division 방어 조건 업데이트 (close→open/high/low)
6. 기존 테스트 업데이트 + 분모 교정 검증 테스트 추가
7. typecheck + lint 통과 확인

## Acceptance Criteria
- body_size 피처가 open을 분모로 사용
- upper_wick 피처가 high를 분모로 사용하고 1.5 가중치 적용
- lower_wick 피처가 high를 분모로 사용하고 1.5 가중치 적용
- high_low_range 피처가 low를 분모로 사용
- vectorize() 출력 길이 === 202
- 0-division 시 0.0 반환
- `bun run typecheck && bun run lint` 통과

## Test Scenarios
- body_size: open=100, close=105 → |105-100|/100 = 0.05 (분모가 open임을 검증)
- upper_wick: high=110, close=105, open=100 → (110-105)/110 × 1.5 검증
- lower_wick: low=95, open=100, close=105 → (100-95)/110 × 1.5 (분모가 high) 검증
- high_low_range: high=110, low=95 → (110-95)/95 (분모가 low) 검증
- vectorize() with 유효 candles → Float32Array(202)
- vectorize() with open=0 → body_size = 0.0 (0-division 방어)
- vectorize() with high=0 → upper_wick/lower_wick = 0.0 (0-division 방어)

## Validation
```bash
bun test -- --grep "vectorizer"
bun run typecheck
bun run lint
```

## Out of Scope
- 전략 피처 12개 계산 로직 (T-10-006의 vectorizer 반영은 별도)
- 정규화 교정 (T-10-008)
- KNN 파라미터 교정 (T-10-009)
