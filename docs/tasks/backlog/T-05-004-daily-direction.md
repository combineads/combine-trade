# T-05-004 일간 방향 필터

## Goal
`src/filters/daily-direction.ts`에 1D 캔들 마감 시 LONG_ONLY/SHORT_ONLY/NEUTRAL 방향을 결정하고 SymbolState.daily_bias를 업데이트하는 로직을 구현한다.

## Why
시그널 파이프라인의 첫 번째 필터. 일간 방향과 반대되는 진입을 차단하여 추세 역행 매매를 방지한다. WATCHING 감지기(T-05-006)와 Evidence Gate(T-05-007)가 daily_bias를 참조한다.

## Inputs
- `docs/PRODUCT.md` — 방향 필터 규칙 (daily MA20 기울기 + 현재가 vs daily_open)
- `docs/DATA_MODEL.md` — SymbolState.daily_bias, daily_open 필드
- `src/core/types.ts` — DailyBias, Candle 타입
- `src/indicators/` — calcSMA (MA20 계산용)
- `src/db/schema.ts` — symbolStateTable (이미 존재)

## Dependencies
- 없음 (EP-01 foundation + EP-02 indicators 완료 전제)

## Expected Outputs
- `src/filters/daily-direction.ts` export: `determineDailyBias(todayCandle, yesterdayCandle, ma20Today, ma20Yesterday) → DailyBias`
- `src/filters/daily-direction.ts` export: `updateDailyBias(db, symbol, exchange, bias, dailyOpen) → void`
- `src/filters/index.ts` — barrel export

## Deliverables
- `src/filters/daily-direction.ts`

## Constraints
- 방향 결정 로직:
  - MA20 기울기 = (ma20Today - ma20Yesterday): 양수 → 상승 추세, 음수 → 하락 추세
  - 현재가(close) vs daily_open: 위 → bullish bias, 아래 → bearish bias
  - 두 조건 모두 bullish → LONG_ONLY
  - 두 조건 모두 bearish → SHORT_ONLY
  - 조건 불일치 → NEUTRAL
- SymbolState.daily_bias UPDATE는 단일 SQL 트랜잭션
- daily_open은 1D 캔들의 open 값으로 설정
- 금액 비교는 Decimal.js 사용
- 순수 함수(determineDailyBias)와 DB 사이드이펙트(updateDailyBias) 분리
- DB 통합 테스트: 실제 PostgreSQL에서 SymbolState.daily_bias 업데이트 검증

## Steps
1. PRODUCT.md에서 방향 필터 규칙 확인
2. src/filters/daily-direction.ts 작성
   - determineDailyBias: 순수 함수, Decimal.js 비교
   - updateDailyBias: DB 업데이트 (SymbolState.daily_bias, daily_open)
3. src/filters/index.ts barrel export 생성
4. 단위 테스트 작성 (순수 함수)
5. DB 통합 테스트 작성 (updateDailyBias)
6. typecheck + lint 통과 확인

## Acceptance Criteria
- MA20 기울기 양수 + close > open → LONG_ONLY
- MA20 기울기 음수 + close < open → SHORT_ONLY
- 조건 불일치 시 → NEUTRAL
- Decimal.js로 모든 가격 비교 수행
- SymbolState.daily_bias 정상 업데이트 (DB 통합 테스트)
- daily_open 값도 함께 업데이트
- `bun run typecheck && bun run lint` 통과

## Test Scenarios
- determineDailyBias() with MA20 상승 + close > open → LONG_ONLY
- determineDailyBias() with MA20 하락 + close < open → SHORT_ONLY
- determineDailyBias() with MA20 상승 + close < open → NEUTRAL (불일치)
- determineDailyBias() with MA20 하락 + close > open → NEUTRAL (불일치)
- determineDailyBias() with MA20 변화 없음 (기울기=0) → NEUTRAL
- [DB] updateDailyBias() → SymbolState.daily_bias 값이 DB에 정상 반영
- [DB] updateDailyBias() → daily_open 값이 함께 업데이트됨

## Validation
```bash
bun test -- --grep "daily-direction"
bun run typecheck
bun run lint
```

## Out of Scope
- 거래차단 판단 (T-05-005)
- WATCHING 감지 (T-05-006)
- 1D 캔들 마감 이벤트 트리거 (EP-09 데몬)
