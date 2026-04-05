/**
 * 202차원 피처 벡터 명세 — 이름, 카테고리, 가중치.
 *
 * 레이아웃:
 *   인덱스 0-189:  캔들 피처 (38봉 × 5) — 이름은 구 6-카테고리 체계와 무관
 *   인덱스 190-201: 전략 피처 (12개)
 *
 * FEATURE_NAMES: KNN 거리 계산, DB 저장, 정규화 파라미터 조회에 사용.
 * FEATURE_WEIGHTS: pre-multiply 가중치 (KNN 거리 가중치).
 * VECTOR_DIM: 202 고정.
 *
 * 참고: 캔들 피처(0-189)는 구 6-카테고리(price_position/momentum/volatility/trend/time_series)
 * 레이아웃을 따르지 않으며, extractCandleFeatures()의 38봉×5 레이아웃을 따른다.
 * 아래 FEATURE_NAMES[0..189]는 하위 호환성을 위해 구 이름을 유지한다.
 */

// ---------------------------------------------------------------------------
// Category: price_position (40)
// ---------------------------------------------------------------------------
const PRICE_POSITION_5M = [
  "bb20_pct_b_5m",
  "bb20_upper_dist_5m",
  "bb20_lower_dist_5m",
  "bb20_bandwidth_5m",
  "bb4_pct_b_5m",
  "bb4_upper_dist_5m",
  "bb4_lower_dist_5m",
  "bb4_bandwidth_5m",
  "close_vs_sma20_5m",
  "close_vs_sma60_5m",
  "close_vs_sma120_5m",
  "close_vs_ema20_5m",
  "close_vs_ema60_5m",
  "close_vs_ema120_5m",
  "high_vs_bb20upper_5m",
  "low_vs_bb20lower_5m",
  "bb4_mid_vs_bb20mid_5m",
] as const;

const PRICE_POSITION_1M = [
  "bb20_pct_b_1m",
  "bb20_upper_dist_1m",
  "bb20_lower_dist_1m",
  "bb20_bandwidth_1m",
  "bb4_pct_b_1m",
  "bb4_upper_dist_1m",
  "bb4_lower_dist_1m",
  "bb4_bandwidth_1m",
  "close_vs_sma20_1m",
  "close_vs_sma60_1m",
  "close_vs_sma120_1m",
  "close_vs_ema20_1m",
  "close_vs_ema60_1m",
  "close_vs_ema120_1m",
  "high_vs_bb20upper_1m",
  "low_vs_bb20lower_1m",
  "bb4_mid_vs_bb20mid_1m",
] as const;

const PRICE_POSITION_CROSS = [
  "bb20_pct_b_ratio",
  "bb4_pct_b_ratio",
  "close_vs_sma20_ratio",
  "close_vs_ema20_ratio",
  "squeeze_state_5m",
  "squeeze_state_1m",
] as const;

// ---------------------------------------------------------------------------
// Category: momentum (30)
// ---------------------------------------------------------------------------
const MOMENTUM_5M = [
  "rsi14_5m",
  "rsi14_diff_vs_50_5m",
  "return_1b_5m",
  "return_2b_5m",
  "return_3b_5m",
  "return_5b_5m",
  "return_10b_5m",
  "roc_5b_5m",
  "roc_10b_5m",
] as const;

const MOMENTUM_1M = [
  "rsi14_1m",
  "rsi14_diff_vs_50_1m",
  "return_1b_1m",
  "return_2b_1m",
  "return_3b_1m",
  "return_5b_1m",
  "return_10b_1m",
  "roc_5b_1m",
  "roc_10b_1m",
] as const;

const MOMENTUM_CROSS = [
  "rsi_divergence",
  "return_1b_ratio",
  "momentum_alignment",
  "bb20_pct_b_change_5m",
  "bb4_pct_b_change_5m",
  "bb20_pct_b_change_1m",
  "bb4_pct_b_change_1m",
  "rsi14_slope_5m",
  "rsi14_slope_1m",
  "price_vs_bb20mid_velocity_5m",
  "price_vs_bb20mid_velocity_1m",
  "rsi14_zscore_5m",
] as const;

