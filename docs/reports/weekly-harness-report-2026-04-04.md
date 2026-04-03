# Weekly Harness Report — 2026-04-04

## Summary
- Drift items found: 2
- Drift items fixed: 1 (QUALITY_SCORE.md 업데이트)
- Stale tasks: 0
- Code debt markers: 0 (TODO: 0, FIXME: 0, HACK: 0)
- Doc duplications flagged: 1 (백오프 전략 cross-ref 부재)
- Rules promoted: 4 (anti-patterns.md에 추가)
- AI slop detected: 0

## Pass 1: Documentation Drift
| File | Issue | Action |
|------|-------|--------|
| ARCHITECTURE.md | 10/21 모듈 구현, 11개 미구현 (계획대로) | 정상 |
| AGENTS.md | `bun run backtest` 스크립트 미존재 | EP-11 시 추가 예정 |
| QUALITY_SCORE.md | EP-01~03 완료 반영 안 됨 | **수정 완료** |
| Layer violations | 0건 (44개 파일 검사) | 정상 |

## Pass 2: Task Board
- Backlog: 0 tasks (에픽 간 자연 공백 — EP-04 태스크 생성 필요)
- Doing: 0 tasks (WIP 준수)
- Done: 10 tasks (EP-03)
- Archive: 22 tasks (EP-01: 14, EP-02: 8) — **이번 정리에서 아카이빙 완료**
- Stale: 없음
- Ready to start: EP-04 태스크 생성 필요

## Pass 3: Code Debt
| Type | Count | Files |
|------|-------|-------|
| TODO | 0 | — |
| FIXME | 0 | — |
| HACK | 0 | — |
| Dead code | 0 | — |

## Pass 4: Documentation Quality
- Duplications found: 1 (백오프 전략 — ARCHITECTURE.md + RELIABILITY.md에 각각 기술, cross-ref 없음)
- Stale examples: 0

## Pass 5: Promoted Rules
- Error mapping: CCXT 에러를 각 메서드에서 개별 catch 금지 → anti-patterns.md
- Decimal 변환: CCXT number를 toDecimal()로 문자열 경유 변환 → anti-patterns.md
- Idempotency: createOrder에 UUID v7 clientOrderId 필수 → anti-patterns.md
- Float64 지표 계산: 내부 Float64, 출력만 Decimal → anti-patterns.md

## Pass 6: Quality Scores
| Dimension | Previous | Current | Evidence |
|-----------|----------|---------|----------|
| Documentation truthfulness | 3 | 4 | 코어 문서 = 코드 구조, anti-patterns 보강 |
| Architecture clarity | 2 | 4 | check-layers.ts 기계적 검증, L0~L2 위반 0건 |
| Validation coverage | 1 | 4 | 743 tests, TDD, typecheck/lint/build 게이트 |
| Reliability readiness | 2 | 2 | exchanges 에러처리 구현, 대조/복구는 미구현 |
| Security hygiene | 1 | 2 | API key ExchangeConfig 전달, .env 미커밋 |
| Developer experience | 1 | 4 | 전체 스크립트 작동, seed/migrate/check-layers |

## Pass 7: AI Slop Detection
| Category | Count | Files | Severity |
|----------|-------|-------|----------|
| Dead code | 0 | — | — |
| Unused abstractions | 0 | — | — |
| Duplication | 1 | base.ts + ws-manager.ts (의도적 백오프 차이) | Info |
| Naming issues | 0 | — | — |

## Recommendations
1. **EP-03 커밋** — 전체 exchanges 구현물 git commit
2. **EP-04 태스크 생성** — backlog 빈 상태, task-generator 실행 필요
3. **ARCHITECTURE.md ↔ RELIABILITY.md 백오프 cross-ref 추가** — minor, 다음 정리 시
