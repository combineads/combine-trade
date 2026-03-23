export interface CandleBar {
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface BollingerBands {
	upper: number;
	middle: number;
	lower: number;
}

export type DoubleBBVariant = "trend_continuation" | "reversal" | "breakout";
export type DoubleBBSide = "bullish" | "bearish";

export interface DoubleBBResult {
	variant: DoubleBBVariant;
	side: DoubleBBSide;
}

const STRONG_BODY_RATIO = 0.6;
const WICK_RATIO_THRESHOLD = 2;

function bodySize(candle: CandleBar): number {
	return Math.abs(candle.close - candle.open);
}

function candleRange(candle: CandleBar): number {
	return candle.high - candle.low;
}

function isBullishCandle(candle: CandleBar): boolean {
	return candle.close > candle.open;
}

function bbWidth(bb: BollingerBands): number {
	return bb.upper - bb.lower;
}

function isNearBB20Upper(candle: CandleBar, bb20: BollingerBands): boolean {
	const width = bbWidth(bb20);
	return candle.high >= bb20.upper - width * 0.15;
}

function isNearBB20Lower(candle: CandleBar, bb20: BollingerBands): boolean {
	const width = bbWidth(bb20);
	return candle.low <= bb20.lower + width * 0.15;
}

function hasReversalWick(candle: CandleBar, side: DoubleBBSide): boolean {
	const range = candleRange(candle);
	if (range === 0) return false;
	const body = bodySize(candle);

	if (side === "bullish") {
		const lowerWick = Math.min(candle.open, candle.close) - candle.low;
		return lowerWick >= body * WICK_RATIO_THRESHOLD;
	}
	const upperWick = candle.high - Math.max(candle.open, candle.close);
	return upperWick >= body * WICK_RATIO_THRESHOLD;
}

function isBB4MovingUp(bb4: BollingerBands, prevBb4: BollingerBands): boolean {
	return bb4.middle > prevBb4.middle;
}

function isBB4MovingDown(bb4: BollingerBands, prevBb4: BollingerBands): boolean {
	return bb4.middle < prevBb4.middle;
}

function detectBreakout(
	candle: CandleBar,
	bb20: BollingerBands,
	_bb4: BollingerBands,
	prevBb20?: BollingerBands,
): DoubleBBResult | null {
	const range = candleRange(candle);
	if (range === 0) return null;

	const body = bodySize(candle);
	const bodyRatio = body / range;
	if (bodyRatio < STRONG_BODY_RATIO) return null;

	// Check BB20 expansion
	if (prevBb20) {
		const currentWidth = bbWidth(bb20);
		const prevWidth = bbWidth(prevBb20);
		if (currentWidth <= prevWidth) return null;
	}

	if (candle.close > bb20.upper && isBullishCandle(candle)) {
		return { variant: "breakout", side: "bullish" };
	}
	if (candle.close < bb20.lower && !isBullishCandle(candle)) {
		return { variant: "breakout", side: "bearish" };
	}

	return null;
}

function detectReversal(candle: CandleBar, bb20: BollingerBands): DoubleBBResult | null {
	if (isNearBB20Lower(candle, bb20) && hasReversalWick(candle, "bullish")) {
		return { variant: "reversal", side: "bullish" };
	}
	if (isNearBB20Upper(candle, bb20) && hasReversalWick(candle, "bearish")) {
		return { variant: "reversal", side: "bearish" };
	}
	return null;
}

function detectTrend(
	candle: CandleBar,
	bb20: BollingerBands,
	bb4: BollingerBands,
	prevBb4: BollingerBands,
): DoubleBBResult | null {
	if (isNearBB20Upper(candle, bb20) && isBB4MovingUp(bb4, prevBb4)) {
		return { variant: "trend_continuation", side: "bullish" };
	}
	if (isNearBB20Lower(candle, bb20) && isBB4MovingDown(bb4, prevBb4)) {
		return { variant: "trend_continuation", side: "bearish" };
	}
	return null;
}

/**
 * Detect Double-BB pattern from BB20 and BB4 bands.
 * Priority: breakout > reversal > trend_continuation.
 * Returns null if no pattern detected.
 */
export function detectDoubleBB(
	candle: CandleBar,
	bb20: BollingerBands,
	bb4: BollingerBands,
	prevBb4: BollingerBands,
	prevBb20?: BollingerBands,
): DoubleBBResult | null {
	// Priority 1: breakout
	const breakout = detectBreakout(candle, bb20, bb4, prevBb20);
	if (breakout) return breakout;

	// Priority 2: reversal
	const reversal = detectReversal(candle, bb20);
	if (reversal) return reversal;

	// Priority 3: trend continuation
	return detectTrend(candle, bb20, bb4, prevBb4);
}
