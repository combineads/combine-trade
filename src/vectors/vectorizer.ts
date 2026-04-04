/**
 * Vectorizer — converts candle OHLCV + AllIndicators into a 202-dimensional Float32Array.
 *
 * Feature order follows FEATURE_NAMES from features.ts exactly (indices 0–201).
 * NaN / Infinity / null inputs are always coerced to 0.0.
 * No normalization is applied here — raw feature values only (T-05-010 handles that).
 */

import { BB4_CONFIG, BB20_CONFIG } from "@/core/constants";
import type { Candle, VectorTimeframe } from "@/core/types";
import {
  calcATRSeries,
  calcBB,
  calcEMASeries,
  calcRSISeries,
  calcSMASeries,
  candlesToCloses,
} from "@/indicators/index";
import type { AllIndicators } from "@/indicators/types";
import { VECTOR_DIM } from "@/vectors/features";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Converts a raw number to a safe float32 value. NaN/Infinity → 0.0. */
function safe(v: number): number {
  return Number.isFinite(v) ? v : 0.0;
}

/** Computes mean of a number array. Returns 0 for empty arrays. */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

/** Computes population standard deviation of a number array. Returns 0 for length <= 1. */
function std(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  let sumSq = 0;
  for (const v of arr) sumSq += (v - m) * (v - m);
  return Math.sqrt(sumSq / arr.length);
}

