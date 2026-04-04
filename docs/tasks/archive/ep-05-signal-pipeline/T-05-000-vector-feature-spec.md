# T-05-000 202차원 벡터 피처 사양 및 상수 정의

## Goal
`docs/VECTOR_SPEC.md`에 202개 피처 명세를 작성하고, `src/vectors/features.ts`에 피처 이름 상수 배열을 정의한다.

## Why
벡터라이저(T-05-009)와 정규화기(T-05-010)의 전제 조건. 정확히 202개 피처가 무엇인지, 어떻게 계산하는지, 어떤 타임프레임에서 추출하는지 사전에 확정해야 한다. features.ts 상수는 런타임에서 벡터 차원을 검증하는 기준이 된다.

## Inputs
- `docs/DATA_MODEL.md` — Vector 엔티티 (202-dim, 5M/1M만)
- `docs/PRODUCT.md` — 전략 피처 카테고리 (BB20/BB4 %B, RSI, ATR, MA slope 등)
- `src/indicators/types.ts` — AllIndicators 타입 (사용 가능한 지표 목록)
- `src/core/types.ts` — Candle 타입 (OHLCV 원시 데이터)

## Dependencies
- 없음 (문서 + 상수 정의 태스크)

## Expected Outputs
- `docs/VECTOR_SPEC.md` — 202개 피처 전체 명세
- `src/vectors/features.ts` — `FEATURE_NAMES` 상수 배열 (string[], length=202) + `VECTOR_DIM` 상수

## Deliverables
- `docs/VECTOR_SPEC.md`
- `src/vectors/features.ts`

## Constraints
- 정확히 202개 피처 (ARCHITECTURE.md, DATA_MODEL.md에서 확정된 숫자)
- 모든 피처는 EP-02 지표(AllIndicators) 또는 Candle OHLCV 원시 데이터에서 계산 가능해야 함
- 피처 카테고리 (Decision log 기준): 가격 위치 ~40, 모멘텀 ~30, 변동성 ~30, 추세 ~40, 시계열 파생 ~50, 시간/세션 ~12
- FEATURE_WEIGHT CommonCode 그룹과 매핑 가능한 카테고리 분류 포함
- 정규화 방법은 Median/IQR (각 피처별 파라미터 산출 방법 정의)

## Steps
1. PRODUCT.md, DATA_MODEL.md에서 벡터 피처 관련 요구사항 확인
2. AllIndicators 타입에서 사용 가능한 지표 목록 파악 (BB20, BB4, SMA20/60/120, EMA20/60/120, RSI14, ATR14, squeeze)
3. Candle OHLCV에서 파생 가능한 피처 목록 설계 (returns, ranges, ratios 등)
4. 카테고리별 피처 설계하여 정확히 202개 구성
5. docs/VECTOR_SPEC.md 작성 — 피처번호, 이름, 수식, 출처 타임프레임, 정규화 방법
6. src/vectors/features.ts 작성 — FEATURE_NAMES 배열, VECTOR_DIM 상수, 카테고리 매핑
7. features.ts 단위 테스트 작성: 배열 길이 = 202, 중복 이름 없음
8. typecheck 통과 확인

## Acceptance Criteria
- VECTOR_SPEC.md에 정확히 202개 피처 기재
- 각 피처에 계산 수식, 출처 타임프레임(5M/1M), 정규화 방법 명시
- features.ts의 FEATURE_NAMES.length === 202
- features.ts의 VECTOR_DIM === 202
- 모든 피처가 AllIndicators 또는 Candle OHLCV로 계산 가능
- `bun run typecheck` 통과

## Test Scenarios
- FEATURE_NAMES 배열 길이가 정확히 202 → length === 202
- VECTOR_DIM 상수가 202 → VECTOR_DIM === 202
- FEATURE_NAMES에 중복 이름 없음 → new Set(FEATURE_NAMES).size === FEATURE_NAMES.length
- FEATURE_NAMES의 모든 요소가 비어있지 않은 문자열 → every(name => name.length > 0)
- FEATURE_CATEGORIES 합계가 202 → Object.values(categories).flat().length === 202

## Validation
```bash
bun test -- --grep "features"
bun run typecheck
```

## Out of Scope
- 벡터 생성 로직 (T-05-009)
- 정규화 구현 (T-05-010)
- KNN 검색 (T-05-011)
