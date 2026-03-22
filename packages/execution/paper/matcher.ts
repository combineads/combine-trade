import Decimal from "decimal.js";
import {
	DEFAULT_PAPER_CONFIG,
	type PaperCandle,
	type PaperDirection,
	type PaperExitResult,
	type PaperFill,
	type PaperOrderConfig,
} from "./types.js";

/** Simulate a market order fill at next candle open with slippage. */
export function simulateMarketFill(
	direction: PaperDirection,
	openPrice: string,
	config: PaperOrderConfig = DEFAULT_PAPER_CONFIG,
): PaperFill {
	const open = new Decimal(openPrice);
	const slippageMultiplier = new Decimal(config.slippagePct).div(100);
	const slippageAmount = open.mul(slippageMultiplier);

	const fillPrice = direction === "LONG" ? open.plus(slippageAmount) : open.minus(slippageAmount);

	return {
		direction,
		fillPrice: fillPrice.toString(),
		slippageApplied: slippageAmount.toString(),
	};
}

/**
 * Scan candles for SL/TP exit. Matches labeler logic:
 * - LONG: SL hit when low <= slPrice, TP hit when high >= tpPrice
 * - SHORT: SL hit when high >= slPrice, TP hit when low <= tpPrice
 * - Same-bar both hit → SL wins (conservative)
 */
export function scanForExit(
	direction: PaperDirection,
	entryPrice: string,
	slPrice: string,
	tpPrice: string,
	candles: PaperCandle[],
): PaperExitResult {
	const sl = new Decimal(slPrice);
	const tp = new Decimal(tpPrice);
	const isLong = direction === "LONG";

	for (let i = 0; i < candles.length; i++) {
		const candle = candles[i]!;
		const high = new Decimal(candle.high);
		const low = new Decimal(candle.low);

		const slHit = isLong ? low.lte(sl) : high.gte(sl);
		const tpHit = isLong ? high.gte(tp) : low.lte(tp);

		if (slHit && tpHit) {
			return { reason: "SL", exitPrice: slPrice, exitBar: i + 1, slHitFirst: true };
		}
		if (slHit) {
			return { reason: "SL", exitPrice: slPrice, exitBar: i + 1, slHitFirst: false };
		}
		if (tpHit) {
			return { reason: "TP", exitPrice: tpPrice, exitBar: i + 1, slHitFirst: false };
		}
	}

	const lastClose = candles.length > 0 ? candles[candles.length - 1]?.close : entryPrice;
	return { reason: "TIME_EXIT", exitPrice: lastClose, exitBar: candles.length, slHitFirst: false };
}
