# T-19-006 implement-read-query-functions

## Goal
`eventDeps`, `orderDeps`, `candleDeps`, `alertDeps`를 위한 read-only Drizzle query 함수를 `apps/api/src/db/`에 구현하고 `index.ts`에 wiring한다.

## Why
Group B는 read-only query이므로 AES-GCM 암호화나 복잡한 로직 없이 순수한 Drizzle select로 구현 가능하다. 4개 dep을 하나의 태스크로 묶어 일관된 패턴으로 작성한다.

## Inputs
- T-19-005 완료
- `apps/api/src/index.ts` — `eventDeps`, `orderDeps`, `candleDeps`, `alertDeps` stub 위치
- `db/schema/` — events, orders, candles, alerts 테이블 스키마
- 각 dep 인터페이스 정의 파일

## Dependencies
T-19-005

## Expected Outputs
- `apps/api/src/db/events-queries.ts` — `findEventById`, `findEventsByStrategy`, `getStrategyStatistics`, `strategyExists`
- `apps/api/src/db/orders-queries.ts` — `findOrders` (filter/pagination)
- `apps/api/src/db/candles-queries.ts` — `findCandles` (filter/pagination)
- `apps/api/src/db/alerts-queries.ts` — `findAlerts` (filter/pagination)
- `apps/api/src/index.ts` — 4개 stub 교체 완료

## Deliverables
- `apps/api/src/db/events-queries.ts`
- `apps/api/src/db/orders-queries.ts`
- `apps/api/src/db/candles-queries.ts`
- `apps/api/src/db/alerts-queries.ts`
- `apps/api/src/index.ts` (수정)

## Constraints
- 모든 query는 `userId` 스코프로 제한 (다른 사용자 데이터 노출 금지)
- pagination: `limit`, `offset` 파라미터 지원
- `ARCHITECTURE.md` 벡터 격리 규칙: 이벤트/통계 query는 동일 strategy + version + symbol 범위만
- Drizzle `db.select().from(...).where(...)` 패턴 사용

## Steps
1. 각 dep 인터페이스 파일 찾기 (packages/core 또는 apps/api/src/types)
2. DB 스키마에서 각 테이블의 컬럼 확인
3. 4개 query 파일 작성 (각 함수는 `db` + 필요한 필터 파라미터 받기)
4. `index.ts`에서 4개 stub 교체
5. `bun run typecheck` 확인

## Acceptance Criteria
- `GET /api/v1/orders` → 200 (실제 데이터 또는 빈 배열)
- `GET /api/v1/candles` → 200 (실제 데이터 또는 빈 배열)
- `GET /api/v1/alerts` → 200 (실제 데이터 또는 빈 배열)
- `GET /api/v1/events` → 200 (실제 데이터 또는 빈 배열)
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test apps/api
```

## Out of Scope
- Write operations (insert, update, delete) for these deps
- Group C deps (T-19-007~T-19-010 범위)
- Vector search (별도 패키지 범위)
