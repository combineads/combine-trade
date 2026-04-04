/**
 * 202-dimensional feature vector specification for KNN-based signal validation.
 *
 * Features are extracted from 5M and 1M candles with their AllIndicators.
 * Normalization method: Median/IQR per feature (computed during WFO training).
 *
 * Category budget:
 *   price_position:  40
 *   momentum:        30
 *   volatility:      30
 *   trend:           40
 *   time_series:     50
 *   time_session:    12
 *   TOTAL:          202
 */

// ---------------------------------------------------------------------------
// Category: price_position (40)
// ---------------------------------------------------------------------------
// 5M Bollinger and MA price position (17)
const PRICE_POSITION_5M = [
  "bb20_pct_b_5m", // (close - bb20_lower) / (bb20_upper - bb20_lower)  [5M]
  "bb20_upper_dist_5m", // (bb20_upper - close) / close  [5M]
  "bb20_lower_dist_5m", // (close - bb20_lower) / close  [5M]
  "bb20_bandwidth_5m", // (bb20_upper - bb20_lower) / bb20_middle  [5M]
  "bb4_pct_b_5m", // (close - bb4_lower) / (bb4_upper - bb4_lower)  [5M]
  "bb4_upper_dist_5m", // (bb4_upper - close) / close  [5M]
  "bb4_lower_dist_5m", // (close - bb4_lower) / close  [5M]
  "bb4_bandwidth_5m", // (bb4_upper - bb4_lower) / bb4_middle  [5M]
  "close_vs_sma20_5m", // (close - sma20) / sma20  [5M]
  "close_vs_sma60_5m", // (close - sma60) / sma60  [5M]
  "close_vs_sma120_5m", // (close - sma120) / sma120  [5M]
  "close_vs_ema20_5m", // (close - ema20) / ema20  [5M]
  "close_vs_ema60_5m", // (close - ema60) / ema60  [5M]
  "close_vs_ema120_5m", // (close - ema120) / ema120  [5M]
  "high_vs_bb20upper_5m", // (high - bb20_upper) / close  [5M]
  "low_vs_bb20lower_5m", // (bb20_lower - low) / close  [5M]
  "bb4_mid_vs_bb20mid_5m", // (bb4_middle - bb20_middle) / bb20_middle  [5M]
] as const;

// 1M Bollinger and MA price position (17)
const PRICE_POSITION_1M = [
  "bb20_pct_b_1m", // (close - bb20_lower) / (bb20_upper - bb20_lower)  [1M]
  "bb20_upper_dist_1m", // (bb20_upper - close) / close  [1M]
  "bb20_lower_dist_1m", // (close - bb20_lower) / close  [1M]
  "bb20_bandwidth_1m", // (bb20_upper - bb20_lower) / bb20_middle  [1M]
  "bb4_pct_b_1m", // (close - bb4_lower) / (bb4_upper - bb4_lower)  [1M]
  "bb4_upper_dist_1m", // (bb4_upper - close) / close  [1M]
  "bb4_lower_dist_1m", // (close - bb4_lower) / close  [1M]
  "bb4_bandwidth_1m", // (bb4_upper - bb4_lower) / bb4_middle  [1M]
  "close_vs_sma20_1m", // (close - sma20) / sma20  [1M]
  "close_vs_sma60_1m", // (close - sma60) / sma60  [1M]
  "close_vs_sma120_1m", // (close - sma120) / sma120  [1M]
  "close_vs_ema20_1m", // (close - ema20) / ema20  [1M]
  "close_vs_ema60_1m", // (close - ema60) / ema60  [1M]
  "close_vs_ema120_1m", // (close - ema120) / ema120  [1M]
  "high_vs_bb20upper_1m", // (high - bb20_upper) / close  [1M]
  "low_vs_bb20lower_1m", // (bb20_lower - low) / close  [1M]
  "bb4_mid_vs_bb20mid_1m", // (bb4_middle - bb20_middle) / bb20_middle  [1M]
] as const;

