# T-14-001 TRANSFER CommonCode 그룹 시드 추가

## Goal
자동 이체 기능에 필요한 설정값을 CommonCode TRANSFER 그룹으로 정의하고, 타입/스키마/시드 데이터를 추가한다.

## Why
자동 이체의 모든 파라미터(활성화 여부, 스케줄, 비율, 최소 금액, reserve 배수)가 CommonCode에 있어야 런타임에 웹 UI에서 변경할 수 있고, 다른 transfer 모듈이 이 설정을 참조할 수 있다.

## Inputs
- `docs/exec-plans/14-auto-transfer.md` M1 — TRANSFER 그룹 시드 정의
- `src/core/types.ts` — CommonCodeGroup 타입
- `src/config/schema.ts` — CONFIG_SCHEMAS 레지스트리
- `src/config/seed.ts` — SEED_DATA 배열

## Dependencies
- 없음 (EP-01 core/db/config 완료 전제)

## Expected Outputs
- `CommonCodeGroup` 타입에 `"TRANSFER"` 추가
- `TransferConfigSchema` Zod 스키마
- `SEED_DATA`에 TRANSFER 그룹 6개 항목

## Deliverables
- `src/core/types.ts` 수정 — CommonCodeGroup에 `"TRANSFER"` 유니온 추가
- `src/config/schema.ts` 수정 — TransferConfigSchema 정의 + CONFIG_SCHEMAS에 등록
- `src/config/seed.ts` 수정 — TRANSFER 시드 6개 항목 추가

## Constraints
- 기존 시드 항목 변경 금지 — 새 항목 추가만
- value의 금액/비율 값은 Decimal 호환 문자열 또는 숫자 사용
- `transfer_enabled`는 기본 `false` (안전 우선)

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/core/types.ts`에서 `CommonCodeGroup` 유니온에 `"TRANSFER"` 추가
4. `src/config/schema.ts`에 `TransferConfigSchema` 정의 (각 code별 value 형태 수용)
5. `CONFIG_SCHEMAS`에 `TRANSFER: TransferConfigSchema` 등록
6. `src/config/seed.ts`의 `SEED_DATA`에 6개 시드 항목 추가:
   - `transfer_enabled`: `false`
   - `transfer_schedule`: `"daily"`
   - `transfer_time_utc`: `"00:30"`
   - `transfer_pct`: `50`
   - `min_transfer_usdt`: `"10"`
   - `reserve_multiplier`: `10`
7. Run tests — confirm all pass (GREEN phase)
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- `CommonCodeGroup` 타입에 `"TRANSFER"` 포함
- `validateConfigValue("TRANSFER", "transfer_enabled", false)` 성공
- `validateConfigValue("TRANSFER", "transfer_pct", 50)` 성공
- `seed()` 실행 시 TRANSFER 그룹 6개 항목 삽입
- 기존 테스트 깨지지 않음

## Test Scenarios
- validateConfigValue("TRANSFER", "transfer_enabled", false) → returns { success: true }
- validateConfigValue("TRANSFER", "transfer_enabled", "not_boolean") → returns { success: false }
- validateConfigValue("TRANSFER", "transfer_pct", 50) → returns { success: true }
- validateConfigValue("TRANSFER", "min_transfer_usdt", "10") → returns { success: true }
- validateConfigValue("TRANSFER", "reserve_multiplier", 10) → returns { success: true }
- SEED_DATA filtering by group_code "TRANSFER" → returns 6 entries
- seed() with empty DB → inserts all TRANSFER entries without error

## Validation
```bash
bun test -- --grep "transfer-config"
bun run typecheck
bun run lint
```

## Out of Scope
- transfer 모듈 코드 작성
- 이체 잔고 계산 로직
- 웹 UI에서 TRANSFER 설정 편집

## Implementation Notes

### Files changed
- `src/core/types.ts` — Added `"TRANSFER"` to `CommonCodeGroup` union (now 13 groups)
- `src/config/schema.ts` — Added `TransferConfigSchema` (group-level union), `TRANSFER_CODE_SCHEMAS` (per-code strict schemas), registered `TRANSFER` in `CONFIG_SCHEMAS`, updated `validateConfigValue` to dispatch per-code schemas for groups that need stricter validation
- `src/config/seed.ts` — Added 6 TRANSFER seed entries: `transfer_enabled`, `transfer_schedule`, `transfer_time_utc`, `transfer_pct`, `min_transfer_usdt`, `reserve_multiplier`
- `tests/config/transfer-config.test.ts` — New test file with 18 tests covering validateConfigValue and SEED_DATA
- `tests/config/schema.test.ts` — Updated CONFIG_SCHEMAS registry count assertion from 12 to 13, added TRANSFER to expectedGroups

### Design decision: per-code schemas
The TRANSFER group values are heterogeneous (boolean / string / number), but the group-level `validateConfigValue` only receives `group` + `code` + `value`. To enforce that `transfer_enabled` rejects strings while `transfer_schedule` accepts them, a `TRANSFER_CODE_SCHEMAS` map was introduced and `validateConfigValue` was updated to prefer per-code schemas when available. This avoids breaking the existing group-keyed `CONFIG_SCHEMAS` contract while supporting the required rejection test.

### Monetary field
`min_transfer_usdt` is stored as string `"10"` for Decimal.js compatibility, consistent with `min_order_size` in EXCHANGE and `risk_pct` in SYMBOL_CONFIG.

### Test results
- 18/18 transfer-config tests pass
- 166/166 config tests pass
- typecheck: clean
- lint: no errors in modified files (pre-existing errors in `src/backtest/` are unrelated)
