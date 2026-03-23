# T-192 implement-paper-dep

## Goal
`paperDeps`를 위한 Drizzle query 함수(`getPaperStatus`, `listPaperOrders`, `getPaperPerformance`, `getPaperComparison`, `resetPaper`)를 구현하고 `index.ts`에 wiring한다.

## Why
페이퍼 트레이딩은 실제 자금 없이 전략을 검증하는 핵심 기능이다. `paper_balances`와 `positions` 테이블에서 상태를 조회하고, `resetPaper`로 초기화할 수 있어야 한다.

## Inputs
- T-188 완료
- `apps/api/src/index.ts` — `paperDeps` stub 위치 + 인터페이스
- `db/schema/` — `paper_balances`, `positions`, paper orders 테이블 스키마
- `paperDeps` 인터페이스 정의

## Dependencies
T-188

## Expected Outputs
- `apps/api/src/db/paper-queries.ts` — 5개 함수 구현
- `apps/api/src/index.ts` — `paperDeps` stub 교체

## Deliverables
- `apps/api/src/db/paper-queries.ts`
- `apps/api/src/index.ts` (수정)

## Constraints
- 모든 query는 `userId` 스코프
- `getPaperStatus`: `paper_balances` + `positions` 조인
- `getPaperPerformance`: SQL 집계 — JS 계산 금지
- `getPaperComparison`: 백테스트 결과 vs 실제 페이퍼 결과 비교 (스키마에 따라)
- `resetPaper`: DELETE + INSERT 트랜잭션 (AOP 트랜잭션 데코레이터 사용)
- 통화 계산은 Decimal.js 사용

## Steps
1. `paperDeps` 인터페이스 확인
2. `paper_balances`, `positions` 테이블 스키마 확인
3. `paper-queries.ts` 작성
4. `resetPaper`: 트랜잭션 처리 확인 (AOP 데코레이터 또는 `db.transaction()`)
5. `index.ts` stub 교체
6. `bun run typecheck` 확인

## Acceptance Criteria
- `GET /api/v1/paper/status` → 200
- `GET /api/v1/paper/orders` → 200 (빈 배열 허용)
- `GET /api/v1/paper/performance` → 200
- `POST /api/v1/paper/reset` → 200, DB 초기화 확인
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test apps/api
```

## Out of Scope
- 페이퍼 트레이딩 실행 엔진 (worker 범위)
- 실제 거래소 데이터와 실시간 연동
- 페이퍼 PnL 실시간 계산
