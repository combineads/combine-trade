# T-09-004 그레이스풀 셧다운 + 실행 모드 관리

## Goal
데몬의 그레이스풀 셧다운 로직 `src/daemon/shutdown.ts`와 실행 모드 관리를 구현한다. SIGTERM/SIGINT 수신 시 안전하게 리소스를 정리하고, CommonCode에서 execution_mode를 읽어 모드별 동작을 관리.

## Why
24/7 운영 데몬에서 셧다운 시 미체결 주문을 방치하면 의도하지 않은 포지션이 열릴 수 있음. 또한 analysis/alert/live 모드 전환이 CommonCode에서 관리되어야 운영자가 DB만 수정해도 데몬 재시작 없이 모드 변경 가능.

## Inputs
- `docs/exec-plans/09-daemon.md` — M4 마일스톤
- `src/candles/index.ts` — CandleManager.stop()
- `src/reconciliation/worker.ts` — ReconciliationHandle.stop()
- `src/config/loader.ts` — getCachedValue(), loadAllConfig()
- `src/orders/executor.ts` — ExecutionModeError (이미 구현)
- `src/db/pool.ts` — closePool()

## Dependencies
- T-09-001 (데몬 스켈레톤 — DaemonHandle 교체, SIGTERM 핸들러 확장)
- T-09-002 (파이프라인 — 실행 모드 체크가 파이프라인에서 사용됨)

## Expected Outputs
- `src/daemon/shutdown.ts` — gracefulShutdown() 함수, ShutdownDeps 인터페이스
- getExecutionMode() 헬퍼 — CommonCode에서 execution_mode 읽기
- T-09-001의 daemon.ts 기본 SIGTERM을 gracefulShutdown()으로 교체

## Deliverables
- `src/daemon/shutdown.ts` — 그레이스풀 셧다운 + 실행 모드 관리

## Constraints
- 셧다운 순서: (1) 새 캔들 이벤트 중단 → (2) 대조 워커 중단 → (3) 미체결 PENDING 주문 취소 → (4) 오픈 포지션 유지 (SL이 거래소에 있음) → (5) DB 연결 종료
- 셧다운 타임아웃: 30초 후 강제 종료
- 중복 SIGTERM 방지 (T-09-001에서 기본 구현, 여기서 확장)
- 실행 모드 하드 가드는 EP-06 executor.ts에 이미 구현 — daemon은 모드를 읽어서 전달만
- 모드 값은 SymbolState.execution_mode에서 읽기 (심볼별 독립 모드)
- DI 패턴: ShutdownDeps로 외부 의존성 주입

## Steps
1. 테스트 파일 `tests/daemon/shutdown.test.ts` 생성 — Test Scenarios 기반 TDD
2. `src/daemon/shutdown.ts` 구현:
   - ShutdownDeps 인터페이스 정의 (candleManager, reconciliationHandle, adapters, db)
   - gracefulShutdown(deps): 순서대로 리소스 정리
   - getExecutionMode(symbol, exchange): SymbolState에서 execution_mode 읽기
   - 셧다운 타임아웃 (30초)
3. T-09-001의 daemon.ts 수정: SIGTERM 핸들러를 gracefulShutdown()으로 교체
4. `bun run typecheck && bun run lint` 통과

## Acceptance Criteria
- SIGTERM → gracefulShutdown() 실행, 순서대로 리소스 정리
- CandleManager.stop() → reconciliation.stop() → PENDING 주문 취소 → DB 연결 종료 순서
- 미체결 PENDING 주문만 취소 (FILLED 주문은 건드리지 않음)
- 오픈 포지션은 닫지 않음 (SL이 거래소에 등록되어 있으므로)
- 셧다운 30초 타임아웃 → 강제 process.exit(1)
- 중복 SIGTERM → 한 번만 실행
- getExecutionMode() → SymbolState에서 모드 읽기
- 셧다운 완료 로그 + Slack 알림

## Test Scenarios
- gracefulShutdown() → CandleManager.stop(), reconciliation.stop(), DB close 순서 호출
- gracefulShutdown() with PENDING orders → cancelOrder() 호출됨
- gracefulShutdown() with open positions → 포지션 닫지 않음 (emergencyClose 미호출)
- gracefulShutdown() with cancelOrder failure → 에러 로그, 나머지 정리 계속
- gracefulShutdown() exceeding 30s timeout → process.exit(1) 호출
- getExecutionMode() with analysis mode in SymbolState → 'analysis' 반환
- getExecutionMode() with live mode in SymbolState → 'live' 반환

## Validation
```bash
bun test -- tests/daemon/shutdown.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- 킬 스위치 (T-09-005 — 전체 포지션 청산은 별도)
- 데몬 재시작 로직 (systemd/pm2 담당)
- 웹 UI 모드 전환 버튼 (EP-11)