// Cross-timeframe price position (6)
const PRICE_POSITION_CROSS = [
  "bb20_pct_b_ratio", // bb20_pct_b_5m - bb20_pct_b_1m  (divergence)
  "bb4_pct_b_ratio", // bb4_pct_b_5m - bb4_pct_b_1m  (divergence)
  "close_vs_sma20_ratio", // close_vs_sma20_5m - close_vs_sma20_1m
  "close_vs_ema20_ratio", // close_vs_ema20_5m - close_vs_ema20_1m
  "squeeze_state_5m", // encoded: -1=squeeze, 0=normal, 1=expansion  [5M]
  "squeeze_state_1m", // encoded: -1=squeeze, 0=normal, 1=expansion  [1M]
] as const;

// ---------------------------------------------------------------------------
// Category: momentum (30)
// ---------------------------------------------------------------------------
// 5M momentum (9)
const MOMENTUM_5M = [
  "rsi14_5m", // rsi14 / 100, range [0,1]  [5M]
  "rsi14_diff_vs_50_5m", // (rsi14 - 50) / 50  [5M]
  "return_1b_5m", // (close[0] - close[1]) / close[1]  [5M, 1-bar return]
  "return_2b_5m", // (close[0] - close[2]) / close[2]  [5M, 2-bar return]
  "return_3b_5m", // (close[0] - close[3]) / close[3]  [5M, 3-bar return]
  "return_5b_5m", // (close[0] - close[5]) / close[5]  [5M, 5-bar return]
  "return_10b_5m", // (close[0] - close[10]) / close[10]  [5M, 10-bar return]
  "roc_5b_5m", // rate of change over 5 bars = return_5b_5m  [5M]
  "roc_10b_5m", // rate of change over 10 bars = return_10b_5m  [5M]
] as const;

// 1M momentum (9)
const MOMENTUM_1M = [
  "rsi14_1m", // rsi14 / 100, range [0,1]  [1M]
  "rsi14_diff_vs_50_1m", // (rsi14 - 50) / 50  [1M]
  "return_1b_1m", // (close[0] - close[1]) / close[1]  [1M, 1-bar return]
  "return_2b_1m", // (close[0] - close[2]) / close[2]  [1M, 2-bar return]
  "return_3b_1m", // (close[0] - close[3]) / close[3]  [1M, 3-bar return]
  "return_5b_1m", // (close[0] - close[5]) / close[5]  [1M, 5-bar return]
  "return_10b_1m", // (close[0] - close[10]) / close[10]  [1M, 10-bar return]
  "roc_5b_1m", // rate of change over 5 bars  [1M]
  "roc_10b_1m", // rate of change over 10 bars  [1M]
] as const;

// Cross-timeframe and composite momentum (12)
const MOMENTUM_CROSS = [
  "rsi_divergence", // rsi14_5m - rsi14_1m  (timeframe divergence)
  "return_1b_ratio", // return_1b_5m - return_1b_1m  (divergence)
  "momentum_alignment", // sign(return_1b_5m) == sign(return_1b_1m) → 1, else -1
  "bb20_pct_b_change_5m", // bb20_pct_b_5m[0] - bb20_pct_b_5m[1]  [5M]
  "bb4_pct_b_change_5m", // bb4_pct_b_5m[0] - bb4_pct_b_5m[1]  [5M]
  "bb20_pct_b_change_1m", // bb20_pct_b_1m[0] - bb20_pct_b_1m[1]  [1M]
  "bb4_pct_b_change_1m", // bb4_pct_b_1m[0] - bb4_pct_b_1m[1]  [1M]
  "rsi14_slope_5m", // rsi14_5m[0] - rsi14_5m[1]  normalized by 100  [5M]
  "rsi14_slope_1m", // rsi14_1m[0] - rsi14_1m[1]  normalized by 100  [1M]
  "price_vs_bb20mid_velocity_5m", // (close_vs_bb20mid_5m - prev_close_vs_bb20mid_5m)  [5M]
  "price_vs_bb20mid_velocity_1m", // (close_vs_bb20mid_1m - prev_close_vs_bb20mid_1m)  [1M]
  "rsi14_zscore_5m", // (rsi14_5m - rsi14_mean3_5m) / rsi14_std3_5m  [5M]
] as const;

