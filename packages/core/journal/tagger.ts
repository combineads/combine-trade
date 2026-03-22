import Decimal from "decimal.js";
import type { MarketContext, TradeJournal, TrendDirection } from "./types.js";

export interface TaggerConfig {
	volatilityHighThreshold: string;
	volatilityLowThreshold: string;
	volumeHighThreshold: string;
	volumeLowThreshold: string;
	quickHoldRatio: number;
	mfeHighRatio: number;
	fundingHighThreshold: string;
}

export const DEFAULT_TAGGER_CONFIG: TaggerConfig = {
	volatilityHighThreshold: "1.5",
	volatilityLowThreshold: "0.7",
	volumeHighThreshold: "1.5",
	volumeLowThreshold: "0.7",
	quickHoldRatio: 0.25,
	mfeHighRatio: 0.5,
	fundingHighThreshold: "0.0005",
};

/** Get the highest-timeframe trend direction. Priority: 1d > 4h > 1h. */
function getHighestTrend(ctx: MarketContext | null): TrendDirection | null {
	if (!ctx) return null;
	return ctx.trend1d ?? ctx.trend4h ?? ctx.trend1h ?? null;
}

function trendTags(ctx: MarketContext | null): string[] {
	const trend = getHighestTrend(ctx);
	if (!trend || trend === "neutral") return ["ranging"];
	if (trend === "up") return ["trending_up"];
	return ["trending_down"];
}

function volatilityTags(ctx: MarketContext | null, config: TaggerConfig): string[] {
	if (!ctx?.volatilityRatio) return [];
	const ratio = new Decimal(ctx.volatilityRatio);
	if (ratio.gt(config.volatilityHighThreshold)) return ["high_volatility"];
	if (ratio.lt(config.volatilityLowThreshold)) return ["low_volatility"];
	return [];
}

function volumeTags(ctx: MarketContext | null, config: TaggerConfig): string[] {
	if (!ctx?.volumeRatio) return [];
	const ratio = new Decimal(ctx.volumeRatio);
	if (ratio.gt(config.volumeHighThreshold)) return ["high_volume"];
	if (ratio.lt(config.volumeLowThreshold)) return ["low_volume"];
	return [];
}

function alignmentTags(direction: string, ctx: MarketContext | null): string[] {
	const trend = getHighestTrend(ctx);
	if (!trend || trend === "neutral") return [];
	const isLongUp = direction === "LONG" && trend === "up";
	const isShortDown = direction === "SHORT" && trend === "down";
	if (isLongUp || isShortDown) return ["with_trend"];
	return ["against_trend"];
}

function fundingTags(ctx: MarketContext | null, config: TaggerConfig): string[] {
	if (!ctx?.fundingRate) return [];
	const abs = new Decimal(ctx.fundingRate).abs();
	if (abs.gt(config.fundingHighThreshold)) return ["high_funding"];
	return ["low_funding"];
}

function resultTags(
	journal: TradeJournal,
	maxHoldBars: number,
	tpPct: number,
	config: TaggerConfig,
): string[] {
	const tags: string[] = [];
	const isWin =
		journal.resultType === "WIN" || (journal.resultType === "TIME_EXIT" && journal.pnlPct >= 0);
	const isLoss =
		journal.resultType === "LOSS" || (journal.resultType === "TIME_EXIT" && journal.pnlPct < 0);
	const isQuick = journal.holdBars < maxHoldBars * config.quickHoldRatio;

	if (isWin) {
		tags.push(isQuick ? "quick_win" : "slow_win");
		if (journal.maePct < 0.5) tags.push("clean_win");
	}

	if (isLoss) {
		tags.push(isQuick ? "quick_loss" : "slow_loss");
		if (journal.mfePct > tpPct * config.mfeHighRatio) tags.push("mfe_high");
	}

	return tags;
}

/** Generate deterministic, sorted auto-tags for a trade journal. */
export function generateTags(
	journal: TradeJournal,
	maxHoldBars: number,
	tpPct: number,
	config: TaggerConfig = DEFAULT_TAGGER_CONFIG,
): string[] {
	const ctx = journal.exitMarketContext;
	const tags = [
		...trendTags(ctx),
		...volatilityTags(ctx, config),
		...volumeTags(ctx, config),
		...alignmentTags(journal.direction, ctx),
		...fundingTags(ctx, config),
		...resultTags(journal, maxHoldBars, tpPct, config),
	];
	return [...new Set(tags)].sort();
}
