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
  sma60: Decimal | null;
  sma120: Decimal | null;
  ema20: Decimal | null;
  ema60: Decimal | null;
  ema120: Decimal | null;
  rsi14: Decimal | null;
  atr14: Decimal | null;
  squeeze: SqueezeState;
};
