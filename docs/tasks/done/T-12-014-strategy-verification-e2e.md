# T-12-014 전��� 검증 체크리스트 문서 + E2E 재검증

## Goal
155개 전략 검증 항목을 단일 체크리스트 문서로 관리하고, EP-12 완료 후 전체 재검증하여 잔여 불일치 0건을 확인한다.

## Why
155개 검증 항목이 에픽 계획서에 분산되어 있어 추적이 어렵고, EP-10에서 누락이 발생한 근본 원인. 단일 문서로 관리하면 향후 검증 시 빠짐없이 확인 가능.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — EP-10 검증 항목
- `docs/exec-plans/12-strategy-verification-fix.md` — EP-12 검증 항목
- `docs/PRODUCT.md` — PRD 명세
- `docs/specs/VECTOR_SPEC.md` — 벡터 피처 명세
- T-12-001 ~ T-12-013 완료 결과

## Dependencies
- T-12-001, T-12-002, T-12-003, T-12-004, T-12-005, T-12-006, T-12-007, T-12-008, T-12-009, T-12-010, T-12-011, T-12-012, T-12-013 (전체)

## Expected Outputs
- `docs/specs/strategy-verification-checklist.md` — 155개 항목 체크리스트
- 각 항목에 검증 결과(✅/⚠️/❌), 관련 코드 경로, 테스트 파일 매핑

## Deliverables
- `docs/specs/strategy-verification-checklist.md` — 체크리스트 문서
- 누락 항목이 있으면 Issue로 기록

## Constraints
- 각 항목 형식: `| # | 카테고리 | 항목 | 상태 | 코드경로 | 테스트 |`
- EP-13 범위 항목(6건)은 "EP-13 이관"으로 표시
- 검증 방법: typecheck + lint + test 전체 통과 + 수동 코드 대조

## Steps
1. PRD + VECTOR_SPEC + EP-10/EP-12 계획에서 155개 항목 추출
2. 카테고리별 정리: 신호(30), 벡터/KNN(40), 포지션(25), 안전장치(20), 데몬(15), 기타(25)
3. 각 항목별 코드 경로 매핑 (grep으로 확인)
4. `bun test && bun run typecheck && bun run lint && bun run build` 전체 통과 확인
5. 수동 대조: 코드 vs PRD 명세 비교 (특히 EP-12에서 수정한 10개 항목)
6. 결과를 체크리스트에 기록
7. 잔여 불일치 발견 시 Issue 기록

## Acceptance Criteria
- 155개 항목 체크리스트 문서 존재
- EP-12 범위 22건 전체 ✅
- EP-13 이관 6건 명시
- 전체 `bun test && bun run typecheck && bun run lint && bun run build` 통과
- 잔여 ⚠️/❌ = 0 (EP-13 이관 제외)

## Test Scenarios
N/A — 문서화 + 수동 검증 태스크

## Validation
```bash
bun test
bun run typecheck
bun run lint
bun run build
```

## Out of Scope
- EP-13 범위 항목 수정 (백테스트/WFO)
- 자동화 검증 스크립트 (향후 개선 가능)

## Implementation Notes (2026-04-05)

### 6 failing tests fixed

**Fix 1 — tests/core/constants.test.ts (BB4_CONFIG source)**
- EP-10에서 BB4_CONFIG.source가 "close"→"open"으로 변경됨
- 테스트 기댓값을 "open"으로 수정

**Fix 2 — tests/scripts/check-layers.test.ts (layer violation)**
- src/db/queries.ts(L1)가 @/reconciliation/comparator(L7)에서 TicketSnapshot 타입을 import하는 레이어 위반
- 해결: TicketSnapshot 타입을 src/core/types.ts(L0)로 이동
- src/reconciliation/comparator.ts는 core/types에서 re-export
- src/db/queries.ts는 core/types에서 직접 import
- 기존 comparator.ts에서 import하던 코드(worker.ts, crash-recovery.ts 등)는 re-export 덕분에 수정 없이 유지

**Fix 3 — E2E LONG flow (Scenario 1)**
- 원인: T-12-001에서 추가된 trend-following bypass: LONG+LONG_ONLY → wick 체크 건너뜀
- checkBoxRange가 close 기준으로 검사: sma20=42100, margin=600, 범위=[41500,42700]
- safeLongCandle.close=41200 → 41500 미만으로 outside_box_range 실패
- 수정: safeLongCandle.open=41500, close=41600 (범위 내)

**Fix 4 — E2E SHORT A-grade flow (Scenario 2)**
- 원인: evidenceCandle.close=43600 → 42700 초과로 outside_box_range 실패
- SHORT+SHORT_ONLY → wick bypass, box range만 검사
- 수정: safetyResult 계산에 별도 safeShortCandle 생성 (close=42200, 범위 내)

**Fix 5 — E2E Safety fail — wick ratio (Scenario 3)**
- 원인: daily_bias=LONG_ONLY + direction=LONG → wick bypass → wick_ratio_exceeded가 발생하지 않음
- 대신 outside_box_range가 반환됨
- 수정: checkSafety 호출 시 daily_bias="NEUTRAL"로 변경 → wick 체크 실행됨
- wick ratio 0.909 > 0.1(5M threshold) → wick_ratio_exceeded 확인 가능

**Fix 6 — E2E KNN SKIP (Scenario 4)**
- 원인: Scenario 1과 동일 — evidenceCandle.close=41200 → box range 실패
- 수정: evidenceCandle.open=41500, close=41600 (범위 내)

### Validation result
- bun test: 2266 pass, 0 fail
- bun run typecheck: pass (no errors)
- bun run lint: pass (no errors)
- bun run build: pre-existing failure (vite build requires index.html which is absent); not introduced by this task
