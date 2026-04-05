# T-18-012 PRODUCT.md Safety Gate 표현 명확화

## Metadata
- modules: [docs]
- primary: docs

## Goal
PRODUCT.md의 Safety Gate "box range center" 표현을 EP-18 수정 후 동작에 맞게 명확히 한다.

## Why
EP-18에서 Safety Gate Rule 2가 "중심 이탈 시 차단" → "중심 근접 시 차단"으로 반전됨. PRODUCT.md의 "box range center" 표현이 모호.

## Inputs
- docs/PRODUCT.md (Safety Gate 항목)

## Dependencies
- 없음

## Expected Outputs
- 수정된 PRODUCT.md

## Deliverables
- "box range center" → "box range center proximity block (중심 근접 시 진입 거부)" 등 명확한 표현으로 변경

## Constraints
- PRODUCT.md의 다른 내용 변경 금지

## Steps
1. PRODUCT.md Safety Gate 항목 읽기
2. 표현 수정
3. 검증

## Acceptance Criteria
- [ ] Safety Gate 설명이 "중심 근접 시 차단" 의미를 명확히 전달

## Test Scenarios
N/A — documentation task

## Validation
```bash
grep -n "box range\|Safety Gate" docs/PRODUCT.md
```

## Out of Scope
- PRODUCT.md 전체 리뷰
