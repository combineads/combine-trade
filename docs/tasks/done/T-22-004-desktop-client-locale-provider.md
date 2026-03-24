# T-22-004 apps/desktop 클라이언트 사이드 locale provider

## Goal
`apps/desktop/` static export 환경에서 i18n이 동작하도록 클라이언트 사이드 locale provider를 구현한다. localStorage 기반 locale 영속성을 포함하며, desktop 앱에서 ko↔en 전환 시 페이지 리로드 없이 UI가 업데이트되어야 한다.

## Why
`apps/desktop/`은 `output: 'export'`로 빌드되므로 서버 미들웨어 사용 불가. 클라이언트 전용 locale 관리가 필요하다. `apps/web/`의 미들웨어 기반 접근과 달리 완전히 클라이언트 사이드로 처리해야 한다.

## Inputs
- T-22-001 출력물: `locales`, `defaultLocale`, messages 파일
- T-22-002 출력물: `I18nProvider`, hooks
- `apps/desktop/` 현재 구조 (Next.js static export)
- EP22 risk: "next-intl과 static export 호환성"

## Dependencies
T-22-001, T-22-002

## Expected Outputs
- `apps/desktop/src/providers/LocaleProvider.tsx` — localStorage 기반 locale 관리
- desktop root layout에 locale provider 통합
- locale 전환 시 즉시 UI 업데이트 (리로드 없음)
- static export 빌드 성공

## Deliverables
- `apps/desktop/src/providers/LocaleProvider.tsx`: `useState` + localStorage로 locale 관리. `I18nProvider` 감싸기. `LocaleContext` export (locale, setLocale)
- `apps/desktop/src/app/layout.tsx` 업데이트: `LocaleProvider` 적용
- `apps/desktop/src/providers/__tests__/LocaleProvider.test.tsx`: locale 전환 및 localStorage 저장 테스트
- `apps/desktop/next.config.ts` 확인: `withNextIntl` 적용 또는 호환성 이슈 해결 주석

## Constraints
- `apps/desktop/`은 `output: 'export'` 유지 필수
- next-intl이 static export와 비호환 시: `react-i18next` 클라이언트 전용 fallback 사용 (결정사항에 따라)
- `usePathname`, `useRouter` 기반 locale prefix 라우팅 사용 금지 (static export 비호환)
- localStorage 키: `'combine-locale'`

## Steps
1. `apps/desktop/` 현재 구조 확인
2. next-intl static export 호환 여부 PoC 테스트
3. 호환 시: next-intl 클라이언트 모드 설정; 비호환 시: react-i18next 사용하여 동일 API 제공
4. `LocaleProvider.tsx` 구현
5. `apps/desktop/src/app/layout.tsx` 업데이트
6. 테스트 작성
7. `cd apps/desktop && bun run build` 성공 확인

## Acceptance Criteria
- `apps/desktop/` static export 빌드 성공
- locale 전환 시 페이지 리로드 없이 UI 업데이트
- localStorage에 선택 locale 저장, 재방문 시 복원
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test apps/desktop/src/providers/__tests__/LocaleProvider.test.tsx
cd apps/desktop && bun run build
```

## Out of Scope
desktop 앱 언어 선택기 UI (T-22-006 에서 처리), 실제 번역 문자열, web 미들웨어 (T-22-003)
