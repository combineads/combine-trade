# T-22-011 — Trading Glossary (Korean/English Terminology Reference)

## Goal

Create a comprehensive Korean/English trading terminology glossary that serves as:
1. A reference document for translators and developers (`packages/ui/src/i18n/glossary.md`)
2. A TypeScript module (`packages/ui/src/i18n/glossary.ts`) for programmatic use in i18n messages

## Steps

1. Create `packages/ui/src/i18n/` directory structure
2. Write `packages/ui/src/i18n/glossary.ts` — TypeScript glossary with categories
3. Write `packages/ui/src/i18n/glossary.md` — human-readable reference document
4. Write `packages/ui/__tests__/i18n-glossary.test.ts` — structural tests
5. Run `bun run typecheck`
6. Move task to done

## Constraints

- LONG, SHORT, PASS stay in English in both languages (domain standard)
- Each term must have: English key, Korean primary, optional Korean alternative, optional note
- Categories: general, orderTypes, riskManagement, technicalAnalysis, positionManagement, systemComponents, statistics
- No runtime dependencies added (pure data file)

## Implementation Notes

- Created `packages/ui/src/i18n/` directory (new — i18n infrastructure not yet built)
- Glossary covers ~80 terms across 7 categories
- TypeScript type `GlossaryEntry` ensures consistent shape
- Tests verify structural integrity (all entries have required fields, no duplicates)

## Outputs

- `packages/ui/src/i18n/glossary.ts`
- `packages/ui/src/i18n/glossary.md`
- `packages/ui/__tests__/i18n-glossary.test.ts`
