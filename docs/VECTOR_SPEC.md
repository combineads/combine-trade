# VECTOR_SPEC.md — 202-Dimensional Feature Vector Specification

## Overview

Every 5M and 1M closed candle produces a 202-dimensional feature vector (`Vector.embedding`).
The vector is stored as `vector(202)` (pgvector) and used for KNN-based signal validation.

- **Dimension**: 202
- **Source timeframes**: 5M and 1M only
- **Normalization**: Median/IQR per feature, computed during WFO in-sample window
- **Source code**: `src/vectors/features.ts`

## Category Budget

| Category | Count | FEATURE_WEIGHT group key |
|---|---|---|
| price_position | 40 | `bb4_position`, `bb20_position`, `ma_position` |
| momentum | 30 | `rsi_momentum`, `return_momentum` |
| volatility | 30 | `atr_volatility`, `band_volatility` |
| trend | 40 | `ma_trend`, `slope_trend` |
| time_series | 50 | `lagged_features`, `rolling_stats` |
| time_session | 12 | `session_context` |
| **TOTAL** | **202** | |

## Normalization Method

All features are normalized using Median/IQR (robust scaling):

```
normalized = (x - median(x)) / IQR(x)
```

where `IQR(x) = Q75(x) - Q25(x)`.

- Parameters (`median`, `IQR`) are computed per feature over the WFO in-sample window.
- Features with `IQR == 0` are set to `0.0` (constant feature → no discriminating power).
- Clipping: values outside [-5, +5] after normalization are clipped to prevent outlier dominance.

---

## Feature Reference

### Category: price_position (indices 0–39)

Features measuring where the current price sits relative to Bollinger Bands and Moving Averages.

#### 5M price position (indices 0–16)

| # | Name | Formula | Source | Notes |
|---|------|---------|--------|-------|
| 0 | `bb20_pct_b_5m` | (close − bb20_lower) / (bb20_upper − bb20_lower) | 5M candle + AllIndicators | 0=lower band, 1=upper band |
| 1 | `bb20_upper_dist_5m` | (bb20_upper − close) / close | 5M | Distance to upper band |
| 2 | `bb20_lower_dist_5m` | (close − bb20_lower) / close | 5M | Distance from lower band |
| 3 | `bb20_bandwidth_5m` | (bb20_upper − bb20_lower) / bb20_middle | 5M | Relative band width |
| 4 | `bb4_pct_b_5m` | (close − bb4_lower) / (bb4_upper − bb4_lower) | 5M | BB4(4,4) position |
| 5 | `bb4_upper_dist_5m` | (bb4_upper − close) / close | 5M | |
| 6 | `bb4_lower_dist_5m` | (close − bb4_lower) / close | 5M | |
| 7 | `bb4_bandwidth_5m` | (bb4_upper − bb4_lower) / bb4_middle | 5M | BB4 relative width |
| 8 | `close_vs_sma20_5m` | (close − sma20) / sma20 | 5M | |
| 9 | `close_vs_sma60_5m` | (close − sma60) / sma60 | 5M | |
| 10 | `close_vs_sma120_5m` | (close − sma120) / sma120 | 5M | |
| 11 | `close_vs_ema20_5m` | (close − ema20) / ema20 | 5M | |
| 12 | `close_vs_ema60_5m` | (close − ema60) / ema60 | 5M | |
| 13 | `close_vs_ema120_5m` | (close − ema120) / ema120 | 5M | |
| 14 | `high_vs_bb20upper_5m` | (high − bb20_upper) / close | 5M | Positive = wick above upper |
| 15 | `low_vs_bb20lower_5m` | (bb20_lower − low) / close | 5M | Positive = wick below lower |
| 16 | `bb4_mid_vs_bb20mid_5m` | (bb4_middle − bb20_middle) / bb20_middle | 5M | |

#### 1M price position (indices 17–33)

