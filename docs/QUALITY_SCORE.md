# QUALITY_SCORE.md

## Scoring rubric
Score each category from 0 to 5.

- Documentation truthfulness
- Architecture clarity
- Validation coverage
- Reliability readiness
- Security hygiene
- Developer experience

## Current score (2026-04-05, post EP-12)
| Category | Score | Notes |
|---|---:|---|
| Documentation truthfulness | 5 | ARCHITECTURE.md 모듈 맵 21/21. VECTOR_SPEC.md 전략 피처 12개 정합. 중복 VECTOR_SPEC 2벌 존재 (minor) |
| Architecture clarity | 5 | L0~L9 전체 구현. TicketSnapshot L0 이동으로 레이어 위반 해소. db/queries.ts L1 준수 |
| Validation coverage | 5 | 2,266 tests / 0 fail (+103 신규). 전략 검증 기존 6 fail 전부 수정. 코드 부채 마커 0건 |
| Reliability readiness | 5 | crash-recovery WatchSession 복원 추가. daily_bias 교차검증으로 방향 모순 진입 차단 |
| Security hygiene | **3** | 변동 없음. 킬스위치 CLI 미인증 유지 |
| Developer experience | **5** | 변동 없음. EP-12 전략 정합성 100% 달성으로 백테스트 준비 완료 |

**Total: 28/30 (변동 없음)**

## Score changes from EP-11 to EP-12
| Category | EP-11 | EP-12 | Delta | Evidence |
|---|---:|---:|---:|---|
| Validation coverage | 5 | 5 | 0 | +103 테스트, 6 fail→0 fail. 점수 유지 (이미 5점) |
| Reliability readiness | 5 | 5 | 0 | WatchSession 복원, daily_bias 교차검증, tp1/tp2 DB 갱신 추가. 점수 유지 (이미 5점) |

EP-12는 기존 코드의 PRD 정합성 교정이므로 점수 자체보다 기반 품질이 강화됨.

## Top 3 quality risks
1. WebSocket 24/7 안정성 미검증 (단위 테스트만)
2. extractStrategy() 296줄 — 12개 피처를 개별 함수로 분리 권장
3. makeGetActiveTickets() factory가 daemon 부트스트랩에 미배선 — 프로덕션 검증 필요

## Next cleanup targets
- EP-13 (백테스트/WFO) 에픽 계획 + 구현
- extractStrategy() 리팩토링 (12개 내부 함수 분리)
- makeGetActiveTickets() daemon wiring 확인/추가
- 킬스위치 CLI 인증 추가 (Security hygiene 4점 목표)
- 중복 VECTOR_SPEC.md 정리 (docs/ vs docs/specs/)
