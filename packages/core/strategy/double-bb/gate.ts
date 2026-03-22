import type { DoubleBBResult } from "./detector.js";
import type { EvidenceResult } from "./evidence.js";

export interface GateContext {
	direction: "long" | "short" | "both";
}

export type GateRejectReason =
	| "no_pattern"
	| "weak_evidence"
	| "counter_trend"
	| "direction_filter";

export interface GateResult {
	pass: boolean;
	rejectReason?: GateRejectReason;
}

const MIN_EVIDENCE_FAMILIES = 3;

export function evaluateGate(
	pattern: DoubleBBResult | null,
	evidence: EvidenceResult,
	context: GateContext,
): GateResult {
	// Rule 1: Double-BB pattern must be detected
	if (!pattern) {
		return { pass: false, rejectReason: "no_pattern" };
	}

	// Rule 2: Direction filter
	if (context.direction === "long" && pattern.side === "bearish") {
		return { pass: false, rejectReason: "direction_filter" };
	}
	if (context.direction === "short" && pattern.side === "bullish") {
		return { pass: false, rejectReason: "direction_filter" };
	}

	// Rule 3: Evidence >= 3 families
	if (evidence.familyHitCount < MIN_EVIDENCE_FAMILIES) {
		return { pass: false, rejectReason: "weak_evidence" };
	}

	// Rule 4: Counter trend bias
	if (evidence.h1Bias.bias === "counter_trend") {
		return { pass: false, rejectReason: "counter_trend" };
	}

	return { pass: true };
}
