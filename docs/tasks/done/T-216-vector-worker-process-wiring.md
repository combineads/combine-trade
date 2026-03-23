# T-216 vector-worker process bootstrap

## Goal
`workers/vector-worker/src/db.ts` (VectorHandlerDeps 전체 구현)와 `workers/vector-worker/src/index.ts` (LISTEN `strategy_event_created` → VectorEventHandler, NOTIFY `decision_completed`)를 구현한다.

## Why
vector-worker는 의사결정 파이프라인의 핵심: 특징 정규화 → 벡터 저장 → kNN 검색 → 통계 → 결정 발행. 이 워커 없이는 시스템이 어떤 결정도 내리지 못한다.

## Inputs
- `workers/vector-worker/src/handler.ts` — 기존 VectorEventHandler
- `packages/core/vector/` — VectorHandlerDeps 인터페이스, VectorTableManager
- `db/index.ts` — Drizzle 싱글턴
- T-211 패턴 참조

## Dependencies
T-211

## Expected Outputs
- `workers/vector-worker/src/db.ts` — 8개 함수 (VectorHandlerDeps 전체)
- `workers/vector-worker/src/index.ts` — 부트스트랩

## Deliverables
- `workers/vector-worker/src/db.ts`:
  - `loadEvent(eventId)`
  - `loadStrategy(strategyId)`
  - `normalizeFeatures(features, strategy)` — packages/core/vector 정규화기 위임
  - `ensureTable(strategyId, version, dimension)` — VectorTableManager 사용
  - `storeVector(tableRef, vector, eventId)` — VectorTableManager 통해 INSERT
  - `searchVectors(tableRef, queryVector, topK, beforeTime)` — kNN + `event_time < beforeTime` 필터
  - `loadLabels(eventIds)`
  - `persistDecision(decision)` → decisions 테이블 INSERT
- `workers/vector-worker/src/index.ts`:
  - LISTEN `strategy_event_created` → `VectorEventHandler.handle()`
  - 결정 후 `decision_completed` NOTIFY

## Constraints
- **필수**: `searchVectors`에 `event_time < beforeTime` 필터 (look-ahead bias 방지)
- **필수**: 동적 테이블명은 반드시 VectorTableManager 경유 (SQL injection 방지)
- `decision_completed` NOTIFY 후 다음 이벤트 처리

## Steps
1. `vector-worker/src/handler.ts` + `VectorHandlerDeps` 인터페이스 읽기
2. `VectorTableManager` 구현 확인
3. `db.ts` 8개 함수 구현 (시간 경계 필터 포함)
4. `index.ts` 부트스트랩 구현
5. `bun run typecheck`

## Acceptance Criteria
- `"Vector worker started"` 출력
- `bun run typecheck` 통과
- `searchVectors`에 `event_time < beforeTime` 필터 존재
- 동적 테이블명이 VectorTableManager 통해서만 생성
- SIGTERM 5초 이내 종료

## Validation
```bash
bun run typecheck
timeout 3 bun run workers/vector-worker/src/index.ts 2>&1 | head -5 || true
```

## Out of Scope
HNSW reindex (T-207), 재벡터화 워크플로, worker health HTTP endpoint
