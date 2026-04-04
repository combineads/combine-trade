# QUALITY_SCORE.md

## Scoring rubric
Score each category from 0 to 5.

- Documentation truthfulness
- Architecture clarity
- Validation coverage
- Reliability readiness
- Security hygiene
- Developer experience

## Current score (2026-04-04, post EP-04)
| Category | Score | Notes |
|---|---:|---|
| Documentation truthfulness | 4 | ARCHITECTURE.md 레이아웃 = 실제 src/ 구조 (candles/ 포함 13/21 모듈 구현). DATA_MODEL.md Candle 엔티티 = db/schema.ts candleTable 일치. anti-patterns.md 4개 항목 유효 |
| Architecture clarity | 4 | 레이어 규칙 기계적 검증(check-layers.ts). L0~L3 구현 완료, candles/ 임포트 전수 검사 위반 0건. 레이어 방향: core(L0), db(L1), candles(L3) → core+db만 임포트 |
| Validation coverage | 5 | 865 tests (EP-03: 743 → EP-04: +122), typecheck/lint 게이트 작동. DB 통합 테스트 도입 (Docker PostgreSQL + test-db 헬퍼). 조건부 UPSERT, 갭 감지 등 실제 DB에서 검증. build는 web UI 미구현으로 실패 (예상됨, EP-09+) |
| Reliability readiness | 3 | EP-04에서 갭 감지/복구, WS 재연결 감지, 캔들 마감 이벤트 구현. 에러 격리 (개별 모듈 실패가 전체 중단 안 함). 대조/크래시복구는 EP-08 이후 |
| Security hygiene | 2 | API key는 ExchangeConfig로 전달, .env 미커밋. .env.test는 로컬 테스트 전용 (비밀 없음). 인증/세션은 미구현 |
| Developer experience | 4 | bun dev/test/lint/typecheck 모두 동작. docker-compose로 테스트 DB 원클릭 구동. seed/migrate/check-layers 스크립트. build는 web UI 부재로 실패 (정상) |

## Score changes from EP-03 to EP-04
| Category | EP-03 | EP-04 | Delta | Evidence |
|---|---:|---:|---:|---|
| Validation coverage | 4 | 5 | +1 | 865 tests (+122). DB 통합 테스트 인프라 도입 (mock 금지, 실제 PostgreSQL). 9개 candle 테스트 파일, 3435 LOC |
| Reliability readiness | 2 | 3 | +1 | 갭 감지/복구 구현, WS 재연결 감지 (timeframe*3 임계값), 캔들 마감 이벤트 dedup, 에러 격리 패턴 |

## Top 3 quality risks
1. 대조(reconciliation) + 크래시 복구 미구현 — 라이브 안전성의 핵심
2. WebSocket 24/7 안정성 미검증 (단위 테스트만, 장시간 통합 테스트 부재)
3. `bun run build` Vite 빌드 실패 (index.html 미존재) — web UI 에픽에서 해결 예정

## Next cleanup targets
- EP-05 태스크 생성 후 backlog 채우기
- collector.ts와 gap-detection.ts 간 TIMEFRAME_DURATION_MS 중복 통합 고려 (minor)
- WebSocket 장시간 통합 테스트 계획 (EP-09)
- QUALITY_SCORE 재평가: EP-05 완료 후
