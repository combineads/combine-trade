import { IndicatorsSync } from "@ixjb94/indicators";
import type { Decimal } from "@/core/decimal";
import { d } from "@/core/decimal";

const ind = new IndicatorsSync();

export function calcSMA(source: number[], period: number): Decimal | null {
  if (source.length < period) return null;
  const result = ind.sma(source, period);
  const last = result[result.length - 1];
  if (last === undefined || Number.isNaN(last)) return null;
  return d(last.toString());
}

export function calcSMASeries(source: number[], period: number): Decimal[] {
  if (source.length < period) return [];
  const result = ind.sma(source, period);
  return result.filter((v) => !Number.isNaN(v)).map((v) => d(v.toString()));
}

export function calcEMA(source: number[], period: number): Decimal | null {
  if (source.length < period) return null;
  const result = ind.ema(source, period);
  const last = result[result.length - 1];
  if (last === undefined || Number.isNaN(last)) return null;
  return d(last.toString());
}

export function calcEMASeries(source: number[], period: number): Decimal[] {
  if (source.length < period) return [];
  const result = ind.ema(source, period);
  return result.filter((v) => !Number.isNaN(v)).map((v) => d(v.toString()));
}
