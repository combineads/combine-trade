# T-15-011 백테스트 벡터 파이프라인 통합 검증

## Metadata
- modules: [backtest, vectors, knn]
- primary: backtest

## Goal
벡터 재생성 후 백테스트를 실행하여 새 벡터 구조에서 KNN 파이프라인이 정상 동작하고 expectancy > 0인지 검증한다.

## Why
6카테고리→38봉 구조 변경 후, 과거 라벨이 새 벡터 공간에서 유의미한 KNN 결과를 생성하는지 확인해야 한다. expectancy ≤ 0이면 WFO 재실행이 필요할 수 있다.

## Inputs
- T-15-010의 재생성된 벡터 데이터
- `bun run backtest` 실행 환경

## Dependencies
- T-15-010 (벡터 재생성 완료)

## Expected Outputs
- 백테스트 결과 로그 (expectancy, winrate, MDD)
- EP-15 Progress notes에 결과 기록

## Deliverables
- 백테스트 실행 결과 기록
- EP-15 progress notes 업데이트
- expectancy ≤ 0 시 WFO 재실행 필요 flag

## Constraints
- 백테스트 실행기 코드 변경 불가 (EP-15 Non-goals)
- 판단 기준: expectancy > 0

## Steps
1. `bun run backtest` 실행
2. 결과 지표 확인: expectancy, winrate, MDD, 총 거래 수
3. expectancy > 0 확인
4. EP-15 progress notes에 결과 기록
5. expectancy ≤ 0이면 Decision log에 "WFO 재실행 필요" 플래그 기록

## Acceptance Criteria
- `bun run backtest` 정상 실행 (에러 없음)
- expectancy > 0 (미달 시 WFO 재실행 필요 플래그)
- 결과가 EP-15 progress notes에 기록됨

## Test Scenarios
N/A — 통합 검증 태스크

## Validation
- `bun run backtest` — 정상 완료
- `bun run typecheck && bun run lint`

## Out of Scope
- WFO 재실행 (EP-13 범위)
- 벡터 구조 변경 (M2-M3에서 완료)

---

## Implementation Notes

**실행 일자**: 2026-04-05

### 검증 모드 변경 배경
T-15-010(벡터 재생성 스크립트)은 구현이 완료된 상태이지만 실제 DB에 대한 벡터 재생성은 프로덕션 환경에서만 가능하다. 따라서 이 태스크는 라이브 DB 없이 수행 가능한 정적 검증으로 실행하였다.

### 검증 수행 내용

#### 1. `bun run typecheck` — PASS
- TypeScript 컴파일 오류 없음
- 수정 사항: biome auto-fix가 `usable[i - 1]!.close` → `usable[i - 1]?.close`로 변환한 결과 `Decimal | undefined`가 `Decimal | null` 파라미터에 할당 불가 에러 발생
  - `/src/vectors/candle-features.ts`: `usable[i - 1]?.close ?? null` 로 수정
  - `/src/vectors/strategy-features.ts`: `allCandles[0]?.high ?? candle.high` 로 수정 (allCandles는 최소 1개 보장)

#### 2. `bun run lint` — PASS (수정 후)
- 초기 실행: 35 errors, 7 warnings
- 수정 대상:
  - `src/backtest/cli.ts`: `useLiteralKeys` (computed → literal key, e.g. `raw["symbol"]` → `raw.symbol`)
  - `src/backtest/engine.ts`, `metrics.ts`, `mock-adapter.ts`, `parallel.ts`, `param-search.ts`, `reporter.ts`, `wfo.ts`, `pipeline-adapter.ts`: import 정렬, `useImportType`, 포맷팅
  - `src/api/routes/stats.ts`, `stats.test.ts`: 포맷팅, import 정렬
  - `src/vectors/candle-features.ts`: `noNonNullAssertion` 수정 (null-safe 분기로 대체)
  - `src/vectors/strategy-features.ts`: optional chaining `?.` 적용
  - `src/web/src/components/trades/PerformanceSummary.tsx`: `noArrayIndexKey` — biome-ignore 주석으로 억제 (skeleton 플레이스홀더는 순서가 안정적이지 않아도 무방)
  - `src/backtest/parallel.ts`: 미사용 변수 `firstError` → `_firstError` 로 이름 변경
- 최종: 0 errors, 0 warnings

#### 3. `bun test` — PASS (수정 후)
- 초기 실행: 2769 pass / 7 fail
- 실패 원인 및 수정:
  - **`config/seed — KNN group has 2 entries`**: EP-15 M4에서 `a_grade_min_samples`, `commission_pct` 2개 항목 추가로 실제 4개. 테스트 어서션 `2 → 4` 수정
  - **`config/seed — FEATURE_WEIGHT group has 2 entries`**: EP-15 M1에서 `wick_ratio` 분리 + 개별 피처 가중치 추가로 실제 7개. 테스트 어서션 `2 → 7` 수정
  - **`candle-schema — integration > INSERT ×5`**: `open_time: new Date(...)` 를 `postgres` 라이브러리에 전달 시 `ERR_INVALID_ARG_TYPE` 에러. `new Date("2025-01-01T00:00:00Z")` → `"2025-01-01T00:00:00Z"` (ISO 문자열) 수정
- 최종: **2776 pass / 0 fail** (14049 expect() calls, 128 파일)

#### 4. `bun run backtest` 명령 확인
- `package.json`에 `"backtest": "bun src/backtest/cli.ts"` 정의 확인 — 명령 존재
- 실제 실행: DB 없이 실행 시 CLI arg 검증 후 DB 연결 단계에서 중단 — 예상된 동작
- **실제 백테스트 실행 및 expectancy/winrate/MDD 측정은 프로덕션 DB에서 `scripts/regenerate-vectors.ts`를 먼저 실행한 후 수행 필요**

### 코드 수정 요약
수정 범위가 태스크 제약("백테스트 실행기 코드 변경 불가")을 준수함을 확인:
- 실행기 로직 변경 없음 (`src/backtest/engine.ts`, `wfo.ts`, `pipeline-adapter.ts` 등 내용 변경 없음)
- lint/format 자동 수정 및 import 정렬만 수행
- 타입 안전성 버그 수정 (`candle-features.ts`, `strategy-features.ts`)
- 테스트 어서션 업데이트 (EP-15 구현 내용 반영)

---

## Outputs

| 검증 항목 | 결과 | 비고 |
|---------|------|------|
| `bun run typecheck` | PASS | null-safe 수정 후 |
| `bun run lint` | PASS | biome auto-fix + 2건 수동 수정 후 |
| `bun test` | PASS (2776/2776) | 7개 실패 수정 후 |
| `bun run backtest` 명령 존재 | PASS | `package.json` 확인 |
| `bun run backtest` 실제 실행 | BLOCKED (DB 없음) | 예상된 제약. 프로덕션 DB 필요 |
| expectancy > 0 판정 | PENDING | DB + 벡터 재생성 후 측정 필요 |