| # | Name | Formula | Source |
|---|------|---------|--------|
| 17 | `bb20_pct_b_1m` | (close − bb20_lower) / (bb20_upper − bb20_lower) | 1M |
| 18 | `bb20_upper_dist_1m` | (bb20_upper − close) / close | 1M |
| 19 | `bb20_lower_dist_1m` | (close − bb20_lower) / close | 1M |
| 20 | `bb20_bandwidth_1m` | (bb20_upper − bb20_lower) / bb20_middle | 1M |
| 21 | `bb4_pct_b_1m` | (close − bb4_lower) / (bb4_upper − bb4_lower) | 1M |
| 22 | `bb4_upper_dist_1m` | (bb4_upper − close) / close | 1M |
| 23 | `bb4_lower_dist_1m` | (close − bb4_lower) / close | 1M |
| 24 | `bb4_bandwidth_1m` | (bb4_upper − bb4_lower) / bb4_middle | 1M |
| 25 | `close_vs_sma20_1m` | (close − sma20) / sma20 | 1M |
| 26 | `close_vs_sma60_1m` | (close − sma60) / sma60 | 1M |
| 27 | `close_vs_sma120_1m` | (close − sma120) / sma120 | 1M |
| 28 | `close_vs_ema20_1m` | (close − ema20) / ema20 | 1M |
| 29 | `close_vs_ema60_1m` | (close − ema60) / ema60 | 1M |
| 30 | `close_vs_ema120_1m` | (close − ema120) / ema120 | 1M |
| 31 | `high_vs_bb20upper_1m` | (high − bb20_upper) / close | 1M |
| 32 | `low_vs_bb20lower_1m` | (bb20_lower − low) / close | 1M |
| 33 | `bb4_mid_vs_bb20mid_1m` | (bb4_middle − bb20_middle) / bb20_middle | 1M |

#### Cross-timeframe price position (indices 34–39)

| # | Name | Formula | Notes |
|---|------|---------|-------|
| 34 | `bb20_pct_b_ratio` | bb20_pct_b_5m − bb20_pct_b_1m | 5M/1M divergence |
| 35 | `bb4_pct_b_ratio` | bb4_pct_b_5m − bb4_pct_b_1m | 5M/1M divergence |
| 36 | `close_vs_sma20_ratio` | close_vs_sma20_5m − close_vs_sma20_1m | |
| 37 | `close_vs_ema20_ratio` | close_vs_ema20_5m − close_vs_ema20_1m | |
| 38 | `squeeze_state_5m` | −1=squeeze, 0=normal, 1=expansion | From AllIndicators.squeeze [5M] |
| 39 | `squeeze_state_1m` | −1=squeeze, 0=normal, 1=expansion | From AllIndicators.squeeze [1M] |

---

### Category: momentum (indices 40–69)

Features measuring price and indicator velocity and direction.

#### 5M momentum (indices 40–48)

| # | Name | Formula | Source |
|---|------|---------|--------|
| 40 | `rsi14_5m` | rsi14 / 100 | 5M AllIndicators |
| 41 | `rsi14_diff_vs_50_5m` | (rsi14 − 50) / 50 | 5M |
| 42 | `return_1b_5m` | (close[0] − close[1]) / close[1] | 5M candle series |
| 43 | `return_2b_5m` | (close[0] − close[2]) / close[2] | 5M |
| 44 | `return_3b_5m` | (close[0] − close[3]) / close[3] | 5M |
| 45 | `return_5b_5m` | (close[0] − close[5]) / close[5] | 5M |
| 46 | `return_10b_5m` | (close[0] − close[10]) / close[10] | 5M |
| 47 | `roc_5b_5m` | same as return_5b_5m (Rate of Change) | 5M |
| 48 | `roc_10b_5m` | same as return_10b_5m | 5M |

#### 1M momentum (indices 49–57)

| # | Name | Formula | Source |
|---|------|---------|--------|
| 49 | `rsi14_1m` | rsi14 / 100 | 1M |
| 50 | `rsi14_diff_vs_50_1m` | (rsi14 − 50) / 50 | 1M |
| 51 | `return_1b_1m` | (close[0] − close[1]) / close[1] | 1M |
| 52 | `return_2b_1m` | (close[0] − close[2]) / close[2] | 1M |
| 53 | `return_3b_1m` | (close[0] − close[3]) / close[3] | 1M |
| 54 | `return_5b_1m` | (close[0] − close[5]) / close[5] | 1M |
| 55 | `return_10b_1m` | (close[0] − close[10]) / close[10] | 1M |
| 56 | `roc_5b_1m` | same as return_5b_1m | 1M |
| 57 | `roc_10b_1m` | same as return_10b_1m | 1M |

