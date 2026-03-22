export type {
	CandleBar,
	BollingerBands,
	DoubleBBVariant,
	DoubleBBSide,
	DoubleBBResult,
} from "./detector.js";
export { detectDoubleBB } from "./detector.js";

export type {
	MaBias,
	EvidenceInput,
	EvidenceResult,
	CandlePatternName,
	CandlePatternResult,
	MaEvidenceResult,
	SeparationResult,
	H1BiasResult,
} from "./evidence.js";
export { evaluateEvidence } from "./evidence.js";

export type {
	GateContext,
	GateRejectReason,
	GateResult,
} from "./gate.js";
export { evaluateGate } from "./gate.js";

export type {
	FeatureInput,
	FeatureVector,
	TargetResult,
} from "./features.js";
export { computeFeatures, computeTargets } from "./features.js";

export type {
	DoubleBBEvaluationInput,
	DoubleBBEvaluation,
} from "./evaluate.js";
export { evaluateDoubleBB } from "./evaluate.js";