// ---------------------------------------------------------------------------
// Category: volatility (30)
// ---------------------------------------------------------------------------
const VOLATILITY_5M = [
  "atr14_5m",
  "atr14_norm_5m",
  "body_size_5m",
  "body_ratio_5m",
  "upper_wick_5m",
  "lower_wick_5m",
  "wick_total_5m",
  "high_low_range_5m",
  "candle_range_vs_bb20bw_5m",
  "squeeze_intensity_5m",
  "vol_regime_5m",
  "atr_change_1b_5m",
  "bb20_bandwidth_vs_sma_5m",
] as const;

const VOLATILITY_1M = [
  "atr14_1m",
  "atr14_norm_1m",
  "body_size_1m",
  "body_ratio_1m",
  "upper_wick_1m",
  "lower_wick_1m",
  "wick_total_1m",
  "high_low_range_1m",
  "candle_range_vs_bb20bw_1m",
  "squeeze_intensity_1m",
  "vol_regime_1m",
  "atr_change_1b_1m",
  "bb20_bandwidth_vs_sma_1m",
] as const;

const VOLATILITY_CROSS = [
  "atr_ratio_5m_vs_1m",
  "bandwidth_ratio_5m_vs_1m",
  "vol_divergence",
  "squeeze_co_occurrence",
] as const;

// ---------------------------------------------------------------------------
// Category: trend (40)
// ---------------------------------------------------------------------------
const TREND_5M = [
  "sma20_slope_5m",
  "sma60_slope_5m",
  "sma120_slope_5m",
  "ema20_slope_5m",
  "ema60_slope_5m",
  "ema120_slope_5m",
  "sma20_vs_sma60_5m",
  "sma60_vs_sma120_5m",
  "ema20_vs_ema60_5m",
  "ema60_vs_ema120_5m",
  "ema20_vs_sma20_5m",
  "ema60_vs_sma60_5m",
  "ma_alignment_5m",
] as const;

const TREND_1M = [
  "sma20_slope_1m",
  "sma60_slope_1m",
  "sma120_slope_1m",
  "ema20_slope_1m",
  "ema60_slope_1m",
  "ema120_slope_1m",
  "sma20_vs_sma60_1m",
  "sma60_vs_sma120_1m",
  "ema20_vs_ema60_1m",
  "ema60_vs_ema120_1m",
  "ema20_vs_sma20_1m",
  "ema60_vs_sma60_1m",
  "ma_alignment_1m",
] as const;

const TREND_CROSS = [
  "sma20_ratio_5m_1m",
  "sma60_ratio_5m_1m",
  "sma120_ratio_5m_1m",
  "ema20_ratio_5m_1m",
  "ema60_ratio_5m_1m",
  "ema120_ratio_5m_1m",
  "trend_alignment_5m",
  "trend_alignment_1m",
  "ma_cross_signal_5m",
  "ma_cross_signal_1m",
  "slope_agreement_5m_1m",
  "sma20_angle_5m",
  "sma20_angle_1m",
  "trend_strength_composite",
] as const;

// ---------------------------------------------------------------------------
// Category: time_series (50)
// ---------------------------------------------------------------------------
const TIME_SERIES_5M = [
  "bb20_pct_b_lag1_5m",
  "bb20_pct_b_lag2_5m",
  "bb20_pct_b_lag3_5m",
  "bb4_pct_b_lag1_5m",
  "bb4_pct_b_lag2_5m",
  "bb4_pct_b_lag3_5m",
  "rsi14_lag1_5m",
  "rsi14_lag2_5m",
  "rsi14_lag3_5m",
  "return_lag1_5m",
  "return_lag2_5m",
  "return_lag3_5m",
  "body_ratio_lag1_5m",
  "body_ratio_lag2_5m",
  "high_low_range_lag1_5m",
  "bb20_pct_b_mean3_5m",
  "bb20_pct_b_std3_5m",
  "rsi14_mean3_5m",
  "rsi14_std3_5m",
  "return_sum3_5m",
  "return_std3_5m",
  "atr14_lag1_5m",
] as const;

