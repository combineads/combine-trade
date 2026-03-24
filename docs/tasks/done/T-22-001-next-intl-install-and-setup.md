# T-22-001 next-intl package installation and basic setup

## Goal
Install `next-intl` in `apps/web` and `apps/desktop`, create Korean/English message files in `packages/ui/src/i18n/messages/`, create a shared i18n config, and wire up the basic next-intl configuration for `apps/web`.

## Why
EP22 (Internationalization) requires an i18n foundation before any view-level translation work can begin. This task establishes the package installation, message file structure, TypeScript types, and shared config so all subsequent EP22 tasks have a stable base.

## Inputs
- `docs/exec-plans/22-internationalization.md` § "M1 — i18n 인프라 구축"
- `apps/web/next.config.ts` — existing Next.js config
- `apps/desktop/next.config.ts` — existing desktop config (static export)
- `packages/ui/src/` — existing UI package structure

## Dependencies
None — first task of EP22.

## Expected Outputs
- `next-intl` installed in `apps/web/package.json` and `apps/desktop/package.json`
- `packages/ui/src/i18n/messages/ko.json` — Korean translations skeleton (common namespace)
- `packages/ui/src/i18n/messages/en.json` — English translations skeleton (common namespace)
- `packages/ui/src/i18n/config.ts` — shared locale config (locales list, defaultLocale)
- `packages/ui/src/i18n/index.ts` — re-exports for shared i18n config
- `apps/web/src/i18n/request.ts` — next-intl server-side request config
- `apps/web/src/i18n/routing.ts` — next-intl routing config
- TypeScript path types for next-intl message keys

## Deliverables
- `next-intl` resolvable in both Next.js apps
- Shared locale constants accessible via `@combine/ui`
- Message files with at least a `common` namespace skeleton
- `bun run typecheck` passes
- Tests for config and message file structure

## Constraints
- Default locale: `ko`
- Supported locales: `['ko', 'en']`
- Message files in `packages/ui/src/i18n/messages/` (shared, used by both apps)
- TypeScript strict mode — no `any`
- Follow `@combine/*` package alias convention
- `apps/desktop` uses static export — do NOT add locale-based routing to desktop yet (T-22-004 handles that)

## Steps
1. Write tests (RED): message file structure, config shape, type exports
2. Install `next-intl` in `apps/web` and `apps/desktop`
3. Create `packages/ui/src/i18n/` directory with config, message files, index
4. Create `apps/web/src/i18n/request.ts` — next-intl `getRequestConfig`
5. Create `apps/web/src/i18n/routing.ts` — next-intl routing definition
6. Export i18n config from `packages/ui/src/i18n/index.ts`
7. Run tests → GREEN
8. Run `bun run typecheck` → fix any type errors

## Acceptance Criteria
- `next-intl` is listed in `apps/web/package.json` dependencies
- `packages/ui/src/i18n/messages/ko.json` and `en.json` exist with `common` namespace
- `packages/ui/src/i18n/config.ts` exports `locales`, `defaultLocale`, `Locale` type
- `apps/web/src/i18n/request.ts` exports a valid `getRequestConfig` function
- `apps/web/src/i18n/routing.ts` exports `routing`, `Link`, `redirect`, `usePathname`, `useRouter`
- All tests pass
- `bun run typecheck` passes

## Validation
```bash
bun test --filter i18n
bun run typecheck
```

## Out of Scope
- Locale-based URL routing middleware (T-22-003)
- `packages/ui` i18n provider / `useTranslations` wrapper (T-22-002)
- Desktop locale provider (T-22-004)
- Any view-level translation (T-22-005 onward)

## Implementation Notes

- **Date**: 2026-03-25
- **next-intl version**: 4.8.3 (installed in both apps/web and apps/desktop)
- **Files created**:
  - `packages/ui/src/i18n/config.ts` — `locales`, `defaultLocale`, `Locale` type, `isValidLocale()`
  - `packages/ui/src/i18n/messages/ko.json` — Korean common namespace skeleton (20 keys)
  - `packages/ui/src/i18n/messages/en.json` — English common namespace skeleton (20 keys)
  - `packages/ui/src/i18n/index.ts` — re-exports from config
  - `apps/web/src/i18n/routing.ts` — next-intl `defineRouting` with locales/defaultLocale
  - `apps/web/src/i18n/request.ts` — next-intl `getRequestConfig` server function
  - `packages/ui/src/i18n/__tests__/i18n-config.test.ts` — 5 config tests
  - `packages/ui/src/i18n/__tests__/messages.test.ts` — 7 message tests
- **packages/ui/src/index.ts**: Added i18n exports at top
- **Approach**:
  - Shared locale config lives in `packages/ui/src/i18n/` for reuse by both apps
  - Message files in `packages/ui/src/i18n/messages/` with `common` namespace skeleton
  - `apps/web` routing uses `defineRouting` from next-intl pointing to shared config
  - `request.ts` dynamically imports message files by locale with fallback to `defaultLocale`
  - Desktop locale provider deferred to T-22-004 (static export compatibility)
- **Validation results**:
  - `bun test packages/ui/src/i18n/__tests__/`: PASS (12 tests, 0 failures)
  - `bun run typecheck`: PASS
  - `bunx biome check packages/ui/src/i18n/ apps/web/src/i18n/`: PASS (0 errors)

## Outputs

- `next-intl@4.8.3` in `apps/web/package.json` and `apps/desktop/package.json`
- `packages/ui/src/i18n/config.ts` — `locales: ['ko', 'en']`, `defaultLocale: 'ko'`, `Locale` type, `isValidLocale()`
- `packages/ui/src/i18n/messages/ko.json` — Korean common namespace (loading, error, confirm, cancel, save, close, delete, edit, create, update, search, filter, reset, refresh, back, next, previous, submit, apply, status.*, direction.*, noData, unknown)
- `packages/ui/src/i18n/messages/en.json` — English common namespace (same keys)
- `apps/web/src/i18n/routing.ts` — next-intl routing definition
- `apps/web/src/i18n/request.ts` — next-intl server request config with locale validation
- `packages/ui/src/index.ts` — exports `locales`, `defaultLocale`, `Locale`, `isValidLocale` from i18n
