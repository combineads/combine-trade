# Weekly Harness Report — 2026-04-05

## Summary
- Drift items found: 5
- Drift items fixed: 2
- Stale tasks: 0
- Code debt markers: 0 (FIXME: 0, TODO: 0, HACK: 0)
- Doc duplications flagged: 1
- Rules promoted: 1
- Epic archived: EP-12 (14 tasks)

## Pass 1: Documentation Drift
| File | Issue | Action |
|------|-------|--------|
| src/db/queries.ts | Layer 주석 L3→L1 오류 | **수정 완료** |
| docs/QUALITY_SCORE.md | EP-12 완료 후 미갱신 | **수정 완료** |
| package.json | `bun run backtest` 스크립트 미등록 | 플래그 (EP-13에서 처리) |
| docs/VECTOR_SPEC.md | docs/와 docs/specs/ 2벌 존재 | 플래그 (정리 필요) |
| docs/ARCHITECTURE.md | TicketSnapshot L0 이동 미기록 | 플래그 (minor) |

## Pass 2: Task Board
- Backlog: 0 tasks (healthy — EP-13 태스크 생성 대기)
- Doing: 0 tasks (within WIP limit)
- Done: 0 tasks (EP-12 아카이빙 완료)
- Archived: EP-12 → docs/tasks/archive/ep-12-strategy-verification-fix/ (14 tasks + SUMMARY.md)

## Pass 3: Code Debt
| Type | Count | Files |
|------|-------|-------|
| TODO | 0 | — |
| FIXME | 0 | — |
| HACK | 0 | — |
| Dead code | 0 | calcSlPrice export 정당, extractSession 완전 제거 |

## Pass 4: Documentation Quality
- Duplications found: VECTOR_SPEC.md 2벌 (docs/ vs docs/specs/) — 통합 필요
- Stale examples: 없음 (extractSession 참조 제거 확인)
- Strategy features: 3개 소스(specs/code/exec-plan) 정합성 확인

## Pass 5: Promoted Rules
- **"Wiring 검증 규칙"** → AGENTS.md 추가 권장
  - 인터페이스 필드/계약 선언 시 DI 구현체와 소비자 양쪽 배선 확인 필수
  - EP-10에서 3건 누락 (bb4_1h 미주입, daily_bias 교차검증 미구현, tp1/tp2 DB 미반영)
  - EP-12에서 모두 수정됨

## Pass 6: Quality Scores
| Dimension | Previous | Current | Evidence |
|-----------|----------|---------|----------|
| Documentation truthfulness | 5 | 5 | VECTOR_SPEC 정합, 중복 2벌은 minor |
| Architecture clarity | 5 | 5 | 레이어 위반 해소, L0~L9 정상 |
| Validation coverage | 5 | 5 | 2266 tests / 0 fail (+103) |
| Reliability readiness | 5 | 5 | WatchSession 복원, daily_bias 교차검증 |
| Security hygiene | 3 | 3 | 변동 없음 |
| Developer experience | 5 | 5 | 전략 정합성 100% → 백테스트 준비 |
| **Total** | **28/30** | **28/30** | |

## Pass 7: AI Slop Detection
| Category | Count | Files | Severity |
|----------|-------|-------|----------|
| Dead code | 0 | — | — |
| Unused abstractions | 1 | makeGetActiveTickets (미배선) | medium |
| Duplication | 1 | safety-gate 순추세 bypass 2회 (의도적) | low |
| Long functions | 1 | extractStrategy() 296줄 | medium |
| Naming issues | 0 | — | — |

## Recommendations
1. **EP-13 시작**: 백테스트/WFO 에픽 계획 및 태스크 생성
2. **makeGetActiveTickets() 배선**: daemon 부트스트랩에서 makeGetActiveTickets(db) 호출 확인/추가
3. **extractStrategy() 리팩토링**: 12개 피처를 개별 내부 함수로 분리 (296줄 → ~100줄)
