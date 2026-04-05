# T-19-003 WatchSession 스퀴즈 bandwidth 히스토리

## Metadata
- modules: [indicators, signals]
- primary: indicators
- epic: EP-19
- milestone: M2
- prd-refs: §7.4 L239

## Goal
`AllIndicators`에 `bandwidthHistory: Decimal[]` (최근 20값) 를 추가하고,
`calcAllIndicators()`가 이를 populate하여 `detectSqueeze()`로 전달함으로써
SQUEEZE_BREAKOUT 감지 경로를 실제로 동작하게 한다.

## Why
현재 `calcAllIndicators()` (index.ts L46-47)는 단일 bandwidth 값만 담긴
배열 `[bb20.bandwidth]`를 `detectSqueeze()`에 전달한다. `detectSqueeze()`는
`bandwidths.length <= 1`이면 즉시 `"normal"`을 반환하므로(squeeze.ts L16),
`indicators.squeeze`는 항상 `"normal"` 이다. 결과적으로
`detectSqueezeBreakout()` (watching.ts L51)의 `indicators.squeeze !== "expansion"`
체크가 항상 참이 되어 SQUEEZE_BREAKOUT은 절대 발동하지 않는다.
PRD §7.4 L239 스퀴즈 감지 조건을 충족하려면 이전 봉의 bandwidth 히스토리가 필요하다.

## Inputs
- `src/indicators/types.ts` — `AllIndicators` 타입
- `src/indicators/index.ts` — `calcAllIndicators()` L42-47 (단일 bandwidth 전달)
- `src/indicators/squeeze.ts` — `detectSqueeze(bandwidths: Decimal[], lookback: number = 20)`
- `src/indicators/bollinger.ts` — `calcBB20()`, BB 시리즈 계산 가능 여부 확인 필요
- PRD §7.4 L239: 스퀴즈 후 expansion → SQUEEZE_BREAKOUT 트리거

## Dependencies
- 없음 (T-19-001과 독립 — `bandwidthHistory`는 별도 필드)

## Expected Outputs
- `src/indicators/types.ts`: `AllIndicators`에 `bandwidthHistory: Decimal[]` 추가
- `src/indicators/index.ts`: `calcAllIndicators()` 에서 BB20 bandwidth series를 계산하여 `bandwidthHistory` populate 및 `detectSqueeze()` 호출
- 신규/갱신 테스트

## Deliverables
- `AllIndicators.bandwidthHistory: Decimal[]` — 최근 20개의 BB20 bandwidth 값 (20개 미만이면 있는 만큼)
- `calcAllIndicators()` 수정:
  - `calcBB20` 시리즈 계산으로 bandwidth 히스토리 추출 (`calcBB`를 직접 다수 호출하거나 bollinger 내부 series 함수 사용)
  - `bandwidthHistory = bandwidthSeries.slice(-20)` 저장
  - `detectSqueeze(bandwidthHistory)` 호출 (현재 `[bb20.bandwidth]` 대신)
- 기존 소비자 코드 무변경 — `bandwidthHistory` 는 additive
- `detectSqueeze()` 자체는 수정하지 않음 (이미 시리즈를 올바르게 처리함)

## Constraints
- `bollinger.ts`에 공개 bandwidth series API가 없다면 `calcAllIndicators()` 내부에서 candles에서 직접 계산 (슬라이딩 윈도우)
- bandwidth 계산: `(bb20.upper - bb20.lower) / bb20.middle` — 기존 `BollingerResult.bandwidth` 필드 재사용
- `bandwidthHistory` 최대 크기: 20 (`detectSqueeze`의 기본 lookback=20과 일치)
- `bb20`이 null이면 `bandwidthHistory = []`, `squeeze = "normal"` 유지
- 기존 `squeeze: SqueezeState` 필드 타입 변경 없음

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm behavioral tests fail (squeeze always "normal")
3. `src/indicators/types.ts`: `bandwidthHistory: Decimal[]` 추가
4. `src/indicators/index.ts`: bandwidth 시리즈 계산 로직 작성
   - 최근 21개 캔들 슬라이스로 각 봉의 BB20을 계산하거나, `calcBBSeries` 등 활용
   - 현실적으로: `candles.slice(-21)`로 윈도우 후 각 sub-array에서 `calcBB20` 호출하여 bandwidth 배열 구성 (성능 vs 단순성 트레이드오프 판단)
