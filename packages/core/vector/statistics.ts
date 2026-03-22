import type { PatternStatistics } from "./types.js";

const MIN_SAMPLES = 30;

/** Label data for statistics computation */
export interface EventLabel {
	resultType: "WIN" | "LOSS" | "TIME_EXIT";
	pnlPct: number;
}

/**
 * Compute pattern statistics from labeled events.
 *
 * - WIN: positive outcome
 * - LOSS: negative outcome
 * - TIME_EXIT with positive pnl → counted as win
 * - TIME_EXIT with negative/zero pnl → counted as loss
 */
export function computeStatistics(
	labels: EventLabel[],
	minSamples = MIN_SAMPLES,
): PatternStatistics {
	const total = labels.length;

	if (total === 0) {
		return {
			winrate: 0,
			avgWin: 0,
			avgLoss: 0,
			expectancy: 0,
			sampleCount: 0,
			status: "INSUFFICIENT",
		};
	}

	let winCount = 0;
	let winSum = 0;
	let lossCount = 0;
	let lossSum = 0;

	for (const label of labels) {
		const isWin =
			label.resultType === "WIN" || (label.resultType === "TIME_EXIT" && label.pnlPct > 0);

		if (isWin) {
			winCount++;
			winSum += Math.abs(label.pnlPct);
		} else {
			lossCount++;
			lossSum += Math.abs(label.pnlPct);
		}
	}

	const winrate = winCount / total;
	const avgWin = winCount > 0 ? winSum / winCount : 0;
	const avgLoss = lossCount > 0 ? lossSum / lossCount : 0;
	const expectancy = winrate * avgWin - (1 - winrate) * avgLoss;

	return {
		winrate,
		avgWin,
		avgLoss,
		expectancy,
		sampleCount: total,
		status: total >= minSamples ? "SUFFICIENT" : "INSUFFICIENT",
	};
}
