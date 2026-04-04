# EP-09 Daemon — Archive Summary

- **Completed**: 2026-04-04
- **Tasks**: 6 (T-09-001 ~ T-09-006)
- **Tests added**: 143 (1,710 → 1,853)
- **Source LOC**: ~2,500
- **Waves**: 4 (Wave 1: skeleton+killswitch, Wave 2: pipeline+recovery, Wave 3: shutdown, Wave 4: E2E)
- **QA failures**: 0
- **Review rejections**: 0

## Key decisions
- daemon.ts → src/daemon/ 디렉토리 분리 (7 태스크 파일 충돌 방지 → 4 파일로 분산)
- CandleManager(EP-04) 재사용 — daemon에서 별도 sync/cleanup 불필요
- comparePositions(EP-08) + emergencyClose(EP-06) 재사용 — 크래시 복구 코드 중복 방지
- 킬 스위치는 데몬과 독립된 CLI 스크립트
- DI 패턴 전면 적용: DaemonDeps, PipelineDeps, CrashRecoveryDeps, ShutdownDeps, KillSwitchDeps
- 5M/1M 동시 시그널 시 1M 우선 (PRD 7.16) — daemon pipeline에서 조율
- 셧다운 30초 타임아웃 → 강제 종료

## Outputs produced
- `src/daemon.ts` — startDaemon(), DaemonHandle (메인 진입점)
- `src/daemon/pipeline.ts` — handleCandleClose(), PipelineDeps (파이프라인 오케스트레이터)
- `src/daemon/crash-recovery.ts` — recoverFromCrash(), CrashRecoveryDeps (크래시 복구)
- `src/daemon/shutdown.ts` — gracefulShutdown(), getExecutionMode() (셧다운+모드)
- `scripts/kill-switch.ts` — killSwitch(), KillSwitchDeps (긴급 킬 스위치)
- `tests/daemon/` — 6 test files, 143 tests