/** Math.sign with explicit 0-handling. */
function sign(v: number): number {
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

/**
 * Encodes a SqueezeState to a numeric value.
 * squeeze=-1, normal=0, expansion=1.
 */
function encodeSqueezeState(state: AllIndicators["squeeze"]): number {
  if (state === "squeeze") return -1;
  if (state === "expansion") return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Internal context: pre-computed series from candle history
// ---------------------------------------------------------------------------

type VectorizerCtx = {
  /** candles newest-last, length >= 0 */
  candles: Candle[];
  /** current-bar AllIndicators */
  ind: AllIndicators;
  timeframe: VectorTimeframe;

  // ---- derived series computed once ----
  /** candle.close as numbers, newest-last */
  closes: number[];
  /** candle.high as numbers */
  highs: number[];
  /** candle.low as numbers */
  lows: number[];
  /** candle.open as numbers */
  opens: number[];

  // ---- BB bandwidth series (for squeeze intensity) ----
  /** BB20 bandwidth for each bar (newest-last), safe(). Length may be 0. */
  bb20BwSeries: number[];
  /** BB4 %B for each bar (newest-last). Length may be 0. */
  bb4PctBSeries: number[];
  /** BB20 %B for each bar (newest-last). Length may be 0. */
  bb20PctBSeries: number[];
  /** ATR series (newest-last). Length may be 0. */
  atr14Series: number[];
  /** RSI series (newest-last) / 100. Length may be 0. */
  rsi14Series: number[];

  // ---- SMA/EMA series (last 2 bars needed for slope) ----
  sma20Series: number[];
  sma60Series: number[];
  sma120Series: number[];
  ema20Series: number[];
  ema60Series: number[];
  ema120Series: number[];
};

/**
 * Builds the pre-computed series needed by feature extractors.
 * Uses the *Series indicator functions to get historical values.
 */
function buildCtx(
  candles: Candle[],
  indicators: AllIndicators,
  timeframe: VectorTimeframe,
): VectorizerCtx {
  const closes = candlesToCloses(candles);
  const highs = candles.map((c) => c.high.toNumber());
  const lows = candles.map((c) => c.low.toNumber());
  const opens = candles.map((c) => c.open.toNumber());

  // BB20 bandwidth series from full candle history
  const bb20BwSeries: number[] = [];
  const bb20PctBSeries: number[] = [];
  const bb4PctBSeries: number[] = [];

  const minBB20 = BB20_CONFIG.length;
  const minBB4 = BB4_CONFIG.length;

  // For each bar i (from oldest required to newest), compute the indicator value.
  // We keep newest-last ordering to match candles array convention.
  // Only compute as far back as we have candle data.
  const n = closes.length;
  for (let i = 0; i < n; i++) {
    const subCloses = closes.slice(0, i + 1);
    if (subCloses.length >= minBB20) {
      const bb20Result = calcBB(
        subCloses,
        BB20_CONFIG.length,
        BB20_CONFIG.stddev,
        subCloses[subCloses.length - 1] ?? 0,
      );
      if (bb20Result !== null) {
        bb20BwSeries.push(safe(bb20Result.bandwidth.toNumber()));
        bb20PctBSeries.push(safe(bb20Result.percentB.toNumber()));
      } else {
        bb20BwSeries.push(0);
        bb20PctBSeries.push(0);
      }
    } else {
      bb20BwSeries.push(0);
      bb20PctBSeries.push(0);
    }

    if (subCloses.length >= minBB4) {
      const bb4Result = calcBB(
        subCloses,
        BB4_CONFIG.length,
        BB4_CONFIG.stddev,
        subCloses[subCloses.length - 1] ?? 0,
      );
      if (bb4Result !== null) {
        bb4PctBSeries.push(safe(bb4Result.percentB.toNumber()));
      } else {
        bb4PctBSeries.push(0);
      }
    } else {
      bb4PctBSeries.push(0);
    }
  }

  // ATR series
  const atr14SeriesDecimal = calcATRSeries(highs, lows, closes);
  // atr14SeriesDecimal is aligned to the tail of the candles array (may be shorter)
  // Pad to length n with 0s at the front
  const atr14Series: number[] = [];
  const atrOffset = n - atr14SeriesDecimal.length;
  for (let i = 0; i < n; i++) {
    const idx = i - atrOffset;
    if (idx >= 0 && idx < atr14SeriesDecimal.length) {
      const v = atr14SeriesDecimal[idx];
      atr14Series.push(v !== undefined ? safe(v.toNumber()) : 0);
    } else {
      atr14Series.push(0);
    }
  }

  // RSI series / 100
  const rsi14SeriesDecimal = calcRSISeries(closes);
  const rsi14Series: number[] = [];
  const rsiOffset = n - rsi14SeriesDecimal.length;
  for (let i = 0; i < n; i++) {
    const idx = i - rsiOffset;
    if (idx >= 0 && idx < rsi14SeriesDecimal.length) {
      const v = rsi14SeriesDecimal[idx];
      rsi14Series.push(v !== undefined ? safe(v.toNumber() / 100) : 0);
    } else {
      rsi14Series.push(0);
    }
  }

  // SMA/EMA series (last value + previous value needed for slope)
  const sma20SeriesDecimal = calcSMASeries(closes, 20);
  const sma60SeriesDecimal = calcSMASeries(closes, 60);
  const sma120SeriesDecimal = calcSMASeries(closes, 120);
  const ema20SeriesDecimal = calcEMASeries(closes, 20);
  const ema60SeriesDecimal = calcEMASeries(closes, 60);
  const ema120SeriesDecimal = calcEMASeries(closes, 120);

  function padSeries(dec: ReturnType<typeof calcSMASeries>, totalLen: number): number[] {
    const arr: number[] = [];
    const offset = totalLen - dec.length;
    for (let i = 0; i < totalLen; i++) {
      const idx = i - offset;
      if (idx >= 0 && idx < dec.length) {
        const v = dec[idx];
        arr.push(v !== undefined ? safe(v.toNumber()) : 0);
      } else {
        arr.push(0);
      }
    }
    return arr;
  }

  const sma20Series = padSeries(sma20SeriesDecimal, n);
  const sma60Series = padSeries(sma60SeriesDecimal, n);
  const sma120Series = padSeries(sma120SeriesDecimal, n);
  const ema20Series = padSeries(ema20SeriesDecimal, n);
  const ema60Series = padSeries(ema60SeriesDecimal, n);
  const ema120Series = padSeries(ema120SeriesDecimal, n);

  return {
    candles,
    ind: indicators,
    timeframe,
    closes,
    highs,
    lows,
    opens,
    bb20BwSeries,
    bb4PctBSeries,
    bb20PctBSeries,
    atr14Series,
    rsi14Series,
    sma20Series,
    sma60Series,
    sma120Series,
    ema20Series,
    ema60Series,
    ema120Series,
  };
}

// ---------------------------------------------------------------------------
// Accessor helpers on ctx arrays (newest-last, index 0 = t, 1 = t-1, etc.)
// ---------------------------------------------------------------------------

/** Get value at lag (0=current, 1=previous, ...) from a newest-last series. Returns 0 if OOB. */
function getLag(series: number[], lag: number): number {
  const n = series.length;
  const idx = n - 1 - lag;
  if (idx < 0 || idx >= n) return 0;
  return series[idx] ?? 0;
}

// ---------------------------------------------------------------------------
// Feature extraction: price_position (40)
// ---------------------------------------------------------------------------

function extractPricePosition(ctx: VectorizerCtx): number[] {
  const { ind, closes, highs, lows } = ctx;
  const n = closes.length;
  const close = n > 0 ? (closes[n - 1] ?? 0) : 0;
  const high = n > 0 ? (highs[n - 1] ?? 0) : 0;
  const low = n > 0 ? (lows[n - 1] ?? 0) : 0;

  // Current indicators (5M context = primary timeframe passed in)
  const bb20 = ind.bb20;
  const bb4 = ind.bb4;
  const sma20 = ind.sma20?.toNumber() ?? 0;
  const sma60 = ind.sma60?.toNumber() ?? 0;
  const sma120 = ind.sma120?.toNumber() ?? 0;
  const ema20 = ind.ema20?.toNumber() ?? 0;
  const ema60 = ind.ema60?.toNumber() ?? 0;
  const ema120 = ind.ema120?.toNumber() ?? 0;

  // bb20 band values
  const bb20Upper = bb20?.upper.toNumber() ?? 0;
  const bb20Lower = bb20?.lower.toNumber() ?? 0;
  const bb20Middle = bb20?.middle.toNumber() ?? 0;
  const bb20BandWidth = bb20Upper - bb20Lower;

  // bb4 band values
  const bb4Upper = bb4?.upper.toNumber() ?? 0;
  const bb4Lower = bb4?.lower.toNumber() ?? 0;
  const bb4Middle = bb4?.middle.toNumber() ?? 0;
  const bb4BandWidth = bb4Upper - bb4Lower;

  // squeeze state encoding
  const squeezeState = encodeSqueezeState(ind.squeeze);

  // ---- 5M price position features (indices 0-16) ----
  const f: number[] = [];

  // 0: bb20_pct_b_5m
  f.push(safe(bb20 !== null ? (close - bb20Lower) / (bb20BandWidth === 0 ? 1 : bb20BandWidth) : 0));
  // 1: bb20_upper_dist_5m
  f.push(safe(bb20 !== null && close !== 0 ? (bb20Upper - close) / close : 0));
  // 2: bb20_lower_dist_5m
  f.push(safe(bb20 !== null && close !== 0 ? (close - bb20Lower) / close : 0));
  // 3: bb20_bandwidth_5m
  f.push(safe(bb20 !== null && bb20Middle !== 0 ? bb20BandWidth / bb20Middle : 0));
  // 4: bb4_pct_b_5m
  f.push(safe(bb4 !== null ? (close - bb4Lower) / (bb4BandWidth === 0 ? 1 : bb4BandWidth) : 0));
  // 5: bb4_upper_dist_5m
  f.push(safe(bb4 !== null && close !== 0 ? (bb4Upper - close) / close : 0));
  // 6: bb4_lower_dist_5m
  f.push(safe(bb4 !== null && close !== 0 ? (close - bb4Lower) / close : 0));
  // 7: bb4_bandwidth_5m
  f.push(safe(bb4 !== null && bb4Middle !== 0 ? bb4BandWidth / bb4Middle : 0));
  // 8: close_vs_sma20_5m
  f.push(safe(sma20 !== 0 ? (close - sma20) / sma20 : 0));
  // 9: close_vs_sma60_5m
  f.push(safe(sma60 !== 0 ? (close - sma60) / sma60 : 0));
  // 10: close_vs_sma120_5m
  f.push(safe(sma120 !== 0 ? (close - sma120) / sma120 : 0));
  // 11: close_vs_ema20_5m
  f.push(safe(ema20 !== 0 ? (close - ema20) / ema20 : 0));
  // 12: close_vs_ema60_5m
  f.push(safe(ema60 !== 0 ? (close - ema60) / ema60 : 0));
  // 13: close_vs_ema120_5m
  f.push(safe(ema120 !== 0 ? (close - ema120) / ema120 : 0));
  // 14: high_vs_bb20upper_5m
  f.push(safe(bb20 !== null && close !== 0 ? (high - bb20Upper) / close : 0));
  // 15: low_vs_bb20lower_5m
  f.push(safe(bb20 !== null && close !== 0 ? (bb20Lower - low) / close : 0));
  // 16: bb4_mid_vs_bb20mid_5m
  f.push(
    safe(
      bb20 !== null && bb4 !== null && bb20Middle !== 0 ? (bb4Middle - bb20Middle) / bb20Middle : 0,
    ),
  );

  // ---- 1M price position (indices 17–33): same formulas, same indicators ----
  // Since both timeframes are passed with the same indicators object, these
  // features duplicate the 5M values but represent the 1M perspective.
  // (The caller passes the correct timeframe's indicators.)
  f.push(safe(bb20 !== null ? (close - bb20Lower) / (bb20BandWidth === 0 ? 1 : bb20BandWidth) : 0)); // 17
  f.push(safe(bb20 !== null && close !== 0 ? (bb20Upper - close) / close : 0)); // 18
  f.push(safe(bb20 !== null && close !== 0 ? (close - bb20Lower) / close : 0)); // 19
  f.push(safe(bb20 !== null && bb20Middle !== 0 ? bb20BandWidth / bb20Middle : 0)); // 20
  f.push(safe(bb4 !== null ? (close - bb4Lower) / (bb4BandWidth === 0 ? 1 : bb4BandWidth) : 0)); // 21
  f.push(safe(bb4 !== null && close !== 0 ? (bb4Upper - close) / close : 0)); // 22
  f.push(safe(bb4 !== null && close !== 0 ? (close - bb4Lower) / close : 0)); // 23
  f.push(safe(bb4 !== null && bb4Middle !== 0 ? bb4BandWidth / bb4Middle : 0)); // 24
  f.push(safe(sma20 !== 0 ? (close - sma20) / sma20 : 0)); // 25
  f.push(safe(sma60 !== 0 ? (close - sma60) / sma60 : 0)); // 26
  f.push(safe(sma120 !== 0 ? (close - sma120) / sma120 : 0)); // 27
  f.push(safe(ema20 !== 0 ? (close - ema20) / ema20 : 0)); // 28
  f.push(safe(ema60 !== 0 ? (close - ema60) / ema60 : 0)); // 29
  f.push(safe(ema120 !== 0 ? (close - ema120) / ema120 : 0)); // 30
  f.push(safe(bb20 !== null && close !== 0 ? (high - bb20Upper) / close : 0)); // 31
  f.push(safe(bb20 !== null && close !== 0 ? (bb20Lower - low) / close : 0)); // 32
  f.push(
    safe(
      bb20 !== null && bb4 !== null && bb20Middle !== 0 ? (bb4Middle - bb20Middle) / bb20Middle : 0,
    ),
  ); // 33

  // ---- Cross-timeframe price position (indices 34–39) ----
  // Since we have one indicators object, cross-timeframe divergence = 0 (same values)
  const bb20PctB5m = f[0] ?? 0; // == f[17]
  const bb4PctB5m = f[4] ?? 0; // == f[21]
  const closeVsSma20_5m = f[8] ?? 0; // == f[25]
  const closeVsEma20_5m = f[11] ?? 0; // == f[28]
  const bb20PctB1m = f[17] ?? 0;
  const bb4PctB1m = f[21] ?? 0;
  const closeVsSma20_1m = f[25] ?? 0;
  const closeVsEma20_1m = f[28] ?? 0;

  f.push(safe(bb20PctB5m - bb20PctB1m)); // 34: bb20_pct_b_ratio
  f.push(safe(bb4PctB5m - bb4PctB1m)); // 35: bb4_pct_b_ratio
  f.push(safe(closeVsSma20_5m - closeVsSma20_1m)); // 36: close_vs_sma20_ratio
  f.push(safe(closeVsEma20_5m - closeVsEma20_1m)); // 37: close_vs_ema20_ratio
  f.push(safe(squeezeState)); // 38: squeeze_state_5m
  f.push(safe(squeezeState)); // 39: squeeze_state_1m

  return f; // length = 40
}

// ---------------------------------------------------------------------------
// Feature extraction: momentum (30)
// ---------------------------------------------------------------------------

function extractMomentum(ctx: VectorizerCtx): number[] {
  const { ind, closes, bb20PctBSeries, bb4PctBSeries, rsi14Series } = ctx;

  // null rsi14 → all rsi-derived features are 0.0
  const rsi14Raw = ind.rsi14?.toNumber() ?? null;
  const rsi14_norm = rsi14Raw !== null ? rsi14Raw / 100 : 0;
  const rsi14_diff = rsi14Raw !== null ? (rsi14Raw - 50) / 50 : 0;

  const f: number[] = [];

  // ---- 5M momentum (indices 40–48) ----
  f.push(safe(rsi14_norm)); // 40: rsi14_5m
  f.push(safe(rsi14_diff)); // 41: rsi14_diff_vs_50_5m

  // return_nb_5m: (close[0] - close[n]) / close[n]
  const c0 = getLag(closes, 0);
  const c1 = getLag(closes, 1);
  const c2 = getLag(closes, 2);
  const c3 = getLag(closes, 3);
  const c5 = getLag(closes, 5);
  const c10 = getLag(closes, 10);

  f.push(safe(c1 !== 0 ? (c0 - c1) / c1 : 0)); // 42: return_1b_5m
  f.push(safe(c2 !== 0 ? (c0 - c2) / c2 : 0)); // 43: return_2b_5m
  f.push(safe(c3 !== 0 ? (c0 - c3) / c3 : 0)); // 44: return_3b_5m
  f.push(safe(c5 !== 0 ? (c0 - c5) / c5 : 0)); // 45: return_5b_5m
  f.push(safe(c10 !== 0 ? (c0 - c10) / c10 : 0)); // 46: return_10b_5m
  f.push(safe(c5 !== 0 ? (c0 - c5) / c5 : 0)); // 47: roc_5b_5m (== return_5b_5m)
  f.push(safe(c10 !== 0 ? (c0 - c10) / c10 : 0)); // 48: roc_10b_5m (== return_10b_5m)

  // ---- 1M momentum (indices 49–57): same values (single indicators set) ----
  f.push(safe(rsi14_norm)); // 49
  f.push(safe(rsi14_diff)); // 50
  f.push(safe(c1 !== 0 ? (c0 - c1) / c1 : 0)); // 51
  f.push(safe(c2 !== 0 ? (c0 - c2) / c2 : 0)); // 52
  f.push(safe(c3 !== 0 ? (c0 - c3) / c3 : 0)); // 53
  f.push(safe(c5 !== 0 ? (c0 - c5) / c5 : 0)); // 54
  f.push(safe(c10 !== 0 ? (c0 - c10) / c10 : 0)); // 55
  f.push(safe(c5 !== 0 ? (c0 - c5) / c5 : 0)); // 56
  f.push(safe(c10 !== 0 ? (c0 - c10) / c10 : 0)); // 57

  // ---- Cross-timeframe momentum (indices 58–69) ----
  const rsi5m = rsi14_norm;
  const rsi1m = rsi14_norm; // same indicators
  const ret1b_5m = f[2] ?? 0; // return_1b_5m (relative index 2 = absolute 42)
  const ret1b_1m = f[11] ?? 0; // return_1b_1m (relative index 11 = absolute 51)

  f.push(safe(rsi5m - rsi1m)); // 58: rsi_divergence
  f.push(safe(ret1b_5m - ret1b_1m)); // 59: return_1b_ratio
  // 60: momentum_alignment — sign same = 1, else -1
  f.push(safe(sign(ret1b_5m) === sign(ret1b_1m) ? 1 : -1)); // 60

  // bb20_pct_b_change: current - previous bar
  const bb20PctB_curr = getLag(bb20PctBSeries, 0);
  const bb20PctB_prev = getLag(bb20PctBSeries, 1);
  const bb4PctB_curr = getLag(bb4PctBSeries, 0);
  const bb4PctB_prev = getLag(bb4PctBSeries, 1);

  f.push(safe(bb20PctB_curr - bb20PctB_prev)); // 61: bb20_pct_b_change_5m
  f.push(safe(bb4PctB_curr - bb4PctB_prev)); // 62: bb4_pct_b_change_5m
  f.push(safe(bb20PctB_curr - bb20PctB_prev)); // 63: bb20_pct_b_change_1m (same series)
  f.push(safe(bb4PctB_curr - bb4PctB_prev)); // 64: bb4_pct_b_change_1m (same series)

  // rsi14_slope = (rsi[0] - rsi[1]) / 100
  const rsiCurr = getLag(rsi14Series, 0); // already / 100
  const rsiPrev = getLag(rsi14Series, 1);
  f.push(safe(rsiCurr - rsiPrev)); // 65: rsi14_slope_5m (already normalized by 100 since series is /100)
  f.push(safe(rsiCurr - rsiPrev)); // 66: rsi14_slope_1m

  // price_vs_bb20mid_velocity: (close - bb20middle)[0] - (close - bb20middle)[1]
  // = (close[0] / bb20middle[0] - 1) - (close[1] / bb20middle[1] - 1)
  // Using the close_vs_bb20mid formula = (close - bb20middle) / bb20middle... but spec says velocity not ratio
  // From VECTOR_SPEC.md: close_vs_bb20mid_5m = (close - bb20_middle) (raw difference apparently)
  // The momentum spec says "BB mid crossing speed" — we'll use (close - bb20_middle) difference
  const bb20 = ctx.ind.bb20;
  const bb20Mid = bb20?.middle.toNumber() ?? 0;
  const closeMidDiff_curr = bb20Mid !== 0 ? c0 - bb20Mid : 0;

  // For t-1, re-compute: close[t-1] vs bb20_mid[t-1]
  // We need previous bb20 middle. We can approximate using prev sma from sma20Series.
  // Actually the BB20 middle IS the SMA20. So bb20Mid at t-1 = sma20Series[n-2].
  const sma20Prev = getLag(ctx.sma20Series, 1);
  const closePrev = c1;
  const closeMidDiff_prev = sma20Prev !== 0 ? closePrev - sma20Prev : 0;

  f.push(safe(closeMidDiff_curr - closeMidDiff_prev)); // 67: price_vs_bb20mid_velocity_5m
  f.push(safe(closeMidDiff_curr - closeMidDiff_prev)); // 68: price_vs_bb20mid_velocity_1m

  // rsi14_zscore_5m = (rsi14 - rsi14_mean3) / rsi14_std3
  const rsi0 = getLag(rsi14Series, 0);
  const rsi1 = getLag(rsi14Series, 1);
  const rsi2 = getLag(rsi14Series, 2);
  const rsiArr = [rsi0, rsi1, rsi2];
  const rsiMean3 = mean(rsiArr);
  const rsiStd3 = std(rsiArr);
  f.push(safe(rsiStd3 !== 0 ? (rsi0 - rsiMean3) / rsiStd3 : 0)); // 69: rsi14_zscore_5m

  return f; // length = 30
}

// ---------------------------------------------------------------------------
// Feature extraction: volatility (30)
// ---------------------------------------------------------------------------

function extractVolatility(ctx: VectorizerCtx): number[] {
  const { ind, closes, highs, lows, opens, bb20BwSeries, atr14Series } = ctx;
  const n = closes.length;

  const close = n > 0 ? (closes[n - 1] ?? 0) : 0;
  const high = n > 0 ? (highs[n - 1] ?? 0) : 0;
  const low = n > 0 ? (lows[n - 1] ?? 0) : 0;
  const openPrice = n > 0 ? (opens[n - 1] ?? 0) : 0;

  const atr14 = ind.atr14?.toNumber() ?? 0;
  const bb20 = ind.bb20;
  const bb20Upper = bb20?.upper.toNumber() ?? 0;
  const bb20Lower = bb20?.lower.toNumber() ?? 0;
  const bb20BandWidth = bb20Upper - bb20Lower;

  const bodyAbs = Math.abs(close - openPrice);
  const range = high - low;

  const upperWickAbs = Math.max(openPrice, close) !== 0 ? high - Math.max(openPrice, close) : 0;
  const lowerWickAbs = Math.min(openPrice, close) !== 0 ? Math.min(openPrice, close) - low : 0;

  // For squeeze_intensity: current_bw / mean(bw[0..19])
  const bwSlice20 = bb20BwSeries.slice(Math.max(0, n - 20));
  const bwMean20 = mean(bwSlice20);
  const bwCurr = getLag(bb20BwSeries, 0);

  // For vol_regime: atr14 / mean(atr14[0..19])
  const atrSlice20 = atr14Series.slice(Math.max(0, n - 20));
  const atrMean20 = mean(atrSlice20);
  const atrCurr = getLag(atr14Series, 0);

  // For bb20_bandwidth_vs_sma: (bw[0] - mean(bw[0..4])) / mean(bw[0..4])
  const bwSlice5 = bb20BwSeries.slice(Math.max(0, n - 5));
  const bwMean5 = mean(bwSlice5);

  // atr_change_1b
  const atrPrev = getLag(atr14Series, 1);

  const f: number[] = [];

  // ---- 5M volatility (indices 70–82) ----
  // 70: atr14_5m = atr14 / close
  f.push(safe(close !== 0 ? atr14 / close : 0));
  // 71: atr14_norm_5m = atr14 / (bb20_upper - bb20_lower)
  f.push(safe(bb20BandWidth !== 0 ? atr14 / bb20BandWidth : 0));
  // 72: body_size_5m = |close - open| / open
  f.push(safe(openPrice !== 0 ? bodyAbs / openPrice : 0));
  // 73: body_ratio_5m = |close - open| / (high - low)
  f.push(safe(range !== 0 ? bodyAbs / range : 0));
  // 74: upper_wick_5m = (high - max(open, close)) / high * 1.5
  f.push(safe(high !== 0 ? (upperWickAbs / high) * 1.5 : 0));
  // 75: lower_wick_5m = (min(open, close) - low) / high * 1.5
  f.push(safe(high !== 0 ? (lowerWickAbs / high) * 1.5 : 0));
  // 76: wick_total_5m = (upperWick + lowerWick) / (high - low)
  f.push(safe(range !== 0 ? (upperWickAbs + lowerWickAbs) / range : 0));
  // 77: high_low_range_5m = (high - low) / low
  f.push(safe(low !== 0 ? range / low : 0));
  // 78: candle_range_vs_bb20bw_5m = (high - low) / (bb20_upper - bb20_lower)
  f.push(safe(bb20BandWidth !== 0 ? range / bb20BandWidth : 0));
  // 79: squeeze_intensity_5m = bw[0] / mean(bw[0..19])
  f.push(safe(bwMean20 !== 0 ? bwCurr / bwMean20 : 0));
  // 80: vol_regime_5m = atr14[0] / mean(atr14[0..19])
  f.push(safe(atrMean20 !== 0 ? atrCurr / atrMean20 : 0));
  // 81: atr_change_1b_5m = (atr14[0] - atr14[1]) / atr14[1]
  f.push(safe(atrPrev !== 0 ? (atrCurr - atrPrev) / atrPrev : 0));
  // 82: bb20_bandwidth_vs_sma_5m = (bw[0] - mean(bw[0..4])) / mean(bw[0..4])
  f.push(safe(bwMean5 !== 0 ? (bwCurr - bwMean5) / bwMean5 : 0));

  // ---- 1M volatility (indices 83–95): same values ----
  f.push(safe(close !== 0 ? atr14 / close : 0)); // 83
  f.push(safe(bb20BandWidth !== 0 ? atr14 / bb20BandWidth : 0)); // 84
  f.push(safe(openPrice !== 0 ? bodyAbs / openPrice : 0)); // 85: body_size_1m = |close - open| / open
  f.push(safe(range !== 0 ? bodyAbs / range : 0)); // 86
  f.push(safe(high !== 0 ? (upperWickAbs / high) * 1.5 : 0)); // 87: upper_wick_1m = (high - max(open,close)) / high * 1.5
  f.push(safe(high !== 0 ? (lowerWickAbs / high) * 1.5 : 0)); // 88: lower_wick_1m = (min(open,close) - low) / high * 1.5
  f.push(safe(range !== 0 ? (upperWickAbs + lowerWickAbs) / range : 0)); // 89
  f.push(safe(low !== 0 ? range / low : 0)); // 90: high_low_range_1m = (high - low) / low
  f.push(safe(bb20BandWidth !== 0 ? range / bb20BandWidth : 0)); // 91
  f.push(safe(bwMean20 !== 0 ? bwCurr / bwMean20 : 0)); // 92
  f.push(safe(atrMean20 !== 0 ? atrCurr / atrMean20 : 0)); // 93
  f.push(safe(atrPrev !== 0 ? (atrCurr - atrPrev) / atrPrev : 0)); // 94
  f.push(safe(bwMean5 !== 0 ? (bwCurr - bwMean5) / bwMean5 : 0)); // 95

  // ---- Cross-timeframe volatility (indices 96–99) ----
  const atr14Norm5m = f[1] ?? 0; // atr14_norm_5m
  const atr14Norm1m = f[14] ?? 0; // atr14_norm_1m
  const bw5m = f[3] ?? 0; // bb20_bandwidth_5m (raw = bwCurr/bb20Middle)
  const bw1m = f[16] ?? 0; // bb20_bandwidth_1m (same)
  const volRegime5m = f[10] ?? 0;
  const volRegime1m = f[23] ?? 0;
  const squeezeState5m = encodeSqueezeState(ctx.ind.squeeze);
  const squeezeState1m = squeezeState5m;

  f.push(safe(atr14Norm1m !== 0 ? atr14Norm5m / atr14Norm1m : 0)); // 96: atr_ratio_5m_vs_1m
  f.push(safe(bw1m !== 0 ? bw5m / bw1m : 0)); // 97: bandwidth_ratio_5m_vs_1m
  f.push(safe(volRegime5m - volRegime1m)); // 98: vol_divergence
  f.push(safe(squeezeState5m + squeezeState1m)); // 99: squeeze_co_occurrence

  return f; // length = 30
}

// ---------------------------------------------------------------------------
// Feature extraction: trend (40)
// ---------------------------------------------------------------------------

function extractTrend(ctx: VectorizerCtx): number[] {
  const { sma20Series, sma60Series, sma120Series, ema20Series, ema60Series, ema120Series } = ctx;

  // Current and previous values for slope computation
  const sma20_0 = getLag(sma20Series, 0);
  const sma20_1 = getLag(sma20Series, 1);
  const sma60_0 = getLag(sma60Series, 0);
  const sma60_1 = getLag(sma60Series, 1);
  const sma120_0 = getLag(sma120Series, 0);
  const sma120_1 = getLag(sma120Series, 1);
  const ema20_0 = getLag(ema20Series, 0);
  const ema20_1 = getLag(ema20Series, 1);
  const ema60_0 = getLag(ema60Series, 0);
  const ema60_1 = getLag(ema60Series, 1);
  const ema120_0 = getLag(ema120Series, 0);
  const ema120_1 = getLag(ema120Series, 1);

  // MA alignment: 1 if sma20>sma60>sma120, -1 if reversed, else 0
  const maAlignment5m =
    sma20_0 > sma60_0 && sma60_0 > sma120_0 ? 1 : sma20_0 < sma60_0 && sma60_0 < sma120_0 ? -1 : 0;

  const sma20Slope = safe(sma20_1 !== 0 ? (sma20_0 - sma20_1) / sma20_1 : 0);
  const sma60Slope = safe(sma60_1 !== 0 ? (sma60_0 - sma60_1) / sma60_1 : 0);
  const sma120Slope = safe(sma120_1 !== 0 ? (sma120_0 - sma120_1) / sma120_1 : 0);
  const ema20Slope = safe(ema20_1 !== 0 ? (ema20_0 - ema20_1) / ema20_1 : 0);
  const ema60Slope = safe(ema60_1 !== 0 ? (ema60_0 - ema60_1) / ema60_1 : 0);
  const ema120Slope = safe(ema120_1 !== 0 ? (ema120_0 - ema120_1) / ema120_1 : 0);

  const ema20VsSma20 = safe(sma20_0 !== 0 ? (ema20_0 - sma20_0) / sma20_0 : 0);
  const ema20VsSma20_1m = ema20VsSma20; // same series

  const f: number[] = [];

  // ---- 5M trend (indices 100–112) ----
  f.push(sma20Slope); // 100
  f.push(sma60Slope); // 101
  f.push(sma120Slope); // 102
  f.push(ema20Slope); // 103
  f.push(ema60Slope); // 104
  f.push(ema120Slope); // 105
  f.push(safe(sma60_0 !== 0 ? (sma20_0 - sma60_0) / sma60_0 : 0)); // 106: sma20_vs_sma60_5m
  f.push(safe(sma120_0 !== 0 ? (sma60_0 - sma120_0) / sma120_0 : 0)); // 107: sma60_vs_sma120_5m
  f.push(safe(ema60_0 !== 0 ? (ema20_0 - ema60_0) / ema60_0 : 0)); // 108: ema20_vs_ema60_5m
  f.push(safe(ema120_0 !== 0 ? (ema60_0 - ema120_0) / ema120_0 : 0)); // 109: ema60_vs_ema120_5m
  f.push(ema20VsSma20); // 110: ema20_vs_sma20_5m
  f.push(safe(sma60_0 !== 0 ? (ema60_0 - sma60_0) / sma60_0 : 0)); // 111: ema60_vs_sma60_5m
  f.push(safe(maAlignment5m)); // 112: ma_alignment_5m

  // ---- 1M trend (indices 113–125): same values ----
  f.push(sma20Slope); // 113
  f.push(sma60Slope); // 114
  f.push(sma120Slope); // 115
  f.push(ema20Slope); // 116
  f.push(ema60Slope); // 117
  f.push(ema120Slope); // 118
  f.push(safe(sma60_0 !== 0 ? (sma20_0 - sma60_0) / sma60_0 : 0)); // 119
  f.push(safe(sma120_0 !== 0 ? (sma60_0 - sma120_0) / sma120_0 : 0)); // 120
  f.push(safe(ema60_0 !== 0 ? (ema20_0 - ema60_0) / ema60_0 : 0)); // 121
  f.push(safe(ema120_0 !== 0 ? (ema60_0 - ema120_0) / ema120_0 : 0)); // 122
  f.push(ema20VsSma20_1m); // 123
  f.push(safe(sma60_0 !== 0 ? (ema60_0 - sma60_0) / sma60_0 : 0)); // 124
  f.push(safe(maAlignment5m)); // 125: ma_alignment_1m

  // ---- Cross-timeframe trend (indices 126–139) ----
  // sma20_ratio_5m_1m = sma20_5m / sma20_1m - 1 (same = 0)
  f.push(0); // 126: sma20_ratio_5m_1m
  f.push(0); // 127: sma60_ratio_5m_1m
  f.push(0); // 128: sma120_ratio_5m_1m
  f.push(0); // 129: ema20_ratio_5m_1m
  f.push(0); // 130: ema60_ratio_5m_1m
  f.push(0); // 131: ema120_ratio_5m_1m

  // trend_alignment = sign(s20_slope) + sign(s60_slope) + sign(s120_slope)
  const trendAlignment = sign(sma20Slope) + sign(sma60Slope) + sign(sma120Slope);
  f.push(safe(trendAlignment)); // 132: trend_alignment_5m
  f.push(safe(trendAlignment)); // 133: trend_alignment_1m

  // ma_cross_signal = sign(ema20_vs_sma20)
  f.push(safe(sign(ema20VsSma20))); // 134: ma_cross_signal_5m
  f.push(safe(sign(ema20VsSma20_1m))); // 135: ma_cross_signal_1m

  // slope_agreement: sign(sma20_slope_5m) == sign(sma20_slope_1m) → 1 else -1 (same = 1)
  f.push(1); // 136: slope_agreement_5m_1m

  // sma20_angle = atan(sma20_slope) / (PI/2) → normalized to [-1, 1]
  f.push(safe(Math.atan(sma20Slope) / (Math.PI / 2))); // 137: sma20_angle_5m
  f.push(safe(Math.atan(sma20Slope) / (Math.PI / 2))); // 138: sma20_angle_1m

  // trend_strength_composite = (ma_alignment_5m + ma_alignment_1m) / 2
  f.push(safe((maAlignment5m + maAlignment5m) / 2)); // 139: trend_strength_composite

  return f; // length = 40
}

// ---------------------------------------------------------------------------
// Feature extraction: time_series (50)
// ---------------------------------------------------------------------------

function extractTimeSeries(ctx: VectorizerCtx): number[] {
  const { closes, highs, lows, opens, bb20PctBSeries, bb4PctBSeries, atr14Series, rsi14Series } =
    ctx;
  const n = closes.length;

  const f: number[] = [];

  // Helper: body_ratio at lag
  function bodyRatioAtLag(lag: number): number {
    const ci = n - 1 - lag;
    if (ci < 0) return 0;
    const c = closes[ci] ?? 0;
    const o = opens[ci] ?? 0;
    const h = highs[ci] ?? 0;
    const l = lows[ci] ?? 0;
    const r = h - l;
    return safe(r !== 0 ? Math.abs(c - o) / r : 0);
  }

  // Helper: high_low_range at lag
  function hlRangeAtLag(lag: number): number {
    const ci = n - 1 - lag;
    if (ci < 0) return 0;
    const c = closes[ci] ?? 0;
    const h = highs[ci] ?? 0;
    const l = lows[ci] ?? 0;
    return safe(c !== 0 ? (h - l) / c : 0);
  }

  // Helper: return between bar at lag1 and lag2
  function returnBetween(lagA: number, lagB: number): number {
    const cA = getLag(closes, lagA);
    const cB = getLag(closes, lagB);
    return safe(cB !== 0 ? (cA - cB) / cB : 0);
  }

  // ---- 5M lagged and rolling (indices 140–161) ----
  // 140-142: bb20_pct_b_lag1/2/3_5m
  f.push(getLag(bb20PctBSeries, 1)); // 140
  f.push(getLag(bb20PctBSeries, 2)); // 141
  f.push(getLag(bb20PctBSeries, 3)); // 142
  // 143-145: bb4_pct_b_lag1/2/3_5m
  f.push(getLag(bb4PctBSeries, 1)); // 143
  f.push(getLag(bb4PctBSeries, 2)); // 144
  f.push(getLag(bb4PctBSeries, 3)); // 145
  // 146-148: rsi14_lag1/2/3_5m (already / 100)
  f.push(getLag(rsi14Series, 1)); // 146
  f.push(getLag(rsi14Series, 2)); // 147
  f.push(getLag(rsi14Series, 3)); // 148
  // 149-151: return_lag1/2/3_5m
  f.push(returnBetween(1, 2)); // 149: (close[1]-close[2])/close[2]
  f.push(returnBetween(2, 3)); // 150: (close[2]-close[3])/close[3]
  f.push(returnBetween(3, 4)); // 151: (close[3]-close[4])/close[4]
  // 152-153: body_ratio_lag1/2_5m
  f.push(bodyRatioAtLag(1)); // 152
  f.push(bodyRatioAtLag(2)); // 153
  // 154: high_low_range_lag1_5m
  f.push(hlRangeAtLag(1)); // 154

  // 155: bb20_pct_b_mean3_5m
  const bb20PctB_0 = getLag(bb20PctBSeries, 0);
  const bb20PctB_1 = getLag(bb20PctBSeries, 1);
  const bb20PctB_2 = getLag(bb20PctBSeries, 2);
  f.push(safe(mean([bb20PctB_0, bb20PctB_1, bb20PctB_2]))); // 155
  // 156: bb20_pct_b_std3_5m
  f.push(safe(std([bb20PctB_0, bb20PctB_1, bb20PctB_2]))); // 156

  // 157: rsi14_mean3_5m (already /100)
  const rsi_0 = getLag(rsi14Series, 0);
  const rsi_1 = getLag(rsi14Series, 1);
  const rsi_2 = getLag(rsi14Series, 2);
  f.push(safe(mean([rsi_0, rsi_1, rsi_2]))); // 157
  // 158: rsi14_std3_5m
  f.push(safe(std([rsi_0, rsi_1, rsi_2]))); // 158

  // 159: return_sum3_5m = sum(return[0..2]) = r01 + r12 + r23
  const r01 = returnBetween(0, 1);
  const r12 = returnBetween(1, 2);
  const r23 = returnBetween(2, 3);
  f.push(safe(r01 + r12 + r23)); // 159
  // 160: return_std3_5m
  f.push(safe(std([r01, r12, r23]))); // 160

  // 161: atr14_lag1_5m = atr14/close at t-1
  const atrPrev = getLag(atr14Series, 1);
  const closePrev = getLag(closes, 1);
  f.push(safe(closePrev !== 0 ? atrPrev / closePrev : 0)); // 161

  // ---- 1M lagged and rolling (indices 162–183): same series ----
  f.push(getLag(bb20PctBSeries, 1)); // 162
  f.push(getLag(bb20PctBSeries, 2)); // 163
  f.push(getLag(bb20PctBSeries, 3)); // 164
  f.push(getLag(bb4PctBSeries, 1)); // 165
  f.push(getLag(bb4PctBSeries, 2)); // 166
  f.push(getLag(bb4PctBSeries, 3)); // 167
  f.push(getLag(rsi14Series, 1)); // 168
  f.push(getLag(rsi14Series, 2)); // 169
  f.push(getLag(rsi14Series, 3)); // 170
  f.push(returnBetween(1, 2)); // 171
  f.push(returnBetween(2, 3)); // 172
  f.push(returnBetween(3, 4)); // 173
  f.push(bodyRatioAtLag(1)); // 174
  f.push(bodyRatioAtLag(2)); // 175
  f.push(hlRangeAtLag(1)); // 176
  f.push(safe(mean([bb20PctB_0, bb20PctB_1, bb20PctB_2]))); // 177
  f.push(safe(std([bb20PctB_0, bb20PctB_1, bb20PctB_2]))); // 178
  f.push(safe(mean([rsi_0, rsi_1, rsi_2]))); // 179
  f.push(safe(std([rsi_0, rsi_1, rsi_2]))); // 180
  f.push(safe(r01 + r12 + r23)); // 181
  f.push(safe(std([r01, r12, r23]))); // 182
  f.push(safe(closePrev !== 0 ? atrPrev / closePrev : 0)); // 183

  // ---- Cross time-series (indices 184–189) ----
  // 184: bb20_pct_b_lag1_ratio = lag1_5m - lag1_1m (same → 0)
  f.push(0); // 184
  // 185: rsi14_lag1_ratio = rsi_lag1_5m - rsi_lag1_1m (same → 0)
  f.push(0); // 185

  // 186: pattern_123_5m = sign(r[0]) + sign(r[1]) + sign(r[2])
  f.push(safe(sign(r01) + sign(r12) + sign(r23))); // 186
  // 187: pattern_123_1m (same)
  f.push(safe(sign(r01) + sign(r12) + sign(r23))); // 187

  // 188: bb4_sequence_5m = mean(diff(bb4_pct_b[0..3]))
  // diff(bb4[0..3]) = [bb4[0]-bb4[1], bb4[1]-bb4[2], bb4[2]-bb4[3]]
  const bb4_0 = getLag(bb4PctBSeries, 0);
  const bb4_1 = getLag(bb4PctBSeries, 1);
  const bb4_2 = getLag(bb4PctBSeries, 2);
  const bb4_3 = getLag(bb4PctBSeries, 3);
  const bb4Diffs = [bb4_0 - bb4_1, bb4_1 - bb4_2, bb4_2 - bb4_3];
  f.push(safe(mean(bb4Diffs))); // 188
  // 189: bb4_sequence_1m (same)
  f.push(safe(mean(bb4Diffs))); // 189

  return f; // length = 50
}

// ---------------------------------------------------------------------------
// Feature extraction: strategy (12)
// Double-BB strategy-specific derived features — indices 190–201.
// Part 1 implements indices 190–193; Part 2 implements 194–197; 198–201 are 0.5 placeholder (Part 3).
// ---------------------------------------------------------------------------

function extractStrategy(ctx: VectorizerCtx): number[] {
  const { ind, opens, sma20Series, highs, lows, rsi14Series, candles } = ctx;
  const n = opens.length;

  // Current open price (used for bb4_position)
  const open = n > 0 ? (opens[n - 1] ?? 0) : 0;

  // Current close price (used for bb20_position)
  const close = n > 0 ? (ctx.closes[n - 1] ?? 0) : 0;

  // ---- [190] bb20_position: (close - bb20.lower) / bb20.width, width=0 → 0.5, null → 0.5 ----
  let bb20Position: number;
  const bb20 = ind.bb20;
  if (bb20 === null) {
    bb20Position = 0.5;
  } else {
    const bb20Lower = bb20.lower.toNumber();
    const bb20Upper = bb20.upper.toNumber();
    const bb20Width = bb20Upper - bb20Lower;
    if (bb20Width === 0) {
      bb20Position = 0.5;
    } else {
      bb20Position = (close - bb20Lower) / bb20Width;
    }
  }

  // ---- [191] bb4_position: (open - bb4.lower) / bb4.width, width=0 → 0.5, null → 0.5 ----
  let bb4Position: number;
  const bb4 = ind.bb4;
  if (bb4 === null) {
    bb4Position = 0.5;
  } else {
    const bb4Lower = bb4.lower.toNumber();
    const bb4Upper = bb4.upper.toNumber();
    const bb4Width = bb4Upper - bb4Lower;
    if (bb4Width === 0) {
      bb4Position = 0.5;
    } else {
      bb4Position = (open - bb4Lower) / bb4Width;
    }
  }

  // ---- [192] ma_ordering: (sma20>sma60?1:0 + sma60>sma120?1:0) / 2, null MA → 0.5 ----
  let maOrdering: number;
  const sma20 = ind.sma20;
  const sma60 = ind.sma60;
  const sma120 = ind.sma120;
  if (sma20 === null || sma60 === null || sma120 === null) {
    maOrdering = 0.5;
  } else {
    const s20 = sma20.toNumber();
    const s60 = sma60.toNumber();
    const s120 = sma120.toNumber();
    maOrdering = ((s20 > s60 ? 1 : 0) + (s60 > s120 ? 1 : 0)) / 2;
  }

  // ---- [193] ma20_slope: (sma20[0] - sma20[3]) / sma20[3], null/zero → 0.5 ----
  let ma20Slope: number;
  const sma20_curr = getLag(sma20Series, 0);
  const sma20_lag3 = getLag(sma20Series, 3);
  if (sma20_curr === 0 || sma20_lag3 === 0) {
    ma20Slope = 0.5;
  } else {
    const raw = (sma20_curr - sma20_lag3) / sma20_lag3;
    const v = safe(raw);
    ma20Slope = Number.isFinite(v) ? v : 0.5;
  }

  // ---- [194] atr_separation: abs(close - sma20) / atr14, atr14=0/null → 0.5 ----
  let atrSeparation: number;
  {
    const atr14 = ind.atr14?.toNumber() ?? null;
    const sma20Val = getLag(sma20Series, 0);
    if (atr14 === null || atr14 === 0 || sma20Val === 0) {
      atrSeparation = 0.5;
    } else {
      const raw = Math.abs(close - sma20Val) / atr14;
      const v = safe(raw);
      atrSeparation = Number.isFinite(v) ? v : 0.5;
    }
  }

  // ---- [195] pivot_distance: (close - nearest_pivot) / atr14, atr14=0/null → 0.5 ----
  // nearest_pivot = closer of highest_high or lowest_low in last 20 candles
  let pivotDistance: number;
  {
    const atr14 = ind.atr14?.toNumber() ?? null;
    if (atr14 === null || atr14 === 0 || n === 0) {
      pivotDistance = 0.5;
    } else {
      const slice20Start = Math.max(0, n - 20);
      let highestH = -Infinity;
      let lowestL = Infinity;
      for (let i = slice20Start; i < n; i++) {
        const h = highs[i] ?? 0;
        const l = lows[i] ?? 0;
        if (h > highestH) highestH = h;
        if (l < lowestL) lowestL = l;
      }
      const distToHigh = Math.abs(close - highestH);
      const distToLow = Math.abs(close - lowestL);
      const nearestPivot = distToHigh <= distToLow ? highestH : lowestL;
      const raw = (close - nearestPivot) / atr14;
      const v = safe(raw);
      pivotDistance = Number.isFinite(v) ? v : 0.5;
    }
  }

  // ---- [196] rsi_normalized: (rsi14 - 50) / 50 → [-1, 1], null → 0.5 ----
  let rsiNormalized: number;
  {
    const rsi14 = ind.rsi14?.toNumber() ?? null;
    if (rsi14 === null) {
      rsiNormalized = 0.5;
    } else {
      const raw = (rsi14 - 50) / 50;
      const v = safe(raw);
      rsiNormalized = Number.isFinite(v) ? v : 0.5;
    }
  }

  // ---- [197] rsi_extreme_count: count(RSI<30 or RSI>70 in last 20 bars) / 20
  // rsi14Series stores RSI/100, so thresholds are 0.3 and 0.7.
  // Insufficient data (<= 0 bars) → 0.5
  let rsiExtremeCount: number;
  if (n === 0 || rsi14Series.length === 0) {
    rsiExtremeCount = 0.5;
  } else {
    const rsiSlice20Start = Math.max(0, n - 20);
    const rsiAvailable = n - rsiSlice20Start; // actual bars available
    if (rsiAvailable === 0) {
      rsiExtremeCount = 0.5;
    } else {
      let extremeCount = 0;
      for (let i = rsiSlice20Start; i < n; i++) {
        const rsiVal = rsi14Series[i] ?? 0; // already /100
        if (rsiVal < 0.3 || rsiVal > 0.7) extremeCount++;
      }
      rsiExtremeCount = extremeCount / rsiAvailable;
    }
  }

  // ---- [198] breakout_intensity: (close - bb20_upper) / atr14 if above upper,
  // (bb20_lower - close) / atr14 (negative) if below lower, else 0.
  // bb20=null or atr14=null/0 → 0.5
  let breakoutIntensity: number;
  {
    const atr14 = ind.atr14?.toNumber() ?? null;
    if (bb20 === null || atr14 === null || atr14 === 0) {
      breakoutIntensity = 0.5;
    } else {
      const bb20Upper = bb20.upper.toNumber();
      const bb20Lower = bb20.lower.toNumber();
      let raw: number;
      if (close > bb20Upper) {
        raw = (close - bb20Upper) / atr14;
      } else if (close < bb20Lower) {
        raw = (bb20Lower - close) / atr14; // positive magnitude, but per spec negative sign
        raw = -raw; // close < lower → negative
      } else {
        raw = 0;
      }
      const v = safe(raw);
      breakoutIntensity = Number.isFinite(v) ? v : 0.5;
    }
  }

  // ---- [199] disparity_divergence: bb4_pct_b - bb20_pct_b
  // bb4_pct_b = (close - bb4_lower) / bb4_width
  // bb20_pct_b = (close - bb20_lower) / bb20_width
  // Either null or width=0 → 0.5
  let disparityDivergence: number;
  {
    const bb4 = ind.bb4;
    if (bb4 === null || bb20 === null) {
      disparityDivergence = 0.5;
    } else {
      const bb4Lower = bb4.lower.toNumber();
      const bb4Upper = bb4.upper.toNumber();
      const bb4Width = bb4Upper - bb4Lower;
      const bb20Lower = bb20.lower.toNumber();
      const bb20Upper = bb20.upper.toNumber();
      const bb20Width = bb20Upper - bb20Lower;
      if (bb4Width === 0 || bb20Width === 0) {
        disparityDivergence = 0.5;
      } else {
        const bb4PctB = (close - bb4Lower) / bb4Width;
        const bb20PctB = (close - bb20Lower) / bb20Width;
        const raw = bb4PctB - bb20PctB;
        const v = safe(raw);
        disparityDivergence = Number.isFinite(v) ? v : 0.5;
      }
    }
  }

  // ---- [200] daily_open_distance: (close - daily_open) / atr14
  // daily_open = open of the first candle of the current UTC day.
  // If no same-day candle found or atr14=null/0 → 0.5
  let dailyOpenDistance: number;
  {
    const atr14 = ind.atr14?.toNumber() ?? null;
    if (atr14 === null || atr14 === 0 || n === 0) {
      dailyOpenDistance = 0.5;
    } else {
      const lastCandle = candles[n - 1];
      if (lastCandle === undefined) {
        dailyOpenDistance = 0.5;
      } else {
        const lastDate = lastCandle.open_time;
        const lastDayUTC =
          lastDate.getUTCFullYear() * 10000 +
          (lastDate.getUTCMonth() + 1) * 100 +
          lastDate.getUTCDate();
        // Find the first candle of the same UTC day (candles are newest-last, so iterate from oldest)
        let dailyOpen: number | null = null;
        for (let i = 0; i < n; i++) {
          const c = candles[i];
          if (c === undefined) continue;
          const cDate = c.open_time;
          const cDayUTC =
            cDate.getUTCFullYear() * 10000 + (cDate.getUTCMonth() + 1) * 100 + cDate.getUTCDate();
          if (cDayUTC === lastDayUTC) {
            dailyOpen = c.open.toNumber();
            break; // first same-day candle found (oldest = daily open)
          }
        }
        if (dailyOpen === null) {
          dailyOpenDistance = 0.5;
        } else {
          const raw = (close - dailyOpen) / atr14;
          const v = safe(raw);
          dailyOpenDistance = Number.isFinite(v) ? v : 0.5;
        }
      }
    }
  }

  // ---- [201] session_box_position: (close - session_low) / (session_high - session_low)
  // session_high = max of highs of same-day candles
  // session_low = min of lows of same-day candles
  // range=0 or no same-day candles → 0.5
  let sessionBoxPosition: number;
  if (n === 0) {
    sessionBoxPosition = 0.5;
  } else {
    const lastCandleSbp = candles[n - 1];
    if (lastCandleSbp === undefined) {
      sessionBoxPosition = 0.5;
    } else {
      const lastDateSbp = lastCandleSbp.open_time;
      const lastDayUTCSbp =
        lastDateSbp.getUTCFullYear() * 10000 +
        (lastDateSbp.getUTCMonth() + 1) * 100 +
        lastDateSbp.getUTCDate();
      let sessionHigh = -Infinity;
      let sessionLow = Infinity;
      let found = false;
      for (let i = 0; i < n; i++) {
        const c = candles[i];
        if (c === undefined) continue;
        const cDate = c.open_time;
        const cDayUTC =
          cDate.getUTCFullYear() * 10000 + (cDate.getUTCMonth() + 1) * 100 + cDate.getUTCDate();
        if (cDayUTC === lastDayUTCSbp) {
          const h = c.high.toNumber();
          const l = c.low.toNumber();
          if (h > sessionHigh) sessionHigh = h;
          if (l < sessionLow) sessionLow = l;
          found = true;
        }
      }
      if (!found || sessionHigh === sessionLow) {
        sessionBoxPosition = 0.5;
      } else {
        const raw = (close - sessionLow) / (sessionHigh - sessionLow);
        const v = safe(raw);
        sessionBoxPosition = Number.isFinite(v) ? v : 0.5;
      }
    }
  }

  return [
    safe(bb20Position) !== bb20Position ? 0.5 : bb20Position, // 190: bb20_position
    safe(bb4Position) !== bb4Position ? 0.5 : bb4Position, // 191: bb4_position
    maOrdering, // 192: ma_ordering
    ma20Slope, // 193: ma20_slope
    atrSeparation, // 194: atr_separation
    pivotDistance, // 195: pivot_distance
    rsiNormalized, // 196: rsi_normalized
    rsiExtremeCount, // 197: rsi_extreme_count
    breakoutIntensity, // 198: breakout_intensity
    disparityDivergence, // 199: disparity_divergence
    dailyOpenDistance, // 200: daily_open_distance
    sessionBoxPosition, // 201: session_box_position
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts candles + AllIndicators into a 202-dimensional Float32Array.
 *
 * @param candles - Recent candle history, newest-last. Minimum 20 for meaningful output.
 * @param indicators - AllIndicators computed for the most recent (current) candle.
 * @param timeframe - "5M" or "1M" — determines feature label suffixes but not logic.
 * @returns Float32Array of length VECTOR_DIM (202). NaN/Infinity → 0.0.
 */
export function vectorize(
  candles: Candle[],
  indicators: AllIndicators,
  _timeframe: VectorTimeframe,
): Float32Array {
  const ctx = buildCtx(candles, indicators, _timeframe);

  const pricePosition = extractPricePosition(ctx); // 40
  const momentum = extractMomentum(ctx); // 30
  const volatility = extractVolatility(ctx); // 30
  const trend = extractTrend(ctx); // 40
  const timeSeries = extractTimeSeries(ctx); // 50
  const strategy = extractStrategy(ctx); // 12

  const all = [...pricePosition, ...momentum, ...volatility, ...trend, ...timeSeries, ...strategy];

  if (all.length !== VECTOR_DIM) {
    throw new Error(`vectorize: dimension mismatch — got ${all.length}, expected ${VECTOR_DIM}`);
  }

  return new Float32Array(all.map((v) => safe(v)));
}