#### Cross-timeframe and composite momentum (indices 58–69)

| # | Name | Formula | Notes |
|---|------|---------|-------|
| 58 | `rsi_divergence` | rsi14_5m − rsi14_1m | Timeframe RSI spread |
| 59 | `return_1b_ratio` | return_1b_5m − return_1b_1m | Timeframe momentum spread |
| 60 | `momentum_alignment` | sign(return_1b_5m) == sign(return_1b_1m) → 1 else −1 | |
| 61 | `bb20_pct_b_change_5m` | bb20_pct_b_5m[0] − bb20_pct_b_5m[1] | 1-bar delta |
| 62 | `bb4_pct_b_change_5m` | bb4_pct_b_5m[0] − bb4_pct_b_5m[1] | 1-bar delta |
| 63 | `bb20_pct_b_change_1m` | bb20_pct_b_1m[0] − bb20_pct_b_1m[1] | 1-bar delta |
| 64 | `bb4_pct_b_change_1m` | bb4_pct_b_1m[0] − bb4_pct_b_1m[1] | 1-bar delta |
| 65 | `rsi14_slope_5m` | (rsi14_5m[0] − rsi14_5m[1]) / 100 | Normalized RSI change |
| 66 | `rsi14_slope_1m` | (rsi14_1m[0] − rsi14_1m[1]) / 100 | |
| 67 | `price_vs_bb20mid_velocity_5m` | close_vs_bb20mid_5m[0] − close_vs_bb20mid_5m[1] | BB mid crossing speed |
| 68 | `price_vs_bb20mid_velocity_1m` | close_vs_bb20mid_1m[0] − close_vs_bb20mid_1m[1] | |
| 69 | `rsi14_zscore_5m` | (rsi14_5m − rsi14_mean3_5m) / rsi14_std3_5m | Local RSI z-score |

---

### Category: volatility (indices 70–99)

Features measuring candle size, wick structure, and band width.

#### 5M volatility (indices 70–82)

| # | Name | Formula | Source |
|---|------|---------|--------|
| 70 | `atr14_5m` | atr14 / close | 5M — ATR relative to price |
| 71 | `atr14_norm_5m` | atr14 / (bb20_upper − bb20_lower) | 5M — ATR vs band width |
| 72 | `body_size_5m` | \|close − open\| / close | 5M |
| 73 | `body_ratio_5m` | \|close − open\| / (high − low) | 5M — body fraction |
| 74 | `upper_wick_5m` | (high − max(open, close)) / atr14 | 5M |
| 75 | `lower_wick_5m` | (min(open, close) − low) / atr14 | 5M |
| 76 | `wick_total_5m` | (upper_wick_abs + lower_wick_abs) / (high − low) | 5M — total wick fraction |
| 77 | `high_low_range_5m` | (high − low) / close | 5M — candle total range |
| 78 | `candle_range_vs_bb20bw_5m` | (high − low) / (bb20_upper − bb20_lower) | 5M |
| 79 | `squeeze_intensity_5m` | bb20_bandwidth[0] / mean(bb20_bandwidth[0..19]) | 5M — relative to 20-bar avg |
| 80 | `vol_regime_5m` | atr14[0] / mean(atr14[0..19]) | 5M — ATR regime ratio |
| 81 | `atr_change_1b_5m` | (atr14[0] − atr14[1]) / atr14[1] | 5M — 1-bar ATR change |
| 82 | `bb20_bandwidth_vs_sma_5m` | (bb20_bw[0] − mean(bb20_bw[0..4])) / mean(bb20_bw[0..4]) | 5M |

#### 1M volatility (indices 83–95)

