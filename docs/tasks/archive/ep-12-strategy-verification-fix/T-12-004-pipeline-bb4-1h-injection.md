# T-12-004 Pipeline — 1H BB4 지표 주입 → A급 신호 활성화

## Goal
`processEntry()`에서 5M/1M 진입 시 1H BB4 지표를 계산하여 `indicators.bb4_1h`에 주입, a_grade 판정이 실제로 동작하도록 한다.

## Why
EP-10에서 `evidence-gate.ts`에 a_grade 체크 코드를 작성했으나, pipeline.ts에서 `indicators.bb4_1h`를 주입하지 않아 항상 undefined → aGrade=false. 인터페이스만 만들고 wiring을 빠트린 EP-10 누락 사례.

## Inputs
- `src/daemon/pipeline.ts` — processEntry() (라인 550~), indicators 생성 (라인 392-393)
- `src/signals/evidence-gate.ts` — a_grade 체크 (라인 119-127), `indicators.bb4_1h` 사용
- `src/indicators/types.ts` — AllIndicators 타입 (`bb4_1h` 필드)
- `src/indicators/bollinger.ts` — `calcBollinger()` 함수 (source 파라미터 지원)

## Dependencies
없음 (독립 태스크)

## Expected Outputs
- processEntry()에서 1H 캔들을 로드하고 BB4(period=4, stdDev=4, source="open") 계산
- 결과를 `indicators.bb4_1h`에 주입한 후 `checkEvidence()` 호출

## Deliverables
- `src/daemon/pipeline.ts` — processEntry()에 1H BB4 계산 + 주입 로직 추가

## Constraints
- 1H 캔들은 `deps.getCandles(db, symbol, exchange, "1H", 10)` 으로 로드 (BB4 계산에 최소 4봉 필요)
- BB4 source="open" (EP-10 T-10-001에서 교정 완료)
- 레이어 규칙: pipeline(L9)에서 indicators(L2) 호출은 허용
- 1H 캔들이 부족하면 bb4_1h=null (기존 동작 유지)

## Steps
1. processEntry() 내, indicators 생성 직후 1H 캔들 로드
2. `calcBollinger(candles1H, 4, 4, "open")` 으로 1H BB4 계산
3. `indicators.bb4_1h = { upper, lower }` 주입
4. 기존 `checkEvidence(candle, indicators, activeSession)` 호출은 변경 없음 — indicators에 bb4_1h가 포함되므로 자동 연결
5. 통합 테스트: pipeline mock에서 bb4_1h 주입 → evidence.aGrade=true 경로 확인

## Acceptance Criteria
- 5M/1M processEntry() 시 `indicators.bb4_1h`가 1H BB4 밴드 값 포함
- 1H BB4 lower 터치 + LONG → aGrade=true
- 1H BB4 upper 터치 + SHORT → aGrade=true
- 1H 캔들 부족 → bb4_1h=null → aGrade=false (기존 동작)
- **통합 테스트**: pipeline E2E 시나리오에서 bb4_1h 주입 → checkEvidence() → aGrade=true 경로 확인
- **호출자 확인**: indicators 객체에 bb4_1h 필드가 주입된 상태로 checkEvidence()에 전달됨

## Test Scenarios
- processEntry() 1H BB4 계산 가능 + LONG + low ≤ bb4_1h_lower → evidence.aGrade=true
- processEntry() 1H BB4 계산 가능 + SHORT + high ≥ bb4_1h_upper → evidence.aGrade=true
- processEntry() 1H BB4 계산 가능 + 터치 없음 → evidence.aGrade=false
- processEntry() 1H 캔들 3봉만 → bb4_1h=null → evidence.aGrade=false
- processEntry() 1H BB4 주입 후 indicators 객체에 bb4_1h 존재 확인
- pipeline 통합: mock 1H candles → evidence-gate에 bb4_1h 전달 → aGrade 확인

## Validation
```bash
bun test -- tests/daemon/pipeline tests/signals/evidence-gate
bun run typecheck && bun run lint
```

## Out of Scope
- evidence-gate.ts 자체 수정 (a_grade 체크 코드는 이미 올바름)
- SL 공식 변경 → T-12-003

## Implementation Notes (2026-04-04)

### Approach
- Added `calcBB4: (candles: Candle[]) => BollingerResult | null` to `PipelineDeps` for testability (follows `calcAllIndicators` pattern).
- Added `BollingerResult` to the `@/indicators/types` import in pipeline.ts.
- In `processEntry()`, injected a step 3b between the active watch session check and `checkEvidence()`:
  1. Load 1H candles via `deps.getCandles(..., "1H", 10)`
  2. If `candles1H.length >= 4`: call `deps.calcBB4(candles1H)`
  3. If result is non-null: mutate `indicators.bb4_1h = bb4_1h`
  4. Otherwise: leave `indicators.bb4_1h` as null (default from `calcAllIndicators`)

### Key Decision
The injection point is after `getActiveWatchSession` check (step 3) and before `checkEvidence` (step 4). This avoids the unnecessary 1H candle load when the pipeline returns early due to trade blocked / loss limit / no watch session.

### Test Considerations
- `recent1MFired` module-level state causes contamination: each 5M test uses a unique symbol to avoid being skipped by earlier 1M pipeline calls in the same test run.
- 6 new tests added in "1H BB4 injection — a_grade activation" describe block.
- All 52 pipeline tests pass; evidence-gate tests (47) unchanged and passing.

### Validation Results
- `bun test -- tests/daemon/pipeline`: 52 pass, 0 fail
- `bun test -- tests/signals/evidence-gate`: 47 pass, 0 fail
- `bun run typecheck`: no errors
- `bun run lint`: no issues
