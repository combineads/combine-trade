# T-14-004 이체 스케줄러 (transfer/scheduler.ts)

## Goal
CommonCode 설정(daily/weekly, 실행 시각)에 따라 자동 이체를 주기적으로 실행하는 TransferScheduler를 구현한다.

## Why
수동 이체는 잊기 쉽고 일관성이 없다. 스케줄러가 매일/매주 정해진 시각에 자동으로 이체를 실행하여 수익 확정을 자동화한다.

## Inputs
- `docs/exec-plans/14-auto-transfer.md` M3 — 스케줄러 스펙
- T-14-001 — TRANSFER CommonCode (transfer_schedule, transfer_time_utc, transfer_enabled)
- T-14-003 — executeTransfer()

## Dependencies
- T-14-002, T-14-003

## Expected Outputs
- `TransferScheduler` 클래스 — start()/stop() 생명주기
- daemon 통합을 위한 공개 API

## Deliverables
- `src/transfer/scheduler.ts`
- `src/transfer/index.ts` 업데이트 (TransferScheduler export)

## Constraints
- setTimeout 체인 사용 — setInterval 미사용 (드리프트 방지)
- `transfer_enabled = false` 시 즉시 skip (타이머는 유지, 실행만 건너뜀)
- daemon 생명주기와 함께 시작/종료 (stop() 호출 시 타이머 해제)
- 이체 시각은 UTC 기준 (±1분 이내 정확도)
- L7 레이어 규칙 준수

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/transfer/scheduler.ts` 생성:
   - `TransferScheduler` 클래스:
     - constructor에 DI: executeTransfer 함수, config 조회 함수
     - `start()`: 다음 실행 시각 계산 → setTimeout 등록
     - `stop()`: 타이머 해제
     - `getNextRunTime()`: transfer_schedule(daily/weekly) + transfer_time_utc 기반 계산
     - `runOnce()`: transfer_enabled 확인 → executeTransfer() 호출 → 다음 타이머 등록
   - weekly의 경우 매주 월요일 실행 (UTC)
4. `src/transfer/index.ts`에 TransferScheduler export 추가
5. Run tests — confirm all pass (GREEN phase)
6. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- start() 호출 후 다음 실행 시각에 executeTransfer() 호출됨
- stop() 호출 후 타이머 해제, 더 이상 실행 없음
- transfer_enabled=false 시 실행 건너뜀 (타이머는 계속 동작)
- daily 스케줄: 매일 transfer_time_utc에 실행
- weekly 스케줄: 매주 월요일 transfer_time_utc에 실행
- setTimeout 체인 사용 (setInterval 미사용)

## Test Scenarios
- TransferScheduler.getNextRunTime() with daily schedule, current time before transfer_time → returns today's transfer_time
- TransferScheduler.getNextRunTime() with daily schedule, current time after transfer_time → returns tomorrow's transfer_time
- TransferScheduler.getNextRunTime() with weekly schedule, current day is Monday before time → returns this Monday's time
- TransferScheduler.getNextRunTime() with weekly schedule, current day is Tuesday → returns next Monday's time
- TransferScheduler.runOnce() with transfer_enabled=false → does NOT call executeTransfer, schedules next run
- TransferScheduler.start() then stop() → clears pending timer, no further executeTransfer calls
- TransferScheduler.runOnce() with transfer_enabled=true → calls executeTransfer and schedules next run

## Validation
```bash
bun test -- --grep "transfer-scheduler"
bun run typecheck
bun run lint
```

## Out of Scope
- daemon.ts 통합 코드 (daemon이 TransferScheduler.start() 호출)
- Slack 알림 (daemon이 결과 받아 호출)
- 수동 즉시 이체 (T-14-005)

## Implementation Notes

### Design decisions

**`start()` uses a 0ms setTimeout** — `start()` must return `void` synchronously while the timer must be non-null immediately after returning. Since config is read async in `runOnce()`, the `start()` method arms a 0ms timer that fires `runOnce()`. This means the first execution happens on the next event loop tick (not at the scheduled time). `runOnce()` reads config, skips or executes, then schedules the next real run at the correct time via the setTimeout chain.

**`getNextRunTime()` takes explicit params** — The method signature takes `schedule`, `timeUtc`, and `now` as explicit params rather than reading from `deps.getConfig()`. This makes the method pure and synchronously testable without async mocking.

**`running` flag as double-stop guard** — `stop()` sets `running = false` and clears the timer. The `isRunning` getter exposes this for daemon health checks. The flag prevents no-op `stop()` calls from incorrectly reporting state.

**Daily "exact time" is treated as "already passed"** — `getNextRunTime()` uses `>=` for the "already passed" check. If called at exactly `00:30:00`, the next run is scheduled for tomorrow at `00:30`, not immediately. This prevents double-firing in edge cases.

### Files changed
- `src/transfer/scheduler.ts` — new file (TransferScheduler class)
- `src/transfer/index.ts` — added TransferScheduler and TransferSchedulerDeps exports
- `tests/transfer/transfer-scheduler.test.ts` — 15 tests covering all 7 scenarios

### Test results
- 15/15 pass
- typecheck: exit 0 (no errors in modified files)
- lint: src/transfer/scheduler.ts passes biome check (pre-existing errors in src/backtest/ unchanged)
