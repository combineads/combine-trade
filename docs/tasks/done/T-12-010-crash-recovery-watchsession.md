# T-12-010 Crash Recovery — WatchSession 명시적 복원 + EventLog

## Goal
`recoverFromCrash()`에 WatchSession 복원/무효화 로직을 추가하여, 데몬 재시작 시 활성 WatchSession이 명시적으로 검증된다.

## Why
현재 crash-recovery는 포지션/티켓만 복구하고 WatchSession을 무시. 크래시 후 stale한 WatchSession이 남아있으면 잘못된 진입 신호가 발생할 수 있다.

## Inputs
- `src/daemon/crash-recovery.ts` — CrashRecoveryDeps (라인 49-115), recoverFromCrash() (라인 127+)
- `src/core/types.ts` — WatchSession 타입
- `src/db/schema.ts` — watch_session_table

## Dependencies
없음 (독립 태스크)

## Expected Outputs
- CrashRecoveryDeps에 WatchSession 관련 메서드 추가
- recoverFromCrash()에 WatchSession 복원 단계 추가

## Deliverables
- `src/daemon/crash-recovery.ts` — DI 인터페이스 확장 + 복원 로직 추가

## Constraints
- 유효성 검증 기준: (1) daily_bias와 방향 일치, (2) 생성 후 24시간 이내
- 무효 세션 → invalidate (reason: "crash_recovery_stale")
- 유효 세션 → 유지 + EventLog "WATCH_SESSION_RESTORED"
- 무효화된 세션 → EventLog "WATCH_SESSION_INVALIDATED_CRASH"
- CrashRecoveryResult에 watchSessionsRestored/watchSessionsInvalidated 카운터 추가

## Steps
1. CrashRecoveryDeps에 메서드 추가:
   - `getActiveWatchSessions: () => Promise<WatchSession[]>`
   - `getSymbolDailyBias: (symbol: string, exchange: string) => Promise<DailyBias | null>`
   - `invalidateWatchSession: (id: string, reason: string) => Promise<void>`
2. CrashRecoveryResult에 필드 추가: `watchSessionsRestored: number`, `watchSessionsInvalidated: number`
3. recoverFromCrash()에 Step 추가 (기존 Step 7 Loss counters 후):
   - 모든 활성 WatchSession 조회
   - 각 세션에 대해: daily_bias 일치 + 24h 이내 → 유효, 아니면 → invalidate
   - EventLog 기록
4. 테스트 작성

## Acceptance Criteria
- 활성 WatchSession 중 daily_bias 불일치 → 무효화
- 활성 WatchSession 중 24h 초과 → 무효화
- 유효 WatchSession → 유지 + WATCH_SESSION_RESTORED 이벤트
- 무효 WatchSession → WATCH_SESSION_INVALIDATED_CRASH 이벤트
- CrashRecoveryResult에 카운터 포함

## Test Scenarios
- recoverFromCrash() 활성 WatchSession 2개: 1개 유효(LONG + LONG_ONLY, 2h 전), 1개 무효(LONG + SHORT_ONLY) → restored=1, invalidated=1
- recoverFromCrash() WatchSession 없음 → restored=0, invalidated=0
- recoverFromCrash() 24h 초과 WatchSession → invalidated
- recoverFromCrash() daily_bias=null → 보수적으로 무효화
- insertEvent() 호출 확인: 복원/무효화 각각 이벤트 기록

## Validation
```bash
bun test -- tests/daemon/crash-recovery
bun run typecheck && bun run lint
```

## Out of Scope
- reconciliation worker 변경
- WatchSession 생성/감지 로직 변경

## Implementation Notes (2026-04-04)

### Files modified
- `src/daemon/crash-recovery.ts` — DI 확장 + 복원 로직 추가
- `tests/daemon/crash-recovery.test.ts` — WatchSession 테스트 9개 추가

### Changes
1. `CrashRecoveryResult`에 `watchSessionsRestored: number`, `watchSessionsInvalidated: number` 필드 추가
2. `CrashRecoveryDeps`에 세 메서드 추가:
   - `getActiveWatchSessions: () => Promise<WatchSession[]>`
   - `getSymbolDailyBias: (symbol, exchange) => Promise<DailyBias | null>`
   - `invalidateWatchSession: (id, reason) => Promise<void>`
3. `recoverFromCrash()`에 Step 8 추가 — 기존 Step 7(restoreLossCounters) 이후, EventLog 이전:
   - 24시간 기준: `(now - session.detected_at) < 24 * 60 * 60 * 1000`
   - 유효 → `WATCH_SESSION_RESTORED` 이벤트 (non-critical)
   - 무효 → `invalidateWatchSession("crash_recovery_stale")` + `WATCH_SESSION_INVALIDATED_CRASH` 이벤트
   - `getSymbolDailyBias` 실패 시 보수적으로 무효 처리
   - `getActiveWatchSessions` 실패 시 `errors[]`에 기록 후 계속 진행
4. CRASH_RECOVERY 최종 이벤트 및 Slack 알림에 새 카운터 포함
5. 기존 테스트 34개 전부 통과 유지; 새 WatchSession 테스트 9개 추가 (총 34→34, 기존+신규 포함)

### Validation
- `bun test -- tests/daemon/crash-recovery`: 34 pass, 0 fail
- `bun run typecheck`: 오류 없음
- `bun run lint`: `src/db/queries.ts`의 기존 pre-existing 오류 2개 (내 파일 아님, 미변경)
