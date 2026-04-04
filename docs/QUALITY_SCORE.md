# QUALITY_SCORE.md

## Scoring rubric
Score each category from 0 to 5.

- Documentation truthfulness
- Architecture clarity
- Validation coverage
- Reliability readiness
- Security hygiene
- Developer experience

## Current score (2026-04-04, post EP-06)
| Category | Score | Notes |
|---|---:|---|
| Documentation truthfulness | 4 | ARCHITECTURE.md 모듈 맵 EP-06 실제 API로 갱신 완료. DATA_MODEL.md 13개 엔티티 중 10개 테이블 구현 (Ticket, Order 추가). 20/21 모듈에 실제 코드 존재 (reconciliation만 stub) |
| Architecture clarity | 5 | L0~L6 구현 완료, 0건 레이어 위반. limits(L5)→positions(L5) import 회피 — db/schema(L1) 직접 접근으로 해결. 3개 신규 모듈(positions L5, orders L6, limits L5) 모두 레이어 준수 |
| Validation coverage | 5 | 1491 tests (EP-05: 1246 → EP-06: +245), typecheck/lint clean. DB 통합 테스트(ticket-manager, loss-limit) + E2E 포지션 진입 테스트 7시나리오. 순수 함수 테스트(fsm, sizer, slippage, checkLossLimit) 포함 |
| Reliability readiness | 3 | SL fail-closed (3회 재시도 → 강제 청산), 슬리피지 ABORT → 강제 청산, 3단계 손실 제한. 모드 가드(analysis 차단). 대조/크래시복구는 EP-08 이후 |
| Security hygiene | 2 | 변동 없음. idempotency_key로 주문 멱등성 확보 (양성). API key는 ExchangeConfig로 전달, .env 미커밋. 인증/세션은 미구현 |
| Developer experience | 4 | bun dev/test/lint/typecheck 모두 동작. docker-compose로 테스트 DB 원클릭. 코드 부채(TODO/FIXME/HACK) 0건 |

## Score changes from EP-05 to EP-06
| Category | EP-05 | EP-06 | Delta | Evidence |
|---|---:|---:|---:|---|
| Documentation truthfulness | 4 | 4 | 0 | ARCHITECTURE.md 모듈 맵 실제 API로 갱신. DATA_MODEL.md Ticket/Order = schema.ts 일치. 테이블 10/13 구현 |
| Architecture clarity | 5 | 5 | 0 | L5(positions, limits), L6(orders) 3개 모듈 추가. 레이어 위반 0건. same-layer 의존성 L1 경유로 해결 |
| Validation coverage | 5 | 5 | 0 | 1491 tests (+245). 7 E2E 시나리오 (LONG/SHORT/손실제한/SL실패/슬리피지/모드가드/레버리지캡) |
| Reliability readiness | 3 | 3 | 0 | SL fail-closed, 슬리피지 ABORT, 손실 제한 추가. 대조는 여전히 미구현 |

## Top 3 quality risks
1. 대조(reconciliation) + 크래시 복구 미구현 — 라이브 안전성의 핵심 (EP-08)
2. WebSocket 24/7 안정성 미검증 (단위 테스트만, 장시간 통합 테스트 부재)
3. executor.ts `executeEntry()` 219줄 — 7단계 로직이 한 함수에 집중. 향후 헬퍼 추출 고려

## Next cleanup targets
- EP-07 (Exits & Labeling) 에픽 계획 및 태스크 생성
- executor.ts `executeEntry()` 219줄 → 헬퍼 추출 검토 (SL 등록 로직, 슬리피지 체크 분리)
- loss-limit.ts `NodePgDatabase` → `DbInstance` 타입 통일
- vectorizer.ts 931줄 — 카테고리별 파일 분리 검토
- QUALITY_SCORE 재평가: EP-07 완료 후
