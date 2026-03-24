import Decimal from "decimal.js";
import type { Candle } from "./types.js";

/** Reason codes for why a candle is flagged as an outlier */
export type OutlierReason = "negative_price" | "zero_ohlc" | "price_spike" | "volume_spike";

/** A single outlier finding — candle is flagged but not removed */
export interface OutlierResult {
	/** The candle that was flagged */
	candle: Candle;
	/** Index of the candle in the original input array */
	index: number;
	/** One or more reasons this candle was flagged */
	reasons: OutlierReason[];
}

/** Price spike threshold: 50% deviation from previous close */
const PRICE_SPIKE_THRESHOLD = new Decimal("0.5");

/** Volume spike threshold: 10x the rolling average of previous candles */
const VOLUME_SPIKE_FACTOR = new Decimal("10");

/**
 * Checks whether any OHLC value is negative.
 * Uses Decimal.js for exact comparison.
 */
function hasNegativePrice(candle: Candle): boolean {
	const zero = new Decimal("0");
	return (
		new Decimal(candle.open).lt(zero) ||
		new Decimal(candle.high).lt(zero) ||
		new Decimal(candle.low).lt(zero) ||
		new Decimal(candle.close).lt(zero)
	);
}

/**
 * Checks whether any OHLC value is exactly zero.
 * Uses Decimal.js for exact comparison.
 */
function hasZeroOhlc(candle: Candle): boolean {
	const zero = new Decimal("0");
	return (
		new Decimal(candle.open).eq(zero) ||
		new Decimal(candle.high).eq(zero) ||
		new Decimal(candle.low).eq(zero) ||
		new Decimal(candle.close).eq(zero)
	);
}

/**
 * Checks whether the candle's close price deviates more than 50%
 * from the previous candle's close.
 * Returns false for the first candle (no previous to compare against).
 */
function isPriceSpike(candle: Candle, prevClose: Decimal): boolean {
	const close = new Decimal(candle.close);
	if (prevClose.isZero()) return false;

	// deviation = |close - prevClose| / prevClose
	const deviation = close.minus(prevClose).abs().div(prevClose);
	return deviation.gt(PRICE_SPIKE_THRESHOLD);
}

/**
 * Checks whether the candle's volume exceeds 10x the average volume
 * of all previous candles in the sequence.
 * Returns false when there are no previous candles.
 */
function isVolumeSpike(candle: Candle, previousCandles: Candle[]): boolean {
	if (previousCandles.length === 0) return false;

	// Compute average volume of previous candles
	let sum = new Decimal("0");
	for (const prev of previousCandles) {
		sum = sum.plus(new Decimal(prev.volume));
	}
	const avg = sum.div(new Decimal(previousCandles.length));

	if (avg.isZero()) return false;

	const currentVolume = new Decimal(candle.volume);
	return currentVolume.div(avg).gt(VOLUME_SPIKE_FACTOR);
}

/**
 * Detects outlier candles in a sequence without removing them.
 * Each result flags the candle's index and lists reasons:
 * - `negative_price`: any of open/high/low/close is negative
 * - `zero_ohlc`: any of open/high/low/close is zero
 * - `price_spike`: close deviates more than 50% from previous close
 * - `volume_spike`: volume exceeds 10x the rolling average
 *
 * Downstream consumers decide how to handle flagged candles.
 */
export function detectOutliers(candles: Candle[]): OutlierResult[] {
	const results: OutlierResult[] = [];

	for (let i = 0; i < candles.length; i++) {
		const candle = candles[i]!;
		const reasons: OutlierReason[] = [];

		// Rule 1: negative prices
		if (hasNegativePrice(candle)) {
			reasons.push("negative_price");
		}

		// Rule 2: zero OHLC
		if (hasZeroOhlc(candle)) {
			reasons.push("zero_ohlc");
		}

		// Rule 3: price spike (requires previous candle)
		if (i > 0) {
			const prevClose = new Decimal(candles[i - 1]!.close);
			if (isPriceSpike(candle, prevClose)) {
				reasons.push("price_spike");
			}
		}

		// Rule 4: volume spike (requires at least one previous candle)
		if (i > 0 && isVolumeSpike(candle, candles.slice(0, i))) {
			reasons.push("volume_spike");
		}

		if (reasons.length > 0) {
			results.push({ candle, index: i, reasons });
		}
	}

	return results;
}
