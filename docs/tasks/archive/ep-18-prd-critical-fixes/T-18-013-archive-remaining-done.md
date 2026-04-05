# T-18-013 EP-18 잔여 done/ 태스크 아카이빙

## Metadata
- modules: [docs]
- primary: docs

## Goal
docs/tasks/done/에 남아있는 T-18-010~012 태스크를 archive/ep-18-prd-critical-fixes/로 이동한다.

## Why
EP-18이 완료되었으나 후속 조치 3건(T-18-010~012)이 done/에 남아있음. archive로 이동하여 done/ 디렉토리를 깨끗하게 유지.

## Inputs
- docs/tasks/done/T-18-010-architecture-cleanup.md
- docs/tasks/done/T-18-011-eventlog-types-cleanup.md
- docs/tasks/done/T-18-012-product-md-box-range-wording.md

## Dependencies
- 없음

## Expected Outputs
- 3개 파일이 archive/ep-18-prd-critical-fixes/로 이동
- SUMMARY.md 업데이트 (12건으로 갱신)

## Deliverables
- mv docs/tasks/done/T-18-010*.md docs/tasks/archive/ep-18-prd-critical-fixes/
- mv docs/tasks/done/T-18-011*.md docs/tasks/archive/ep-18-prd-critical-fixes/
- mv docs/tasks/done/T-18-012*.md docs/tasks/archive/ep-18-prd-critical-fixes/
- SUMMARY.md 태스크 카운트 9→12 갱신

## Constraints
- 파일 내용 변경 금지 — 이동만

## Steps
1. T-18-010~012 파일 3개를 archive/ep-18-prd-critical-fixes/로 이동
2. SUMMARY.md 태스크 카운트 갱신
3. done/ 디렉토리에 T-18-* 파일 없음 확인

## Acceptance Criteria
- [ ] docs/tasks/done/에 T-18-* 파일 0건
- [ ] archive/ep-18-prd-critical-fixes/에 T-18-001~012 (12건)
- [ ] SUMMARY.md 태스크 수 12/12

## Test Scenarios
N/A — file management task

## Validation
```bash
ls docs/tasks/done/T-18-* 2>/dev/null | wc -l  # should be 0
ls docs/tasks/archive/ep-18-prd-critical-fixes/T-18-*.md | wc -l  # should be 12
```

## Out of Scope
- 벡터 재구축
- P1/P2 불일치 수정
