# T-09-001 데몬 스켈레톤 — DB + CandleManager + 대조워커 + 기본 SIGTERM

## Goal
데몬 메인 진입점 `src/daemon.ts`를 구현한다. DB 연결, config 로드, CandleManager 시작, 대조 워커 시작, 기본 SIGTERM 핸들러를 포함하는 최소 스켈레톤.

## Why
EP-01~EP-08에서 구현한 모든 모듈을 하나의 실행 프로세스로 통합하는 첫 단계. CandleManager(EP-04)가 히스토리 동기화, 실시간 수집, 갭 복구를 이미 처리하므로 daemon.ts는 이를 연결만 하면 됨.

## Inputs
- `docs/exec-plans/09-daemon.md` — M1 마일스톤
- `docs/ARCHITECTURE.md` — daemon(L9) 모듈 정의
- `src/candles/index.ts` — CandleManager API (start, stop, onCandleClose)
- `src/reconciliation/worker.ts` — startReconciliation() API
- `src/config/loader.ts` — loadAllConfig() API
- `src/db/pool.ts` — getDb() API

## Dependencies
- 없음 (EP-09 첫 태스크, EP-01~EP-08 완료 전제)

## Expected Outputs
- `src/daemon.ts` — startDaemon(), DaemonHandle 타입 (stop 메서드 포함)
- daemon.ts가 CandleManager.onCandleClose() 콜백 등록 — T-09-002에서 파이프라인 로직 연결

## Deliverables
- `src/daemon.ts` — 기존 `export {};` 스텁을 완전한 데몬 스켈레톤으로 교체

## Constraints
- L9 레이어: 모든 하위 레이어 import 허용
- CandleManager.start()가 sync + collector + gap recovery를 이미 처리 — 별도 sync 호출 금지
- SIGTERM/SIGINT 핸들러는 기본 수준 (process.exit 호출). 확장된 shutdown은 T-09-004에서 구현
- `bun run daemon` 명령으로 실행 가능해야 함 (package.json scripts 확인)
- DI 패턴 적용: 테스트에서 CandleManager, ReconciliationDeps, ExchangeAdapter를 mock으로 교체 가능

## Steps
1. 테스트 파일 `tests/daemon/daemon-skeleton.test.ts` 생성 — Test Scenarios 기반 TDD
2. `src/daemon.ts` 구현:
   - DaemonDeps 인터페이스 정의 (CandleManager, ExchangeAdapter map, ReconciliationDeps 등)
   - startDaemon(deps): DB 연결 → config 로드 → CandleManager.start() → onCandleClose 콜백 등록 → startReconciliation() → SIGTERM 핸들러
   - DaemonHandle 반환 (stop 메서드)
3. package.json의 `daemon` 스크립트가 `bun src/daemon.ts`를 실행하는지 확인
4. `bun run typecheck && bun run lint` 통과 확인

## Acceptance Criteria
- startDaemon() 호출 시 순서: getDb() → loadAllConfig() → CandleManager.start() → onCandleClose() → startReconciliation()
- DaemonHandle.stop() 호출 시: CandleManager.stop() → reconciliation.stop() 순서로 정리
- SIGTERM 수신 시 stop() 호출 후 process.exit(0)
- 중복 SIGTERM 방지 (이미 종료 중이면 무시)
- 모든 단계에서 core/logger로 로깅

## Test Scenarios
- startDaemon() with valid deps → CandleManager.start() 호출됨, reconciliation 시작됨, onCandleClose 콜백 등록됨
- startDaemon() when DB connection fails → 에러 throw, 부분 시작된 리소스 정리
- startDaemon() when config load fails → 에러 throw
- DaemonHandle.stop() → CandleManager.stop() + reconciliation.stop() 순서 호출
- SIGTERM signal → stop() 호출 후 process.exit(0)
- 중복 SIGTERM → stop() 한 번만 호출 (재진입 방지)
- onCandleClose 콜백 등록 확인 → CandleManager.onCandleClose()에 함수 전달됨

## Validation
```bash
bun test -- tests/daemon/daemon-skeleton.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- 파이프라인 오케스트레이션 로직 (T-09-002)
- 크래시 복구 시퀀스 (T-09-003)
- 확장된 그레이스풀 셧다운 (T-09-004)
- 킬 스위치 (T-09-005)
