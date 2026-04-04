# T-11-005 조회 API — tickets (필터+페이지네이션), stats (성과 통계)

## Goal
거래 내역 페이지에 필요한 완료 거래 조회 API와 성과 통계 API를 구현한다.

## Why
거래 내역 화면의 테이블(필터+페이지네이션)과 성과 요약 카드(총수익, 승률, 손익비, MDD)가 이 데이터를 소비한다.

## Inputs
- `docs/exec-plans/11-api-web.md` M2
- `docs/DATA_MODEL.md` — Ticket 엔티티
- `docs/WEB_UI_SCREENS.md` §3 — 거래 내역 필터 및 통계

## Dependencies
- T-11-003 (미들웨어)

## Expected Outputs
- `src/api/routes/tickets.ts` — GET /api/tickets (필터+cursor 페이지네이션)
- `src/api/routes/stats.ts` — GET /api/stats (성과 통계)

## Deliverables
- `src/api/routes/tickets.ts`
- `src/api/routes/stats.ts`
- `tests/api/routes/tickets.test.ts`
- `tests/api/routes/stats.test.ts`

## Constraints
- cursor 기반 페이지네이션 (offset 아님): `?cursor=<last_id>&limit=20`
- 필터: `?period=today|7d|30d|all&symbol=BTCUSDT&exchange=binance&result=WIN|LOSS|TIME_EXIT`
- Ticket WHERE state = 'CLOSED' 만 조회
- stats 쿼리: SUM(pnl), COUNT, win_rate, avg_risk_reward, max_drawdown
- MDD 계산: 누적 PnL 곡선에서 최대 낙폭 (SQL window function 또는 코드 계산)
- 모든 금액 필드는 string

## Steps
1. `src/api/routes/tickets.ts` — 필터 파라미터 파싱 (Zod), SQL WHERE 절 동적 구성
2. cursor 페이지네이션: `WHERE id < cursor ORDER BY created_at DESC LIMIT N+1` (hasMore 판단)
3. 응답: `{ data: Ticket[], cursor: string | null, total: number }`
4. `src/api/routes/stats.ts` — 기간 필터 기반 집계 쿼리
5. 통계 계산: total_pnl, total_trades, win_rate, avg_risk_reward (avg(pnl/risk)), mdd
6. 테스트 작성

## Acceptance Criteria
- GET /api/tickets → CLOSED 티켓만 반환, 최신순 정렬
- GET /api/tickets?period=today → 오늘 생성된 거래만
- GET /api/tickets?symbol=BTCUSDT&result=WIN → 복합 필터
- GET /api/tickets?cursor=<id>&limit=10 → 커서 이후 10건 + hasMore
- GET /api/stats → `{ total_pnl, total_trades, win_count, loss_count, win_rate, avg_risk_reward, mdd }`
- GET /api/stats?period=30d → 30일 기준 통계
- 필터 파라미터 유효성 검사 (잘못된 period → 400)

## Test Scenarios
- GET /api/tickets with no filters → all CLOSED tickets, newest first
- GET /api/tickets?period=today → only tickets closed today
- GET /api/tickets?symbol=BTCUSDT → only BTCUSDT tickets
- GET /api/tickets?result=WIN → only WIN result tickets
- GET /api/tickets?cursor=<id>&limit=2 → 2 items after cursor + correct hasMore flag
- GET /api/tickets with invalid period → 400 error
- GET /api/stats → correct win_rate calculation (win_count / total)
- GET /api/stats with no closed tickets → all zeros, win_rate null

## Validation
```bash
bun test -- tests/api/routes/tickets.test.ts tests/api/routes/stats.test.ts
bun run typecheck && bun run lint
```

## Out of Scope
- 활성 포지션 (T-11-004)
- 시그널/이벤트 (T-11-006)
