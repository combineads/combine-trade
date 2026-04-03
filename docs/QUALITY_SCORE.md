# QUALITY_SCORE.md

## Scoring rubric
Score each category from 0 to 5.

- Documentation truthfulness
- Architecture clarity
- Validation coverage
- Reliability readiness
- Security hygiene
- Developer experience

## Current score (2026-04-04, post EP-03)
| Category | Score | Notes |
|---|---:|---|
| Documentation truthfulness | 4 | 모든 코어 문서가 코드와 일치. ARCHITECTURE.md 레이아웃 = 실제 구조. anti-patterns.md 실질 항목 보강 |
| Architecture clarity | 4 | 레이어 규칙 기계적 검증(check-layers.ts). L0~L2 구현 완료, 위반 0건 |
| Validation coverage | 4 | 743 tests, typecheck/lint/build 게이트 작동. EP-01~03 전체 TDD. 통합 테스트 포함 |
| Reliability readiness | 2 | 에러 매핑/재시도/백오프 구현됨(exchanges). 대조/크래시복구는 EP-08 이후 |
| Security hygiene | 2 | API key는 ExchangeConfig로 전달, .env 미커밋. 인증/세션은 미구현 |
| Developer experience | 4 | bun dev/test/lint/typecheck/build 모두 동작. seed/migrate 스크립트. 레이어 검증 자동화 |

## Top 3 quality risks
1. 대조(reconciliation) + 크래시 복구 미구현 — 라이브 안전성의 핵심
2. WebSocket 24/7 안정성 미검증 (단위 테스트만, 장시간 통합 테스트 부재)
3. Backtest/live 코드 경로 동일성 아직 검증 불가 (backtest 모듈 미구현)

## Next cleanup targets
- EP-04 태스크 생성 후 backlog 채우기
- WebSocket 장시간 통합 테스트 계획 (EP-04 or EP-09)
- QUALITY_SCORE 재평가: EP-04 완료 후
