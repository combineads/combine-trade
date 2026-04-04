# QUALITY_SCORE.md

## Scoring rubric
Score each category from 0 to 5.

- Documentation truthfulness
- Architecture clarity
- Validation coverage
- Reliability readiness
- Security hygiene
- Developer experience

## Current score (2026-04-04, post EP-07)
| Category | Score | Notes |
|---|---:|---|
| Documentation truthfulness | 4 | ARCHITECTURE.md 모듈 맵 EP-06 갱신 완료 (EP-07 exits/labeling은 아직 미갱신). DATA_MODEL.md 13개 엔티티 중 10개 테이블 구현. 20/21 모듈에 실제 코드 (reconciliation만 stub) |
| Architecture clarity | 5 | L0~L6 전체 구현, 0건 레이어 위반. pyramid(L5)→executor(L6) DI 콜백 패턴으로 레이어 규칙 준수. exits/labeling 모듈 모두 레이어 정합 |
| Validation coverage | 5 | 1616 tests (EP-06: 1491 → EP-07: +125), typecheck/lint clean. E2E 청산→라벨링 7시나리오 + E2E 진입 7시나리오. 순수 함수(checker, trailing, classify) + DB 통합(manager, finalizeLabel) |
| Reliability readiness | 3 | 3단계 청산 + 트레일링 라쳇 + TIME_EXIT 60h 보호. SL fail-closed, 슬리피지 ABORT, 3단계 손실 제한. 대조/크래시복구는 EP-08 이후 |
| Security hygiene | 2 | 변동 없음 |
| Developer experience | 4 | 코드 부채 0건. 전체 검증 파이프라인 정상 |

## Score changes from EP-06 to EP-07
| Category | EP-06 | EP-07 | Delta | Evidence |
|---|---:|---:|---:|---|
| Architecture clarity | 5 | 5 | 0 | exits(L6), labeling(L6) 추가. pyramid DI 콜백 패턴. 레이어 위반 0건 |
| Validation coverage | 5 | 5 | 0 | 1616 tests (+125). E2E 청산→라벨링 7시나리오 |
| Reliability readiness | 3 | 3 | 0 | 3단계 청산, 트레일링 라쳇, TIME_EXIT 추가. 대조 미구현 |

## Top 3 quality risks
1. 대조(reconciliation) + 크래시 복구 미구현 — 라이브 안전성의 핵심 (EP-08)
2. WebSocket 24/7 안정성 미검증 (단위 테스트만, 장시간 통합 테스트 부재)
3. ARCHITECTURE.md 모듈 맵에 exits/labeling 실제 API 미반영 (exits: checkExit/processExit, labeling: classifyResult/finalizeLabel)

## Next cleanup targets
- EP-08 (Safety Net) 에픽 계획 및 태스크 생성
- ARCHITECTURE.md 모듈 맵: exits, labeling 실제 API 갱신
- executor.ts `executeEntry()` 219줄 → 헬퍼 추출 검토
- loss-limit.ts `NodePgDatabase` → `DbInstance` 타입 통일
- QUALITY_SCORE 재평가: EP-08 완료 후
