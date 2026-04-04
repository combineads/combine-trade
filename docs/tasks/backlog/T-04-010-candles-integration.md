# T-04-010 캔들 모듈 통합 API (시작/중지/상태)

## Goal
`src/candles/index.ts`에 캔들 모듈의 통합 API를 구현하여, 데몬이 단일 진입점으로 캔들 수집을 시작/중지/상태 조회할 수 있게 한다.

## Why
캔들 모듈은 히스토리 동기화, 실시간 수집, 갭 복구 3개 하위 모듈로 구성된다. 데몬(EP-09)이 이들을 개별 관리하지 않고 통합 API로 제어할 수 있어야 한다.

## Inputs
- `src/candles/sync.ts` — syncCandles()
- `src/candles/collector.ts` — CandleCollector
- `src/candles/gap-recovery.ts` — GapRecovery
- `src/candles/cleanup.ts` — cleanupOldCandles()
- `src/core/ports.ts` — ExchangeAdapter

## Dependencies
- T-04-004 (sync)
- T-04-007 (collector + close event)
- T-04-009 (gap recovery)
- T-04-005 (cleanup)

## Expected Outputs
- `src/candles/index.ts`:
  - `CandleManager` 클래스:
    - `start(config): Promise<void>` — 동기화 → 수집 시작 → 갭 복구 등록
    - `stop(): Promise<void>` — 수집 중지, 리소스 정리
    - `getStatus(): CandleManagerStatus`
    - `onCandleClose(callback): Unsubscribe` — 마감 이벤트 프록시
    - `runCleanup(): Promise<CleanupResult>` — 수동 cleanup 실행
  - `CandleManagerStatus` 타입
  - `CandleManagerConfig` 타입

## Deliverables
- `src/candles/index.ts` (재작성)

## Constraints
- start() 순서: (1) syncCandles → (2) collector.start → (3) gap recovery 연결
- stop() 순서: collector.stop → 리소스 해제
- WebSocket 재연결 시 자동 갭 복구 트리거 (collector.onReconnect() 콜백 활용 — T-04-006에서 제공)
- 에러 격리: 개별 하위 모듈 실패가 전체 중단시키지 않음
- 로깅: 시작/중지/상태 변경 이벤트
- DB 테스트: test-db 헬퍼로 실제 PostgreSQL에서 전체 모듈 연동 검증

## Steps
1. `CandleManagerConfig` 타입 정의 (symbols, timeframes, adapter, exchangeName)
2. `CandleManagerStatus` 타입 정의 (syncCompleted, collecting, lastGapRecovery, activeSubscriptions)
3. `CandleManager` 클래스 구현:
   a. `start()` — sync → collector.start → gap recovery 콜백 등록
   b. `stop()` — collector.stop, 상태 초기화
   c. `getStatus()` — 하위 모듈 상태 집계
   d. `onCandleClose()` — collector.onCandleClose 프록시
   e. `runCleanup()` — cleanupOldCandles 호출
4. WS 재연결 시 갭 복구: collector.onReconnect() 콜백 등록 → GapRecovery.recoverAll 호출
5. 에러 처리: sync 실패 → 로그 + collector는 시작 (과거 데이터 없어도 실시간 수집)
6. 통합 테스트 작성 (실제 PostgreSQL, 모듈 간 연동 검증, test-db 헬퍼 사용)

## Acceptance Criteria
- start() → sync 완료 후 collector 시작 후 gap recovery 준비
- stop() → collector 중지, 모든 구독 해제
- getStatus() → 동기화 완료 여부, 활성 구독 수, 마지막 갭 복구 시각
- onCandleClose() → collector의 마감 이벤트를 외부에 전달
- sync 실패 시에도 collector는 시작됨
- WS 재연결 시 자동 갭 복구 트리거

## Test Scenarios
- start() → syncCandles 호출 → collector.start 호출 → gap recovery 등록 순서 확인
- start() with sync failure → collector.start는 정상 호출됨
- stop() → collector.stop 호출됨
- getStatus() after start → { syncCompleted: true, collecting: true, ... }
- onCandleClose(cb) → collector 마감 이벤트가 cb로 전달됨
- WS reconnect 이벤트 → GapRecovery.recoverAll 자동 호출
- runCleanup() → cleanupOldCandles 호출, 결과 반환

## Validation
```bash
bun test -- --grep "candle-manager|candles-integration"
bun run typecheck
bun run build
```

## Out of Scope
- 데몬 메인 루프에서의 호출 (EP-09)
- 파이프라인 트리거 연결 (EP-05+)
- 멀티 거래소 동시 수집 오케스트레이션 (Phase 2/3)
