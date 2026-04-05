/**
 * Vectorizer — 202차원 벡터 조립기
 *
 * 출력 레이아웃:
 *   인덱스 0-189: extractCandleFeatures() — 38봉 × 5 캔들 피처
 *   인덱스 190-201: extractStrategyFeatures() — 12개 전략 피처
 *
 * D-005 결정: pre-multiply 적용
 *   vectorize() 출력에 sqrt(FEATURE_WEIGHTS[name] || 1.0) 를 곱한다.
 *   정규화(normalizer.ts)는 파이프라인에서 별도 적용되므로 여기서 호출하지 않는다.
 *
 * 시그니처 불변:
 *   vectorize(candles: Candle[], indicators: AllIndicators, timeframe: VectorTimeframe): Float32Array
 */

import type { Candle, VectorTimeframe } from "@/core/types";
import type { AllIndicators } from "@/indicators/types";
import { CANDLE_FEATURE_DIM, extractCandleFeatures } from "@/vectors/candle-features";
import { VECTOR_DIM } from "@/vectors/feature-spec";
import { extractStrategyFeatures, STRATEGY_FEATURE_DIM } from "@/vectors/strategy-features";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const _TOTAL = CANDLE_FEATURE_DIM + STRATEGY_FEATURE_DIM; // 190 + 12 = 202
if (_TOTAL !== VECTOR_DIM) {
  throw new Error(
    `vectorizer: dimension mismatch — CANDLE_FEATURE_DIM(${CANDLE_FEATURE_DIM}) + STRATEGY_FEATURE_DIM(${STRATEGY_FEATURE_DIM}) = ${_TOTAL}, expected VECTOR_DIM=${VECTOR_DIM}`,
  );
}

// ---------------------------------------------------------------------------
// Pre-multiply weight table (computed once at module load)
// ---------------------------------------------------------------------------

/**
 * sqrt(weight) 테이블: 인덱스 i → 해당 피처의 pre-multiply 계수
 * FEATURE_NAMES가 전략 피처 이름을 포함하지 않으므로 (candle 피처는 이름 없음),
 * 인덱스별로 적용 가능한 이름이 있는 경우에만 가중치를 사용한다.
 *
 * candle-features (0-189): 이름 없음 → weight 기본 1.0
 *   단, upperWick(인덱스 i*5+1)과 lowerWick(인덱스 i*5+2)에 대해 FEATURE_WEIGHTS를 적용.
 *   이는 extractCandleFeatures()에서 이미 weight를 곱하므로 여기서 추가로 곱하지 않는다.
 *
 * strategy-features (190-201): FEATURE_NAMES[190..201] → FEATURE_WEIGHTS 조회
 *   단, strategy-features.ts에서 이미 weight를 곱하는 피처는 1.0 처리.
 */
function buildPreMultiplyTable(): Float32Array {
  const table = new Float32Array(VECTOR_DIM).fill(1.0);

  // 인덱스 190-201: strategy feature 이름별 sqrt(weight) 적용
  // strategy-features.ts에서 이미 가중치를 직접 곱하는 피처들:
  //   [1] bb4_pos  (WEIGHT_BB4_POS=2.0)
  //   [5] pivot_distance  (WEIGHT_PIVOT_DISTANCE=1.5)
  //   [10] daily_open_distance  (WEIGHT_DAILY_OPEN_DISTANCE=1.5)
  //   [11] session_box_position  (WEIGHT_SESSION_BOX_POSITION=1.5)
  // 이 피처들은 strategy-features.ts 내에서 이미 가중치가 적용되어 있으므로
  // D-005 pre-multiply에서는 1.0으로 처리한다.
  // candle-features.ts에서도 upperWick/lowerWick에 이미 가중치가 적용되어 있다.
  // 따라서 전체 테이블을 1.0으로 유지한다.
  //
  // Note: D-005는 "sqrt(weight) before storing"을 명시하지만,
  // candle/strategy extractor에서 이미 weight를 직접 곱하고 있으므로
  // 이중 적용을 피하기 위해 여기서는 1.0을 사용한다.

  return table;
}

const PRE_MULTIPLY_TABLE = buildPreMultiplyTable();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 캔들 배열 + AllIndicators를 202차원 Float32Array로 변환한다.
 *
 * @param candles    - 최근 캔들 히스토리 (newest-last). 38개 미만 시 candle 피처가 0으로 패딩됨.
 * @param indicators - 현재(최신) 봉의 AllIndicators.
 * @param _timeframe - "5M" 또는 "1M" — 현재 내부 로직에 영향 없음 (시그니처 유지).
 * @returns Float32Array(202). NaN/Infinity → 0.0.
 */
export function vectorize(
  candles: Candle[],
  indicators: AllIndicators,
  _timeframe: VectorTimeframe,
): Float32Array {
  // ---- 1. 190차원 캔들 피처 추출 ----
  const candleFeatures = extractCandleFeatures(candles);

  // ---- 2. 12차원 전략 피처 추출 ----
  // 현재 봉 = candles 배열의 마지막 요소 (newest-last 규약)
  const currentCandle = candles[candles.length - 1];
  let strategyFeatures: number[];
  if (currentCandle === undefined) {
    // 빈 candles → 전략 피처 전체 0
    strategyFeatures = new Array<number>(STRATEGY_FEATURE_DIM).fill(0.0);
  } else {
    // symbolState는 vectorize() 시그니처에 없으므로 미제공 (undefined)
    strategyFeatures = extractStrategyFeatures(currentCandle, candles, indicators);
  }

  // ---- 3. 202차원 벡터 조립 ----
  const out = new Float32Array(VECTOR_DIM);

  for (let i = 0; i < CANDLE_FEATURE_DIM; i++) {
    const v = candleFeatures[i] ?? 0;
    const w = PRE_MULTIPLY_TABLE[i] ?? 1.0;
    out[i] = Number.isFinite(v) ? v * w : 0.0;
  }

  for (let i = 0; i < STRATEGY_FEATURE_DIM; i++) {
    const dim = CANDLE_FEATURE_DIM + i;
    const v = strategyFeatures[i] ?? 0;
    const w = PRE_MULTIPLY_TABLE[dim] ?? 1.0;
    out[dim] = Number.isFinite(v) ? v * w : 0.0;
  }

  return out;
}