| # | Name | Formula | Source |
|---|------|---------|--------|
| 83 | `atr14_1m` | atr14 / close | 1M |
| 84 | `atr14_norm_1m` | atr14 / (bb20_upper − bb20_lower) | 1M |
| 85 | `body_size_1m` | \|close − open\| / close | 1M |
| 86 | `body_ratio_1m` | \|close − open\| / (high − low) | 1M |
| 87 | `upper_wick_1m` | (high − max(open, close)) / atr14 | 1M |
| 88 | `lower_wick_1m` | (min(open, close) − low) / atr14 | 1M |
| 89 | `wick_total_1m` | (upper_wick_abs + lower_wick_abs) / (high − low) | 1M |
| 90 | `high_low_range_1m` | (high − low) / close | 1M |
| 91 | `candle_range_vs_bb20bw_1m` | (high − low) / (bb20_upper − bb20_lower) | 1M |
| 92 | `squeeze_intensity_1m` | bb20_bandwidth[0] / mean(bb20_bandwidth[0..19]) | 1M |
| 93 | `vol_regime_1m` | atr14[0] / mean(atr14[0..19]) | 1M |
| 94 | `atr_change_1b_1m` | (atr14[0] − atr14[1]) / atr14[1] | 1M |
| 95 | `bb20_bandwidth_vs_sma_1m` | (bb20_bw[0] − mean(bb20_bw[0..4])) / mean(bb20_bw[0..4]) | 1M |

#### Cross-timeframe volatility (indices 96–99)

| # | Name | Formula | Notes |
|---|------|---------|-------|
| 96 | `atr_ratio_5m_vs_1m` | atr14_norm_5m / atr14_norm_1m | Relative volatility |
| 97 | `bandwidth_ratio_5m_vs_1m` | bb20_bandwidth_5m / bb20_bandwidth_1m | |
| 98 | `vol_divergence` | vol_regime_5m − vol_regime_1m | Regime difference |
| 99 | `squeeze_co_occurrence` | squeeze_state_5m + squeeze_state_1m | −2=both squeeze |

---

### Category: trend (indices 100–139)

Features measuring moving average orientation and slope.

#### 5M trend (indices 100–112)

| # | Name | Formula | Source |
|---|------|---------|--------|
| 100 | `sma20_slope_5m` | (sma20[0] − sma20[1]) / sma20[1] | 5M |
| 101 | `sma60_slope_5m` | (sma60[0] − sma60[1]) / sma60[1] | 5M |
| 102 | `sma120_slope_5m` | (sma120[0] − sma120[1]) / sma120[1] | 5M |
| 103 | `ema20_slope_5m` | (ema20[0] − ema20[1]) / ema20[1] | 5M |
| 104 | `ema60_slope_5m` | (ema60[0] − ema60[1]) / ema60[1] | 5M |
| 105 | `ema120_slope_5m` | (ema120[0] − ema120[1]) / ema120[1] | 5M |
| 106 | `sma20_vs_sma60_5m` | (sma20 − sma60) / sma60 | 5M |
| 107 | `sma60_vs_sma120_5m` | (sma60 − sma120) / sma120 | 5M |
| 108 | `ema20_vs_ema60_5m` | (ema20 − ema60) / ema60 | 5M |
| 109 | `ema60_vs_ema120_5m` | (ema60 − ema120) / ema120 | 5M |
| 110 | `ema20_vs_sma20_5m` | (ema20 − sma20) / sma20 | 5M — EMA lag indicator |
| 111 | `ema60_vs_sma60_5m` | (ema60 − sma60) / sma60 | 5M |
| 112 | `ma_alignment_5m` | 1 if sma20>sma60>sma120, −1 if reversed, else 0 | 5M |

#### 1M trend (indices 113–125)

| # | Name | Formula | Source |
|---|------|---------|--------|
| 113 | `sma20_slope_1m` | (sma20[0] − sma20[1]) / sma20[1] | 1M |
| 114 | `sma60_slope_1m` | (sma60[0] − sma60[1]) / sma60[1] | 1M |
| 115 | `sma120_slope_1m` | (sma120[0] − sma120[1]) / sma120[1] | 1M |
| 116 | `ema20_slope_1m` | (ema20[0] − ema20[1]) / ema20[1] | 1M |
| 117 | `ema60_slope_1m` | (ema60[0] − ema60[1]) / ema60[1] | 1M |
| 118 | `ema120_slope_1m` | (ema120[0] − ema120[1]) / ema120[1] | 1M |
| 119 | `sma20_vs_sma60_1m` | (sma20 − sma60) / sma60 | 1M |
| 120 | `sma60_vs_sma120_1m` | (sma60 − sma120) / sma120 | 1M |
| 121 | `ema20_vs_ema60_1m` | (ema20 − ema60) / ema60 | 1M |
| 122 | `ema60_vs_ema120_1m` | (ema60 − ema120) / ema120 | 1M |
| 123 | `ema20_vs_sma20_1m` | (ema20 − sma20) / sma20 | 1M |
| 124 | `ema60_vs_sma60_1m` | (ema60 − sma60) / sma60 | 1M |
| 125 | `ma_alignment_1m` | 1 if sma20>sma60>sma120, −1 if reversed, else 0 | 1M |

