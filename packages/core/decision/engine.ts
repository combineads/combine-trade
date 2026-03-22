import { confidenceTier, wilsonScoreCI } from "./confidence.js";
import type { DecisionConfig, DecisionInput, DecisionResult, Direction } from "./types.js";

const DEFAULT_MIN_SAMPLES = 30;
const DEFAULT_MIN_WINRATE = 0.55;
const DEFAULT_MIN_EXPECTANCY = 0;

/**
 * Pure function decision engine.
 * Takes pattern statistics and returns LONG/SHORT/PASS judgment.
 */
export function judge(
	statistics: DecisionInput,
	strategyDirection: "long" | "short",
	config?: DecisionConfig,
): DecisionResult {
	const minSamples = config?.minSamples ?? DEFAULT_MIN_SAMPLES;
	const minWinrate = config?.minWinrate ?? DEFAULT_MIN_WINRATE;
	const minExpectancy = config?.minExpectancy ?? DEFAULT_MIN_EXPECTANCY;

	const { lower, upper } = wilsonScoreCI(statistics.winrate, statistics.sampleCount);
	const tier = confidenceTier(statistics.sampleCount);

	const base = { statistics, ciLower: lower, ciUpper: upper, confidenceTier: tier };

	// Check criteria in priority order
	if (statistics.sampleCount < minSamples) {
		return { ...base, decision: "PASS", reason: "insufficient_samples" };
	}

	if (statistics.winrate < minWinrate) {
		return { ...base, decision: "PASS", reason: "low_winrate" };
	}

	if (statistics.expectancy <= minExpectancy) {
		return { ...base, decision: "PASS", reason: "negative_expectancy" };
	}

	// All criteria met — enter in strategy's direction
	const decision: Direction = strategyDirection === "long" ? "LONG" : "SHORT";
	return { ...base, decision, reason: "criteria_met" };
}
