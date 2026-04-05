# T-15-014 성과 API 필드 추가 + UI 7개 카드 구현

## Metadata
- modules: [api, web]
- primary: api

## Goal
API `/api/stats`에 expectancy, max_consecutive_losses 필드를 추가하고, 거래 내역 페이지에 7개 성과 카드를 구현한다.

## Why
PRD §7.23은 거래 내역 페이지에 "winrate, expectancy, MDD, 최대 연속 손실, 손익비" 등 요약 통계를 요구한다. 현재 API에 이 필드들이 없다.

## Inputs
- PRD §7.23
- `src/api/routes/` (현재 API)
- `src/web/` (현재 UI)
- M4의 commission_pct (expectancy 수수료 차감)

## Dependencies
- T-15-009 (commission_pct CommonCode — expectancy 계산에 필요)
- T-15-013 (이체 로직 완료 — TRANSFER CommonCode 정리)

## Expected Outputs
- 확장된 StatsResult 타입
- UI 성과 카드 컴포넌트

## Deliverables
- `src/api/routes/stats.ts` — StatsResult에 expectancy, max_consecutive_losses 추가
- `src/web/` — 성과 요약 7개 카드 컴포넌트
- 테스트

## Constraints
- expectancy는 수수료 차감 후 값
- 7개 카드: 총 수익, 총 거래, 승률, expectancy, 평균 손익비, MDD, 최대 연속 손실

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. StatsResult 타입에 expectancy, max_consecutive_losses 필드 추가
4. stats API 핸들러에서 Ticket 데이터 기반 계산 구현
5. UI 성과 카드 7개 구현
6. Run tests — confirm all pass (GREEN phase)
7. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- `/api/stats`가 expectancy, max_consecutive_losses 필드 반환
- expectancy = 수수료 차감 후 값 (commission_pct 사용)
- UI에 7개 성과 카드 표시
- `bun run build` 통과

## Test Scenarios
- GET /api/stats → response includes expectancy field (number)
- GET /api/stats → response includes max_consecutive_losses field (number)
- Stats calculation with 10 wins, 5 losses → correct winrate (66.7%)
- Stats calculation with alternating W/L/L/L/W → max_consecutive_losses = 3
- Stats calculation with commission_pct deducted from expectancy
- Stats with no trades → all fields zero or null

## Browser Verification
- http://localhost:3000/trade-history → 7개 성과 카드 표시 확인
- http://localhost:3000/trade-history → expectancy 카드에 수수료 차감 값 표시

## Validation
- `bun test -- --grep "stats"`
- `bun run build`

## Out of Scope
- 필터링/정렬 기능
- 대시보드 페이지 변경
