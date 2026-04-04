# T-10-001 BB4 Source를 "close" → "open"으로 변경

## Goal
BB4 지표의 소스를 `close`에서 `open`으로 변경하여 PRD 명세와 일치시킨다. `src/core/constants.ts`의 BB4_CONFIG.source를 `"open"`으로 수정하고, `src/indicators/bollinger.ts`의 calcBB()가 source 파라미터에 따라 open 또는 close 가격을 사용하도록 확장한다.

## Why
PRD에서 BB4는 open 가격 기반으로 산출하도록 정의되어 있으나, 현재 코드는 close 기반으로 구현되어 있다. BB4 밴드 위치가 달라지면 Evidence Gate의 터치 감지 결과가 달라지므로, 전략 정합성을 위해 PRD와 일치시켜야 한다.

## Inputs
- `docs/exec-plans/10-strategy-alignment.md` — M1 BB4 source=open 요구사항
- `docs/PRODUCT.md` — BB4 source=open 명세
- `src/core/constants.ts` — BB4_CONFIG 현재 상태 (source: "close")
- `src/indicators/bollinger.ts` — calcBB() 현재 구현 (closes: number[] 파라미터)
- `src/core/types.ts` — BollingerConfig 타입

## Dependencies
- 없음 (독립 태스크)

## Expected Outputs
- `src/core/constants.ts` — BB4_CONFIG.source = "open"
- `src/indicators/bollinger.ts` — calcBB()에 source 파라미터 추가, "open"이면 candle.open 사용
- `tests/indicators/bollinger.test.ts` — source=open 테스트 케이스 추가

## Deliverables
- `src/core/constants.ts`
- `src/indicators/bollinger.ts`
- `tests/indicators/bollinger.test.ts`

## Constraints
- calcBB20은 기존대로 source=close 유지 (BB20_CONFIG.source는 변경하지 않음)
- calcBB()의 기존 호출부(source 미지정)는 하위 호환 유지 — source 파라미터 기본값 = config에서 참조
- BollingerConfig 타입에 `source: "open" | "close"` 필드가 없으면 추가
- Decimal.js 정밀도 유지
- BB4_CONFIG 외 다른 상수 변경 금지

## Steps
1. `src/core/types.ts`에서 BollingerConfig에 source 필드 존재 여부 확인, 없으면 추가
2. `src/core/constants.ts`에서 BB4_CONFIG.source를 "open"으로 변경
3. `src/indicators/bollinger.ts`의 calcBB()에 source 파라미터 추가 — "open"이면 open 가격 배열, "close"면 close 가격 배열 사용
4. 기존 calcBB 호출부가 config.source를 자동 참조하도록 인터페이스 조정
5. 기존 테스트가 source=close로 동작하는지 확인 (BB20 테스트 불변)
6. source=open 테스트 케이스 추가: 동일 캔들 데이터에서 open vs close 결과가 다른 것 검증
7. typecheck + lint 통과 확인

## Acceptance Criteria
- BB4_CONFIG.source === "open" 확인
- calcBB(candles, BB4_CONFIG) 호출 시 candle.open 가격 기반으로 밴드 산출
- calcBB(candles, BB20_CONFIG) 호출 시 기존대로 candle.close 가격 기반 (하위 호환)
- BollingerConfig 타입에 source 필드 포함
- 기존 BB20 테스트 전부 통과 (회귀 없음)
- Decimal.js 정밀도 유지

## Test Scenarios
- calcBB with BB20_CONFIG (source=close) → 기존과 동일한 결과 (회귀 테스트)
- calcBB with BB4_CONFIG (source=open) → open 가격 기반 밴드 산출
- open !== close인 캔들 데이터로 calcBB(source=open) vs calcBB(source=close) → 결과가 다름
- BB4_CONFIG.source === "open" 상수 검증
- calcBB with source=open, 모든 캔들 open==close → source=close와 동일 결과

## Validation
```bash
bun test -- --grep "bollinger"
bun run typecheck
bun run lint
```

## Out of Scope
- Evidence Gate 로직 변경 (T-10-003)
- BB20 source 변경 (BB20은 close 유지)
- 다른 지표(MA, RSI, ATR) 수정
