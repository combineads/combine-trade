# T-218 strategy-worker process bootstrap

## Goal
`workers/strategy-worker/src/db.ts` (전략/이벤트/캔들 repository Drizzle 구현)와 `workers/strategy-worker/src/index.ts` (LISTEN `candle_closed` → StrategyEvaluator + StrategyExecutor sandbox)를 구현한다.

## Why
strategy-worker는 캔들 수신 후 모든 활성 전략을 샌드박스에서 평가하는 파이프라인 입구다. 이 워커가 없으면 전략 이벤트가 생성되지 않아 파이프라인 전체가 멈춘다.

## Inputs
- `workers/strategy-worker/src/evaluator.ts` — 기존 StrategyEvaluator 도메인 로직
- `packages/core/strategy/` — StrategyExecutor (V8 isolate sandbox), StrategyEvaluatorDeps
- `db/index.ts` — Drizzle 싱글턴
- T-211 패턴 참조

## Dependencies
T-216

## Expected Outputs
- `workers/strategy-worker/src/db.ts` — 3개 repository Drizzle 구현
- `workers/strategy-worker/src/index.ts` — 부트스트랩

## Deliverables
- `workers/strategy-worker/src/db.ts`:
  - `findActiveStrategies(symbol, timeframe)` → strategies 테이블 (`timeframe = ANY(strategies.timeframes)`)
  - `StrategyEventRepository.insert(event)` → strategy_events 테이블
  - `CandleRepository.findForWarmup(symbol, timeframe, before, limit)` → 웜업 캔들 조회
- `workers/strategy-worker/src/index.ts`:
  - `StrategyExecutor` 인스턴스 생성 (V8 isolate pool)
  - LISTEN `candle_closed` → `StrategyEvaluator.evaluate(candle, strategies)`
  - 이벤트 발생 시 NOTIFY `strategy_event_created`
  - SIGTERM shutdown (isolate pool 정리 포함)

## Constraints
- StrategyExecutor V8 isolate 초기화 방법을 `packages/core/strategy/` 코드에서 반드시 확인
- `--max-old-space-size` 필요 여부 확인 후 `package.json` scripts에 추가
- 전략 실행 에러는 해당 전략만 스킵 (다른 전략에 전파 금지)

## Steps
1. `strategy-worker/src/evaluator.ts` + `packages/core/strategy/` 읽기
2. StrategyExecutor 생성자 + 초기화 방법 확인
3. `db.ts` 3개 함수 구현
4. `index.ts` 부트스트랩 구현 (isolate pool 포함)
5. `bun run typecheck`

## Acceptance Criteria
- `"Strategy worker started"` 출력
- `candle_closed` 채널 구독
- `bun run typecheck` 통과
- 단일 전략 에러가 타 전략에 전파되지 않음
- SIGTERM 5초 이내 종료

## Validation
```bash
bun run typecheck
timeout 3 bun run workers/strategy-worker/src/index.ts 2>&1 | head -5 || true
```

## Out of Scope
전략 코드 에디터, 전략 파라미터 최적화, WebSocket 기반 캔들 스트리밍
