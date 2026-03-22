import { div } from "@combine/shared/decimal/arithmetic.js";
import type { MarketContext, TrendDirection } from "./types.js";

/** Classify trend based on price relative to SMA. */
export function classifyTrend(smaValue: number, currentPrice: number): TrendDirection {
	if (currentPrice > smaValue * 1.001) return "up";
	if (currentPrice < smaValue * 0.999) return "down";
	return "neutral";
}

/** Calculate volatility ratio: current ATR / average ATR. */
export function calculateVolatilityRatio(currentAtr: string, avgAtr: string): string {
	return div(currentAtr, avgAtr);
}

/** Calculate volume ratio: current volume / average volume. */
export function calculateVolumeRatio(currentVolume: string, avgVolume: string): string {
	return div(currentVolume, avgVolume);
}

export interface MarketContextInput {
	sma1h?: { sma: number; price: number };
	sma4h?: { sma: number; price: number };
	sma1d?: { sma: number; price: number };
	volatility?: { currentAtr: string; avgAtr: string };
	volume?: { current: string; average: string };
	fundingRate?: string;
}

/** Build market context from available data. Missing fields become null. */
export function buildMarketContext(input: MarketContextInput): MarketContext {
	return {
		trend1h: input.sma1h ? classifyTrend(input.sma1h.sma, input.sma1h.price) : null,
		trend4h: input.sma4h ? classifyTrend(input.sma4h.sma, input.sma4h.price) : null,
		trend1d: input.sma1d ? classifyTrend(input.sma1d.sma, input.sma1d.price) : null,
		volatilityRatio: input.volatility
			? calculateVolatilityRatio(input.volatility.currentAtr, input.volatility.avgAtr)
			: null,
		volumeRatio: input.volume
			? calculateVolumeRatio(input.volume.current, input.volume.average)
			: null,
		fundingRate: input.fundingRate ?? null,
	};
}