#### Cross-timeframe trend (indices 126–139)

| # | Name | Formula | Notes |
|---|------|---------|-------|
| 126 | `sma20_ratio_5m_1m` | sma20_5m / sma20_1m − 1 | Spread between timeframes |
| 127 | `sma60_ratio_5m_1m` | sma60_5m / sma60_1m − 1 | |
| 128 | `sma120_ratio_5m_1m` | sma120_5m / sma120_1m − 1 | |
| 129 | `ema20_ratio_5m_1m` | ema20_5m / ema20_1m − 1 | |
| 130 | `ema60_ratio_5m_1m` | ema60_5m / ema60_1m − 1 | |
| 131 | `ema120_ratio_5m_1m` | ema120_5m / ema120_1m − 1 | |
| 132 | `trend_alignment_5m` | sign(s20_slope) + sign(s60_slope) + sign(s120_slope) | 5M — range [−3, 3] |
| 133 | `trend_alignment_1m` | sign(s20_slope) + sign(s60_slope) + sign(s120_slope) | 1M |
| 134 | `ma_cross_signal_5m` | sign(ema20_vs_sma20_5m) | 5M — +1=bullish, −1=bearish |
| 135 | `ma_cross_signal_1m` | sign(ema20_vs_sma20_1m) | 1M |
| 136 | `slope_agreement_5m_1m` | sign(sma20_slope_5m) == sign(sma20_slope_1m) → 1 else −1 | |
| 137 | `sma20_angle_5m` | atan(sma20_slope_5m) / (π/2) | Normalized to [−1, 1] |
| 138 | `sma20_angle_1m` | atan(sma20_slope_1m) / (π/2) | |
| 139 | `trend_strength_composite` | (ma_alignment_5m + ma_alignment_1m) / 2 | |

---

### Category: time_series (indices 140–189)

Lagged features and rolling statistics capturing recent history in the series.

#### 5M lagged and rolling (indices 140–161)

| # | Name | Formula | Source |
|---|------|---------|--------|
| 140 | `bb20_pct_b_lag1_5m` | bb20_pct_b_5m at t−1 | 5M |
| 141 | `bb20_pct_b_lag2_5m` | bb20_pct_b_5m at t−2 | 5M |
| 142 | `bb20_pct_b_lag3_5m` | bb20_pct_b_5m at t−3 | 5M |
| 143 | `bb4_pct_b_lag1_5m` | bb4_pct_b_5m at t−1 | 5M |
| 144 | `bb4_pct_b_lag2_5m` | bb4_pct_b_5m at t−2 | 5M |
| 145 | `bb4_pct_b_lag3_5m` | bb4_pct_b_5m at t−3 | 5M |
| 146 | `rsi14_lag1_5m` | rsi14_5m/100 at t−1 | 5M |
| 147 | `rsi14_lag2_5m` | rsi14_5m/100 at t−2 | 5M |
| 148 | `rsi14_lag3_5m` | rsi14_5m/100 at t−3 | 5M |
| 149 | `return_lag1_5m` | (close[1] − close[2]) / close[2] | 5M — return of bar t−1 |
| 150 | `return_lag2_5m` | (close[2] − close[3]) / close[3] | 5M |
| 151 | `return_lag3_5m` | (close[3] − close[4]) / close[4] | 5M |
| 152 | `body_ratio_lag1_5m` | body_ratio at t−1 | 5M |
| 153 | `body_ratio_lag2_5m` | body_ratio at t−2 | 5M |
| 154 | `high_low_range_lag1_5m` | high_low_range at t−1 | 5M |
| 155 | `bb20_pct_b_mean3_5m` | mean(bb20_pct_b_5m[0..2]) | 5M — 3-bar rolling mean |
| 156 | `bb20_pct_b_std3_5m` | std(bb20_pct_b_5m[0..2]) | 5M — 3-bar rolling std |
| 157 | `rsi14_mean3_5m` | mean(rsi14_5m[0..2]) / 100 | 5M |
| 158 | `rsi14_std3_5m` | std(rsi14_5m[0..2]) / 100 | 5M |
| 159 | `return_sum3_5m` | sum(return[0..2]) | 5M — 3-bar cumulative return |
| 160 | `return_std3_5m` | std(return[0..2]) | 5M — 3-bar return volatility |
| 161 | `atr14_lag1_5m` | atr14 / close at t−1 | 5M |

