# T-22-003 apps/web locale 미들웨어 및 라우팅

## Goal
`apps/web/` Next.js App Router에 locale 기반 미들웨어와 라우팅을 설정하여 `/ko/...`, `/en/...` URL 경로를 지원하고 Accept-Language 헤더 기반 자동 감지를 구현한다.

## Why
Next.js App Router의 i18n은 미들웨어 기반 locale 감지 및 경로 접두사 처리가 필요하다. `apps/web/` 특화 작업으로 SSR 환경에서 올바른 locale이 서버에서 선택되어야 hydration mismatch를 방지한다.

## Inputs
- T-22-001 출력물: `locales`, `defaultLocale` 설정
- T-22-002 출력물: `I18nProvider`
- `apps/web/` 현재 디렉토리 구조 (App Router)
- `next-intl` 미들웨어 API

## Dependencies
T-22-001, T-22-002

## Expected Outputs
- `apps/web/middleware.ts` — locale 감지 및 경로 라우팅
- `apps/web/src/app/[locale]/layout.tsx` — locale 기반 root layout
- locale 파라미터를 받는 layout에서 `I18nProvider` 초기화
- 단위/통합 테스트

## Deliverables
- `apps/web/middleware.ts`: `createMiddleware` (next-intl) 기반 locale 감지. Accept-Language 헤더 → locale 결정. `/` → `/{defaultLocale}/` 리다이렉트
- `apps/web/src/app/[locale]/layout.tsx`: locale 파라미터 수용, messages 로드, `I18nProvider` 감싸기
- `apps/web/src/app/[locale]/layout.tsx` 내 `generateStaticParams` — ko/en 정적 파라미터
- `apps/web/__tests__/middleware.test.ts`: Accept-Language 헤더 파싱 및 리다이렉트 로직 테스트
- `apps/web/next.config.ts` 업데이트: `withNextIntl` 플러그인 적용

## Constraints
- 기존 `apps/web/src/app/` 라우팅 구조 파괴 없이 `[locale]` segment 추가
- `apps/web/`은 SSR 모드 유지 (`output: 'export'` 금지)
- locale이 없는 URL 접근 시 반드시 locale prefix로 리다이렉트

## Steps
1. `apps/web/` 현재 app 라우팅 구조 확인
2. `apps/web/middleware.ts` 작성
3. `apps/web/src/app/[locale]/layout.tsx` 생성 (기존 layout 이동/래핑)
4. `next.config.ts` 업데이트
5. middleware 테스트 작성
6. `bun run typecheck` 및 `bun run build` 확인

## Acceptance Criteria
- `GET /` → `301 /ko/` (Accept-Language: ko 또는 기본)
- `GET /en/dashboard` → 영문 locale로 렌더링
- `GET /ko/dashboard` → 한국어 locale로 렌더링
- `bun run build` (apps/web) 성공
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test apps/web/__tests__/middleware.test.ts
cd apps/web && bun run build
```

## Out of Scope
desktop 앱 locale 설정 (T-22-004), 실제 번역 문자열 (T-22-005 이후), 언어 선택기 UI (T-22-006)
