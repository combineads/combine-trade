# T-06-007 3단계 손실 제한

## Goal
일간/세션/시간당 3단계 손실 제한의 순수 판정 함수와 DB 갱신 함수를 구현한다.

## Why
과도한 손실로 시드가 훼손되는 것을 방지하는 안전장치이다. 3단계 독립 제한(일간 10%, 세션 3회, 시간당 5M 2회/1M 1회)으로 다양한 시간 단위에서 보호한다.

## Inputs
- `src/db/schema.ts` — symbolStateTable (losses_today, losses_session, losses_this_1h_5m, losses_this_1h_1m)
- `src/core/decimal.ts` — Decimal.js 래퍼
- `docs/DATA_MODEL.md` — SymbolState 손실 카운터 필드, 리셋 규칙
- `docs/DATA_MODEL.md` — CommonCode LOSS_LIMIT.max_daily_loss_pct (0.10)

## Dependencies
- 없음 (SymbolState 테이블은 EP-01에서 이미 존재, db/schema.ts L1 직접 접근)

## Expected Outputs
- `src/limits/loss-limit.ts` — `checkLossLimit()` 순수 함수, `recordLoss()` DB 함수
- LossLimitResult 타입: { allowed, violations[] }

## Deliverables
- `src/limits/loss-limit.ts`
- `tests/limits/loss-limit.test.ts`
- `src/limits/index.ts` barrel export 업데이트

## Constraints
- `checkLossLimit()` 는 순수 함수 — DB import 금지 (SymbolState 값을 파라미터로 받음)
- `recordLoss()`는 db/schema.ts의 symbolStateTable 직접 접근 — positions 모듈 import 금지 (L5→L5 import 방지)
- 모든 금액 계산 Decimal.js
- 한도 초과 시 진입 차단 (fail-closed)
- 손실 카운터 리셋 로직은 T-06-008에서 구현

## Steps
1. LossLimitConfig, LossLimitResult, LossViolation 타입 정의
2. `checkLossLimit(symbolState, balance, config) → LossLimitResult` 구현 (순수)
   - 일간: losses_today >= balance × max_daily_loss_pct → 차단
   - 세션: losses_session >= max_session_losses (3) → 차단
   - 시간 5M: losses_this_1h_5m >= max_hourly_5m (2) → 차단
   - 시간 1M: losses_this_1h_1m >= max_hourly_1m (1) → 차단
   - allowed = 모든 제한 통과, violations = 위반 목록
3. `recordLoss(db, symbol, exchange, lossAmount, timeframe) → void` 구현
   - symbolStateTable 직접 UPDATE (losses_today += lossAmount, losses_session += 1, losses_this_1h_Xm += 1)
   - timeframe에 따라 5M 또는 1M 카운터 증가
4. `loadLossLimitConfig(db) → LossLimitConfig` — CommonCode에서 설정 로드
5. 테스트 작성 후 구현 (TDD)

## Acceptance Criteria
- 일간 손실 10% 도달 시 allowed = false
- 세션 손절 3회 도달 시 allowed = false
- 시간당 5M 2회 도달 시 allowed = false (5M 진입에 대해)
- 시간당 1M 1회 도달 시 allowed = false (1M 진입에 대해)
- 여러 제한 동시 위반 시 violations에 모두 포함
- 모든 제한 미위반 시 allowed = true, violations = []
- recordLoss()가 정확한 카운터 증가
- Decimal.js로 모든 금액 계산
- positions 모듈 import 없음 (레이어 규칙 준수)

## Test Scenarios
- checkLossLimit() with no losses → allowed=true, violations=[]
- checkLossLimit() with daily loss at 9.9% → allowed=true
- checkLossLimit() with daily loss at 10% → allowed=false, violation='DAILY'
- checkLossLimit() with daily loss at 15% → allowed=false, violation='DAILY'
- checkLossLimit() with session losses at 2 → allowed=true
- checkLossLimit() with session losses at 3 → allowed=false, violation='SESSION'
- checkLossLimit() with 5M hourly losses at 1 → allowed=true
- checkLossLimit() with 5M hourly losses at 2 → allowed=false, violation='HOURLY_5M'
- checkLossLimit() with 1M hourly losses at 1 → allowed=false, violation='HOURLY_1M'
- checkLossLimit() with multiple violations → violations array has all
- recordLoss() increments losses_today by lossAmount (Decimal)
- recordLoss() with timeframe='5M' increments losses_session and losses_this_1h_5m
- recordLoss() with timeframe='1M' increments losses_session and losses_this_1h_1m
- loadLossLimitConfig() reads CommonCode.LOSS_LIMIT values

## Validation
```bash
bun test -- --grep "loss-limit"
bun run typecheck
bun run lint
```

## Out of Scope
- 손실 카운터 리셋 로직 (T-06-008)
- Slack 알림 (EP-08 이후)
- 계좌 수준 합산 (SELECT SUM — 데몬에서 호출)
