export type Direction = "LONG" | "SHORT" | "PASS";

export type DecisionReason =
	| "criteria_met"
	| "insufficient_samples"
	| "low_winrate"
	| "negative_expectancy";

export type ConfidenceTier = "low" | "medium" | "high" | "very_high";

export interface DecisionConfig {
	minSamples?: number;
	minWinrate?: number;
	minExpectancy?: number;
}

export interface DecisionInput {
	winrate: number;
	avgWin: number;
	avgLoss: number;
	expectancy: number;
	sampleCount: number;
}

export interface DecisionResult {
	decision: Direction;
	reason: DecisionReason;
	statistics: DecisionInput;
	ciLower: number;
	ciUpper: number;
	confidenceTier: ConfidenceTier;
}
