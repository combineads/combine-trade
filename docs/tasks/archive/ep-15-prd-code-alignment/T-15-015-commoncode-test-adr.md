# T-15-015 CommonCodeGroup 테스트 수정 + ADR-004 경제지표 소스 결정

## Metadata
- modules: [core, config]
- primary: core

## Goal
CommonCodeGroup 테스트의 TRANSFER 누락 버그를 수정하고, Investing.com API 사용에 대한 ADR을 작성한다.

## Why
tests/core/types.test.ts에서 CommonCodeGroup 카운트가 12로 하드코딩되어 있으나, TRANSFER 그룹이 추가되어 13이어야 한다. 또한 PRD Open questions에 있는 경제지표 소스 결정을 ADR로 문서화해야 한다.

## Inputs
- `tests/core/types.test.ts` (현재 테스트)
- PRD Open questions (Investing.com API)
- `docs/PRODUCT.md`

## Dependencies
- T-15-013 (TRANSFER seed 정리 완료)

## Expected Outputs
- 수정된 테스트
- ADR-004 문서
- PRODUCT.md Open questions 업데이트

## Deliverables
- `tests/core/types.test.ts` — CommonCodeGroup count assertion 12→13, TRANSFER 포함
- `docs/decisions/ADR-004-economic-calendar-source.md`
- `docs/PRODUCT.md` Open questions 업데이트

## Constraints
- ADR은 선택지 분석 + 결정 + 근거 형식

## Steps
1. `tests/core/types.test.ts`에서 CommonCodeGroup assertion 수정
2. ADR-004 작성:
   - 배경: 경제지표 별3개 자동 거래차단 필요
   - 선택지: Investing.com API / 스크래핑 / 수동 입력 / 대안 API
   - 결정과 근거
   - fail-closed 정책 (API 실패 시 거래차단 활성)
3. PRODUCT.md Open questions 해당 항목 업데이트
4. 테스트 실행

## Acceptance Criteria
- CommonCodeGroup 테스트 13개 그룹 통과 (TRANSFER 포함)
- ADR-004 작성 완료
- PRODUCT.md Open questions 업데이트

## Test Scenarios
- CommonCodeGroup enum/type → includes exactly 13 groups
- CommonCodeGroup → includes "TRANSFER" group
- CommonCodeGroup → includes "KNN" group

## Validation
- `bun test -- --grep "CommonCodeGroup"`
- ADR-004 파일 존재 확인

## Out of Scope
- 경제지표 API 구현
- TradeBlock 로직 변경

## Implementation Notes
- `tests/core/types.test.ts` L190: `toHaveLength(12)` → `toHaveLength(13)`, `'TRANSFER'` 항목 추가.
- `src/core/types.ts`에 이미 `'TRANSFER'`가 존재했으나 테스트가 동기화되지 않은 상태였음.
- ADR-004는 기존 ADR 형식(Date/Status/Context/Decision/Consequences)을 따라 작성. 스크래핑 방식을 채택하되 fail-closed 정책 명시.
- PRODUCT.md Open questions 항목을 strikethrough + ADR-004 참조로 업데이트.

## Outputs
- `tests/core/types.test.ts` — TRANSFER 포함, count 13으로 수정 완료
- `docs/decisions/ADR-004-economic-calendar-source.md` — 신규 작성
- `docs/PRODUCT.md` — Open questions 항목 resolved 표시
- 테스트 결과: 44 pass / 0 fail
