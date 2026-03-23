# T-193 implement-backtest-dep

## Goal
`backtestDeps`를 `BacktestEngine`에 wiring하고 `index.ts`에 연결한다. BacktestEngine이 복잡한 자체 DB 의존성을 가진다면 structured error stub으로 안전하게 처리한다.

## Why
백테스트 기능은 전략 검증의 핵심이다. `BacktestEngine`을 올바르게 wire해야 `/api/v1/backtests/run` 엔드포인트가 동작한다.

## Inputs
- T-188 완료
- `packages/backtest/` — `BacktestEngine` 구현 및 의존성 감사
- `apps/api/src/index.ts` — `backtestDeps` stub + 인터페이스
- `db/schema/` — backtest 관련 테이블 스키마

## Dependencies
T-188

## Expected Outputs
- `apps/api/src/db/backtest-queries.ts` — `strategyExists` + BacktestEngine wiring
- `apps/api/src/index.ts` — `backtestDeps` stub 교체

## Deliverables
- `apps/api/src/db/backtest-queries.ts`
- `apps/api/src/index.ts` (수정)

## Constraints
- 먼저 `packages/backtest/` 감사: BacktestEngine의 생성자 의존성이 단순하면 완전 구현, 복잡하다면 `{ runBacktest: () => { throw new Error("Backtest engine not yet wired") } }` structured stub 사용
- `strategyExists`: Drizzle query — strategies 테이블에서 존재 여부 확인
- 완전 구현하는 경우 BacktestEngine은 userId 스코프로 격리
- 에러 응답은 500이 아닌 503 + 명확한 메시지

## Steps
1. `packages/backtest/` 디렉터리 구조 및 `BacktestEngine` 생성자 읽기
2. 의존성 복잡도 판단:
   - 단순 (DB + config만): 완전 구현
   - 복잡 (외부 서비스, 큰 설정): structured error stub
3. `backtest-queries.ts` 작성
4. `index.ts` stub 교체
5. `bun run typecheck` 확인

## Acceptance Criteria
- `POST /api/v1/backtests/run` — 500 에러 없음 (200 또는 503 structured error)
- `strategyExists` — strategies 테이블 실제 조회
- "Not wired to DB" 문자열이 응답에 없음
- `bun run typecheck` 통과

## Validation
```bash
bun run typecheck
bun test apps/api
```

## Out of Scope
- BacktestEngine 자체 구현 개선
- 백테스트 결과 저장 (별도 기능)
- 병렬 백테스트 실행
