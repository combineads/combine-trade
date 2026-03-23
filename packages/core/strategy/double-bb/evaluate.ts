import type { BollingerBands, CandleBar, DoubleBBResult } from "./detector.js";
import { detectDoubleBB } from "./detector.js";
import type { MaBias } from "./evidence.js";
import { evaluateEvidence } from "./evidence.js";
import type { FeatureVector, TargetResult } from "./features.js";
import { computeFeatures, computeTargets } from "./features.js";
import { evaluateGate } from "./gate.js";

export interface DoubleBBEvaluationInput {
	candle: CandleBar;
	bb20: BollingerBands;
	bb4: BollingerBands;
	prevBb4: BollingerBands;
	prevBb20?: BollingerBands;
	ma20: number;
	ma50: number;
	ma100: number;
	ma200: number;
	prevMa20: number;
	prevMa50: number;
	h1Bias: MaBias;
	volume: number;
	avgVolume20: number;
	atr14: number;
	direction: "long" | "short" | "both";
}

export interface DoubleBBEvaluation {
	pattern: DoubleBBResult;
	features: FeatureVector;
	targets: TargetResult;
}

export function evaluateDoubleBB(input: DoubleBBEvaluationInput): DoubleBBEvaluation | null {
	// Step 1: Detect pattern
	const pattern = detectDoubleBB(
		input.candle,
		input.bb20,
		input.bb4,
		input.prevBb4,
		input.prevBb20,
	);

	// Step 2: Evaluate evidence
	const evidence = evaluateEvidence({
		candle: input.candle,
		side: pattern?.side ?? "bullish",
		ma20: input.ma20,
		ma50: input.ma50,
		ma100: input.ma100,
		ma200: input.ma200,
		prevMa20: input.prevMa20,
		prevMa50: input.prevMa50,
		h1Bias: input.h1Bias,
	});

	// Step 3: Gate check
	const gate = evaluateGate(pattern, evidence, { direction: input.direction });
	if (!gate.pass) return null;

	// pattern is guaranteed non-null after gate passes
	const confirmedPattern = pattern as DoubleBBResult;

	// Step 4: Compute features
	const candleRange = input.candle.high - input.candle.low;
	const features = computeFeatures({
		pattern: confirmedPattern,
		evidence,
		close: input.candle.close,
		bb20Upper: input.bb20.upper,
		bb20Lower: input.bb20.lower,
		volume: input.volume,
		avgVolume20: input.avgVolume20,
		candleRange,
		atr14: input.atr14,
	});

	// Step 5: Compute targets
	const targets = computeTargets(confirmedPattern.side, input.candle.close, input.atr14);

	return { pattern: confirmedPattern, features, targets };
}
