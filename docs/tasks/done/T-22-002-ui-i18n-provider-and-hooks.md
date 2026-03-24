# T-22-002 packages/ui i18n provider 및 훅 래퍼

## Goal
`packages/ui/` 에 `I18nProvider` 컴포넌트와 `useTranslations` 래퍼 훅을 구현하여, web/desktop 앱이 동일한 API로 번역 기능을 사용할 수 있게 한다.

## Why
`apps/web/`(SSR)과 `apps/desktop/`(static export)의 렌더링 환경이 다르다. 공유 UI 패키지에 추상화 레이어를 두어 양쪽 앱에서 일관된 API를 제공해야 한다.

## Inputs
- T-22-001 출력물: `packages/ui/src/i18n/messages/`, `types.ts`, `index.ts`
- `packages/ui/src/` 현재 구조
- `next-intl` 공식 API 문서

## Dependencies
T-22-001

## Expected Outputs
- `I18nProvider` 컴포넌트 — locale과 messages를 받아 context 제공
- `useTranslations` 훅 래퍼 — 타입 안전 번역 키 지원
- `useLocale` 훅 — 현재 locale 반환
- 단위 테스트 통과

## Deliverables
- `packages/ui/src/i18n/I18nProvider.tsx`: next-intl `NextIntlClientProvider` 래퍼. locale, messages, timeZone props 수용
- `packages/ui/src/i18n/hooks.ts`: `useTranslations`, `useLocale`, `useFormatter` 재export (next-intl에서 가져와 타입 보강)
- `packages/ui/src/i18n/__tests__/I18nProvider.test.tsx`: Provider 렌더링 및 훅 동작 단위 테스트
- `packages/ui/src/i18n/index.ts` 업데이트: Provider, hooks export 추가

## Constraints
- `I18nProvider`는 React Server Component가 아닌 Client Component (`"use client"`)
- `packages/core` import 금지
- `next-intl` API를 직접 노출하되, 추가 추상화 레이어 없이 단순 래퍼로 유지

## Steps
1. T-22-001 출력물 확인
2. `I18nProvider.tsx` 구현 — `NextIntlClientProvider` 래퍼
3. `hooks.ts` 구현 — next-intl 훅 재export
4. `index.ts` 업데이트
5. 단위 테스트 작성 (renderWithI18n 헬퍼 포함)
6. `bun run typecheck` 통과 확인

## Acceptance Criteria
- `I18nProvider`로 감싼 컴포넌트에서 `useTranslations('common')` 호출 가능
- `useLocale()`이 현재 locale string 반환
- TypeScript에서 존재하지 않는 번역 키 접근 시 컴파일 에러
- 테스트에서 ko/en 번역 전환 동작 확인

## Validation
```bash
bun run typecheck
bun test packages/ui/src/i18n/__tests__/I18nProvider.test.tsx
```

## Out of Scope
Next.js 미들웨어 (T-22-003), desktop locale provider (T-22-004), 실제 번역 문자열 (T-22-005 이후)
