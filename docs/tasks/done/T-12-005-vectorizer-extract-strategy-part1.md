# T-12-005 Vectorizer — extractSession()→extractStrategy() 교체 + Part 1 (bb20/bb4/ma/ma20_slope)

## Goal
vectorizer.ts의 `extractSession()` 함수를 `extractStrategy()`로 교체하고, 첫 4개 전략 피처(bb20_position, bb4_position, ma_ordering, ma20_slope)를 구현한다.

## Why
features.ts는 indices 190-201을 STRATEGY 피처로 정의하지만, vectorizer.ts의 extractSession()은 동일 인덱스에 session/timing 피처(hourSin, dowSin 등)를 채운다. 정의와 구현이 불일치하여 KNN 거리 계산이 무의미. session/timing 피처를 전략 피처로 교체한다.

## Inputs
- `src/vectors/vectorizer.ts` — extractSession() (라인 842-896), vectorize() 호출부
- `src/vectors/features.ts` — STRATEGY 배열 (라인 286-299), FEATURE_WEIGHTS (라인 347+)
- `src/indicators/types.ts` — AllIndicators (sma20, sma60, sma120, bb20, bb4)

## Dependencies
없음 (독립 태스크)

## Expected Outputs
- `extractStrategy()` 함수 (12개 number 배열 반환, Part 1은 첫 4개 구현 + 나머지 8개는 0.5 placeholder)
- vectorize()에서 extractSession() → extractStrategy() 호출로 변경
- 기존 extractSession() 관련 테스트 업데이트

## Deliverables
- `src/vectors/vectorizer.ts` — extractSession() 삭제, extractStrategy() 추가, vectorize() 호출 변경

## Constraints
- bb20_position: (close - BB20_lower) / BB20_width → [-∞, +∞], 기본 weight 1.0
- bb4_position: (open - BB4_lower) / BB4_width → [-∞, +∞], weight 2.0
- ma_ordering: (MA20>MA60 ? 1 : 0 + MA60>MA120 ? 1 : 0) / 2 → [0, 1]
- ma20_slope: (MA20[현재] - MA20[3봉전]) / MA20[3봉전] → 상대 비율
- width=0 → 0.5 (center), 지표 null → 0.5
- NaN/Infinity → 0.5
- 미래 참조 금지

## Steps
1. extractSession() 함수 삭제
2. extractStrategy(ctx: VectorizerCtx): number[] 함수 생성
3. bb20_position 구현: `(close - bb20.lower) / (bb20.upper - bb20.lower)`, width=0 → 0.5
4. bb4_position 구현: `(open - bb4.lower) / (bb4.upper - bb4.lower)`, width=0 → 0.5
5. ma_ordering 구현: MA20, MA60, MA120 비교. null MA → 0.5
6. ma20_slope 구현: candles 배열에서 3봉 전 sma20 필요 → prevSma20 또는 직접 계산
7. 나머지 8개 인덱스: 0.5 placeholder (Part 2, 3에서 구현)
8. vectorize()에서 extractSession() → extractStrategy() 호출 변경
9. 테스트 작성 + 기존 session 테스트 업데이트

## Acceptance Criteria
- indices 190-193이 bb20_position, bb4_position, ma_ordering, ma20_slope 값
- indices 194-201은 0.5 placeholder (Part 2, 3에서 채움)
- vectorize() 반환 배열 길이 = 202
- features.ts FEATURE_NAMES[190..193]과 실제 출력 순서 일치
- NaN/Infinity → 0.5, null 지표 → 0.5
- **호출자 확인**: vectorize() 내부에서 extractStrategy()가 호출되고 결과가 최종 벡터[190..201]에 포함됨

## Test Scenarios
- extractStrategy() bb20 존재 + close가 밴드 중간 → bb20_position ≈ 0.5
- extractStrategy() bb4 존재 + open이 lower 터치 → bb4_position ≈ 0.0
- extractStrategy() bb20.width = 0 → bb20_position = 0.5
- extractStrategy() MA20 > MA60 > MA120 → ma_ordering = 1.0
- extractStrategy() MA120 > MA60 > MA20 → ma_ordering = 0.0
- extractStrategy() MA20 상승 (3봉 전 대비) → ma20_slope > 0
- vectorize() 반환 length = 202, indices 190-193 ≠ 0.5 (유의미한 값)

## Validation
```bash
bun test -- tests/vectors/
bun run typecheck && bun run lint
```

## Out of Scope
- 피처 194-197 (atr_separation, pivot, rsi_normalized, rsi_extreme_count) → T-12-006
- 피처 198-201 (breakout, disparity, daily_open, session_box) → T-12-007

## Implementation Notes (2026-04-04)
- extractSession() 함수 삭제 완료 (라인 842-896 → extractStrategy()로 교체)
- ma20_slope: `ind.sma20`/`ind.prevSma20` 대신 ctx.sma20Series (3봉전 lag) 사용 — sma20Series는 buildCtx에서 calcSMASeries로 미리 계산됨
- bb20Position/bb4Position: NaN/Infinity 보호를 위해 `safe(v) !== v ? 0.5 : v` 패턴 사용 (safe()가 0.0 반환하므로 직접 safe() 호출 불가)
- ma20_slope가 0.5인 경우: sma20_curr==0 || sma20_lag3==0 (웜업 부족) 또는 safe() 후 Infinity
- 세션 관련 테스트 13개 제거, 전략 피처 테스트 11개 추가
- 78/78 tests pass, typecheck clean, lint clean
