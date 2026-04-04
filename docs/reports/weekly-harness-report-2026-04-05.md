# Weekly Harness Report — 2026-04-05

## Summary
- Drift items found: 2
- Drift items fixed: 2
- Stale tasks: 0
- Code debt markers: 0 (worker.ts TODO 삭제)
- Doc duplications flagged: 0 (acceptable)
- Rules promoted: 0 (3 candidates identified)
- Epic archived: EP-12 (14 tasks), EP-13 (14 tasks)
- AI slop fixed: 3 HIGH items

## Pass 1: Documentation Drift
| File | Issue | Action |
|------|-------|--------|
| ARCHITECTURE.md:148 | backtest Public API 과소 기술 (7+ exports 누락) | **수정 완료** |
| exec-plans/13-backtest-wfo.md | Progress notes "(작업 전)" 미갱신 | **수정 완료** |

## Pass 2: Task Board
- Backlog: 0 tasks (다음 에픽 대기)
- Doing: 0 tasks (WIP limit 준수)
- Done: 0 tasks (EP-13 아카이브 완료)
- Archived: EP-12 (14 tasks), EP-13 (14 tasks + SUMMARY.md)

## Pass 3: Code Debt
| Type | Count | Files |
|------|-------|-------|
| TODO | 0 | worker.ts 삭제로 해소 |
| FIXME | 0 | — |
| HACK | 0 | — |

## Pass 4: Documentation Quality
- WFO 파라미터(6M/2M/1M) 5곳 문서화 — 레벨별 상세도 차이로 의도적 중복
- CLI 옵션 별도 참조 문서 없음 — 내부 도구로 수용

## Pass 5: Promoted Rules
후보 3건 식별 (미적용):
1. PipelineDeps DI 패턴 → AGENTS.md 아키텍처 가드레일
2. Mock adapter 전체 인터페이스 구현 규칙
3. Lookahead bias 방지 시간순서 강제 규칙

## Pass 6: Quality Scores
| Dimension | Previous | Current | Evidence |
|-----------|----------|---------|----------|
| Documentation truthfulness | 5 | 5 | ARCHITECTURE.md backtest API 갱신 |
| Architecture clarity | 5 | 5 | L8 backtest 모듈 11파일 정상 배치 |
| Validation coverage | 5 | 5 | 2514 tests / 0 fail (+248) |
| Reliability readiness | 5 | 5 | 변동 없음 |
| Security hygiene | 3 | 3 | 변동 없음 |
| Developer experience | 5 | 5 | bun run backtest CLI 추가 |
| **Total** | **28/30** | **28/30** | |

## Pass 7: AI Slop Detection
| Category | Count | Severity | Action |
|----------|-------|----------|--------|
| Dead code (worker.ts) | 1 | HIGH | **삭제** |
| Dead export (createBacktestActiveSymbol) | 1 | HIGH | **삭제** |
| Duplication (closePosition) | 1 | HIGH | **추출 완료** |
| Long function (createOrder 151L) | 1 | MEDIUM | 추후 분리 |
| Long function (createBacktestPipelineDeps 468L) | 1 | MEDIUM | 추후 인라인화 |
| Naming (addMonths 'd' shadowing) | 1 | LOW | 추후 리네임 |

## Recommendations
1. **EP-14 (auto-transfer)** 태스크 생성 필요 — backlog 비어있음
2. mock-adapter.ts createOrder 분리 (151L → 3개 private method)
3. AGENTS.md에 backtest 패턴 3건 promote 검토
