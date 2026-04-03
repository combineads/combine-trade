import { IndicatorsSync } from "@ixjb94/indicators";
import type { Decimal } from "@/core/decimal";
import { d } from "@/core/decimal";

const ind = new IndicatorsSync();

export const ATR_DEFAULT_PERIOD = 14;

export function calcATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = ATR_DEFAULT_PERIOD,
): Decimal | null {
  if (highs.length < period + 1 || highs.length !== lows.length || highs.length !== closes.length) {
    return null;
  }
  const result = ind.atr(highs, lows, closes, period);
  const last = result[result.length - 1];
  if (last === undefined || Number.isNaN(last)) return null;
  return d(Math.abs(last).toString());
}

export function calcATRSeries(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = ATR_DEFAULT_PERIOD,
): Decimal[] {
  if (highs.length < period + 1) return [];
  const result = ind.atr(highs, lows, closes, period);
  return result.filter((v) => !Number.isNaN(v)).map((v) => d(Math.abs(v).toString()));
}
