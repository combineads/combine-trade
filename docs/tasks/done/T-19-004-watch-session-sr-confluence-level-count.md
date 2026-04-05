# T-19-004 WatchSession S/R 겹침 ≥2 레벨 카운트

## Metadata
- modules: [signals]
- primary: signals
- epic: EP-19
- milestone: M2
- prd-refs: §7.4 L240

## Goal
`detectSRConfluence()`를 PRD §7.4 L240에 맞게 재작성한다.
독립적인 S/R 레벨 6개(daily_open, prev_day_high, prev_day_low, MA20, MA60, MA120)
중 `|close − level| < ATR14 × 0.3` 을 만족하는 레벨이 2개 이상일 때만
SR_CONFLUENCE를 트리거한다.

## Why
현재 `detectSRConfluence()` (watching.ts L122-197)는 BB4/BB20 밴드 사이 구간에
close가 위치하는지 확인한다. 이는 PRD §7.4 L240의 "독립 S/R 레벨 ≥2 겹침" 조건과
다른 구현이다. PRD의 의도는 가격이 여러 지지/저항 레벨과 동시에 근접함을 확인하는
것이며, BB밴드 구간 체크는 이를 반영하지 않는다.

## Inputs
- `src/signals/watching.ts` L122-197 — 현재 `detectSRConfluence()` 구현
- `src/indicators/types.ts` — `AllIndicators` (`sma20`, `sma60`, `sma120`, `atr14`)
- PRD §7.4 L240: S/R 레벨 = daily_open, prev_day_high, prev_day_low, MA20, MA60, MA120
- PRD §7.4 L240: 근접 조건 = `|close − level| < ATR14 × 0.3`
- PRD §7.4 L240: 트리거 조건 = 근접 레벨 수 ≥ 2

## Dependencies
- 없음 (독립 수정)

## Expected Outputs
- 수정된 `src/signals/watching.ts` — `detectSRConfluence()` 재작성
- 갱신된 테스트

## Deliverables
- `detectSRConfluence()` 재작성:
  - S/R 레벨 소스: `indicators.sma20`, `indicators.sma60`, `indicators.sma120` + `symbolState`의 `daily_open`, `prev_day_high`, `prev_day_low`
  - 각 레벨에 대해 `|close − level| < atr14 × 0.3` 체크
  - `atr14` null이면 null 반환 (ATR 없으면 판단 불가)
  - 근접 레벨 수 < 2이면 null 반환
  - ≥ 2이면 direction 결정 후 `WatchingResult` 반환
- direction 결정: 근접 레벨들의 평균이 close보다 위이면 SHORT (저항), 아래이면 LONG (지지)
- `symbolState` 파라미터 확장: `prev_day_high?: Decimal | null`, `prev_day_low?: Decimal | null` 추가 (없으면 해당 레벨 제외)
- `detectWatching()` 시그니처 변경 최소화: `symbolState` 옵셔널 파라미터 추가
- 기존 BB4 Touch / Squeeze Breakout 로직 무변경

## Constraints
- `WatchingResult` 타입 변경 없음
- `detectWatching()` 공개 시그니처는 `symbolState` 옵셔널 파라미터 추가만 허용
- `isDirectionAllowed()` 헬퍼 유지
- `atr14` null일 때 SR_CONFLUENCE 판단 불가 → null 반환 (fail-safe)
- TP 가격: `tp1Price = sma20`, `tp2Price` = LONG이면 `bb20.upper`, SHORT이면 `bb20.lower` (기존 BB4Touch 패턴 준용)

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm behavioral tests fail
3. `src/signals/watching.ts`: `detectSRConfluence()` 본문을 새 로직으로 교체
4. `detectWatching()` 에 `symbolState` 옵셔널 파라미터 추가 및 `detectSRConfluence()`에 전달
5. Run tests — confirm all pass (GREEN phase)
6. `bun run typecheck && bun run lint`
7. 기존 `watching.ts` 소비자(daemon 등) 확인: `detectWatching()` 호출부에 `symbolState` 미전달 시 기존 동작 유지 확인
8. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [ ] close가 MA20, MA60 모두에 `ATR14 × 0.3` 내 → SR_CONFLUENCE 반환
- [ ] close가 MA20만 근접 (1개만) → null 반환
- [ ] close가 어떤 레벨에도 근접하지 않음 → null 반환
- [ ] `atr14` null → null 반환
- [ ] 근접 레벨들 평균이 close보다 위 → direction = SHORT
- [ ] 근접 레벨들 평균이 close보다 아래 → direction = LONG
- [ ] `dailyBias`가 LONG_ONLY일 때 SHORT SR_CONFLUENCE → null 반환
- [ ] `symbolState.daily_open` 제공 시 레벨로 포함됨
- [ ] `symbolState` 미전달 시 MA20/MA60/MA120만 S/R 레벨로 사용
- [ ] 기존 BB4 Touch, Squeeze Breakout 동작 무변경

## Test Scenarios
- detectSRConfluence() with close near MA20 and MA60 (both within ATR*0.3) → returns SR_CONFLUENCE
- detectSRConfluence() with close near only MA20 (one level) → returns null
- detectSRConfluence() with close near daily_open and MA120 → returns SR_CONFLUENCE
- detectSRConfluence() with atr14=null → returns null
- detectSRConfluence() with close near no levels → returns null
- detectSRConfluence() with levels-average above close → direction = SHORT
- detectSRConfluence() with levels-average below close → direction = LONG
- detectSRConfluence() with bias=LONG_ONLY and SHORT direction → returns null
- detectSRConfluence() with symbolState.prev_day_high and prev_day_low included as levels
- detectWatching() without symbolState → SR check only uses MA levels, BB4_TOUCH still works
- detectWatching() order preserved: SQUEEZE_BREAKOUT evaluated before SR_CONFLUENCE before BB4_TOUCH

## Validation
```bash
bun test src/signals/
bun run typecheck
bun run lint
```

## Out of Scope
- Squeeze Breakout bandwidth 히스토리 → T-19-003
- BB4 Touch 로직 변경
- TP 계산 알고리즘 변경
- S/R 레벨 소스 추가 (6개 고정)
- 데이터베이스 스키마 변경
