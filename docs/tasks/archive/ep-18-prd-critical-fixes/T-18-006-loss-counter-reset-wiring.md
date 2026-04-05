# T-18-006 손실 카운터 리셋 daemon 연결

## Metadata
- modules: [daemon, limits]
- primary: daemon

## Goal
`resetAllExpired()` 함수를 daemon 런타임에 연결하여 손실 카운터(daily/session/hourly)가 적절한 시점에 리셋되도록 한다.

## Why
`resetAllExpired()`, `shouldResetDaily()`, `resetDailyLosses()` 등의 함수가 `loss-limit.ts`에 완전히 구현되어 있지만, daemon이나 pipeline 어디서도 호출하지 않아 카운터가 영원히 누적됨. 하루 지나도 losses_today가 리셋되지 않으면 영구 매매 중단.

## Inputs
- `src/limits/loss-limit.ts:388-410` — resetAllExpired()
- `src/limits/loss-limit.ts:281-311` — shouldResetDaily(), shouldResetHourly(), shouldResetSession()
- `src/daemon/pipeline.ts` / `src/daemon.ts`

## Dependencies
- T-18-005 (Daily Loss Limit balance 수정이 먼저 완료되어야 리셋 검증 의미 있음)

## Expected Outputs
- daemon에서 resetAllExpired() 호출 로직
- LastResets 상태 관리
- 테스트

## Deliverables
- daemon에 `LastResets` 상태를 인메모리로 관리하는 로직 추가
- 1H close 핸들러(`process1H`) 또는 별도 interval에서 `resetAllExpired()` 호출
  - daily: UTC 00:00 경과 시 → `resetDailyLosses()`
  - hourly: 매 정시(HH:00) 경과 시 → `resetHourlyLosses()`
  - session: trade block 시작 시 → `resetSessionLosses()`
- 리셋 실행 후 `LastResets` 타임스탬프 갱신
- trade block 시작 시점 감지를 위한 연동 (기존 `isTradeBlocked` 활용)

## Constraints
- resetAllExpired()는 기존 순수 함수 — 시그니처 변경 금지
- 리셋은 심볼×거래소별로 실행 (모든 active SymbolState 행)
- SymbolState FOR UPDATE 잠금으로 경합 방지
- 1H close 핸들러 내에서 실행하면 캔들 처리와 원자적으로 처리 가능

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. daemon.ts 또는 pipeline.ts에 `LastResets` 상태 초기화 (daemon 시작 시 현재 시간)
4. process1H() 또는 별도 interval에서 모든 active symbol×exchange에 대해 resetAllExpired() 호출
5. trade block 시작 감지 로직 추가 (sessionStartTime 전달)
6. 리셋 후 LastResets 타임스탬프 갱신
7. 백테스트 adapter에서 리셋 로직 mock 또는 연결
8. Run tests — confirm all pass (GREEN phase)
9. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- [x] daemon 시작 후 UTC 00:00 경과 → losses_today = '0' 확인 (shouldResetDaily 단위 테스트 + resetAllExpired DB 연동 테스트)
- [x] 매 정시 경과 → losses_this_1h_5m = 0, losses_this_1h_1m = 0 확인 (shouldResetHourly 단위 테스트)
- [x] trade block(장 개장) 시작 → losses_session = 0 확인 (setSessionStartTime → sessionReset 경로 테스트)
- [x] 리셋이 모든 active symbol×exchange에 적용 (processSymbol에서 symbol×exchange별 resetExpiredLosses 호출)
- [x] 리셋 중 candle close 처리와 경합 없음 (processSymbol 진입 시 첫 번째 단계로 실행)

## Test Scenarios
- resetAllExpired() called when UTC day changes → daily counters reset to 0
- resetAllExpired() called when UTC hour changes → hourly counters reset to 0
- resetAllExpired() called with sessionStartTime matching trade block → session counter reset
- resetAllExpired() called within same hour → no reset performed
- daemon startup initializes LastResets to current timestamp
- multiple symbol×exchange rows all get reset when daily boundary crossed

## Validation
```bash
bun test src/limits/loss-limit.test.ts
bun test src/daemon/pipeline.test.ts
bun run typecheck
```

## Out of Scope
- checkAccountDailyLimit 활성화 → T-18-005
- trade block seed 데이터 변경 없음

## Implementation Notes

### Design: PipelineDeps closure pattern
`resetAllExpired()`는 `symbol×exchange×now×lastResets`를 받는 함수다. Daemon은 `LastResets`를 인메모리 상태로 관리하고, `PipelineDeps.resetExpiredLosses(symbol, exchange, now)` 클로저를 통해 pipeline에 주입한다. Pipeline은 상태 관리 책임 없이 클로저만 호출한다.

### Call site: processSymbol (every candle)
매 candle close마다 `resetExpiredLosses`를 호출하여 시간 경계를 확인한다. 1H candle에서만 호출하면 1M/5M 시작 시 최대 60분 지연이 발생할 수 있어 모든 timeframe에서 호출한다.

### Session start detection: block→unblock transition
`processEntry`에서 `isTradeBlocked()` 결과가 `true → false`로 전환될 때 `setSessionStartTime(now)`를 호출한다. Module-level `previouslyBlocked` Map으로 이전 상태를 추적한다.

### Test isolation: _resetModuleStateForTesting()
Module-level Map(`previouslyBlocked`, `recent1MFired`)이 테스트 간 공유되어 오염이 발생한다. `_resetModuleStateForTesting()` 함수를 export해서 테스트 시작 시 초기화한다.

### Backtest adapter: no-op
백테스트는 시간 경계 리셋이 불필요하므로 `resetExpiredLosses`는 `{ dailyReset: false, sessionReset: false, hourlyReset: false }` 반환, `setSessionStartTime`는 no-op.

### Pre-existing test fix
`tests/daemon/pipeline.test.ts`의 "calls processTrailing when ticket has trailing_active=true" 테스트가 5M candle 기준으로 작성되어 있었으나 T-18-008에서 trailing이 1H only로 변경됨. 1H candle로 수정.
