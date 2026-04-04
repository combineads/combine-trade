# T-10-013 계좌 수준 일일 손실 합산 쿼리

## Goal
개별 심볼 수준이 아닌 계좌 전체(전 심볼×거래소) 일일 손실 합산을 검증하는 checkAccountDailyLimit() 함수를 추가한다. 전체 SymbolState rows의 losses_today SUM이 balance × max_daily_loss_pct를 초과하면 신규 진입을 전면 중단한다.

## Why
현재 checkLossLimit()는 개별 심볼의 losses_today만 검사한다. 심볼 A에서 5% 손실, 심볼 B에서 4% 손실이 발생해도 각각 10% 한도 이내이므로 통과하지만, 계좌 전체로는 9%의 손실이 발생한 상태다. 계좌 수준 합산 검증이 없으면 전체 자본 대비 과도한 손실이 축적될 수 있다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M3 계좌 수준 일일 손실 합산 요구사항
- `src/limits/loss-limit.ts` — 기존 checkLossLimit() 구현 (개별 심볼 수준)
- `src/db/schema.ts` — symbolStateTable 스키마 (losses_today 컬럼)
- `src/core/types.ts` — SymbolState 타입

## Dependencies
- 없음 (독립 태스크)

## Expected Outputs
- `src/limits/loss-limit.ts` — checkAccountDailyLimit() DB 함수 추가, AccountDailyLimitResult 타입 추가
- `tests/limits/account-daily-loss.test.ts` — 계좌 수준 일일 손실 합산 테스트

## Deliverables
- `src/limits/loss-limit.ts`
- `tests/limits/account-daily-loss.test.ts`

## Constraints
- 기존 checkLossLimit() (개별 심볼 수준) 수정 불가 — 별도 함수로 추가
- SUM 쿼리: `SELECT COALESCE(SUM(losses_today::numeric), 0) FROM symbol_state`
- 비교식: `sumLossesToday >= balance × maxDailyLossPct → blocked`
- Decimal.js 정밀도 유지 — SUM 결과를 Decimal으로 변환하여 비교
- balance는 호출자가 전달 (DB에서 조회하지 않음 — 거래소 어댑터 또는 캐시에서 가져옴)
- maxDailyLossPct는 기존 LossLimitConfig.maxDailyLossPct 재사용

## Steps
1. `src/limits/loss-limit.ts`에 AccountDailyLimitResult 타입 추가: `{ allowed: boolean; totalLossesToday: Decimal; threshold: Decimal }`
2. checkAccountDailyLimit(db, balance, config) 함수 추가
3. 내부에서 SUM(losses_today) 쿼리 실행 (Drizzle ORM의 sql`` 태그 사용)
4. SUM 결과를 Decimal으로 변환, balance × maxDailyLossPct와 비교
5. 결과 반환: allowed (boolean), totalLossesToday (Decimal), threshold (Decimal)
6. SymbolState rows가 없는 경우 SUM = 0으로 처리 (COALESCE)
7. 테스트 파일 작성 (DB mock 또는 test fixture 사용)
8. typecheck + lint 통과 확인

## Acceptance Criteria
- checkAccountDailyLimit()가 전 심볼의 losses_today SUM을 올바르게 계산
- SUM >= balance × maxDailyLossPct → `{ allowed: false }` 반환
- SUM < balance × maxDailyLossPct → `{ allowed: true }` 반환
- SymbolState rows가 없는 경우 SUM = 0으로 allowed = true
- 기존 checkLossLimit() 테스트 전부 통과 (회귀 없음)
- Decimal.js 정밀도 유지

## Test Scenarios
- 심볼 3개, 각 losses_today=100, balance=10000, maxDailyLossPct=0.10 → SUM=300(3%), threshold=1000(10%) → allowed=true
- 심볼 3개, 각 losses_today=400, balance=10000, maxDailyLossPct=0.10 → SUM=1200(12%), threshold=1000(10%) → allowed=false
- SymbolState rows 없음 → SUM=0, allowed=true
- 심볼 1개, losses_today=500, balance=5000, maxDailyLossPct=0.10 → SUM=500(10%), threshold=500(10%) → allowed=false (>= 비교이므로 경계값에서 차단)
- 심볼 5개, 다양한 losses_today 합산이 정확한지 검증 (Decimal 정밀도)

## Validation
```bash
bun test -- --grep "account-daily"
bun test -- --grep "loss-limit"
bun run typecheck
bun run lint
```

## Out of Scope
- 기존 checkLossLimit() (개별 심볼) 수정
- balance 조회 로직 (호출자 책임)
- pipeline.ts에서 checkAccountDailyLimit 호출 연결 (E2E에서 검증)
- 다른 M3 안전장치 (FSM 가드, spread 사전 체크 등)
