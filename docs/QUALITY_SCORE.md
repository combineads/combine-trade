# QUALITY_SCORE.md

## Scoring rubric
Score each category from 0 to 5.

- Documentation truthfulness
- Architecture clarity
- Validation coverage
- Reliability readiness
- Security hygiene
- Developer experience

## Current score (2026-04-04, post EP-05)
| Category | Score | Notes |
|---|---:|---|
| Documentation truthfulness | 4 | ARCHITECTURE.md = 실제 src/ 구조 (filters/signals/vectors/knn 포함 17/21 모듈 구현). DATA_MODEL.md 13개 엔티티 중 8개 테이블 구현 (Symbol, SymbolState, CommonCode, Candle, TradeBlock, WatchSession, Signal, SignalDetail, Vector). VECTOR_SPEC.md 202피처 = features.ts 상수 일치 |
| Architecture clarity | 5 | 레이어 규칙 기계적 검증(check-layers.ts). L0~L5 구현 완료, 0건 위반. 4개 신규 모듈(filters L4, signals L5, vectors L3, knn L4) 모두 레이어 준수. 모듈 간 의존성 방향 정확 |
| Validation coverage | 5 | 1246 tests (EP-04: 865 → EP-05: +381), typecheck/lint clean. DB 통합 테스트 + E2E 파이프라인 테스트. 5개 E2E 시나리오 (LONG/SHORT/차단/Safety실패/KNN SKIP). pgvector HNSW 검색 테스트 포함 |
| Reliability readiness | 3 | Safety Gate fail-closed, 거래차단 fail-closed. 시간 감쇠로 오래된 데이터 가중치 감소. 대조/크래시복구는 EP-08 이후 |
| Security hygiene | 2 | 변동 없음. API key는 ExchangeConfig로 전달, .env 미커밋. 인증/세션은 미구현 |
| Developer experience | 4 | bun dev/test/lint/typecheck 모두 동작. docker-compose로 테스트 DB 원클릭. 코드 부채(TODO/FIXME/HACK) 0건 |

## Score changes from EP-04 to EP-05
| Category | EP-04 | EP-05 | Delta | Evidence |
|---|---:|---:|---:|---|
| Architecture clarity | 4 | 5 | +1 | L4(filters, knn), L5(signals), L3(vectors) 4개 모듈 추가. 레이어 위반 0건. 모듈 간 의존성 그래프 검증 (6 Wave 병렬 실행 성공) |
| Documentation truthfulness | 4 | 4 | 0 | VECTOR_SPEC.md 신규 추가. 기존 문서와 코드 일치 유지 |

## Top 3 quality risks
1. 대조(reconciliation) + 크래시 복구 미구현 — 라이브 안전성의 핵심
2. WebSocket 24/7 안정성 미검증 (단위 테스트만, 장시간 통합 테스트 부재)
3. `bun run build` Vite 빌드 실패 (index.html 미존재) — web UI 에픽에서 해결 예정

## Next cleanup targets
- EP-06 (Position Management) 에픽 계획 및 태스크 생성
- vectorizer.ts 931줄 — 기능상 문제 없으나, 카테고리별 추출 함수를 별도 파일로 분리 고려
- WebSocket 장시간 통합 테스트 계획 (EP-09)
- QUALITY_SCORE 재평가: EP-06 완료 후
