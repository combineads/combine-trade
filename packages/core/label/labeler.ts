import Decimal from "decimal.js";
import type { LabelInput, LabelResult } from "./types.js";

/**
 * Labels a strategy event by scanning forward candles for TP/SL/TIME_EXIT.
 * All price calculations use Decimal.js for financial accuracy.
 */
export function labelEvent(input: LabelInput): LabelResult {
	const { entryPrice, direction, tpPct, slPct, maxHoldBars, forwardCandles } = input;
	const entry = new Decimal(entryPrice);
	const isLong = direction === "long";

	// Calculate TP and SL prices
	const tpPrice = isLong
		? entry.mul(new Decimal(1).plus(new Decimal(tpPct).div(100)))
		: entry.mul(new Decimal(1).minus(new Decimal(tpPct).div(100)));

	const slPrice = isLong
		? entry.mul(new Decimal(1).minus(new Decimal(slPct).div(100)))
		: entry.mul(new Decimal(1).plus(new Decimal(slPct).div(100)));

	let mfeMax = new Decimal(0); // max favorable excursion
	let maeMax = new Decimal(0); // max adverse excursion

	const barsToScan = Math.min(maxHoldBars, forwardCandles.length);

	for (let i = 0; i < barsToScan; i++) {
		const candle = forwardCandles[i]!;
		const high = new Decimal(candle.high);
		const low = new Decimal(candle.low);

		// Track MFE/MAE
		if (isLong) {
			const favorable = high.minus(entry).div(entry).mul(100);
			const adverse = entry.minus(low).div(entry).mul(100);
			if (favorable.gt(mfeMax)) mfeMax = favorable;
			if (adverse.gt(maeMax)) maeMax = adverse;
		} else {
			const favorable = entry.minus(low).div(entry).mul(100);
			const adverse = high.minus(entry).div(entry).mul(100);
			if (favorable.gt(mfeMax)) mfeMax = favorable;
			if (adverse.gt(maeMax)) maeMax = adverse;
		}

		// Check TP and SL hit
		const tpHit = isLong ? high.gte(tpPrice) : low.lte(tpPrice);
		const slHit = isLong ? low.lte(slPrice) : high.gte(slPrice);

		if (tpHit && slHit) {
			// Same candle: both hit → LOSS (conservative, sl_hit_first=true)
			const exitPriceVal = slPrice;
			const pnlPct = computePnl(entry, exitPriceVal, isLong);
			return {
				resultType: "LOSS",
				pnlPct: pnlPct.toNumber(),
				mfePct: mfeMax.toNumber(),
				maePct: maeMax.toNumber(),
				holdBars: i + 1,
				exitPrice: exitPriceVal.toString(),
				slHitFirst: true,
			};
		}

		if (tpHit) {
			const exitPriceVal = tpPrice;
			const pnlPct = computePnl(entry, exitPriceVal, isLong);
			return {
				resultType: "WIN",
				pnlPct: pnlPct.toNumber(),
				mfePct: mfeMax.toNumber(),
				maePct: maeMax.toNumber(),
				holdBars: i + 1,
				exitPrice: exitPriceVal.toString(),
				slHitFirst: false,
			};
		}

		if (slHit) {
			const exitPriceVal = slPrice;
			const pnlPct = computePnl(entry, exitPriceVal, isLong);
			return {
				resultType: "LOSS",
				pnlPct: pnlPct.toNumber(),
				mfePct: mfeMax.toNumber(),
				maePct: maeMax.toNumber(),
				holdBars: i + 1,
				exitPrice: exitPriceVal.toString(),
				slHitFirst: false,
			};
		}
	}

	// TIME_EXIT: max_hold_bars reached or no candles
	const lastClose =
		barsToScan > 0 ? new Decimal(forwardCandles[barsToScan - 1]!.close) : entry;
	const pnlPct = computePnl(entry, lastClose, isLong);

	return {
		resultType: "TIME_EXIT",
		pnlPct: pnlPct.toNumber(),
		mfePct: mfeMax.toNumber(),
		maePct: maeMax.toNumber(),
		holdBars: barsToScan,
		exitPrice: lastClose.toString(),
		slHitFirst: false,
	};
}

function computePnl(entry: Decimal, exit: Decimal, isLong: boolean): Decimal {
	if (isLong) {
		return exit.minus(entry).div(entry).mul(100);
	}
	return entry.minus(exit).div(entry).mul(100);
}
