export { ATR_DEFAULT_PERIOD, calcATR, calcATRSeries } from "@/indicators/atr";
export { calcBB, calcBB4, calcBB20, candlesToCloses } from "@/indicators/bollinger";
export { calcEMA, calcEMASeries, calcSMA, calcSMASeries } from "@/indicators/ma";
export { calcRSI, calcRSISeries, RSI_DEFAULT_PERIOD } from "@/indicators/rsi";
export { detectSqueeze } from "@/indicators/squeeze";
export type { AllIndicators, BollingerResult, SqueezeState } from "@/indicators/types";

import { BB20_CONFIG } from "@/core/constants";
import type { Decimal } from "@/core/decimal";
import type { Candle } from "@/core/types";
import { calcATR } from "@/indicators/atr";
import { calcBB, calcBB4, calcBB20, candlesToCloses } from "@/indicators/bollinger";
import { calcEMA, calcSMA, calcSMASeries } from "@/indicators/ma";
import { calcRSI, calcRSISeries } from "@/indicators/rsi";
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

  // sma20History: last 4 SMA20 values in chronological order (oldest → newest, index 0 = 3 bars ago).
  const sma20History = sma20Series.slice(-4);

  // RSI & ATR
  const rsi14 = calcRSI(closes);

  // rsiHistory: last 14 RSI values as plain numbers in chronological order (oldest → newest).
  const rsiHistory = calcRSISeries(closes)
    .map((v) => v.toNumber())
    .slice(-14);
  const atr14 = calcATR(highs, lows, closes);

  // Bandwidth series: compute BB20 for each sliding window of the last 20+20-1=39
  // candles (or fewer if not enough data). For each sub-array of BB20_LENGTH candles
  // we call calcBB to get the bandwidth at that window position.
  // Result: bandwidthHistory holds up to 20 Decimal bandwidth values in chronological
  // order (oldest → newest), last element matching current bb20.bandwidth.
  const bandwidthHistory: Decimal[] = [];
  if (bb20 !== null) {
    const bb20Length = BB20_CONFIG.length; // 20
    const bb20Stddev = BB20_CONFIG.stddev; // 2
    // We want up to 20 bandwidth values. The i-th value (0-indexed from the end)
    // is computed from candles[candles.length - bb20Length - i .. candles.length - i].
    // i=0 → current window (most recent, equals bb20)
    // i=19 → oldest window in our 20-value history
    // Collect in reverse then flip to chronological order.
    const totalWindows = Math.min(20, candles.length - bb20Length + 1);
    const tempBw: Decimal[] = [];
    for (let i = 0; i < totalWindows; i++) {
      // i=0: last bb20Length candles (current), i=1: one step back, etc.
      const end = candles.length - i;
      const start = end - bb20Length;
      const windowCandles = candles.slice(start, end);
      const windowCloses = candlesToCloses(windowCandles);
      const currentClose = windowCloses[windowCloses.length - 1];
      if (currentClose === undefined) continue;
      const bbResult = calcBB(windowCloses, bb20Length, bb20Stddev, currentClose);
      if (bbResult !== null) {
        tempBw.push(bbResult.bandwidth);
      }
    }
    // tempBw is newest-first; reverse to chronological order (oldest → newest)
    tempBw.reverse();
    bandwidthHistory.push(...tempBw);
  }

  const squeeze = detectSqueeze(bandwidthHistory);

  return {
    bb20,
    bb4,
    // bb4_1h is not available from same-timeframe candles — the daemon pipeline
    // must supply this separately from 1H candle indicators when calling checkEvidence.
    bb4_1h: null,
    sma20,
    prevSma20,
    // sma20_5m is not available from same-timeframe candles — the daemon pipeline
    // injects this from 5M candle indicators when processing 1M timeframe entries.
    sma20_5m: null,
    sma20History,
    sma60,
    sma120,
    ema20,
    ema60,
    ema120,
    rsi14,
    rsiHistory,
    atr14,
    squeeze,
    bandwidthHistory,
  };
}
