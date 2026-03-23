import type { CandleBar, DoubleBBSide } from "./detector.js";

export type MaBias = "aligned" | "counter_trend" | "neutral_bias";

export interface EvidenceInput {
	candle: CandleBar;
	side: DoubleBBSide;
	ma20: number;
	ma50: number;
	ma100: number;
	ma200: number;
	prevMa20: number;
	prevMa50: number;
	h1Bias: MaBias;
}

export type CandlePatternName =
	| "hammer"
	| "inverted_hammer"
	| "doji"
	| "engulfing"
	| "strong_body"
	| "none";

export interface CandlePatternResult {
	hit: boolean;
	pattern: CandlePatternName;
}

export interface MaEvidenceResult {
	hit: boolean;
	ordering: boolean;
	slope: "bullish" | "bearish" | "flat";
}

export interface SeparationResult {
	hit: boolean;
	distance: number;
}

export interface H1BiasResult {
	hit: boolean;
	bias: MaBias;
}

export interface EvidenceResult {
	candlePattern: CandlePatternResult;
	maEvidence: MaEvidenceResult;
	separation: SeparationResult;
	h1Bias: H1BiasResult;
	familyHitCount: number;
}

const HAMMER_BODY_MAX = 0.35;
const HAMMER_WICK_MIN = 0.55;
const DOJI_BODY_MAX = 0.1;
const STRONG_BODY_MIN = 0.7;

function bodySize(candle: CandleBar): number {
	return Math.abs(candle.close - candle.open);
}

function candleRange(candle: CandleBar): number {
	return candle.high - candle.low;
}

function detectCandlePattern(candle: CandleBar, side: DoubleBBSide): CandlePatternResult {
	const range = candleRange(candle);
	if (range === 0) return { hit: false, pattern: "none" };

	const body = bodySize(candle);
	const bodyRatio = body / range;

	// Doji: body <= 10% of range
	if (bodyRatio <= DOJI_BODY_MAX) {
		return { hit: true, pattern: "doji" };
	}

	// Hammer/Inverted hammer: body <= 35% + dominant wick >= 55%
	if (bodyRatio <= HAMMER_BODY_MAX) {
		const lowerWick = Math.min(candle.open, candle.close) - candle.low;
		const upperWick = candle.high - Math.max(candle.open, candle.close);

		if (side === "bullish") {
			const lowerWickRatio = lowerWick / range;
			if (lowerWickRatio >= HAMMER_WICK_MIN) {
				return { hit: true, pattern: "hammer" };
			}
		} else {
			const upperWickRatio = upperWick / range;
			if (upperWickRatio >= HAMMER_WICK_MIN) {
				return { hit: true, pattern: "inverted_hammer" };
			}
		}
	}

	// Strong body: body >= 70% of range
	if (bodyRatio >= STRONG_BODY_MIN) {
		return { hit: true, pattern: "strong_body" };
	}

	return { hit: false, pattern: "none" };
}

function evaluateMaEvidence(input: EvidenceInput): MaEvidenceResult {
	const { side, ma20, ma50, ma100, ma200, prevMa20, prevMa50 } = input;

	// Slope detection
	const ma20Rising = ma20 > prevMa20;
	const ma50Rising = ma50 > prevMa50;
	const ma20Falling = ma20 < prevMa20;
	const ma50Falling = ma50 < prevMa50;

	let slope: "bullish" | "bearish" | "flat" = "flat";
	if (ma20Rising && ma50Rising) slope = "bullish";
	else if (ma20Falling && ma50Falling) slope = "bearish";

	// Ordering detection
	let ordering = false;
	if (side === "bullish") {
		ordering = ma20 > ma50 && ma50 > ma100 && ma100 > ma200;
	} else {
		ordering = ma20 < ma50 && ma50 < ma100 && ma100 < ma200;
	}

	// Hit: ordering matches side AND slope matches side
	const slopeAligned =
		(side === "bullish" && slope === "bullish") || (side === "bearish" && slope === "bearish");
	const hit = ordering && slopeAligned;

	return { hit, ordering, slope };
}

function evaluateSeparation(candle: CandleBar, ma20: number, side: DoubleBBSide): SeparationResult {
	if (ma20 === 0) return { hit: false, distance: 0 };

	const distance = (candle.close - ma20) / ma20;

	// Hit: positive separation for bullish, negative for bearish
	const hit = (side === "bullish" && distance > 0) || (side === "bearish" && distance < 0);

	return { hit, distance };
}

function evaluateH1Bias(h1Bias: MaBias): H1BiasResult {
	return {
		hit: h1Bias === "aligned",
		bias: h1Bias,
	};
}

export function evaluateEvidence(input: EvidenceInput): EvidenceResult {
	const candlePattern = detectCandlePattern(input.candle, input.side);
	const maEvidence = evaluateMaEvidence(input);
	const separation = evaluateSeparation(input.candle, input.ma20, input.side);
	const h1Bias = evaluateH1Bias(input.h1Bias);

	const familyHitCount =
		(candlePattern.hit ? 1 : 0) +
		(maEvidence.hit ? 1 : 0) +
		(separation.hit ? 1 : 0) +
		(h1Bias.hit ? 1 : 0);

	return { candlePattern, maEvidence, separation, h1Bias, familyHitCount };
}
