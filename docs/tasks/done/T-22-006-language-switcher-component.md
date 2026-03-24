# T-22-006 LanguageSwitcher 컴포넌트 구현

## Goal
top-bar에 배치할 `LanguageSwitcher` 컴포넌트를 구현한다. 사용자가 ko↔en을 선택할 수 있으며, 선택 언어가 localStorage에 저장되어 재방문 시 유지된다.

## Why
사용자가 언어를 직접 전환할 수 있는 UI 진입점이 필요하다. `packages/ui/`에 위치하여 web/desktop 모두에서 재사용된다.

## Inputs
- T-22-002 출력물: `useLocale` 훅
- T-22-003 출력물: web locale 라우팅 (web에서는 URL 기반 전환)
- T-22-004 출력물: desktop LocaleContext (desktop에서는 setLocale 기반 전환)
- `packages/ui/src/components/` 패턴 및 디자인 토큰

## Dependencies
T-22-002, T-22-003, T-22-004

## Expected Outputs
- `LanguageSwitcher` 컴포넌트 (packages/ui)
- web/desktop 환경에서 모두 동작하는 locale 전환 로직
- 단위 테스트

## Deliverables
- `packages/ui/src/components/LanguageSwitcher/LanguageSwitcher.tsx`:
  - 현재 locale 표시 (ko → "한국어", en → "English")
  - 드롭다운 또는 토글 형태 선택 UI
  - web: `useRouter().push` + locale prefix 교체로 전환
  - desktop: `LocaleContext.setLocale` 호출로 전환
  - platform 분기는 `usePlatform()` 훅으로 처리
- `packages/ui/src/components/LanguageSwitcher/index.ts`: export
- `packages/ui/src/components/LanguageSwitcher/__tests__/LanguageSwitcher.test.tsx`: locale 전환 동작 테스트

## Constraints
- 플랫폼 분기 로직은 `packages/ui/platform/usePlatform()` 훅 사용
- localStorage 키: `'combine-locale'` (T-22-004와 동일)
- 컴포넌트 자체는 `"use client"` 선언 필수
- 디자인 시스템 토큰 준수 (DESIGN_SYSTEM.md)

## Steps
1. `packages/ui/platform/` 현재 `usePlatform` API 확인
2. `LanguageSwitcher.tsx` 구현
3. web locale 전환 로직 (router.push 기반)
4. desktop locale 전환 로직 (context setLocale 기반)
5. 단위 테스트 작성
6. `bun run typecheck` 통과 확인

## Acceptance Criteria
- ko 선택 시 한국어로 즉시 전환
- en 선택 시 영어로 즉시 전환
- 선택 언어가 localStorage에 저장되어 재방문 시 복원
- `bun test packages/ui/src/components/LanguageSwitcher` 통과
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test packages/ui/src/components/LanguageSwitcher/__tests__/LanguageSwitcher.test.tsx
```

## Out of Scope
top-bar 레이아웃 변경 (기존 UI 통합은 뷰 태스크에서), 3개 이상 언어 지원