// ---------------------------------------------------------------------------
// Category: volatility (30)
// ---------------------------------------------------------------------------
// 5M volatility (13)
const VOLATILITY_5M = [
  "atr14_5m", // atr14_5m / close  (ATR normalized by close)  [5M]
  "atr14_norm_5m", // atr14_5m / bb20_bandwidth_abs  (ATR vs BB width)  [5M]
  "body_size_5m", // |close - open| / close  [5M]
  "body_ratio_5m", // |close - open| / (high - low)  (body fraction of range)  [5M]
  "upper_wick_5m", // (high - max(open,close)) / atr14  [5M]
  "lower_wick_5m", // (min(open,close) - low) / atr14  [5M]
  "wick_total_5m", // (upper_wick + lower_wick) / (high - low)  [5M]
  "high_low_range_5m", // (high - low) / close  [5M]
  "candle_range_vs_bb20bw_5m", // (high - low) / (bb20_upper - bb20_lower)  [5M]
  "squeeze_intensity_5m", // bb20_bandwidth / bb20_bandwidth_sma20  (current vs avg)  [5M]
  "vol_regime_5m", // atr14 / atr14_sma20  (current vs rolling avg)  [5M]
  "atr_change_1b_5m", // (atr14[0] - atr14[1]) / atr14[1]  [5M]
  "bb20_bandwidth_vs_sma_5m", // (bb20_bandwidth - bb20_bandwidth_mean5) / bb20_bandwidth_mean5  [5M]
] as const;

// 1M volatility (13)
const VOLATILITY_1M = [
  "atr14_1m", // atr14_1m / close  (ATR normalized by close)  [1M]
  "atr14_norm_1m", // atr14_1m / bb20_bandwidth_abs  (ATR vs BB width)  [1M]
  "body_size_1m", // |close - open| / close  [1M]
  "body_ratio_1m", // |close - open| / (high - low)  [1M]
  "upper_wick_1m", // (high - max(open,close)) / atr14  [1M]
  "lower_wick_1m", // (min(open,close) - low) / atr14  [1M]
  "wick_total_1m", // (upper_wick + lower_wick) / (high - low)  [1M]
  "high_low_range_1m", // (high - low) / close  [1M]
  "candle_range_vs_bb20bw_1m", // (high - low) / (bb20_upper - bb20_lower)  [1M]
  "squeeze_intensity_1m", // bb20_bandwidth / bb20_bandwidth_sma20  [1M]
  "vol_regime_1m", // atr14 / atr14_sma20  [1M]
  "atr_change_1b_1m", // (atr14[0] - atr14[1]) / atr14[1]  [1M]
  "bb20_bandwidth_vs_sma_1m", // (bb20_bandwidth - bb20_bandwidth_mean5) / bb20_bandwidth_mean5  [1M]
] as const;

// Cross-timeframe volatility (4)
const VOLATILITY_CROSS = [
  "atr_ratio_5m_vs_1m", // atr14_norm_5m / atr14_norm_1m  (relative volatility)
  "bandwidth_ratio_5m_vs_1m", // bb20_bandwidth_5m / bb20_bandwidth_1m
  "vol_divergence", // vol_regime_5m - vol_regime_1m  (vol regime difference)
  "squeeze_co_occurrence", // squeeze_state_5m + squeeze_state_1m  (both in squeeze = -2)
] as const;