const TIME_SERIES_1M = [
  "bb20_pct_b_lag1_1m",
  "bb20_pct_b_lag2_1m",
  "bb20_pct_b_lag3_1m",
  "bb4_pct_b_lag1_1m",
  "bb4_pct_b_lag2_1m",
  "bb4_pct_b_lag3_1m",
  "rsi14_lag1_1m",
  "rsi14_lag2_1m",
  "rsi14_lag3_1m",
  "return_lag1_1m",
  "return_lag2_1m",
  "return_lag3_1m",
  "body_ratio_lag1_1m",
  "body_ratio_lag2_1m",
  "high_low_range_lag1_1m",
  "bb20_pct_b_mean3_1m",
  "bb20_pct_b_std3_1m",
  "rsi14_mean3_1m",
  "rsi14_std3_1m",
  "return_sum3_1m",
  "return_std3_1m",
  "atr14_lag1_1m",
] as const;

const TIME_SERIES_CROSS = [
  "bb20_pct_b_lag1_ratio",
  "rsi14_lag1_ratio",
  "pattern_123_5m",
  "pattern_123_1m",
  "bb4_sequence_5m",
  "bb4_sequence_1m",
] as const;

// ---------------------------------------------------------------------------
// Category: strategy (12)
// ---------------------------------------------------------------------------
const STRATEGY = [
  "bb20_position",
  "bb4_position",
  "ma_ordering",
  "ma20_slope",
  "atr_separation",
  "pivot_distance",
  "rsi_normalized",
  "rsi_extreme_count",
  "breakout_intensity",
  "disparity_divergence",
  "daily_open_distance",
  "session_box_position",
] as const;

// ---------------------------------------------------------------------------
// FEATURE_CATEGORIES: 카테고리명 → 피처명 목록
// ---------------------------------------------------------------------------
export const FEATURE_CATEGORIES: Record<string, readonly string[]> = {
  price_position: [...PRICE_POSITION_5M, ...PRICE_POSITION_1M, ...PRICE_POSITION_CROSS] as const,
  momentum: [...MOMENTUM_5M, ...MOMENTUM_1M, ...MOMENTUM_CROSS] as const,
  volatility: [...VOLATILITY_5M, ...VOLATILITY_1M, ...VOLATILITY_CROSS] as const,
  trend: [...TREND_5M, ...TREND_1M, ...TREND_CROSS] as const,
  time_series: [...TIME_SERIES_5M, ...TIME_SERIES_1M, ...TIME_SERIES_CROSS] as const,
  strategy: [...STRATEGY] as const,
};

// ---------------------------------------------------------------------------
// FEATURE_NAMES: 202개 피처 이름 (순서 = 벡터 인덱스)
// ---------------------------------------------------------------------------
export const FEATURE_NAMES: string[] = [
  ...PRICE_POSITION_5M,
  ...PRICE_POSITION_1M,
  ...PRICE_POSITION_CROSS,
  ...MOMENTUM_5M,
  ...MOMENTUM_1M,
  ...MOMENTUM_CROSS,
  ...VOLATILITY_5M,
  ...VOLATILITY_1M,
  ...VOLATILITY_CROSS,
  ...TREND_5M,
  ...TREND_1M,
  ...TREND_CROSS,
  ...TIME_SERIES_5M,
  ...TIME_SERIES_1M,
  ...TIME_SERIES_CROSS,
  ...STRATEGY,
];

// ---------------------------------------------------------------------------
// VECTOR_DIM: 202 고정
// ---------------------------------------------------------------------------
export const VECTOR_DIM = 202 as const;

// ---------------------------------------------------------------------------
// FEATURE_WEIGHTS: 피처별 KNN 거리 가중치 (기본 1.0; 누락 시 1.0)
// PRD §3.2 논리 그룹 키: upperWick → upper_wick_* 피처, lowerWick → lower_wick_* 피처
// ---------------------------------------------------------------------------
export const FEATURE_WEIGHTS: Record<string, number> = {
  bb4_position: 2.0,
  pivot_distance: 1.5,
  daily_open_distance: 1.5,
  session_box_position: 1.5,
  upperWick: 1.5,
  lowerWick: 1.5,
};
