# T-06-008 손실 카운터 리셋 로직

## Goal
손실 카운터의 시간 기반 리셋 로직(일간/세션/시간)을 구현한다.

## Why
손실 제한이 올바르게 동작하려면 카운터가 적절한 시점에 리셋되어야 한다. 리셋 없이는 한번 한도에 도달하면 영구적으로 진입이 차단된다.

## Inputs
- `src/limits/loss-limit.ts` — T-06-007 산출물 (기존 함수들)
- `src/db/schema.ts` — symbolStateTable
- `docs/DATA_MODEL.md` — 손실 카운터 리셋 규칙

## Dependencies
- T-06-007 (loss-limit.ts 기본 구현)

## Expected Outputs
- `src/limits/loss-limit.ts` 확장 — `resetDailyLosses()`, `resetSessionLosses()`, `resetHourlyLosses()`, `shouldReset()` 추가
- 데몬이 적절한 시점에 호출

## Deliverables
- `src/limits/loss-limit.ts` (T-06-007 파일 확장)
- `tests/limits/loss-limit-reset.test.ts`

## Constraints
- `shouldReset*()` 판정 함수는 순수 (현재 시각을 파라미터로 받음)
- `reset*()` DB 함수는 db/schema.ts symbolStateTable 직접 접근
- positions 모듈 import 금지 (레이어 규칙)
- UTC 기준 시각 계산

## Steps
1. `shouldResetDaily(now, lastResetTime) → boolean` — UTC 00:00 경계 판단 (순수)
2. `shouldResetSession(now, sessionStartTime) → boolean` — 세션(장) 시작 시점 판단 (순수)
3. `shouldResetHourly(now, lastResetTime) → boolean` — 매 정시(HH:00) 경계 판단 (순수)
4. `resetDailyLosses(db, symbol, exchange) → void` — losses_today = 0
5. `resetSessionLosses(db, symbol, exchange) → void` — losses_session = 0
6. `resetHourlyLosses(db, symbol, exchange) → void` — losses_this_1h_5m = 0, losses_this_1h_1m = 0
7. `resetAllExpired(db, symbol, exchange, now, lastResets) → ResetResult` — 종합 리셋 판단 + 실행
8. 테스트 작성 후 구현 (TDD)

## Acceptance Criteria
- UTC 00:00 경과 시 losses_today 리셋
- 세션(장) 시작 시 losses_session 리셋
- 매 정시(HH:00) 경과 시 losses_this_1h_5m, losses_this_1h_1m 리셋
- 리셋 시점 미경과 시 카운터 유지
- 여러 리셋이 동시에 트리거될 수 있음 (자정 = 일간 + 시간 동시)
- 순수 판정 함수는 현재 시각을 파라미터로 받아 결정론적

## Test Scenarios
- shouldResetDaily() at 23:59 → false, at 00:01 (next day) → true
- shouldResetDaily() same day, different hour → false
- shouldResetSession() at session start time → true
- shouldResetSession() mid-session → false
- shouldResetHourly() at 13:59 → false, at 14:01 → true
- shouldResetHourly() same hour → false
- resetDailyLosses() → losses_today set to '0'
- resetSessionLosses() → losses_session set to 0
- resetHourlyLosses() → losses_this_1h_5m=0, losses_this_1h_1m=0
- resetAllExpired() at midnight → daily + hourly both reset
- resetAllExpired() at session start + hourly boundary → session + hourly both reset
- resetAllExpired() mid-period → no resets, returns empty

## Validation
```bash
bun test -- --grep "loss-limit-reset|loss-counter-reset"
bun run typecheck
bun run lint
```

## Out of Scope
- 데몬 스케줄링 (EP-09)
- 세션 시작 시점 결정 (거래차단 시스템 — EP-05 trade-block.ts와 연동은 EP-09)