// ---------------------------------------------------------------------------
// Category: trend (40)
// ---------------------------------------------------------------------------
// 5M trend (13)
const TREND_5M = [
  "sma20_slope_5m", // (sma20[0] - sma20[1]) / sma20[1]  [5M]
  "sma60_slope_5m", // (sma60[0] - sma60[1]) / sma60[1]  [5M]
  "sma120_slope_5m", // (sma120[0] - sma120[1]) / sma120[1]  [5M]
  "ema20_slope_5m", // (ema20[0] - ema20[1]) / ema20[1]  [5M]
  "ema60_slope_5m", // (ema60[0] - ema60[1]) / ema60[1]  [5M]
  "ema120_slope_5m", // (ema120[0] - ema120[1]) / ema120[1]  [5M]
  "sma20_vs_sma60_5m", // (sma20 - sma60) / sma60  [5M]
  "sma60_vs_sma120_5m", // (sma60 - sma120) / sma120  [5M]
  "ema20_vs_ema60_5m", // (ema20 - ema60) / ema60  [5M]
  "ema60_vs_ema120_5m", // (ema60 - ema120) / ema120  [5M]
  "ema20_vs_sma20_5m", // (ema20 - sma20) / sma20  [5M]
  "ema60_vs_sma60_5m", // (ema60 - sma60) / sma60  [5M]
  "ma_alignment_5m", // 1 if sma20>sma60>sma120, -1 if sma20<sma60<sma120, else 0  [5M]
] as const;

// 1M trend (13)
const TREND_1M = [
  "sma20_slope_1m", // (sma20[0] - sma20[1]) / sma20[1]  [1M]
  "sma60_slope_1m", // (sma60[0] - sma60[1]) / sma60[1]  [1M]
  "sma120_slope_1m", // (sma120[0] - sma120[1]) / sma120[1]  [1M]
  "ema20_slope_1m", // (ema20[0] - ema20[1]) / ema20[1]  [1M]
  "ema60_slope_1m", // (ema60[0] - ema60[1]) / ema60[1]  [1M]
  "ema120_slope_1m", // (ema120[0] - ema120[1]) / ema120[1]  [1M]
  "sma20_vs_sma60_1m", // (sma20 - sma60) / sma60  [1M]
  "sma60_vs_sma120_1m", // (sma60 - sma120) / sma120  [1M]
  "ema20_vs_ema60_1m", // (ema20 - ema60) / ema60  [1M]
  "ema60_vs_ema120_1m", // (ema60 - ema120) / ema120  [1M]
  "ema20_vs_sma20_1m", // (ema20 - sma20) / sma20  [1M]
  "ema60_vs_sma60_1m", // (ema60 - sma60) / sma60  [1M]
  "ma_alignment_1m", // 1 if sma20>sma60>sma120, -1 if reversed, else 0  [1M]
] as const;

// Cross-timeframe trend (14)
const TREND_CROSS = [
  "sma20_ratio_5m_1m", // sma20_5m / sma20_1m - 1  (spread between timeframes)
  "sma60_ratio_5m_1m", // sma60_5m / sma60_1m - 1
  "sma120_ratio_5m_1m", // sma120_5m / sma120_1m - 1
  "ema20_ratio_5m_1m", // ema20_5m / ema20_1m - 1
  "ema60_ratio_5m_1m", // ema60_5m / ema60_1m - 1
  "ema120_ratio_5m_1m", // ema120_5m / ema120_1m - 1
  "trend_alignment_5m", // sign(sma20_slope) + sign(sma60_slope) + sign(sma120_slope)  [5M]
  "trend_alignment_1m", // sign(sma20_slope) + sign(sma60_slope) + sign(sma120_slope)  [1M]
  "ma_cross_signal_5m", // sign(ema20_vs_sma20_5m): +1 bullish, -1 bearish  [5M]
  "ma_cross_signal_1m", // sign(ema20_vs_sma20_1m)  [1M]
  "slope_agreement_5m_1m", // sign(sma20_slope_5m) == sign(sma20_slope_1m) → 1 else -1
  "sma20_angle_5m", // arctan(sma20_slope_5m) normalized to [-1,1]  [5M]
  "sma20_angle_1m", // arctan(sma20_slope_1m) normalized to [-1,1]  [1M]
  "trend_strength_composite", // (ma_alignment_5m + ma_alignment_1m) / 2
] as const;