#### 1M lagged and rolling (indices 162–183)

| # | Name | Formula | Source |
|---|------|---------|--------|
| 162 | `bb20_pct_b_lag1_1m` | bb20_pct_b_1m at t−1 | 1M |
| 163 | `bb20_pct_b_lag2_1m` | bb20_pct_b_1m at t−2 | 1M |
| 164 | `bb20_pct_b_lag3_1m` | bb20_pct_b_1m at t−3 | 1M |
| 165 | `bb4_pct_b_lag1_1m` | bb4_pct_b_1m at t−1 | 1M |
| 166 | `bb4_pct_b_lag2_1m` | bb4_pct_b_1m at t−2 | 1M |
| 167 | `bb4_pct_b_lag3_1m` | bb4_pct_b_1m at t−3 | 1M |
| 168 | `rsi14_lag1_1m` | rsi14_1m/100 at t−1 | 1M |
| 169 | `rsi14_lag2_1m` | rsi14_1m/100 at t−2 | 1M |
| 170 | `rsi14_lag3_1m` | rsi14_1m/100 at t−3 | 1M |
| 171 | `return_lag1_1m` | (close[1] − close[2]) / close[2] | 1M |
| 172 | `return_lag2_1m` | (close[2] − close[3]) / close[3] | 1M |
| 173 | `return_lag3_1m` | (close[3] − close[4]) / close[4] | 1M |
| 174 | `body_ratio_lag1_1m` | body_ratio at t−1 | 1M |
| 175 | `body_ratio_lag2_1m` | body_ratio at t−2 | 1M |
| 176 | `high_low_range_lag1_1m` | high_low_range at t−1 | 1M |
| 177 | `bb20_pct_b_mean3_1m` | mean(bb20_pct_b_1m[0..2]) | 1M |
| 178 | `bb20_pct_b_std3_1m` | std(bb20_pct_b_1m[0..2]) | 1M |
| 179 | `rsi14_mean3_1m` | mean(rsi14_1m[0..2]) / 100 | 1M |
| 180 | `rsi14_std3_1m` | std(rsi14_1m[0..2]) / 100 | 1M |
| 181 | `return_sum3_1m` | sum(return[0..2]) | 1M |
| 182 | `return_std3_1m` | std(return[0..2]) | 1M |
| 183 | `atr14_lag1_1m` | atr14 / close at t−1 | 1M |

#### Cross time-series (indices 184–189)

| # | Name | Formula | Notes |
|---|------|---------|-------|
| 184 | `bb20_pct_b_lag1_ratio` | bb20_pct_b_lag1_5m − bb20_pct_b_lag1_1m | Lagged divergence |
| 185 | `rsi14_lag1_ratio` | rsi14_lag1_5m − rsi14_lag1_1m | Lagged RSI divergence |
| 186 | `pattern_123_5m` | sign(r[0]) + sign(r[1]) + sign(r[2]) | 5M — 3-bar direction count |
| 187 | `pattern_123_1m` | sign(r[0]) + sign(r[1]) + sign(r[2]) | 1M |
| 188 | `bb4_sequence_5m` | mean(diff(bb4_pct_b[0..3])) | 5M — bb4 %B momentum over 3 bars |
| 189 | `bb4_sequence_1m` | mean(diff(bb4_pct_b[0..3])) | 1M |

