# T-22-005 — Common namespace translations

## Goal

Extract translation keys from shared UI components and populate comprehensive `common` namespace
entries in `packages/ui/src/i18n/messages/ko.json` and `en.json`.

## Steps

1. Create `packages/ui/src/i18n/messages/ko.json` with full common namespace
2. Create `packages/ui/src/i18n/messages/en.json` with full common namespace
3. Create `packages/ui/src/i18n/glossary.ts` with trading terminology constants
4. Write tests in `packages/ui/__tests__/i18n-common.test.ts` to verify key parity between locales

## Constraints

- All trading direction terms (LONG, SHORT, PASS) stay in English in both locales
- Ko translations must use glossary terms consistently
- Both locale files must have identical key structure
- No next-intl runtime dependency required — these are pure JSON message files

## Implementation Notes

- Created `packages/ui/src/i18n/` directory with `messages/ko.json`, `messages/en.json`
- Created `packages/ui/src/i18n/glossary.ts` for trading term constants
- Tests verify structural parity (same keys) between ko and en locale files

## Outputs

- `packages/ui/src/i18n/messages/ko.json`
- `packages/ui/src/i18n/messages/en.json`
- `packages/ui/src/i18n/glossary.ts`
- `packages/ui/__tests__/i18n-common.test.ts`
