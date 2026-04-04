# T-12-007 Vectorizer — 전략 피처 Part 3 (breakout/disparity/daily_open/session_box) + 호출자 연결 확인

## Goal
extractStrategy()의 indices 198-201에 해당하는 마지막 4개 전략 피처를 구현하고, 전체 12개 피처가 features.ts 정의와 일치하는지 최종 확인한다.

## Why
T-12-005, T-12-006에서 8개 피처를 구현했으나, 마지막 4개(breakout_intensity, disparity_divergence, daily_open_distance, session_box_position)가 남아있다. 이 태스크 완료로 indices 190-201 전체가 전략 피처로 채워진다.

## Inputs
- `src/vectors/vectorizer.ts` — T-12-005/006에서 업데이트된 extractStrategy()
- `src/vectors/features.ts` — STRATEGY[8..11], FEATURE_WEIGHTS
- `src/indicators/types.ts` — AllIndicators

## Dependencies
- T-12-005 (extractStrategy 뼈대)

## Expected Outputs
- extractStrategy() 12개 피처 모두 구현
- features.ts FEATURE_NAMES[190..201]과 vectorizer.ts 출력 순서 1:1 일��� 확인

## Deliverables
- `src/vectors/vectorizer.ts` — extractStrategy() 인덱스 198-201 구현 + 전체 검증 테스트

## Constraints
- breakout_intensity: close > BB20_upper → (close - BB20_upper) / ATR14, close < BB20_lower → (BB20_lower - close) / ATR14, 중간 → 0. weight 1.0
- disparity_divergence: price_slope(10봉) - disparity_slope(10봉). PRD는 bb4_pct_b_5m - bb20_pct_b_5m. weight 1.0
- daily_open_distance: (close - daily_open) / ATR14. daily_open은 VectorizerCtx에 주입 필요. weight 1.5
- session_box_position: (close - session_low) / (session_high - session_low). session box는 SymbolState에서 주입. weight 1.5
- 지표/데이터 null → 0.5, NaN/Infinity → 0.5

## Steps
1. breakout_intensity 구현
2. disparity_divergence 구현: bb4 %B와 bb20 %B 차이로 단순화
3. daily_open_distance 구현: VectorizerCtx에 daily_open 필드 추가 (pipeline에서 전달)
4. session_box_position 구현: VectorizerCtx에 session_box 필드 추가 (pipeline에서 전달)
5. FEATURE_NAMES[190..201] vs extractStrategy() 출력 순서 대조 테스트
6. vectorize() → extractStrategy() → 최종 벡터 경로 통합 테스트
7. 기존 테스트 모두 통과 확인

## Acceptance Criteria
- indices 190-201 전체가 유의미한 전략 피처 값 (0.5 placeholder 없음)
- features.ts FEATURE_NAMES[190..201]과 vectorizer.ts 출력 순서 정확히 일치
- FEATURE_WEIGHTS에 정의된 가중치(bb4_position=2.0, pivot=1.5, daily_open=1.5, session_box=1.5) 반영
- NaN/Infinity → 0.5, null → 0.5
- **호출자 확인**: vectorize() → extractStrategy() → 최종 벡터[190..201] 경로가 실제 동작

## Test Scenarios
- breakout_intensity close > BB20_upper → 양수
- breakout_intensity close 밴드 내 → 0
- disparity_divergence bb4 %B > bb20 %B → 양수
- daily_open_distance close > daily_open → 양수, ATR14=null → 0.5
- session_box_position close=session_low → 0.0, close=session_high → 1.0
- session_box_position session_high=session_low → 0.5 (division by zero 방어)
- 전체 통합: vectorize() 호출 → 202차원 벡터 반환 → indices 190-201 모두 non-placeholder

## Validation
```bash
bun test -- tests/vectors/
bun run typecheck && bun run lint
```

## Out of Scope
- 정규화 파라미터 변경 (normalizer는 이미 EP-10에서 교정됨)
- 기존 인덱스 0-189 변경
