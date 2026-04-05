# T-19-006 백테스트 CLI saveResult + WFO 튜닝 화이트리스트

## Metadata
- modules: [backtest]
- primary: backtest

## Goal
`runCli()`의 backtest 및 WFO 실행에 `saveResult` 콜백을 연결하여 결과를 `backtests` 테이블에 저장하고, `param-search`의 튜닝 대상 파라미터를 PRD 지정 화이트리스트(KNN.*, FEATURE_WEIGHT.*, SYMBOL_CONFIG.risk_pct)로 제한한다.

## Why
현재 CLI의 `runner.run()` 결과는 출력 후 폐기된다 — `backtests` 테이블에 저장되지 않아 과거 실행을 추적할 수 없다. 또한 `runParameterSearch()` 호출 시 전달되는 `ParamSpace[]`에 아무런 가드가 없어 ANCHOR 외의 임의 파라미터(예: EXCHANGE, TIMEFRAME 구조값)가 튜닝 대상이 될 위험이 있다. PRD §7.24(L469), §7.25(L475–476)는 이 두 항목을 모두 명시적 요건으로 지정한다.

## Inputs
- `src/backtest/cli.ts` — `runCli()`, `runBacktestWindow` 내부 구현
- `src/backtest/wfo.ts` — `WfoDeps.saveResult` 인터페이스
- `src/db/schema.ts` — `backtestTable`, `NewBacktestRow`
- PRD §7.24 L469: CLI must call saveResult after each run
- PRD §7.25 L475–476: tunable params = KNN.*, FEATURE_WEIGHT.*, SYMBOL_CONFIG.risk_pct only

## Dependencies
- T-19-005 (WFO 통과/실패 게이트 + CommonCode 반영) — 없어도 독립 수정 가능

## Expected Outputs
- 수정된 `src/backtest/cli.ts` — saveResult 콜백 주입
- 수정된 `src/backtest/param-search.ts` 또는 `cli.ts` — 화이트리스트 ParamSpace 정의
- 갱신된 테스트 파일들

## Deliverables
- `src/backtest/cli.ts`:
  - `runCli()`의 backtest 모드에서 `BacktestRunner.run()` 완료 후 `backtestTable`에 INSERT
  - WFO 모드에서 `runWfo()`의 `deps.saveResult` 콜백을 DB INSERT 함수로 주입
  - `saveResult` 구현: `run_type`, `symbol`, `exchange`, `start_date`, `end_date`, `config_snapshot`, `results`, `parent_id`, `window_index` 채워 삽입
- `src/backtest/param-search.ts`:
  - `TUNABLE_PARAM_WHITELIST` 상수 추가: KNN 그룹 전체, FEATURE_WEIGHT 그룹 전체, SYMBOL_CONFIG.risk_pct
  - `assertTunableParams(spaces: ParamSpace[]): void` — 화이트리스트 외 파라미터 포함 시 Error throw
  - `runParameterSearch()` 상단에서 `assertTunableParams()` 호출
- `tests/backtest/param-search.test.ts` (또는 기존 파일): 화이트리스트 검증 테스트 추가
- `tests/backtest/cli.test.ts` (또는 기존 파일): saveResult 콜백 주입 검증 테스트 추가

## Constraints
- `saveResult` 실패는 경고 로그만 남기고 CLI 종료를 막지 않음 (fire-and-forget with catch)
- ANCHOR 그룹 차단 기존 로직(`rejectAnchorGroup()`)은 변경하지 않음
- 화이트리스트는 코드에 상수로 고정 — DB/CommonCode에서 읽지 않음
- Decimal.js 사용 없음 (파라미터 값은 number 유지)
- `bun run typecheck` 통과

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/backtest/param-search.ts`에 `TUNABLE_PARAM_WHITELIST` 상수 및 `assertTunableParams()` 추가
4. `runParameterSearch()` 초입에 `assertTunableParams(gridSpaces)` 호출 추가 (randomSpaces도 포함)
5. `src/backtest/cli.ts` — `runCli()` backtest 브랜치에 saveResult 구현:
   - `getDb()`로 DB 획득
   - `runner.run()` 결과를 `backtestTable`에 INSERT
6. `runCli()` WFO 브랜치에 saveResult 콜백 함수 구현 후 `runWfo(deps)` 주입
7. Run tests — confirm all pass (GREEN phase)
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] backtest 모드 실행 완료 후 `backtests` 테이블에 `run_type='BACKTEST'` 행 INSERT됨
- [x] WFO 모드 실행 시 부모 `run_type='WFO'` 행 + 유효 윈도우마다 `run_type='WFO'` 자식 행 INSERT됨
- [x] `runParameterSearch()` 호출 시 SYMBOL_CONFIG.risk_pct 외 다른 SYMBOL_CONFIG 코드가 포함되면 Error throw
- [x] `runParameterSearch()` 호출 시 KNN.* 파라미터는 허용됨
- [x] `runParameterSearch()` 호출 시 FEATURE_WEIGHT.* 파라미터는 허용됨
- [x] saveResult DB 오류 → 경고 로그만, CLI는 정상 종료

## Test Scenarios
- assertTunableParams([{group:"KNN", code:"top_k", ...}]) → 통과 (no error)
- assertTunableParams([{group:"FEATURE_WEIGHT", code:"w_squeeze", ...}]) → 통과
- assertTunableParams([{group:"SYMBOL_CONFIG", code:"risk_pct", ...}]) → 통과
- assertTunableParams([{group:"SYMBOL_CONFIG", code:"max_leverage", ...}]) → Error "not in tunable whitelist"
- assertTunableParams([{group:"EXCHANGE", code:"api_key", ...}]) → Error "not in tunable whitelist"
- assertTunableParams([{group:"ANCHOR", code:"bb_period", ...}]) → Error (기존 rejectAnchorGroup 포함)
- runParameterSearch() with non-whitelisted space in randomSpaces → Error thrown before any backtest runs
- CLI saveResult injection: runWfo() called with deps.saveResult defined (not undefined)

## Validation
```bash
bun test src/backtest/param-search.test.ts
bun test src/backtest/cli.test.ts
bun run typecheck
```

## Out of Scope
- WFO 통과/실패 게이트 (efficiency threshold) — T-19-005
- WFO 최적값 → CommonCode UPDATE — T-19-005
- 백테스트 reporter 변경
- DB 마이그레이션 (backtests 테이블은 기존 스키마)
