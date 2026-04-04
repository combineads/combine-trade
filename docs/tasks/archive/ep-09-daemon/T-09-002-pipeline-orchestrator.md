# T-09-002 파이프라인 오케스트레이터 — 에러 격리 + 레이턴시 계측 + 5M/1M 우선

## Goal
캔들 마감 이벤트를 받아 전체 트레이딩 파이프라인을 실행하는 `src/daemon/pipeline.ts`를 구현한다. 타임프레임별 분기, 심볼별 에러 격리, 레이턴시 계측을 포함.

## Why
데몬의 핵심 비즈니스 로직. 캔들 마감 → 지표 → 필터 → 시그널 → 벡터화 → KNN → 주문 → 청산 관리 전체 파이프라인을 오케스트레이션한다. 심볼 A의 에러가 심볼 B에 영향을 주면 안 됨.

## Inputs
- `docs/exec-plans/09-daemon.md` — M2 마일스톤
- `src/indicators/index.ts` — calcBB20, calcBB4, calcMA, calcRSI, calcATR
- `src/filters/index.ts` — determineDailyBias, updateDailyBias, isTradeBlocked
- `src/signals/index.ts` — detectWatching, checkEvidence, checkSafety
- `src/vectors/index.ts` — vectorize, insertVector
- `src/knn/index.ts` — searchKnn, makeDecision
- `src/positions/index.ts` — calculateSize, createTicket, canPyramid, executePyramid
- `src/orders/index.ts` — executeEntry
- `src/exits/index.ts` — checkExit, processExit, processTrailing, updateTpPrices, updateMfeMae
- `src/limits/index.ts` — checkLossLimit
- `src/notifications/index.ts` — sendSlackAlert
- `src/db/event-log.ts` — insertEvent

## Dependencies
- T-09-001 (데몬 스켈레톤 — onCandleClose 콜백에 pipeline 연결)

## Expected Outputs
- `src/daemon/pipeline.ts` — handleCandleClose() 함수, PipelineDeps 인터페이스
- T-09-001의 daemon.ts에서 onCandleClose → handleCandleClose 연결

## Deliverables
- `src/daemon/pipeline.ts` — 파이프라인 오케스트레이터

## Constraints
- L9 레이어: 모든 하위 레이어 import 허용
- 심볼별 try/catch — 한 심볼의 에러가 다른 심볼에 전파되지 않음
- 타임프레임별 분기: 1D → 방향 필터, 1H → WATCHING + TP 갱신, 5M/1M → 진입 시그널 + 청산 체크
- 5M/1M 동시 시그널 시 1M 우선 (PRD 7.16 — SL 타이트 → 손익비 유리)
- 실행 모드 체크: analysis → 시그널 기록만, alert/live → 주문 실행
- 레이턴시: EventLog `PIPELINE_LATENCY` 이벤트로 기록
- Decimal.js 사용 (모든 가격/사이즈)
- DI 패턴: PipelineDeps 인터페이스로 모든 외부 의존성 주입

## Steps
1. 테스트 파일 `tests/daemon/pipeline.test.ts` 생성 — Test Scenarios 기반 TDD
2. `src/daemon/` 디렉토리 생성
3. `src/daemon/pipeline.ts` 구현:
   - PipelineDeps 인터페이스 정의 (DB, exchange adapters, 각 모듈 함수)
   - handleCandleClose(candle, timeframe, deps): 타임프레임별 분기
   - processSymbol(symbol, exchange, candle, timeframe, deps): 심볼별 파이프라인
   - 1D: determineDailyBias → updateDailyBias → EventLog BIAS_CHANGE
   - 1H: detectWatching → updateTpPrices → processTrailing
   - 5M/1M: isTradeBlocked → checkLossLimit → checkEvidence → checkSafety → vectorize → KNN → executeEntry
   - 모든 TF: checkExit → processExit → updateMfeMae
4. T-09-001의 daemon.ts에서 onCandleClose에 handleCandleClose 연결하도록 수정
5. `bun run typecheck && bun run lint` 통과

## Acceptance Criteria
- 1D 캔들 마감 시 → determineDailyBias + updateDailyBias 호출
- 1H 캔들 마감 시 → detectWatching + TP 가격 갱신 + 트레일링 상향
- 5M/1M 캔들 마감 시 → 전체 진입 파이프라인 실행 (거래차단/손실제한 체크 포함)
- 5M과 1M 동시 시그널 → 1M 우선 (5M 스킵)
- 심볼 A 에러 → 심볼 B 정상 실행
- analysis 모드 → 시그널 기록만, 주문 실행 안 함
- 각 파이프라인 실행의 레이턴시가 EventLog에 기록됨
- 에러 발생 시 core/logger + Slack 알림

