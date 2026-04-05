# T-13-001 Backtest 테이블 스키마 마이그레이션

## Goal
DATA_MODEL.md의 Backtest 엔티티 정의에 따라 `backtests` 테이블을 Drizzle ORM 스키마에 추가한다.

## Why
백테스트/WFO 실행 결과를 저장할 DB 테이블이 없으면 이후 모든 백테스트 태스크가 진행 불가.

## Inputs
- `docs/DATA_MODEL.md` — Backtest 엔티티 정의 (line 329-354)
- `src/db/schema.ts` — 기존 Drizzle 스키마 패턴
- `src/core/types.ts` — `BacktestRunType` 타입 (이미 정의됨)

## Dependencies
없음 (EP-13 첫 태스크)

## Expected Outputs
- `src/db/schema.ts`에 `backtestTable` 정의 추가
- `BacktestRow`, `NewBacktestRow` 타입 export

## Deliverables
- `src/db/schema.ts` — `backtestTable` pgTable 추가

## Constraints
- DATA_MODEL.md 엔티티 정의를 충실히 반영 (run_type, parent_id, window_index, config_snapshot, results)
- FK: (symbol, exchange) → Symbol RESTRICT
- FK: parent_id → Backtest CASCADE (self-referencing)
- CHECK: run_type IN ('BACKTEST', 'WFO')
- 기존 스키마 패턴(uuid PK, timestamptz, CHECK 제약) 준수

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/db/schema.ts`에 `backtestTable` pgTable 정의 추가
4. Symbol FK, self-referencing parent_id FK, CHECK 제약조건 추가
5. `BacktestRow`, `NewBacktestRow` 타입 export
6. Run tests — confirm all pass (GREEN phase)
7. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- `backtestTable`이 DATA_MODEL.md Backtest 엔티티와 1:1 매핑
- `run_type` CHECK ('BACKTEST' / 'WFO')
- `parent_id` self-referencing FK with CASCADE
- `config_snapshot`, `results`가 jsonb 타입
- `bun run typecheck` 통과

## Test Scenarios
- backtestTable 정의가 필수 컬럼 모두 포함 (id, run_type, symbol, exchange, start_date, end_date, config_snapshot, results, created_at)
- NewBacktestRow 타입으로 BACKTEST 행 삽입 → 정상 삽입
- NewBacktestRow 타입으로 WFO 행 삽입 (parent_id, window_index 포함) → 정상 삽입
- run_type에 잘못된 값 삽입 시도 → CHECK 제약 위반
- parent_id에 존재하지 않는 uuid 삽입 → FK 위반
- parent_id가 있는 행의 부모 삭제 → CASCADE로 자식도 삭제

## Validation
```bash
bun run typecheck
bun test -- --grep "backtest.*schema"
```

## Out of Scope
- 마이그레이션 스크립트 실행 (Drizzle push/migrate는 별도)
- 백테스트 로직 구현
