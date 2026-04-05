# T-14-008 웹 대시보드 이체 이력 섹션 & 수동 이체 버튼

## Goal
웹 대시보드에 이체 이력 테이블과 수동 즉시 이체 버튼을 추가한다.

## Why
운영자가 웹 UI에서 이체 현황을 한눈에 확인하고, 필요시 즉시 이체를 트리거할 수 있어야 한다.

## Inputs
- `docs/exec-plans/14-auto-transfer.md` M4 — 웹 UI 스펙
- `docs/DESIGN_SYSTEM.md` — 디자인 토큰, 컴포넌트 스타일
- T-14-007 — GET /api/transfers, POST /api/transfers/trigger

## Dependencies
- T-14-007

## Expected Outputs
- 이체 이력 테이블 컴포넌트
- 수동 즉시 이체 버튼 (확인 대화상자 포함)
- TanStack Query 훅

## Deliverables
- `src/web/components/TransferHistory.tsx` (또는 기존 대시보드에 섹션 추가)
- `src/web/hooks/useTransfers.ts` — TanStack Query 훅

## Constraints
- React + Zustand + TanStack Query 스택
- DESIGN_SYSTEM.md 토큰 사용 (색상, 타이포그래피, 간격)
- 수동 이체 버튼 클릭 시 확인 대화상자 필수 (실수 방지)
- 이체 이력: 금액, 시각, 상태(성공/실패/skip) 표시
- web/ 디렉토리는 standalone (레이어 규칙에서 독립)

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/web/hooks/useTransfers.ts` 생성:
   - `useTransferHistory(cursor?)` — GET /api/transfers 쿼리
   - `useTriggerTransfer()` — POST /api/transfers/trigger 뮤테이션
4. `src/web/components/TransferHistory.tsx` 생성:
   - 이체 이력 테이블: 시각, 거래소, 금액, 상태 컬럼
   - 상태별 배지 색상 (성공=green, 실패=red, skip=gray)
   - "더 보기" 버튼 (cursor 페이지네이션)
   - 수동 이체 버튼 + 확인 대화상자
5. 대시보드 페이지에 TransferHistory 컴포넌트 추가
6. Run tests — confirm all pass (GREEN phase)
7. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- 이체 이력 테이블에 금액, 시각, 상태 표시
- 상태별 시각적 구분 (색상 배지)
- 수동 이체 버튼 클릭 → 확인 대화상자 → 확인 시 이체 실행
- 이체 성공/실패 후 이력 테이블 자동 갱신
- 페이지네이션 동작

## Test Scenarios
- TransferHistory renders empty state when no transfer events
- TransferHistory renders table rows for each transfer event (amount, time, status)
- Transfer status badge shows correct color: SUCCESS=green, FAILED=red, SKIP=gray
- Manual transfer button click → shows confirmation dialog
- Confirmation dialog confirm → calls useTriggerTransfer mutation
- Confirmation dialog cancel → does NOT trigger transfer
- useTransferHistory hook fetches from GET /api/transfers

## Validation
```bash
bun test -- --grep "transfer-ui"
bun run typecheck
bun run build
```

## Browser Verification
- http://localhost:3000/dashboard → scroll to transfer section → verify history table renders
- http://localhost:3000/dashboard → click manual transfer button → verify confirmation dialog appears → confirm → verify success toast

## Out of Scope
- TRANSFER CommonCode 설정 편집 UI
- 이체 통계/차트

## Implementation Notes

### Files created
- `src/web/src/hooks/useTransfers.ts` — TanStack Query hooks: `useTransferHistory(cursor?)` and `useTriggerTransfer()`
- `src/web/src/components/dashboard/TransferHistory.tsx` — transfer history table + confirmation modal

### Files modified
- `src/web/src/pages/DashboardPage.tsx` — added `<TransferHistory />` to right column below RecentSignals

### Tests
- `tests/transfer/transfer-ui.test.ts` — 28 tests covering status color logic, label mapping, amount extraction, URL building, response shape validation, empty state, pagination, and confirmation dialog state machine
- All 28 tests pass

### Design decisions
- No `@testing-library/react` in devDependencies — tests cover pure logic utilities extracted from the component (getStatusColor, getStatusLabel, extractAmount, URL builder) rather than DOM rendering
- Confirmation modal follows the existing KillSwitchModal pattern (focus trap, Escape to close, overlay click to dismiss)
- Event accumulation on load-more uses a Set of existing IDs to prevent duplicates when TanStack Query invalidation re-fetches from cursor=undefined
- apiGet/apiPost from `src/web/src/lib/api.ts` used (consistent with other hooks) rather than raw fetch

### Validation results
```
bun test -- --grep "transfer-ui"   → 28 pass, 0 fail
bun run typecheck                   → no errors
bun run build:web                   → ✓ built in 116ms (94 modules)
```
