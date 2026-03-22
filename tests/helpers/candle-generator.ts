import type { Candle } from "@combine/candle";
import { TIMEFRAME_MS } from "@combine/candle";
import type { Exchange, Timeframe } from "@combine/shared";

interface CandleGeneratorOptions {
	exchange?: Exchange;
	symbol?: string;
	timeframe?: Timeframe;
	startTime?: Date;
	count?: number;
	basePrice?: number;
	volatility?: number; // percentage, e.g. 0.02 = 2%
	seed?: number;
}

/** Simple seeded random number generator (mulberry32) */
function seededRandom(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Generate realistic continuous candle data for testing.
 * Ensures: high >= max(open, close), low <= min(open, close), no gaps.
 */
export function generateCandles(options: CandleGeneratorOptions = {}): Candle[] {
	const {
		exchange = "binance",
		symbol = "BTCUSDT",
		timeframe = "1m",
		startTime = new Date(Date.UTC(2024, 0, 1, 0, 0, 0)),
		count = 100,
		basePrice = 50000,
		volatility = 0.02,
		seed = 42,
	} = options;

	const random = seededRandom(seed);
	const intervalMs = TIMEFRAME_MS[timeframe];
	const candles: Candle[] = [];
	let currentPrice = basePrice;

	for (let i = 0; i < count; i++) {
		const openTime = new Date(startTime.getTime() + i * intervalMs);
		const open = currentPrice;

		// Random price movement
		const change = (random() - 0.5) * 2 * volatility * open;
		const close = open + change;

		// High and low with realistic wicks
		const wickUp = random() * volatility * open * 0.5;
		const wickDown = random() * volatility * open * 0.5;
		const high = Math.max(open, close) + wickUp;
		const low = Math.min(open, close) - wickDown;

		// Volume with some randomness
		const volume = 100 + random() * 900;

		candles.push({
			exchange,
			symbol,
			timeframe,
			openTime,
			open: open.toFixed(2),
			high: high.toFixed(2),
			low: low.toFixed(2),
			close: close.toFixed(2),
			volume: volume.toFixed(4),
			isClosed: true,
		});

		currentPrice = close;
	}

	return candles;
}
