# T-18-010 ARCHITECTURE.md 미구현 참조 정리

## Metadata
- modules: [docs]
- primary: docs

## Goal
ARCHITECTURE.md에서 미구현 모듈(kpi/, economic-calendar)의 참조를 정리한다.

## Why
kpi/ 디렉토리 미존재, economic-calendar.ts 파일 미존재. 문서가 코드와 불일치.

## Inputs
- docs/ARCHITECTURE.md

## Dependencies
- 없음

## Expected Outputs
- 정리된 ARCHITECTURE.md

## Deliverables
- kpi/ 관련 3곳: 레이아웃, 레이어 규칙, 모듈 맵 → "[미구현]" 주석 통일 또는 "planned" 섹션으로 분리
- economic-calendar.ts 통합 경계 테이블 → "[미구현]" 표시

## Constraints
- 선언 자체를 삭제하지 않음 (향후 구현 예정)

## Steps
1. ARCHITECTURE.md 읽기
2. kpi/ 참조 3곳 + economic-calendar 1곳 정리
3. 변경 검증

## Acceptance Criteria
- [ ] kpi/ 참조에 미구현 표시
- [ ] economic-calendar 참조에 미구현 표시

## Test Scenarios
N/A — documentation task

## Validation
```bash
grep -n "미구현" docs/ARCHITECTURE.md
```

## Out of Scope
- kpi/ 모듈 실제 구현
- economic-calendar 실제 구현
