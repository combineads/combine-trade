# EP-01 Foundation — Archive Summary

- **Completed:** 2026-04-03
- **Tasks:** 14 (T-01-001 ~ T-01-014)
- **Key decisions:**
  - Drizzle ORM + postgres.js + pgvector 조합 채택
  - ESLint 대신 Biome 사용 → 커스텀 레이어 검증 스크립트(check-layers.ts)
  - CommonCode로 config.json 대체
  - ANCHOR 그룹 보호는 애플리케이션 레벨
- **Patterns discovered:**
  - Decimal.js 래퍼 패턴 (d() 팩토리)
  - 구조화 JSON 로거를 L0에 배치 → 모든 모듈에서 사용
  - Zod 스키마 기반 설정 검증
- **Outputs produced:**
  - `src/core/` — types, constants, decimal, ports, logger
  - `src/db/` — pool, schema, migrate
  - `src/config/` — schema, loader, seed
  - `scripts/check-layers.ts` — 레이어 의존성 검증