5. `detectSqueeze(bandwidthHistory)` 호출로 교체
6. 반환 객체에 `bandwidthHistory` 포함
7. Run tests — confirm all pass (GREEN phase)
8. `bun run typecheck && bun run lint`
9. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [ ] 30개 캔들 제공 → `bandwidthHistory.length === 20`
- [ ] 22개 캔들 제공 → `bandwidthHistory.length` < 20 (있는 만큼)
- [ ] `bb20`이 null인 경우 → `bandwidthHistory = []`, `squeeze = "normal"`
- [ ] squeeze 감지: bandwidth가 20봉 평균의 50% 미만인 경우 → `squeeze = "squeeze"`
- [ ] squeeze 감지: bandwidth가 20봉 평균의 150% 초과인 경우 → `squeeze = "expansion"`
- [ ] 단일 bandwidth 값만 있는 경우 → `squeeze = "normal"` (기존 동작 유지)
- [ ] `detectWatching()` 에서 SQUEEZE_BREAKOUT이 이제 "expansion" 상태에서 발동 가능
- [ ] 기존 소비자(`safety-gate.ts`, `evidence-gate.ts`) 수정 불필요 — `bun run typecheck` PASS

## Test Scenarios
- calcAllIndicators() with 30 candles → bandwidthHistory.length === 20
- calcAllIndicators() with 22 candles → bandwidthHistory.length is less than 20
- calcAllIndicators() with 0 candles or bb20=null → bandwidthHistory is empty array
- calcAllIndicators() with candles showing sustained narrow bandwidth then sudden wide → squeeze === "expansion"
- calcAllIndicators() with candles showing sustained wide bandwidth then sudden narrow → squeeze === "squeeze"
- calcAllIndicators() with uniform bandwidth across all candles → squeeze === "normal"
- detectWatching() with indicators.squeeze === "expansion" and close above bb20 upper → returns SQUEEZE_BREAKOUT result
- detectWatching() with indicators.squeeze === "normal" → does not return SQUEEZE_BREAKOUT
- bandwidthHistory last element equals current bb20.bandwidth value
- AllIndicators type: bandwidthHistory property exists and is typed as Decimal[]

## Validation
```bash
bun test src/indicators/
bun test src/signals/
bun run typecheck
bun run lint
```

## Out of Scope
- `detectSqueeze()` 알고리즘 자체 변경 (이미 올바름)
- S/R Confluence 감지 수정 → T-19-004
- `squeeze.ts` lookback 파라미터 변경
- 성능 최적화 (bandwidth 시리즈 계산 캐싱)

## Implementation Notes

### Completed
- `src/indicators/types.ts`: `bandwidthHistory: Decimal[]` 추가 (AllIndicators 마지막 필드)
- `src/indicators/index.ts`: sliding window BB20 계산 로직 추가 (up to 20 windows, newest-first then reversed to chronological)
- `src/indicators/bandwidth-history.test.ts`: 신규 테스트 파일 (15 tests)
- `src/signals/watching.test.ts`: T-19-003 SQUEEZE_BREAKOUT 도달 가능성 테스트 2개 추가

### Deviations from spec
- Task acceptance criteria "30개 캔들 → bandwidthHistory.length === 20" 은 물리적으로 불가능 (30-20+1=11개 윈도우만 가능). 테스트를 물리적으로 정확한 값(11)으로 수정함.
- 39개 캔들에서 정확히 20개 달성 (39-20+1=20).

### Consumer files updated (additive, bandwidthHistory: [] 추가)
총 12개 테스트 파일의 AllIndicators 목 객체에 `bandwidthHistory: []` 추가:
src/daemon/pipeline.test.ts, src/signals/safety-gate.test.ts, src/vectors/strategy-features.test.ts,
tests/indicators/types.test.ts (length assertion 16→17 포함), tests/indicators/unified.test.ts,
tests/integration/indicators-imports.test.ts, tests/signals/safety-gate.test.ts,
tests/signals/evidence-gate.test.ts, tests/signals/pipeline-e2e.test.ts,
tests/vectors/strategy-features.test.ts, tests/vectors/vectorizer.test.ts,
tests/strategy-alignment/strategy-alignment-e2e.test.ts, tests/daemon/pipeline.test.ts, tests/daemon/daemon-e2e.test.ts

### Validation result
- bun test src/indicators/ src/signals/: 71 pass, 0 fail
- bun run typecheck: PASS
- bun run lint: 2 pre-existing errors (src/exits/manager.ts, src/orders/executor.test.ts) — not introduced by this task