// ---------------------------------------------------------------------------
// Category: time_series (50)
// ---------------------------------------------------------------------------
// 5M lagged and rolling features (22)
const TIME_SERIES_5M = [
  "bb20_pct_b_lag1_5m", // bb20_pct_b_5m at t-1  [5M]
  "bb20_pct_b_lag2_5m", // bb20_pct_b_5m at t-2  [5M]
  "bb20_pct_b_lag3_5m", // bb20_pct_b_5m at t-3  [5M]
  "bb4_pct_b_lag1_5m", // bb4_pct_b_5m at t-1  [5M]
  "bb4_pct_b_lag2_5m", // bb4_pct_b_5m at t-2  [5M]
  "bb4_pct_b_lag3_5m", // bb4_pct_b_5m at t-3  [5M]
  "rsi14_lag1_5m", // rsi14_5m/100 at t-1  [5M]
  "rsi14_lag2_5m", // rsi14_5m/100 at t-2  [5M]
  "rsi14_lag3_5m", // rsi14_5m/100 at t-3  [5M]
  "return_lag1_5m", // (close[1] - close[2]) / close[2]  [5M]
  "return_lag2_5m", // (close[2] - close[3]) / close[3]  [5M]
  "return_lag3_5m", // (close[3] - close[4]) / close[4]  [5M]
  "body_ratio_lag1_5m", // body_ratio at t-1  [5M]
  "body_ratio_lag2_5m", // body_ratio at t-2  [5M]
  "high_low_range_lag1_5m", // high_low_range at t-1  [5M]
  "bb20_pct_b_mean3_5m", // mean(bb20_pct_b_5m[0..2])  [5M]
  "bb20_pct_b_std3_5m", // std(bb20_pct_b_5m[0..2])  [5M]
  "rsi14_mean3_5m", // mean(rsi14_5m[0..2]) / 100  [5M]
  "rsi14_std3_5m", // std(rsi14_5m[0..2]) / 100  [5M]
  "return_sum3_5m", // sum(return[0..2])  [5M]
  "return_std3_5m", // std(return[0..2])  [5M]
  "atr14_lag1_5m", // atr14 / close at t-1  [5M]
] as const;

// 1M lagged and rolling features (22)
const TIME_SERIES_1M = [
  "bb20_pct_b_lag1_1m", // bb20_pct_b_1m at t-1  [1M]
  "bb20_pct_b_lag2_1m", // bb20_pct_b_1m at t-2  [1M]
  "bb20_pct_b_lag3_1m", // bb20_pct_b_1m at t-3  [1M]
  "bb4_pct_b_lag1_1m", // bb4_pct_b_1m at t-1  [1M]
  "bb4_pct_b_lag2_1m", // bb4_pct_b_1m at t-2  [1M]
  "bb4_pct_b_lag3_1m", // bb4_pct_b_1m at t-3  [1M]
  "rsi14_lag1_1m", // rsi14_1m/100 at t-1  [1M]
  "rsi14_lag2_1m", // rsi14_1m/100 at t-2  [1M]
  "rsi14_lag3_1m", // rsi14_1m/100 at t-3  [1M]
  "return_lag1_1m", // (close[1] - close[2]) / close[2]  [1M]
  "return_lag2_1m", // (close[2] - close[3]) / close[3]  [1M]
  "return_lag3_1m", // (close[3] - close[4]) / close[4]  [1M]
  "body_ratio_lag1_1m", // body_ratio at t-1  [1M]
  "body_ratio_lag2_1m", // body_ratio at t-2  [1M]
  "high_low_range_lag1_1m", // high_low_range at t-1  [1M]
  "bb20_pct_b_mean3_1m", // mean(bb20_pct_b_1m[0..2])  [1M]
  "bb20_pct_b_std3_1m", // std(bb20_pct_b_1m[0..2])  [1M]
  "rsi14_mean3_1m", // mean(rsi14_1m[0..2]) / 100  [1M]
  "rsi14_std3_1m", // std(rsi14_1m[0..2]) / 100  [1M]
  "return_sum3_1m", // sum(return[0..2])  [1M]
  "return_std3_1m", // std(return[0..2])  [1M]
  "atr14_lag1_1m", // atr14 / close at t-1  [1M]
] as const;