## Test Scenarios
- handleCandleClose() with 1D candle → determineDailyBias + updateDailyBias 호출, EventLog BIAS_CHANGE 기록
- handleCandleClose() with 1H candle + active WatchSession → updateTpPrices + processTrailing 호출
- handleCandleClose() with 1H candle + no WatchSession → detectWatching 호출
- handleCandleClose() with 5M candle + valid signal → vectorize → KNN → executeEntry 풀 체인
- handleCandleClose() with 5M candle + trade blocked → 진입 스킵, 로그 기록
- handleCandleClose() with 5M candle + loss limit hit → 진입 스킵, 로그 기록
- handleCandleClose() with 5M candle + analysis mode → 시그널 기록만, executeEntry 미호출
- handleCandleClose() with open position + any timeframe → checkExit + updateMfeMae 호출
- 5M/1M 동시 시그널 → 1M 시그널 우선 실행, 5M 스킵
- 심볼 A 에러 throw + 심볼 B 정상 → B 파이프라인 정상 완료
- 파이프라인 완료 후 → EventLog PIPELINE_LATENCY 기록 (durationMs 포함)

## Validation
```bash
bun test -- tests/daemon/pipeline.test.ts
bun run typecheck
bun run lint
```

## Out of Scope
- 크래시 복구 (T-09-003)
- 셧다운 시 파이프라인 중단 로직 (T-09-004)
- 킬 스위치 (T-09-005)
- 실제 거래소 연결 (mock adapter 사용)

## Implementation Notes

**Status:** Done

**Files changed:**
- `src/daemon/pipeline.ts` — NEW: PipelineDeps 인터페이스 + handleCandleClose() + 내부 processSymbol/process1D/process1H/processEntry/processExits 함수
- `tests/daemon/pipeline.test.ts` — NEW: 38개 테스트 (TDD), 모든 분기 커버
- `src/daemon.ts` — MODIFIED: pipelineDeps/activeSymbols를 DaemonDeps에 추가, onCandleClose 콜백에서 handleCandleClose 호출로 연결

**Key decisions:**
- `computeEntrySize(adapter, symbol, exchange, evidence)` 고수준 dep으로 주입 — balance/exchangeInfo 등 3개 추가 dep 방지
- `getSymbolState` DB 헬퍼가 실존하지 않아 injectable dep으로 주입
- `recent1MFired = new Map<string, number>()` 모듈 레벨 상태로 60s TTL 1M 우선 규칙 구현
- `exactOptionalPropertyTypes: true` 대응 — `CreateTicketParams.tp1Price/tp2Price` 조건부 할당
- `applyTimeDecay` 시그니처 수정: `(neighbors, now, config)` 3-인자 + `loadTimeDecayConfig` dep 추가

**Validation results (2026-04-04):**
- `bun test -- tests/daemon/pipeline.test.ts`: 38 pass, 0 fail
- `bun run typecheck`: clean
- `bun run lint`: clean (biome check --write 적용)

## Review Notes

**Verdict:** approve

**Reviewer:** harness-task-closer (자동 검증)

**Validation re-run (2026-04-04):**
- `bun test -- tests/daemon/pipeline.test.ts`: 38 pass, 0 fail ✓
- `bun run typecheck`: 0 errors ✓
- `bun run lint`: 0 warnings ✓

**Acceptance criteria check:**
- [x] 1D 캔들 마감 시 determineDailyBias + updateDailyBias 호출 — 테스트 확인
- [x] 1H 캔들 마감 시 detectWatching + TP 가격 갱신 + 트레일링 상향 — 테스트 확인
- [x] 5M/1M 캔들 마감 시 전체 진입 파이프라인 실행 (거래차단/손실제한 포함) — 테스트 확인
- [x] 5M과 1M 동시 시그널 → 1M 우선 (5M 스킵) — 테스트 확인
- [x] 심볼 A 에러 → 심볼 B 정상 실행 — 테스트 확인
- [x] analysis 모드 → 시그널 기록만, 주문 실행 안 함 — 테스트 확인
- [x] 각 파이프라인 실행의 레이턴시가 EventLog에 기록됨 — 테스트 확인
- [x] 에러 발생 시 core/logger + Slack 알림 — 테스트 확인
