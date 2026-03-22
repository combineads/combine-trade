import type { ConfidenceTier } from "./types.js";

/**
 * Wilson score confidence interval for binomial proportion.
 * z=1.96 for 95% confidence.
 */
export function wilsonScoreCI(
	winrate: number,
	n: number,
	z = 1.96,
): { lower: number; upper: number } {
	if (n === 0) return { lower: 0, upper: 0 };

	const z2 = z * z;
	const denominator = 1 + z2 / n;
	const centre = winrate + z2 / (2 * n);
	const spread = z * Math.sqrt((winrate * (1 - winrate)) / n + z2 / (4 * n * n));

	const lower = Math.max(0, (centre - spread) / denominator);
	const upper = Math.min(1, (centre + spread) / denominator);

	return { lower, upper };
}

/** Classify confidence tier based on sample count */
export function confidenceTier(sampleCount: number): ConfidenceTier {
	if (sampleCount >= 300) return "very_high";
	if (sampleCount >= 150) return "high";
	if (sampleCount >= 60) return "medium";
	return "low";
}
