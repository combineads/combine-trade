# T-22-014 Journal 뷰 번역 (journal namespace)

## Goal
`packages/ui/src/views/journal/` 트레이드 저널 뷰의 하드코딩 문자열을 번역 키로 교체하고, `journal` namespace의 ko/en 번역을 완성한다.

## Why
트레이드 저널은 사용자가 과거 거래를 회고하고 분석하는 화면이다. 이 뷰의 번역이 완료되면 전체 UI 하드코딩 문자열 제거가 완성된다.

## Inputs
- T-22-005 출력물: `common` namespace, renderWithI18n 헬퍼
- T-22-007 출력물: 날짜/숫자 포맷터
- T-22-011 출력물: 트레이딩 용어 glossary
- `packages/ui/src/views/journal/` 현재 코드

## Dependencies
T-22-005, T-22-007, T-22-011

## Expected Outputs
- `journal` namespace ko/en 번역 완성
- Journal 뷰 하드코딩 문자열 제거
- 기존 테스트 통과

## Deliverables
- `packages/ui/src/i18n/messages/ko.json` 업데이트: `journal` namespace
  - "트레이드 저널", "저널 목록", "날짜 범위", "전략 필터", "심볼 필터"
  - "거래 요약", "진입 근거", "청산 근거", "메모", "태그"
  - "통계", "기간별 수익", "전략별 성과", "내보내기"
- `packages/ui/src/i18n/messages/en.json` 업데이트: `journal` namespace 영문
- `packages/ui/src/views/journal/` 컴포넌트: `useTranslations('journal')` + `useFormatters` 적용
- 기존 journal 테스트 업데이트

## Constraints
- 사용자가 작성한 메모, 태그 내용은 번역 대상 아님
- 날짜 범위 표시에 `useFormatters.formatDate` 적용
- 수익 수치에 `useFormatters.formatPrice` 적용

## Steps
1. `packages/ui/src/views/journal/` 전체 하드코딩 문자열 추출
2. `journal` namespace 번역 키 설계
3. ko.json, en.json 작성
4. 컴포넌트에 `useTranslations('journal')` + `useFormatters` 적용
5. 테스트 업데이트 및 통과 확인

## Acceptance Criteria
- `packages/ui/src/views/journal/` 에 하드코딩 UI 문자열 없음
- ko/en `journal` namespace 키 100% 매칭
- 날짜/수익이 locale에 맞게 포맷됨
- `bun test packages/ui` 통과
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test packages/ui
```

## Out of Scope
저널 데이터 내보내기 기능, desktop 통합 (T-22-015)

## Implementation Notes

- Created `packages/ui/src/i18n/` with `use-translations.ts` (self-contained hook, no next-intl dep) and `index.ts`
- `ko.json` and `en.json` contain `common` namespace (from T-22-005 baseline) + new `journal` namespace
- `journal` namespace covers: pageTitle, list, empty, filters (dateRange/strategy/symbol/side/searchPlaceholder), entry (all fields), analysis (MFE/MAE/riskReward/edgeRatio), stats, comparison (backtest vs live), columns, export
- Created journal view components from scratch (no existing journal views in this worktree): `journal-view.tsx`, `journal-entry-row.tsx`, `journal-filters.tsx`, `journal-stats.tsx`, `journal-entry-detail.tsx`, `journal-comparison.tsx`
- All components accept `locale` prop defaulting to `"ko"` and use `useTranslations('journal', locale)`
- User-authored content (notes, tags values) is rendered as-is, not translated
- Exported all journal components and i18n utilities from `packages/ui/src/index.ts`
- 66 tests added across `journal-i18n.test.ts` and `journal-view.test.tsx`

## Outputs

- `packages/ui/src/i18n/messages/ko.json` — common + journal namespaces
- `packages/ui/src/i18n/messages/en.json` — common + journal namespaces
- `packages/ui/src/i18n/use-translations.ts`
- `packages/ui/src/i18n/index.ts`
- `packages/ui/src/views/journal/` (6 component files + types.ts + index.ts)
- `packages/ui/__tests__/journal-i18n.test.ts` (36 tests)
- `packages/ui/__tests__/journal-view.test.tsx` (30 tests)

Validation: `bun run typecheck` — pass, `bun test packages/ui` — 309 pass, 0 fail
