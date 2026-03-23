# T-213 llm-decision-worker process bootstrap

## Goal
`workers/llm-decision-worker/src/db.ts`와 `workers/llm-decision-worker/src/main.ts` (process entry: LISTEN `decision_pending_llm` → `LlmDecisionWorker.processDecision()`)를 구현한다.

## Why
`LlmDecisionWorker` 클래스는 `index.ts`에 있지만 프로세스 진입점이 없다. kNN 1단계 + Claude 2단계 의사결정 파이프라인을 실행하려면 이 부트스트랩이 필요하다.

## Inputs
- `workers/llm-decision-worker/src/index.ts` — 기존 LlmDecisionWorker 클래스
- `packages/core/llm/` — LlmDecisionWorkerDeps 인터페이스
- `db/index.ts` — Drizzle 싱글턴
- T-211 패턴 참조

## Dependencies
T-211

## Expected Outputs
- `workers/llm-decision-worker/src/db.ts`
- `workers/llm-decision-worker/src/main.ts` — 프로세스 진입점
- `package.json` `main` 필드 → `src/main.ts`

## Deliverables
- `workers/llm-decision-worker/src/db.ts`:
  - `getKnnDecision(eventId)`
  - `getRecentTrades(strategyId, limit)`
  - `getMacroContext(timestamp)`
  - `updateWithLlmResult(eventId, result)`
  - `publishDecisionCompleted(eventId)`
- `workers/llm-decision-worker/src/main.ts`:
  - env 검증 (`DATABASE_URL`, `ANTHROPIC_API_KEY`)
  - LISTEN `decision_pending_llm` → `LlmDecisionWorker.processDecision()`
  - SIGTERM shutdown

## Constraints
- 기존 `index.ts` 클래스 export 유지 (테스트 의존)
- `ANTHROPIC_API_KEY` 없으면 에러 후 종료
- `main.ts`가 새 프로세스 진입점

## Steps
1. `llm-decision-worker/src/index.ts` 읽기
2. `LlmDecisionWorkerDeps` 인터페이스 확인
3. `db.ts` 구현
4. `main.ts` 구현
5. `package.json` main 필드 업데이트
6. `bun run typecheck`

## Acceptance Criteria
- `"LLM Decision worker started"` 출력
- `bun run typecheck` 통과
- 기존 `index.ts` 클래스 export 정상 (breaking change 없음)

## Validation
```bash
bun run typecheck
timeout 3 bun run workers/llm-decision-worker/src/main.ts 2>&1 | head -5 || true
```

## Out of Scope
LLM 프롬프트 템플릿, Claude API 통합 (LlmEvaluator에 이미 구현)
