# Weekly Harness Report — 2026-04-04 (post EP-05)

## Summary
- Drift items found: 0
- Drift items fixed: 0
- Stale tasks: 0
- Code debt markers: 0 (FIXME: 0, TODO: 0, HACK: 0)
- Doc duplications flagged: 0
- Rules promoted: 0
- Tasks archived: 15 (EP-05 → `docs/tasks/archive/ep-05-signal-pipeline/`)

## Pass 1: Documentation Drift
| File | Issue | Action |
|------|-------|--------|
| ARCHITECTURE.md | filters/signals/vectors/knn 모듈 이미 문서화 | No action needed |
| DATA_MODEL.md | TradeBlock~Vector 엔��티 = schema.ts 일치 | No action needed |
| VECTOR_SPEC.md | 신규 문서 — features.ts 상수와 동기화 | Verified |

## Pass 2: Task Board
- Backlog: 0 tasks (empty — EP-05 완료, EP-06 미생성)
- Doing: 0 tasks (clean)
- Done: 0 tasks (clean)
- Archive: EP-01 (14), EP-02 (8), EP-03 (10), EP-04 (11), EP-05 (15) = 58 tasks total
- Stale: none
- Action: EP-05 15개 태스크 backlog → archive 이동 완료

## Pass 3: Code Debt
| Type | Count | Files |
|------|-------|-------|
| TODO | 0 | — |
| FIXME | 0 | — |
| HACK | 0 | — |
| TEMP | 0 | — |

## Pass 4: Documentation Quality
- Duplications found: none
- Stale examples: none

## Pass 5: Promoted Rules
- None this cycle

## Pass 6: Quality Scores
| Dimension | Previous | Current | Evidence |
|-----------|----------|---------|----------|
| Documentation truthfulness | 4 | 4 | VECTOR_SPEC.md 추가, 기존 문서 정합성 유지 |
| Architecture clarity | 4 | 5 | 4개 신규 모듈 레이어 준수, 0건 위반, check-layers 통과 |
| Validation coverage | 5 | 5 | 1246 tests (+381), E2E 파이프라인 테스트 추가 |
| Reliability readiness | 3 | 3 | Safety/TradeBlock fail-closed 패턴, 대조는 미구현 |
| Security hygiene | 2 | 2 | 변동 없음 |
| Developer experience | 4 | 4 | 코드 부채 0건, 전체 검증 파이프라인 정상 |
| **Total** | **22** | **23** | **+1** |

## Pass 7: AI Slop Detection
| Category | Count | Files | Severity |
|----------|-------|-------|----------|
| Dead code | 0 | — | — |
| Unused abstractions | 0 | — | — |
| Duplication | 0 | — | — |
| Naming issues | 0 | — | — |
| Long functions (>50 lines) | 0 | vectorizer.ts 내부 함���들은 카테고리별 분리 | — |

## Recommendations
1. EP-06 (Position Management) 에픽 계획 시작 — 포지션 사이징, 주문 실행, FSM
2. vectorizer.ts (931줄) 카테고리별 파일 분리 검토 — 기능상 문�� 없으나 가독성 향상 가능
3. pool.test.ts 병렬 충돌 1건 — EP-04 ��턴(beforeEach closePool)으로 ���미 대응됨, 근본 해결은 Bun test isolation 옵션
