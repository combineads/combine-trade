export { ATR_DEFAULT_PERIOD, calcATR, calcATRSeries } from "@/indicators/atr";
export { calcBB, calcBB4, calcBB20, candlesToCloses } from "@/indicators/bollinger";
export { calcEMA, calcEMASeries, calcSMA, calcSMASeries } from "@/indicators/ma";
export { calcRSI, calcRSISeries, RSI_DEFAULT_PERIOD } from "@/indicators/rsi";
export { detectSqueeze } from "@/indicators/squeeze";
export type { AllIndicators, BollingerResult, SqueezeState } from "@/indicators/types";

import type { Candle } from "@/core/types";
import { calcATR } from "@/indicators/atr";
import { calcBB4, calcBB20, candlesToCloses } from "@/indicators/bollinger";
import { calcEMA, calcSMA, calcSMASeries } from "@/indicators/ma";
import { calcRSI } from "@/indicators/rsi";
import { detectSqueeze } from "@/indicators/squeeze";
import type { AllIndicators } from "@/indicators/types";

export function calcAllIndicators(candles: Candle[]): AllIndicators {
  // Extract number arrays once
  const closes = candlesToCloses(candles);
  const highs = candles.map((c) => c.high.toNumber());
  const lows = candles.map((c) => c.low.toNumber());

  // Bollinger Bands
  const bb20 = calcBB20(candles);
  const bb4 = calcBB4(candles);

  // Moving Averages
  const sma20 = calcSMA(closes, 20);
  const sma60 = calcSMA(closes, 60);
  const sma120 = calcSMA(closes, 120);
  const ema20 = calcEMA(closes, 20);
  const ema60 = calcEMA(closes, 60);
  const ema120 = calcEMA(closes, 120);

  // prevSma20: second-to-last value in the SMA20 series — used for slope direction in evidence gate.
  const sma20Series = calcSMASeries(closes, 20);
  const prevSma20 = sma20Series.length >= 2 ? (sma20Series[sma20Series.length - 2] ?? null) : null;

  // RSI & ATR
  const rsi14 = calcRSI(closes);
  const atr14 = calcATR(highs, lows, closes);

  // Squeeze detection from BB20 bandwidth series.
  // A single bandwidth value always returns "normal" — the caller must
  // accumulate a bandwidth history and call detectSqueeze directly for
  // meaningful squeeze/expansion detection in the trading pipeline.
  const bandwidths = bb20 ? [bb20.bandwidth] : [];
  const squeeze = detectSqueeze(bandwidths);

  return {
    bb20,
    bb4,
    // bb4_1h is not available from same-timeframe candles — the daemon pipeline
    // must supply this separately from 1H candle indicators when calling checkEvidence.
    bb4_1h: null,
    sma20,
    prevSma20,
    sma60,
    sma120,
    ema20,
    ema60,
    ema120,
    rsi14,
    atr14,
    squeeze,
  };
}
