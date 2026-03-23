import type { Timeframe } from "@combine/shared";
import Decimal from "decimal.js";
import type { Candle } from "./types.js";
import { TIMEFRAME_MS } from "./types.js";

const TIMEFRAME_MINUTES: Record<string, number> = {
	"3m": 3,
	"5m": 5,
	"15m": 15,
	"1h": 60,
	"4h": 240,
	"1d": 1440,
};

/**
 * Get the aggregation bar open time for a given 1m candle timestamp.
 * Aligns to the target timeframe boundary.
 */
export function getAggregationBarOpenTime(candleOpenTime: Date, targetTf: Timeframe): Date {
	const ms = TIMEFRAME_MS[targetTf];
	const aligned = Math.floor(candleOpenTime.getTime() / ms) * ms;
	return new Date(aligned);
}

/**
 * Check if a higher-timeframe bar is closed based on how many 1m candles have been received.
 */
export function isTimeframeClosed(
	_barOpenTime: Date,
	targetTf: Timeframe,
	receivedCount: number,
): boolean {
	const required = TIMEFRAME_MINUTES[targetTf];
	if (!required) return false;
	return receivedCount >= required;
}

/**
 * Aggregate 1m candles into a target timeframe.
 * Input must be sorted by openTime ascending.
 * Returns aggregated bars with correct OHLCV math.
 */
export function aggregateCandles(candles1m: Candle[], targetTf: Timeframe): Candle[] {
	if (candles1m.length === 0) return [];

	const required = TIMEFRAME_MINUTES[targetTf];
	if (!required) return [];

	// Group candles by their target-TF bar open time
	const groups = new Map<number, Candle[]>();

	for (const candle of candles1m) {
		const barOpen = getAggregationBarOpenTime(candle.openTime, targetTf);
		const key = barOpen.getTime();
		const group = groups.get(key);
		if (group) {
			group.push(candle);
		} else {
			groups.set(key, [candle]);
		}
	}

	// Build aggregated bars in order
	const result: Candle[] = [];
	const sortedKeys = [...groups.keys()].sort((a, b) => a - b);

	for (const key of sortedKeys) {
		const group = groups.get(key)!;
		const first = group[0]!;
		const last = group[group.length - 1]!;

		let high = new Decimal(first.high);
		let low = new Decimal(first.low);
		let volume = new Decimal(0);

		for (const c of group) {
			const h = new Decimal(c.high);
			const l = new Decimal(c.low);
			if (h.gt(high)) high = h;
			if (l.lt(low)) low = l;
			volume = volume.plus(c.volume);
		}

		result.push({
			exchange: first.exchange,
			symbol: first.symbol,
			timeframe: targetTf,
			openTime: new Date(key),
			open: first.open,
			high: high.toString(),
			low: low.toString(),
			close: last.close,
			volume: volume.toString(),
			isClosed: group.length >= required,
		});
	}

	return result;
}
