# T-09-006 데몬 E2E 통합 테스트

## Goal
데몬 전체 라이프사이클을 검증하는 E2E 통합 테스트를 작성한다. 스켈레톤 시작 → 파이프라인 실행 → 크래시 복구 → 그레이스풀 셧다운 → 킬 스위치를 관통하는 시나리오.

## Why
개별 태스크(T-09-001~005)는 각 모듈을 단위/통합 테스트하지만, 모듈 간 연결이 올바른지 검증하는 E2E가 필요함. 특히 daemon.ts의 시작 순서(복구 → sync → 파이프라인)와 종료 순서가 올바른지 확인.

## Inputs
- `docs/exec-plans/09-daemon.md` — 전체 마일스톤
- `src/daemon.ts` — startDaemon(), DaemonHandle
- `src/daemon/pipeline.ts` — handleCandleClose()
- `src/daemon/crash-recovery.ts` — recoverFromCrash()
- `src/daemon/shutdown.ts` — gracefulShutdown()
- `scripts/kill-switch.ts` — killSwitch()
- 기존 E2E 패턴: `tests/exits/exits-labeling-e2e.test.ts`, `tests/reconciliation/safety-net-e2e.test.ts`

## Dependencies
- T-09-001, T-09-002, T-09-003, T-09-004, T-09-005 (전체 구현 완료)

## Expected Outputs
- `tests/daemon/daemon-e2e.test.ts` — 7+ E2E 시나리오

## Deliverables
- `tests/daemon/daemon-e2e.test.ts` — 데몬 E2E 통합 테스트

## Constraints
- 실제 DB 사용 (docker-compose PostgreSQL)
- Exchange adapter는 mock (실제 거래소 연결 없음)
- 기존 E2E 시드 패턴 사용 (Symbol, SymbolState, CommonCode 시드)
- 테스트 간 DB 격리 (트랜잭션 롤백 또는 테이블 클리어)
- 테스트 타임아웃 주의 (setTimeout chain, async 핸들러)

## Steps
1. `tests/daemon/daemon-e2e.test.ts` 생성
2. 시드 헬퍼 작성: Symbol, SymbolState(analysis/live 모드), CommonCode (KNN, LOSS_LIMIT 등)
3. Mock exchange adapter 작성: fetchPositions, createOrder, cancelOrder, watchOHLCV 등
4. E2E 시나리오 구현 (Test Scenarios 참조)
5. `bun test -- tests/daemon/daemon-e2e.test.ts` 통과 확인
6. 전체 테스트 스위트 통과 확인 (`bun test`)

## Acceptance Criteria
- 7+ E2E 시나리오 모두 통과
- 데몬 시작 → 크래시 복구 → 파이프라인 → 셧다운 전체 흐름 검증
- 전체 테스트 스위트 통과 (기존 1,710개 + 신규)
- typecheck, lint 통과

## Test Scenarios
- 데몬 시작 (클린 상태) → CandleManager.start() + reconciliation 시작 확인 + 기본 SIGTERM
- 데몬 시작 + 1D 캔들 마감 이벤트 → 방향 필터 실행, SymbolState.daily_bias 갱신
- 데몬 시작 + 1H 캔들 마감 이벤트 + WATCHING 조건 충족 → WatchSession 생성
- 데몬 시작 + 5M 캔들 마감 이벤트 + 시그널 조건 충족 (live 모드) → Ticket 생성, Order 기록
- 크래시 복구 시나리오: 거래소에 포지션 존재 + DB 티켓 매칭 + SL 미등록 → SL 재등록 후 파이프라인 재개
- 크래시 복구 시나리오: 거래소에 미지 포지션 → emergencyClose 후 파이프라인 재개
- 그레이스풀 셧다운 → CandleManager 중단, PENDING 주문 취소, DB 정리 순서 확인
- 킬 스위치 실행 → 전체 포지션 청산, execution_mode → 'analysis', Slack 알림

## Validation
```bash
bun test -- tests/daemon/daemon-e2e.test.ts
bun test
bun run typecheck
bun run lint
```

## Out of Scope
- 실제 거래소 연결 테스트 (sandbox/testnet — 수동 검증)
- 성능 벤치마크 (레이턴시 1200ms 미만 — 프로파일링은 별도)
- 웹 UI 연동 (EP-11)
