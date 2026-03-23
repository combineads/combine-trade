# T-214 retrospective-worker process bootstrap

## Goal
`workers/retrospective-worker/src/db.ts`와 `workers/retrospective-worker/src/main.ts` (LISTEN `journal_ready` → `RetrospectiveWorker.processJournal()`)를 구현한다.

## Why
RetrospectiveWorker 클래스는 있지만 프로세스 진입점이 없다. Claude 기반 트레이드 리뷰 자동화를 위해 필요하다.

## Inputs
- `workers/retrospective-worker/src/index.ts` — 기존 RetrospectiveWorker 클래스
- `packages/core/retrospective/` — RetrospectiveWorkerDeps 인터페이스
- `db/index.ts` — Drizzle 싱글턴
- T-211, T-213 패턴 참조

## Dependencies
T-211

## Expected Outputs
- `workers/retrospective-worker/src/db.ts`
- `workers/retrospective-worker/src/main.ts`

## Deliverables
- `workers/retrospective-worker/src/db.ts`:
  - `getJournalWithContext(journalId)`
  - `saveReport(report)`
- `workers/retrospective-worker/src/main.ts`:
  - env 검증 → db → subscriber → `RetrospectiveWorker.start()` → SIGTERM
- `package.json` main → `src/main.ts`

## Constraints
- 기존 `index.ts` 클래스 export 유지
- `ANTHROPIC_API_KEY` 필수

## Steps
1. `retrospective-worker/src/index.ts` 읽기
2. `RetrospectiveWorkerDeps` 확인
3. `db.ts` 구현
4. `main.ts` 구현
5. `bun run typecheck`

## Acceptance Criteria
- `"Retrospective worker started"` 출력
- `bun run typecheck` 통과
- SIGTERM 5초 이내 종료

## Validation
```bash
bun run typecheck
timeout 3 bun run workers/retrospective-worker/src/main.ts 2>&1 | head -5 || true
```

## Out of Scope
리포트 저장 포맷 변경, 멀티 LLM 프로바이더
