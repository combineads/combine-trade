# T-09-003 크래시 복구 — comparePositions + emergencyClose 재사용, SL 재등록

## Goal
데몬 시작 시 실행되는 크래시 복구 시퀀스 `src/daemon/crash-recovery.ts`를 구현한다. EP-08의 `comparePositions()`와 EP-06의 `emergencyClose()`를 재사용하여 거래소↔DB 포지션 대조 및 복구 수행.

## Why
데몬이 크래시 후 재시작되면 DB와 거래소 포지션이 불일치할 수 있음. SL이 거래소에서 사라졌을 수 있음. 빠르게 상태를 복구하지 않으면 보호 없는 포지션이 노출됨. 크래시 복구는 CandleManager 시작 전에 완료되어야 함.

## Inputs
- `docs/exec-plans/09-daemon.md` — M3 마일스톤
- `src/reconciliation/comparator.ts` — comparePositions() (순수 함수)
- `src/reconciliation/worker.ts` — ReconciliationDeps 인터페이스
- `src/orders/executor.ts` — emergencyClose()
- `src/db/event-log.ts` — insertEvent()
- `src/notifications/slack.ts` — sendSlackAlert()
- `src/core/ports.ts` — ExchangeAdapter.fetchPositions(), createOrder()

## Dependencies
- T-09-001 (데몬 스켈레톤 — daemon.ts에서 recoverFromCrash 호출)

## Expected Outputs
- `src/daemon/crash-recovery.ts` — recoverFromCrash() 함수, CrashRecoveryDeps 인터페이스, CrashRecoveryResult 타입
- daemon.ts에서 startDaemon() 내 CandleManager.start() 전에 recoverFromCrash() 호출

## Deliverables
- `src/daemon/crash-recovery.ts` — 크래시 복구 시퀀스

## Constraints
- comparePositions() 재사용 (EP-08 reconciliation/comparator.ts) — 대조 로직 중복 금지
- emergencyClose() 재사용 (EP-06 orders/executor.ts) — 패닉 클로즈 중복 금지
- SL 재등록: 매칭된 포지션에서 거래소에 SL 주문이 없으면 adapter.createOrder(stop_market) 호출
- 손실 카운터 복원: SymbolState에서 losses_today/session/hourly를 읽어 메모리에 반영
- 모든 복구 액션은 EventLog `CRASH_RECOVERY` + Slack 알림
- DI 패턴: CrashRecoveryDeps로 외부 의존성 주입

## Steps
1. 테스트 파일 `tests/daemon/crash-recovery.test.ts` 생성 — Test Scenarios 기반 TDD
2. `src/daemon/crash-recovery.ts` 구현:
   - CrashRecoveryDeps 인터페이스 정의
   - recoverFromCrash(adapters, deps): CrashRecoveryResult
   - Step 1: fetchPositions() (모든 거래소)
   - Step 2: getActiveTickets() (DB)
   - Step 3: comparePositions() (EP-08 재사용)
   - Step 4: 매칭 — SL 확인 (fetchOrder or adapter level) → 미등록 시 createOrder(stop_market)
   - Step 5: 불일치 — emergencyClose() (EP-06 재사용)
   - Step 6: 고아 — setSymbolStateIdle()
   - Step 7: 손실 카운터 복원 — getSymbolStates() → 메모리 반영
   - Step 8: EventLog CRASH_RECOVERY + Slack
3. T-09-001의 daemon.ts 수정: startDaemon()에서 CandleManager.start() 전에 recoverFromCrash() 호출
4. `bun run typecheck && bun run lint` 통과

## Acceptance Criteria
- 매칭된 포지션 + SL 존재 → 정상 (액션 없음, 로그만)
- 매칭된 포지션 + SL 미존재 → SL 재등록 (adapter.createOrder stop_market)
- 불일치 포지션 (거래소에 있는데 DB에 없음) → emergencyClose() 호출
- 고아 포지션 (DB에 있는데 거래소에 없음) → SymbolState IDLE 마킹
- 손실 카운터 복원 완료
- 모든 복구 액션 EventLog CRASH_RECOVERY + Slack
- 거래소 API 실패 → 해당 거래소 스킵, 다른 거래소 계속 복구
- 복구 완료 후 CrashRecoveryResult 반환 (matched/unmatched/orphaned/slReRegistered 카운트)

## Test Scenarios
- recoverFromCrash() with all positions matched + SL exists → no actions, result.matched > 0
- recoverFromCrash() with matched position + missing SL → SL re-registered via createOrder(stop_market)
- recoverFromCrash() with unmatched position (exchange only) → emergencyClose() called
- recoverFromCrash() with orphaned ticket (DB only) → setSymbolStateIdle() called
- recoverFromCrash() with exchange API failure → skip that exchange, continue others, error logged
- recoverFromCrash() with SL re-registration failure → error logged, Slack alert, continue
- recoverFromCrash() with empty positions (no exchange positions, no DB tickets) → clean result, no actions
- recoverFromCrash() → EventLog CRASH_RECOVERY inserted with summary data
- recoverFromCrash() → Slack alert sent with recovery summary

## Validation
```bash
bun test -- tests/daemon/crash-recovery.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- 대조 비교 알고리즘 자체 (EP-08에서 구현 완료)
- 패닉 클로즈 로직 (EP-06에서 구현 완료)
- 주기적 대조 워커 (EP-08에서 구현 완료, T-09-001에서 시작)
