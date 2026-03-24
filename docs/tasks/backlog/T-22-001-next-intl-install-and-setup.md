# T-22-001 next-intl 패키지 설치 및 기본 설정

## Goal
`next-intl` 패키지를 설치하고, `packages/ui/src/i18n/` 디렉토리 구조와 TypeScript 타입 설정을 완료한다.

## Why
EP22 전체 i18n 작업의 기반이 되는 인프라 태스크. 이 태스크 없이는 나머지 번역 작업 전체가 블록된다.

## Inputs
- `packages/ui/package.json` — 의존성 추가 대상
- `packages/ui/tsconfig.json` — TypeScript 경로 설정
- `docs/exec-plans/22-internationalization.md` — 아키텍처 결정사항

## Dependencies
없음

## Expected Outputs
- `next-intl` 패키지가 `packages/ui`에 설치됨
- `packages/ui/src/i18n/` 디렉토리 구조 생성
- `packages/ui/src/i18n/messages/ko.json` 및 `en.json` (빈 skeleton)
- TypeScript global type 선언으로 번역 키 자동완성 가능

## Deliverables
- `packages/ui/package.json`: `next-intl` 의존성 추가
- `packages/ui/src/i18n/messages/ko.json`: namespace skeleton (common, dashboard, strategies, orders, alerts, risk, settings, auth, backtest, charts, events, journal)
- `packages/ui/src/i18n/messages/en.json`: 동일 skeleton
- `packages/ui/src/i18n/types.ts`: `Messages` 타입 선언 (TypeScript 자동완성용)
- `packages/ui/src/i18n/index.ts`: i18n 설정 export (locales, defaultLocale)
- `packages/ui/src/i18n/__tests__/messages.test.ts`: ko/en skeleton 구조 일치 테스트

## Constraints
- `packages/core`에는 i18n 의존성 추가 금지 (domain isolation)
- `next-intl` 버전은 Next.js App Router RSC를 지원하는 최신 안정 버전 사용
- 번역 파일은 `packages/ui/src/i18n/messages/` 에 위치 (결정사항)

## Steps
1. `packages/ui/` 현재 package.json 읽기
2. `bun add next-intl` in `packages/ui/`
3. `packages/ui/src/i18n/` 디렉토리 및 하위 파일 생성
4. `ko.json`, `en.json` namespace skeleton 작성 (각 namespace는 빈 object `{}`)
5. `types.ts` — `typeof import('./messages/ko.json')` 기반 `Messages` 타입 작성
6. `index.ts` — `locales`, `defaultLocale` export
7. 테스트 작성: ko/en namespace keys 일치 확인
8. `bun run typecheck` 통과 확인

## Acceptance Criteria
- `packages/ui` 에서 `import { useTranslations } from 'next-intl'` 가능
- `ko.json`과 `en.json`에 동일한 최상위 namespace 키 존재
- `bun run typecheck` 통과
- `bun test --filter messages` 통과

## Validation
```bash
bun run typecheck
bun test packages/ui/src/i18n/__tests__/messages.test.ts
```

## Out of Scope
Provider 컴포넌트 구현 (T-22-002), 미들웨어 설정 (T-22-003), 실제 번역 문자열 입력 (T-22-005 이후)
