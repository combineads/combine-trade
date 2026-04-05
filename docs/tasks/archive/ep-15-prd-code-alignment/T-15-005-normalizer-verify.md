# T-15-005 normalizer.ts PRD 일치 검증 + 38봉 구조 대응 확인

## Metadata
- modules: [vectors]
- primary: vectors

## Goal
현재 normalizer.ts가 PRD §3.1과 이미 일치하는지 검증하고, 새 38봉 구조에서 정상 동작하는지 확인한다.

## Why
코드 검증 결과 normalizer.ts는 이미 PRD 일치 확인됨 (Median/IQR, lookback=60, clamp(-3,3)→[0,1], IQR=0→0.5). 그러나 입력 벡터의 의미가 6카테고리 파생 피처→38봉 원시 피처로 변경되므로, 정규화가 새 데이터 분포에서도 정상 동작하는지 테스트해야 한다.

## Inputs
- `src/vectors/normalizer.ts` (현재 코드)
- PRD §3.1 정규화 사양
- T-15-003의 candle-features 출력 형태

## Dependencies
- T-15-003 (candle features extractor 완료 — 입력 데이터 형태 확정)

## Expected Outputs
- 검증 테스트 추가된 `tests/vectors/normalizer.test.ts`
- 필요 시 normalizer.ts 미세 수정

## Deliverables
- `tests/vectors/normalizer.test.ts` — 38봉 구조 대응 테스트 추가
- 필요 시 `src/vectors/normalizer.ts` 수정 (예상: 변경 없음 또는 최소)

## Constraints
- normalizer.ts 구조 변경 최소화 (이미 PRD 일치)
- VECTOR_DIM=202 유지
- DEFAULT_LOOKBACK=60 유지

## Steps
1. Write test code from ## Test Scenarios (RED phase — 기존 테스트는 통과, 새 테스트만 RED)
2. Run tests — confirm new behavioral tests status
3. PRD §3.1 vs normalizer.ts 상수 대조 확인:
   - CLAMP_MIN=-3, CLAMP_MAX=3 ✅
   - DEFAULT_LOOKBACK=60 ✅
   - CENTER=0.5 (IQR=0) ✅
4. 38봉 candle features 분포에 대한 정규화 테스트 작성
5. 문제 발견 시 수정 (예상: 변경 없음)
6. Run tests — confirm all pass (GREEN phase)
7. Refactor while keeping tests green (REFACTOR phase)

## Acceptance Criteria
- normalizer.ts 상수가 PRD §3.1과 일치 확인 (문서화)
- 38봉 candle features 입력에 대해 정규화 출력이 [0, 1] 범위
- lookback=60 롤링 윈도우 정상 동작
- 기존 테스트 유지 + 신규 테스트 통과
- `bun run typecheck` 통과

## Test Scenarios
- normalize() with 202-dim raw vector → all output values in [0, 1]
- normalize() with extreme values (100x normal) → clamped to 0 or 1
- normalize() with all-zero vector + valid params → outputs are 0.5 (center)
- computeNormParams() with 60 vectors → produces 202 {median, iqr} pairs
- computeNormParams() with constant feature (all same value) → iqr=0, normalize outputs 0.5
- computeNormParams() with fewer than 60 vectors → uses all available vectors
- normalize() with candle-like distribution (body≈0.001, range≈0.005) → values properly spread in [0,1]

## Validation
- `bun test -- --grep "normalizer"`
- `bun run typecheck`

## Out of Scope
- normalizer.ts 알고리즘 변경
- vectorizer 조립 (T-15-006)

## Implementation Notes

### PRD §3.1 상수 대조 결과 (변경 없음)

`src/vectors/normalizer.ts`를 직접 검토한 결과:

| PRD §3.1 사양 | 코드 상수 | 일치 여부 |
|---|---|---|
| Median/IQR 정규화 | `percentile(sorted, 50)`, `q3-q1` | ✅ |
| lookback=60 | `DEFAULT_LOOKBACK = 60` | ✅ |
| clamp(-3, 3) | `CLAMP_MIN = -3`, `CLAMP_MAX = 3` | ✅ |
| [0,1] 스케일링: (z+3)/6 | `(zClamped - CLAMP_MIN) / (CLAMP_MAX - CLAMP_MIN)` | ✅ |
| IQR=0 → 0.5 | `CENTER = 0.5` | ✅ |
| NaN/Infinity → 0.5 | `!Number.isFinite(rawVal)` 및 `!Number.isFinite(z)` 가드 | ✅ |
| VECTOR_DIM=202 | `VECTOR_DIM` import from `@/vectors/features` | ✅ |

**결론: normalizer.ts 수정 없음. 모든 상수와 알고리즘이 PRD §3.1과 정확히 일치.**

### 38봉 candle-features 분포 대응 확인

candle-features.ts의 실제 출력 스케일:
- `body` = |close-open|/close ≈ 0.001 (0.1%)
- `range` = (high-low)/close ≈ 0.005 (0.5%)
- `ret` = (close-prevClose)/prevClose ≈ ±0.002 (0.2%)
- `upperWick`, `lowerWick` ≈ 0.002 (가중치 1.5 적용 후 ≈ 0.003)

이 스케일은 기존 파생 피처(BB%, RSI/100 등 [0,1] 범위)와 다르지만, Median/IQR 방식은 분포에 무관하게 동작한다. 60개 학습 벡터에서 각 피처의 median/IQR을 계산하면, 새 스케일에서도 [0,1] 출력 범위가 보장된다. 테스트로 실증 확인 완료.

### 신규 테스트 구성

`tests/vectors/normalizer.test.ts`에 2개 describe 블록 추가 (12개 테스트):

**"normalizer — PRD §3.1 상수 검증" (5개)**
- CLAMP_MIN=-3 경계값 정확성
- CLAMP_MAX=3 경계값 정확성
- CENTER=0.5 (IQR=0 케이스) 정확성
- DEFAULT_LOOKBACK=60 동작 확인
- VECTOR_DIM=202 출력 길이 확인

**"normalizer — 38봉 candle-features 분포 대응" (7개)**
- 캔들 스케일 입력(body~0.001)에서 출력 [0,1] 범위
- 100배 극단값 → clamp → 1.0 근접
- all-zero 벡터 + IQR>0 params → [0,1] 범위, z=-1 → 2/6
- 상수 피처(IQR=0) → 0.5
- 60개 벡터 → 202쌍 {median, iqr} 반환
- 60개 미만 벡터 → 가용 전체 사용, 오류 없음
- 중앙값 벡터 → normalize 출력 0.5

## Outputs

- **변경된 파일**: `tests/vectors/normalizer.test.ts` (테스트 12개 추가)
- **변경 없음**: `src/vectors/normalizer.ts` (PRD 완전 일치 확인)
- **테스트 결과**: 45 pass / 0 fail (기존 33 + 신규 12)
- **타입 체크**: 통과 (오류 없음)
