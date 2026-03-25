/** Readiness report returned by GET /api/v1/trading/readiness/:strategyId */
export interface ReadinessReport {
	overall: number;
	components: {
		paper: number;
		backtest: number;
		risk: number;
	};
	/** True only when overall >= READINESS_THRESHOLD (70). */
	canGoLive: boolean;
}

/** Minimum readiness score required to transition to live trading. */
export const READINESS_THRESHOLD = 70;

/**
 * Pure predicate: returns true when the score meets the live trading gate.
 * Extracted as a pure function to allow refactoring in tests and callers.
 */
export function meetsReadinessGate(score: number): boolean {
	return score >= READINESS_THRESHOLD;
}
