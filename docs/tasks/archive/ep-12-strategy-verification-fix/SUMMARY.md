# EP-12 Strategy Verification Fix — Archive Summary

- **Completed**: 2026-04-05
- **Tasks**: 14 (T-12-001 ~ T-12-014)
- **Tests added**: ~103 (2163 → 2266)
- **Source LOC**: +2889 / -304 (교정 위주 + 전략 피처 신규)
- **Waves**: 8 sub-waves (WIP=2)
- **QA failures**: 0
- **Review rejections**: 0

## Key decisions
- indices 190-201: extractSession()(session/timing) → extractStrategy()(전략 피처)로 교체 — features.ts 정의를 따름
- daily_bias 교차 검증을 pipeline.ts(L9)에서 수행 — EP-10 Decision log 약속 이행
- tp1/tp2 1H 갱신: updateTpPrices() 순수 함수 → updateWatchSessionTp() DB 반영 추가
- SL 공식: ATR×0.5 → 꼬리길이×15% (PRD 명세 이행)
- TP2 divisor: 3 → 2 (잔여의 50% 청산)
- min_samples: 20 → 30
- TicketSnapshot 타입: reconciliation/comparator → core/types (L0)로 이동 (레이어 위반 해소)
- FOR UPDATE: src/db/queries.ts에 makeGetActiveTickets() factory 신규 생성

## Patterns discovered
- EP-10 누락 근본 원인: 인터페이스(함수 정의, 체크 코드)만 작성하고 연결(pipeline 주입, DB 반영)을 빠트림
- "Wiring 검증" 패턴: 모든 태스크 AC에 "호출자 확인" + 통합 테스트 필수화

## Outputs produced
- `src/signals/safety-gate.ts` — 금지1 역추세 bypass, 금지3 avg_range_5 교정
- `src/signals/evidence-gate.ts` — calcSlPrice() 꼬리길이×15%
- `src/daemon/pipeline.ts` — bb4_1h 주입, daily_bias 교차검증, tp1/tp2 DB 갱신
- `src/vectors/vectorizer.ts` — extractStrategy() 12개 전략 피처 완전 구현
- `src/exits/checker.ts` — TP2_CLOSE_DIVISOR 3→2
- `src/knn/decision.ts` — DEFAULT_MIN_SAMPLES 20→30
- `src/daemon/crash-recovery.ts` — WatchSession 복원/무효화
- `src/db/queries.ts` — makeGetActiveTickets() FOR UPDATE 구현
- `src/signals/watching.ts` — updateWatchSessionTp() DB 갱신 함수
- `src/core/types.ts` — TicketSnapshot 타입 L0 이동
