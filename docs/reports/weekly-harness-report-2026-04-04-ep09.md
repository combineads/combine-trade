# Weekly Harness Report — 2026-04-04 (post EP-09)

## Summary
- Drift items found: 2
- Drift items fixed: 2
- Stale tasks: 0
- Code debt markers: 0 (FIXME: 0, TODO: 0, HACK: 0)
- Doc duplications flagged: 0
- Rules promoted: 0
- Tasks archived: 6 (EP-09 → `docs/tasks/archive/ep-09-daemon/`)

## Pass 1: Documentation Drift
| File | Issue | Action |
|------|-------|--------|
| ARCHITECTURE.md | daemon layout: single file → directory (pipeline/crash-recovery/shutdown) | Updated |
| ARCHITECTURE.md | daemon module map API: 2 functions → 6 functions (handleCandleClose, recoverFromCrash, getExecutionMode, killSwitch 추가) | Updated |

## Pass 2: Task Board
- Backlog: 0 tasks (empty — EP-09 완료, EP-10 미생성)
- Doing: 0 tasks (clean)
- Done: 0 tasks (clean)
- Archive: EP-01~EP-09 = 85 tasks total
- Stale: none

## Pass 3: Code Debt
| Type | Count | Files |
|------|-------|-------|
| TODO | 0 | — |
| FIXME | 0 | — |
| HACK | 0 | — |

## Pass 4: Documentation Quality
- Duplications found: none
- Stale examples: none (EP-09 모듈 맵 갱신 완료)

## Pass 5: Promoted Rules
- None this cycle

## Pass 6: Quality Scores
| Dimension | Previous | Current | Evidence |
|-----------|----------|---------|----------|
| Documentation truthfulness | 4 | 4 | ARCHITECTURE.md daemon 갱신. 19/21 모듈에 실제 코드 |
| Architecture clarity | 5 | 5 | L0~L9 전체 구현. daemon/ 디렉토리 분리. DI 5개 |
| Validation coverage | 5 | 5 | 1853 tests, 0 fail |
| Reliability readiness | 4 | **5** | **+1**: 크래시 복구, 셧다운, 킬스위치, 에러격리, 레이턴시 |
| Security hygiene | 2 | 2 | 킬스위치 CLI 인증 없음 |
| Developer experience | 4 | 4 | 코드 부채 0건 |
| **Total** | **24** | **25** | **+1** |

## Pass 7: AI Slop Detection
| Category | Count | Files | Severity |
|----------|-------|-------|----------|
| Dead code | 0 | — | — |
| Unused abstractions | 0 | — | — |
| Duplication | 3 patterns | crash-recovery, worker, kill-switch (fetchPositions 패턴) | medium |
| Long functions | 2 | pipeline.ts processEntry(208줄), crash-recovery.ts recoverFromCrash(222줄) | medium |

## Recommendations
1. EP-10 (API/Web) 에픽 시작 — REST API + 웹 대시보드
2. processEntry() 208줄 → 3~4개 단계 함수로 분리
3. fetchPositions 공통 유틸리티 추출 (3곳 중복)