// Cross time-series derived (6)
const TIME_SERIES_CROSS = [
  "bb20_pct_b_lag1_ratio", // bb20_pct_b_lag1_5m - bb20_pct_b_lag1_1m
  "rsi14_lag1_ratio", // rsi14_lag1_5m - rsi14_lag1_1m
  "pattern_123_5m", // 3-bar return direction pattern: sum(sign(r1), sign(r2), sign(r3))  [5M]
  "pattern_123_1m", // 3-bar return direction pattern  [1M]
  "bb4_sequence_5m", // bb4_pct_b trend over 3 bars: mean(diff(bb4_pct_b[0..3]))  [5M]
  "bb4_sequence_1m", // bb4_pct_b trend over 3 bars  [1M]
] as const;

// ---------------------------------------------------------------------------
// Category: time_session (12)
// ---------------------------------------------------------------------------
const TIME_SESSION = [
  "hour_sin", // sin(2π * utc_hour / 24)  cyclical encoding
  "hour_cos", // cos(2π * utc_hour / 24)  cyclical encoding
  "dow_sin", // sin(2π * day_of_week / 7)  cyclical encoding
  "dow_cos", // cos(2π * day_of_week / 7)  cyclical encoding
  "is_asia_session", // 1 if 00:00–08:00 UTC, else 0
  "is_europe_session", // 1 if 08:00–16:00 UTC, else 0
  "is_us_session", // 1 if 13:30–22:00 UTC, else 0
  "is_funding_window", // 1 if within 15min of 00:00/08:00/16:00 UTC, else 0
  "is_market_open_window", // 1 if within 2h of any session open, else 0
  "minutes_since_hour_sin", // sin(2π * minute / 60)
  "minutes_since_hour_cos", // cos(2π * minute / 60)
  "is_top_of_hour", // 1 if minute < 5 or minute >= 55, else 0
] as const;

// ---------------------------------------------------------------------------
// FEATURE_CATEGORIES: maps category name → feature name list
// FEATURE_WEIGHT CommonCode group maps to these category keys.
// ---------------------------------------------------------------------------
export const FEATURE_CATEGORIES: Record<string, readonly string[]> = {
  price_position: [...PRICE_POSITION_5M, ...PRICE_POSITION_1M, ...PRICE_POSITION_CROSS] as const,
  momentum: [...MOMENTUM_5M, ...MOMENTUM_1M, ...MOMENTUM_CROSS] as const,
  volatility: [...VOLATILITY_5M, ...VOLATILITY_1M, ...VOLATILITY_CROSS] as const,
  trend: [...TREND_5M, ...TREND_1M, ...TREND_CROSS] as const,
  time_series: [...TIME_SERIES_5M, ...TIME_SERIES_1M, ...TIME_SERIES_CROSS] as const,
  time_session: [...TIME_SESSION] as const,
};

// ---------------------------------------------------------------------------
// FEATURE_NAMES: canonical ordered array of all 202 feature names.
// Index i corresponds to embedding[i] in the Vector entity.
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
  ...TIME_SESSION,
];

// ---------------------------------------------------------------------------
// VECTOR_DIM: canonical dimension constant. Must equal FEATURE_NAMES.length.
// ---------------------------------------------------------------------------
export const VECTOR_DIM = 202 as const;
