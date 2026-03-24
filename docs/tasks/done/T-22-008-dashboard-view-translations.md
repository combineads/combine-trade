# T-22-008 — Dashboard view translations

## Goal

Add a `dashboard` namespace to `packages/ui/src/i18n/messages/ko.json` and `en.json`.
Update all dashboard view components to use translation keys instead of hardcoded strings.
Add tests verifying namespace structure and that both locales have matching keys.

## Steps

1. Create `packages/ui/src/i18n/messages/ko.json` and `en.json` with `dashboard` namespace
2. Create `packages/ui/src/i18n/glossary.ts` with trading-term constants and locale types
3. Create `packages/ui/src/i18n/index.ts` — `getTranslations()` helper and `useTranslations()` hook
4. Update `DashboardView` to accept optional `locale` prop and pass `t` to sub-components
5. Update `KillSwitchCard`, `WorkerStatus`, `StrategySummary`, `RecentEvents` to accept optional `t` prop
6. Write `packages/ui/__tests__/dashboard-translations.test.tsx` — 31 tests covering namespace parity and component rendering
7. Fix `dashboard.test.tsx` existing test to pass `locale="en"` explicitly

## Constraints

- Default locale is `ko` (Korean) per EP22 decisions
- LONG / SHORT / PASS remain English in both locales (trading domain standard)
- `t` prop is optional on all sub-components — backward compatible, falls back to English strings
- No external i18n library dependency (next-intl not yet installed; T-22-001 is a prerequisite for full infrastructure)
- All monetary / direction values (LONG/SHORT) unchanged

## Implementation Notes

- `getTranslations(namespace, locale)` uses dot-notation key paths for nested lookups
- Returns the key path as a fallback string when key is missing (no runtime errors)
- `useTranslations(namespace)` reads locale from `I18nContext` (context exported but not yet wired to a provider — that is T-22-002's job)
- Sub-components retain their original prop API; `t` is additive

## Outputs

- `packages/ui/src/i18n/messages/ko.json` — dashboard namespace (Korean)
- `packages/ui/src/i18n/messages/en.json` — dashboard namespace (English)
- `packages/ui/src/i18n/glossary.ts` — trading term constants + Locale type
- `packages/ui/src/i18n/index.ts` — getTranslations, useTranslations, I18nContext, message exports
- `packages/ui/src/views/dashboard/dashboard-view.tsx` — uses translations via locale prop
- `packages/ui/src/views/dashboard/kill-switch-card.tsx` — accepts optional t prop
- `packages/ui/src/views/dashboard/worker-status.tsx` — accepts optional t prop
- `packages/ui/src/views/dashboard/strategy-summary.tsx` — accepts optional t prop
- `packages/ui/src/views/dashboard/recent-events.tsx` — accepts optional t prop
- `packages/ui/__tests__/dashboard-translations.test.tsx` — 31 tests, all passing

## Validation

```
bun test packages/ui/__tests__/dashboard-translations.test.tsx  → 31 pass
bun test packages/ui/                                           → 274 pass
bun run typecheck                                               → no errors
```

## Status

Done — 2026-03-25
