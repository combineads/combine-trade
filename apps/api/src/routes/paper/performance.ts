import Decimal from "decimal.js";
import { Elysia, t } from "elysia";
import { ForbiddenError, UnauthorizedError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";

// ---------------------------------------------------------------------------
// Pure computation helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Compute the Sharpe ratio from a list of per-trade PnL strings.
 *
 * Sharpe = mean(returns) / stddev(returns)
 *
 * Returns "0" when there are fewer than 2 data points or stddev is zero.
 * All arithmetic uses Decimal.js to avoid float drift.
 */
export function computeSharpe(pnlStrings: string[]): string {
	if (pnlStrings.length < 2) return "0";

	const values = pnlStrings.map((v) => new Decimal(v));
	const n = new Decimal(values.length);

	const sum = values.reduce((acc, v) => acc.plus(v), new Decimal(0));
	const mean = sum.div(n);

	const variance = values.reduce((acc, v) => acc.plus(v.minus(mean).pow(2)), new Decimal(0)).div(n);

	const stddev = variance.sqrt();

	if (stddev.isZero()) return "0";

	return mean.div(stddev).toDecimalPlaces(4).toString();
}

/**
 * Compute the maximum drawdown from a running-balance sequence.
 *
 * maxDrawdown = max((peak - trough) / peak) over all peaks encountered.
 *
 * Returns "0" for empty input or a monotonically increasing sequence.
 * Result is a decimal fraction (e.g. "0.25" means 25% drawdown).
 */
export function computeMaxDrawdown(balances: string[]): string {
	if (balances.length === 0) return "0";

	let peak = new Decimal(balances[0] ?? "0");
	let maxDd = new Decimal(0);

	for (const b of balances) {
		const val = new Decimal(b);
		if (val.greaterThan(peak)) {
			peak = val;
		} else if (!peak.isZero()) {
			const dd = peak.minus(val).div(peak);
			if (dd.greaterThan(maxDd)) {
				maxDd = dd;
			}
		}
	}

	return maxDd.toDecimalPlaces(4).toString();
}

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

export interface PaperPerformanceResult {
	totalPnl: string;
	winrate: string;
	tradeCount: number;
	sharpe: string;
	maxDrawdown: string;
	startBalance: string;
	currentBalance: string;
	runId: string;
}

export interface PaperPerformanceDeps {
	getStrategyOwner: (strategyId: string) => Promise<string | null>;
	getPaperPerformance: (strategyId: string) => Promise<PaperPerformanceResult>;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function paperPerformanceRoute(deps: PaperPerformanceDeps) {
	return new Elysia().get(
		"/api/v1/paper/:strategyId/performance",
		async (ctx) => {
			const userId =
				typeof (ctx as unknown as Record<string, unknown>).userId === "string"
					? ((ctx as unknown as Record<string, unknown>).userId as string)
					: "";

			if (!userId) throw new UnauthorizedError();

			const owner = await deps.getStrategyOwner(ctx.params.strategyId);
			if (owner !== userId) throw new ForbiddenError();

			const performance = await deps.getPaperPerformance(ctx.params.strategyId);

			return ok(performance);
		},
		{
			params: t.Object({ strategyId: t.String() }),
		},
	);
}
