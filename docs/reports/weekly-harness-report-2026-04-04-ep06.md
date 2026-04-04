# Weekly Harness Report — 2026-04-04 (post EP-06)

## Summary
- Drift items found: 4
- Drift items fixed: 4
- Stale tasks: 0
- Code debt markers: 0 (FIXME: 0, TODO: 0, HACK: 0)
- Doc duplications flagged: 0
- Rules promoted: 0
- Tasks archived: 9 (EP-06 → `docs/tasks/archive/ep-06-position-management/`)

## Pass 1: Documentation Drift
| File | Issue | Action |
|------|-------|--------|
| ARCHITECTURE.md | positions 모듈 API: PositionFSM→canTransition/createTicket/calculateSize | Updated |
| ARCHITECTURE.md | limits 모듈 API: LossLimitManager→checkLossLimit/recordLoss/resetAllExpired | Updated |
| ARCHITECTURE.md | orders 모듈 API: OrderExecutor→executeEntry/emergencyClose/checkSlippage | Updated |
| ARCHITECTURE.md | 제약조건: "Hard cap in PositionSizer" → "sizer.ts HARD_CAP_LEVERAGE" | Updated |
| AGENTS.md | `bun run backtest` 스크립트 미정의 (EP-11에서 추가 예정) | Noted |

## Pass 2: Task Board
- Backlog: 0 tasks (empty — EP-06 완료, EP-07 미생성)
- Doing: 0 tasks (clean)
- Done: 0 tasks (clean)
- Archive: EP-01 (14), EP-02 (8), EP-03 (10), EP-04 (11), EP-05 (15), EP-06 (9) = 67 tasks total
- Stale: none
- Action: EP-06 9개 태스크 backlog → archive 이동 완료

## Pass 3: Code Debt
| Type | Count | Files |
|------|-------|-------|
| TODO | 0 | — |
| FIXME | 0 | — |
| HACK | 0 | — |
| TEMP | 0 | — |

## Pass 4: Documentation Quality
- Duplications found: none (FSM/손실제한 규칙이 여러 문서에 있으나 적절한 레이어링)
- Stale examples: 3건 수정 완료 (ARCHITECTURE.md 모듈 맵)

## Pass 5: Promoted Rules
- None this cycle
- 신규 패턴 후보: `docs/patterns/2026-04-04-same-layer-avoidance.md` (L5→L5 회피)

## Pass 6: Quality Scores
| Dimension | Previous | Current | Evidence |
|-----------|----------|---------|----------|
| Documentation truthfulness | 4 | 4 | ARCHITECTURE.md 모듈 맵 갱신. DATA_MODEL.md 10/13 테이블 구현 |
| Architecture clarity | 5 | 5 | L5+L6 3개 모듈 추가, 레이어 위반 0건 |
| Validation coverage | 5 | 5 | 1491 tests (+245), E2E 7시나리오 |
| Reliability readiness | 3 | 3 | SL fail-closed, 슬리피지 ABORT, 손실 제한. 대조 미구현 |
| Security hygiene | 2 | 2 | idempotency_key 추가 (양성). 인증 미구현 |
| Developer experience | 4 | 4 | 코드 부채 0건. 전체 검증 파이프라인 정상 |
| **Total** | **23** | **23** | **0** |

## Pass 7: AI Slop Detection
| Category | Count | Files | Severity |
|----------|-------|-------|----------|
| Dead code | 0 | — | — |
| Unused abstractions | 0 | — | — |
| Duplication | 0 | where-clause 반복은 Drizzle 패턴 허용 범위 | — |
| Naming issues | 0 | — | — |
| Long functions (>50 lines) | 1 | executor.ts executeEntry() 219줄 | medium |
| Type inconsistency | 1 | loss-limit.ts NodePgDatabase→DbInstance | low |

## Recommendations
1. EP-07 (Exits & Labeling) 에픽 계획 시작 — 3단계 청산, 피라미딩, 라벨링
2. executor.ts `executeEntry()` 219줄 → SL 등록, 슬리피지 체크를 헬퍼로 추출 검토
3. loss-limit.ts `NodePgDatabase` → `DbInstance` 타입 통일
