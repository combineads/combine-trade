# EP-05 Signal Pipeline — Archive Summary

**Completed**: 2026-04-04
**Tasks**: 15 (T-05-000 ~ T-05-014)
**Tests added**: +381 (865 → 1246)
**Waves**: 6

## Key decisions
- 벡터 202차원 피처를 6개 카테고리로 분류 (가격 위치, 모멘텀, 변동성, 추세, 시계열, 세션)
- Signal 2단계 흐름: Evidence Gate에서 knn_decision=null로 생성 → KNN에서 업데이트
- A-grade 판정: DOUBLE_B + safety_passed + winrate ≥ 0.65
- 1M 노이즈 필터를 Safety Gate에 통합 (별도 모듈 대신)
- WATCHING 감지기 3유형(Squeeze Breakout, S/R Confluence, BB4 Touch)을 단일 모듈로 통합
- 스키마 마이그레이션을 도메인별 3개 태스크로 분할 (TradeBlock+WatchSession → Signal+SignalDetail → Vector+HNSW)
- 시간 감쇠: 지수 감쇠 (half-life 90일 기본, CommonCode 설정)
- KNN 검색: pgvector HNSW (cosine 기본, L2 전환 가능, ef_search=100)
- 거래차단: 반복 패턴 5건 시드 + fail-closed 정책

## Patterns discovered
- 스키마 태스크 분할: 5개 테이블을 도메인별 3개로 나눠 병렬화 가능 + 리뷰 용이
- 파일 소유권 충돌 방지: watching.ts 3개 태스크→1개 통합으로 merge conflict 제거
- 순수 함수 + DB 사이드이펙트 분리: checkEvidence(pure) + createSignal(DB) 패턴 반복
- constructor injection 대신 함수 인자 주입: EP-04 패턴 계승

## Outputs produced
- `docs/VECTOR_SPEC.md` — 202차원 벡터 피처 사양
- `src/vectors/` — features.ts, vectorizer.ts, normalizer.ts, repository.ts
- `src/filters/` — daily-direction.ts, trade-block.ts
- `src/signals/` — watching.ts, evidence-gate.ts, safety-gate.ts
- `src/knn/` — engine.ts, time-decay.ts, decision.ts
- `src/db/schema.ts` — TradeBlock, WatchSession, Signal, SignalDetail, Vector 테이블
- `drizzle/` — 3개 마이그레이션 (0002, 0003, 0004)
