import type { Decimal } from "@/core/decimal";

export type BollingerResult = {
  upper: Decimal;
  middle: Decimal;
  lower: Decimal;
  /** (upper - lower) / middle */
  bandwidth: Decimal;
  /** (close - lower) / (upper - lower) */
  percentB: Decimal;
};

export type SqueezeState = "squeeze" | "expansion" | "normal";

export type AllIndicators = {
  bb20: BollingerResult | null;
  bb4: BollingerResult | null;
  /** 1H-timeframe BB4 bands — used by evidence gate for a_grade determination. */
  bb4_1h: BollingerResult | null;
  sma20: Decimal | null;
  /** Previous period SMA20 — used to compute MA20 slope for ONE_B direction validation. */
  prevSma20: Decimal | null;
  /**
   * 5M-timeframe SMA20 — injected by pipeline when processing 1M candles.
   * Used by the 1M noise filter (PRD §7.7) to compare 5M MA20 direction
   * against the daily bias. Null when not yet loaded or not applicable.
   */
  sma20_5m: Decimal | null;
  /**
   * Last 4 SMA20 values in chronological order (oldest → newest).
   * Index 0 = 3 bars ago, last index = current (same as sma20).
   * Fewer than 4 elements when insufficient candle history.
   * Used by T-19-002 to compute 3-bar ma20_slope (PRD §7.8 L276).
   */
  sma20History: Decimal[];
  sma60: Decimal | null;
  sma120: Decimal | null;
  ema20: Decimal | null;
  ema60: Decimal | null;
  ema120: Decimal | null;
  rsi14: Decimal | null;
  /**
   * Last 14 RSI values in chronological order (oldest → newest), as plain numbers.
   * Last index = current (≈ rsi14.toNumber()). Fewer than 14 elements when
   * insufficient candle history. Used by T-19-002 to compute rsi_extreme_count (PRD §7.8 L277).
   */
  rsiHistory: number[];
  atr14: Decimal | null;
  squeeze: SqueezeState;
  /**
   * Last up-to-20 BB20 bandwidth values in chronological order (oldest → newest).
   * Last element equals current bb20.bandwidth.
   * Fewer than 20 elements when insufficient candle history.
   * Empty array when bb20 is null.
   * Used by detectSqueeze() to determine squeeze/expansion state.
   */
  bandwidthHistory: Decimal[];
};
