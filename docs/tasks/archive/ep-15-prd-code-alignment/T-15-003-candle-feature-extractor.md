# T-15-003 38봉×5 캔들 피처 추출기 구현

## Metadata
- modules: [vectors]
- primary: vectors

## Goal
PRD §7.8의 38봉×5 캔들 피처 추출기를 신규 구현하고, 기존 features.ts의 호환 re-export를 유지한다.

## Why
현재 벡터의 190차원은 6카테고리 파생 지표(BB position, RSI, ATR 등)로 구성되어 있으나, PRD §7.8은 최근 38개 캔들의 원시 가격 피처(body, upperWick, lowerWick, range, ret)를 요구한다. 이 구조 변경이 EP-15의 핵심이다.

## Inputs
- PRD §7.8: 38봉 × 5피처 명세
- T-15-001의 VECTOR_SPEC.md (감사 완료 문서)
- T-15-002의 FEATURE_WEIGHTS (upperWick:1.5, lowerWick:1.5)
- `src/vectors/features.ts` (기존 FEATURE_NAMES, VECTOR_DIM 등)

## Dependencies
- T-15-002 (FEATURE_WEIGHTS에 upperWick/lowerWick 추가 완료)

## Expected Outputs
- `src/vectors/candle-features.ts` — 38봉×5 추출 함수
- 기존 `@/vectors/features` import 경로 호환 유지

## Deliverables
- `src/vectors/candle-features.ts` — `extractCandleFeatures(candles: Candle[]): number[]`
- `tests/vectors/candle-features.test.ts`
- features.ts에 FEATURE_NAMES/VECTOR_DIM 호환 re-export 유지

## Constraints
- 출력 인덱스 0-189: 봉 순서 (bar[0]의 5피처, bar[1]의 5피처, ...)
- Decimal.js로 가격 계산 후 toNumber()
- 가중치 적용: upperWick × 1.5, lowerWick × 1.5 (FEATURE_WEIGHTS에서 로드)
- 캔들 부족 시 0.0 패딩 (38개 미만)
- 기존 import 경로(`@/vectors/features`)가 깨지면 안 됨

## Steps
1. Write test code from ## Test Scenarios (RED phase)
2. Run tests — confirm all behavioral tests fail
3. `src/vectors/candle-features.ts` 생성:
   - 입력: Candle[] (최근 38개, newest-last)
   - 5피처/봉: body=|close-open|/close, upperWick=(high-max(open,close))/close, lowerWick=(min(open,close)-low)/close, range=(high-low)/close, ret=(close-prevClose)/prevClose
   - 가중치 적용: upperWick × weight, lowerWick × weight
   - 출력: number[190]
4. features.ts에서 새 FEATURE_NAMES (190 candle + 12 strategy) 호환 re-export 구성
5. 기존 VECTOR_DIM=202, FEATURE_CATEGORIES 호환 유지
6. Run tests — confirm all pass (GREEN phase)
7. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- 38봉 × 5피처 = 190차원 출력
- 인덱스 0-4: bar[0]의 (body, upperWick, lowerWick, range, ret)
- 인덱스 5-9: bar[1]의 (body, upperWick, lowerWick, range, ret)
- upperWick × 1.5, lowerWick × 1.5 가중치 적용됨
- 캔들 < 38개 → 부족분 0.0 패딩
- 모든 가격 계산 Decimal.js
- `bun run typecheck` 통과

## Test Scenarios
- extractCandleFeatures() with 38 candles → returns 190-element array
- extractCandleFeatures() with 38 candles → index 0-4 are bar[0] features in order (body, upperWick, lowerWick, range, ret)
- extractCandleFeatures() with doji candle (open===close) → body=0, wicks calculated correctly
- extractCandleFeatures() with marubozu (high===close, low===open for bullish) → upperWick=0, lowerWick=0
- extractCandleFeatures() with 20 candles → last 18 bars padded with 0.0 (90 zeros)
- extractCandleFeatures() with empty array → returns 190 zeros
- extractCandleFeatures() → upperWick values multiplied by 1.5 weight
- extractCandleFeatures() → lowerWick values multiplied by 1.5 weight

## Validation
- `bun test -- --grep "candle-features"`
- `bun run typecheck`

## Out of Scope
- 전략 12차원 피처 (T-15-004)
- 정규화 (M3)
- 기존 vectorizer.ts 삭제 (M3)

## Implementation Notes

### 패딩 방향 결정
태스크 명세의 "last 18 bars padded with 0.0 (90 zeros)" 문구에 따라 뒤쪽(bar[N..37]) 패딩 채택.
- candles[i] → bar[i] (candles[0]은 항상 bar[0])
- 38개 미만 시 bar[usable.length..37]이 0.0

### Decimal.js 사용
`Decimal.max()`, `Decimal.min()`으로 max(open,close), min(open,close) 계산.
`safe()` 헬퍼로 NaN/Infinity → 0.0 보호.

### 가중치 로드
`FEATURE_WEIGHTS` (features.ts)에서 `upperWick`/`lowerWick` 키를 읽음.
`weights` 파라미터로 오버라이드 가능 (테스트 및 실험용).

### features.ts 호환
features.ts는 수정 없이 유지됨. candle-features.ts는 독립 모듈로 신규 생성.

## Outputs
- `src/vectors/candle-features.ts` — `extractCandleFeatures()` 구현 (190차원)
- `tests/vectors/candle-features.test.ts` — 13개 테스트 (13/13 pass)
- `bun test -- --grep "candle-features"`: 13 pass, 0 fail
- `bun run typecheck`: candle-features 관련 오류 없음 (transfer 기존 오류는 pre-existing)
