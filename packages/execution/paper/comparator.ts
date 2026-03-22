import Decimal from "decimal.js";

const Z_THRESHOLD = new Decimal("-1.645");

/**
 * One-sided z-test comparing paper win rate to backtest win rate.
 * H0: paper_wr >= backtest_wr. Reject if z < -1.645 (p < 0.05).
 * z = (paper_wr - bt_wr) / sqrt(bt_wr * (1 - bt_wr) / n)
 */
export function zTestWinRate(
	paperWinRate: number,
	backtestWinRate: number,
	paperSampleCount: number,
): { z: string; pass: boolean } {
	const pWr = new Decimal(paperWinRate);
	const btWr = new Decimal(backtestWinRate);
	const n = new Decimal(paperSampleCount);

	if (pWr.eq(btWr)) {
		return { z: "0", pass: true };
	}

	const stdErr = btWr.mul(new Decimal(1).minus(btWr)).div(n).sqrt();
	if (stdErr.isZero()) {
		return { z: "0", pass: true };
	}

	const z = pWr.minus(btWr).div(stdErr);
	return { z: z.toString(), pass: z.gte(Z_THRESHOLD) };
}

/**
 * Annualized Sharpe ratio for 24/7 crypto: mean / stddev * sqrt(365).
 * Returns "0" for insufficient data or zero standard deviation.
 */
export function sharpeRatio(dailyReturns: string[]): string {
	if (dailyReturns.length < 2) return "0";

	const values = dailyReturns.map((r) => new Decimal(r));
	const n = new Decimal(values.length);
	const mean = values.reduce((sum, v) => sum.plus(v), new Decimal(0)).div(n);

	const variance = values
		.reduce((sum, v) => sum.plus(v.minus(mean).pow(2)), new Decimal(0))
		.div(n.minus(1));

	const stdDev = variance.sqrt();
	if (stdDev.isZero()) return "0";

	const annualizationFactor = new Decimal(365).sqrt();
	return mean.div(stdDev).mul(annualizationFactor).toString();
}

/**
 * Maximum drawdown as a percentage: max((peak - trough) / peak * 100).
 * Returns "0" for empty or single-value curves.
 */
export function maxDrawdown(equityCurve: string[]): string {
	if (equityCurve.length < 2) return "0";

	let peak = new Decimal(equityCurve[0]!);
	let maxDd = new Decimal(0);

	for (let i = 1; i < equityCurve.length; i++) {
		const current = new Decimal(equityCurve[i]!);
		if (current.gt(peak)) {
			peak = current;
		}
		const dd = peak.minus(current).div(peak).mul(100);
		if (dd.gt(maxDd)) {
			maxDd = dd;
		}
	}

	return maxDd.toString();
}

/** Compute expectancy delta: paper - backtest. */
export function expectancyDelta(paperExpectancy: string, backtestExpectancy: string): string {
	return new Decimal(paperExpectancy).minus(backtestExpectancy).toString();
}