---

### Category: time_session (indices 190–201)

Temporal context features using cyclical encoding to avoid ordinal discontinuity.

| # | Name | Formula | Notes |
|---|------|---------|-------|
| 190 | `hour_sin` | sin(2π × utc_hour / 24) | Cyclical hour encoding |
| 191 | `hour_cos` | cos(2π × utc_hour / 24) | |
| 192 | `dow_sin` | sin(2π × day_of_week / 7) | Monday=0 |
| 193 | `dow_cos` | cos(2π × day_of_week / 7) | |
| 194 | `is_asia_session` | 1 if 00:00–08:00 UTC else 0 | Asia market hours |
| 195 | `is_europe_session` | 1 if 08:00–16:00 UTC else 0 | Europe market hours |
| 196 | `is_us_session` | 1 if 13:30–22:00 UTC else 0 | US market hours |
| 197 | `is_funding_window` | 1 if within 15min of 00/08/16 UTC else 0 | Funding rate window |
| 198 | `is_market_open_window` | 1 if within 2h of any session open else 0 | From TradeBlock rules |
| 199 | `minutes_since_hour_sin` | sin(2π × minute / 60) | Sub-hour position |
| 200 | `minutes_since_hour_cos` | cos(2π × minute / 60) | |
| 201 | `is_top_of_hour` | 1 if minute < 5 or minute ≥ 55 else 0 | Near-hourly candle close |

---

## Data Requirements per Feature

| Category | 5M history needed | 1M history needed |
|---|---|---|
| price_position | 1 candle (+ indicators) | 1 candle (+ indicators) |
| momentum | 11 candles | 11 candles |
| volatility | 20 candles (for regime avg) | 20 candles |
| trend | 2 candles (for slope) | 2 candles |
| time_series | 5 candles (lag3 + returns) | 5 candles |
| time_session | candle open_time | candle open_time |

Minimum required: 20 closed 5M candles + 20 closed 1M candles with valid AllIndicators.

## Null / Missing Indicator Handling

When an indicator is null (insufficient warmup data):
- The corresponding feature is set to `0.0` (neutral value post-normalization).
- This matches the Median/IQR normalization behavior: a zero normalized value is indistinguishable from the median, which is the safest fallback.
- Vectors with more than 20% null-derived features should be excluded from KNN training (but may still be scored in inference mode).

## FEATURE_WEIGHT CommonCode Mapping

The `FEATURE_WEIGHT` CommonCode group stores per-category weights for KNN distance computation:

```
FEATURE_WEIGHT / bb4_position    → applies to bb4_pct_b_5m, bb4_pct_b_1m, ...
FEATURE_WEIGHT / bb20_position   → applies to bb20_pct_b_5m, bb20_pct_b_1m, ...
FEATURE_WEIGHT / ma_position     → applies to close_vs_sma20_*, close_vs_ema20_*, ...
FEATURE_WEIGHT / rsi_momentum    → applies to rsi14_5m, rsi14_1m, rsi_divergence, ...
FEATURE_WEIGHT / return_momentum → applies to return_*_5m, return_*_1m, ...
FEATURE_WEIGHT / atr_volatility  → applies to atr14_*, vol_regime_*, ...
FEATURE_WEIGHT / band_volatility → applies to bandwidth_*, squeeze_intensity_*, ...
FEATURE_WEIGHT / ma_trend        → applies to sma*_vs_sma*, ema*_vs_ema*, ...
FEATURE_WEIGHT / slope_trend     → applies to *_slope_*, ma_alignment_*, ...
FEATURE_WEIGHT / lagged_features → applies to *_lag*_*, pattern_123_*, ...
FEATURE_WEIGHT / rolling_stats   → applies to *_mean3_*, *_std3_*, *_sum3_*, ...
FEATURE_WEIGHT / session_context → applies to hour_sin/cos, is_*_session, ...
```

Default weight: `1.0` for all categories. WFO may tune these weights.
`ANCHOR` group protects structural anchors from WFO modification.

## Change History

| Date | Author | Change |
|---|---|---|
| 2026-04-04 | T-05-000 | Initial specification — 202 features, 6 categories |
