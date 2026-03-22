import type { DoubleBBResult, DoubleBBSide } from "./detector.js";
import type { EvidenceResult } from "./evidence.js";

export interface FeatureInput {
	pattern: DoubleBBResult;
	evidence: EvidenceResult;
	close: number;
	bb20Upper: number;
	bb20Lower: number;
	volume: number;
	avgVolume20: number;
	candleRange: number;
	atr14: number;
}

export interface FeatureVector {
	double_bb_variant: number;
	candle_pattern_score: number;
	ma_slope_score: number;
	ma_ordering_score: number;
	ma_reaction_score: number;
	separation_distance: number;
	h1_bias_alignment: number;
	price_in_bb20: number;
	volume_ratio: number;
	atr_range: number;
}

export interface TargetResult {
	takeProfit: number;
	stopLoss: number;
	maxHoldBars: number;
}

const VARIANT_MAP: Record<string, number> = {
	trend_continuation: 0.33,
	reversal: 0.67,
	breakout: 1.0,
};

const BIAS_MAP: Record<string, number> = {
	counter_trend: 0,
	neutral_bias: 0.5,
	aligned: 1.0,
};

const TP_MULTIPLIER = 2.0;
const SL_MULTIPLIER = 1.0;
const DEFAULT_MAX_HOLD_BARS = 60;

function sigmoid(x: number, center: number, scale: number): number {
	return 1 / (1 + Math.exp(-(x - center) / scale));
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function computeFeatures(input: FeatureInput): FeatureVector {
	const { pattern, evidence, close, bb20Upper, bb20Lower, volume, avgVolume20, candleRange, atr14 } = input;

	// 1. double_bb_variant: minmax mapping
	const double_bb_variant = VARIANT_MAP[pattern.variant] ?? 0;

	// 2. candle_pattern_score: boolean
	const candle_pattern_score = evidence.candlePattern.hit ? 1 : 0;

	// 3. ma_slope_score: sigmoid on slope direction strength
	const slopeValue = evidence.maEvidence.slope === "bullish" ? 1 :
		evidence.maEvidence.slope === "bearish" ? -1 : 0;
	const ma_slope_score = clamp01(sigmoid(slopeValue, 0, 0.5));

	// 4. ma_ordering_score: boolean
	const ma_ordering_score = evidence.maEvidence.ordering ? 1 : 0;

	// 5. ma_reaction_score: boolean (uses maEvidence hit as proxy for reaction)
	const ma_reaction_score = evidence.maEvidence.hit ? 1 : 0;

	// 6. separation_distance: sigmoid on distance
	const separation_distance = clamp01(sigmoid(Math.abs(evidence.separation.distance), 0.01, 0.01));

	// 7. h1_bias_alignment: minmax
	const h1_bias_alignment = BIAS_MAP[evidence.h1Bias.bias] ?? 0.5;

	// 8. price_in_bb20: percent position within BB20
	const bb20Width = bb20Upper - bb20Lower;
	const price_in_bb20 = bb20Width > 0 ? clamp01((close - bb20Lower) / bb20Width) : 0.5;

	// 9. volume_ratio: sigmoid on volume/avgVolume ratio
	const volRatio = avgVolume20 > 0 ? volume / avgVolume20 : 1;
	const volume_ratio = clamp01(sigmoid(volRatio, 1, 0.5));

	// 10. atr_range: sigmoid on candleRange/ATR ratio
	const atrRatio = atr14 > 0 ? candleRange / atr14 : 1;
	const atr_range = clamp01(sigmoid(atrRatio, 1, 0.5));

	return {
		double_bb_variant,
		candle_pattern_score,
		ma_slope_score,
		ma_ordering_score,
		ma_reaction_score,
		separation_distance,
		h1_bias_alignment,
		price_in_bb20,
		volume_ratio,
		atr_range,
	};
}

export function computeTargets(
	side: DoubleBBSide,
	entryPrice: number,
	atr: number,
	maxHoldBars: number = DEFAULT_MAX_HOLD_BARS,
): TargetResult {
	if (side === "bullish") {
		return {
			takeProfit: entryPrice + atr * TP_MULTIPLIER,
			stopLoss: entryPrice - atr * SL_MULTIPLIER,
			maxHoldBars,
		};
	}
	return {
		takeProfit: entryPrice - atr * TP_MULTIPLIER,
		stopLoss: entryPrice + atr * SL_MULTIPLIER,
		maxHoldBars,
	};
}
