# EP-15 PRD v2.0 코드 정렬 — Archive Summary

## Completed
- Date: 2026-04-05
- Tasks: 15/15 (0 failed, 0 blocked)
- Waves: 10
- Tests: 2776 pass / 0 fail

## Key Decisions
- D-001: atr_separation = (bb20_upper − bb20_lower) / ATR14
- D-002: rsi_extreme_count = count(RSI>70 or <30) in 14 bars / 14
- D-003: breakout_intensity = |close − bb20_band| / (bb20_upper − bb20_lower)
- D-004: disparity_divergence = (close/MA20 − 1) − (RSI14/50 − 1)
- D-005: pgvector pre-multiply 채택 (sqrt(weight) × feature → 저장)

## Patterns Discovered
- Pre-multiply가 post-rerank보다 단순하고 HNSW 인덱스 완전 호환
- A-grade 로직은 evidence gate → pipeline → decision 3개 파일에 걸쳐 흐르므로, 시그니처 변경 시 전수 검색(grep) 필수
- normalizer.ts는 분포 무관 (Median/IQR) → 벡터 구조 변경에도 수정 불필요

## Outputs Produced
- `src/vectors/candle-features.ts` — 38봉×5 캔들 피처 추출기 (190dim)
- `src/vectors/strategy-features.ts` — 12 전략 피처 추출기
- `src/vectors/vectorizer.ts` — 202차원 조립기 (1175줄→75줄)
- `src/vectors/feature-spec.ts` — FEATURE_NAMES, VECTOR_DIM, FEATURE_WEIGHTS 상수
- `src/knn/decision.ts` — makeDecision(neighbors, isAGrade, config) 시그니처
- `src/knn/engine.ts` — buildWeightIndexMap() + D-005 문서화
- `src/signals/safety-gate.ts` — checkNoise1M() 5M MA20 기반
- `src/transfer/balance.ts` — calculateTransferable() 수익 기반
- `src/transfer/scheduler.ts` — getDailyProfit() 신규
- `src/api/routes/stats.ts` — expectancy, max_consecutive_losses 필드
- `src/web/src/components/trades/PerformanceSummary.tsx` — 7개 카드
- `scripts/regenerate-vectors.ts` — 벡터 재생성 스크립트
- `drizzle/0007_invalidate_vectors.sql` — 벡터 무효화 마이그레이션
- `docs/decisions/ADR-004-economic-calendar-source.md`
