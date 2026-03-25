import { computePValue } from "@combine/core/drift/index.js";
import Decimal from "decimal.js";
import { Elysia, t } from "elysia";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BacktestStats {
	winrate: string;
	expectancy: string;
	sharpe: string;
}

export interface LiveStats {
	winrate: string;
	expectancy: string;
	sharpe: string;
	tradeCount: number;
	wins: number;
	losses: number;
}

export interface GetBacktestStatsOptions {
	strategyId: string;
	userId: string;
}

export interface GetLiveStatsOptions {
	strategyId: string;
	userId: string;
	from?: string;
	to?: string;
}

export interface CheckStrategyAccessOptions {
	strategyId: string;
	userId: string;
}

/**
 * Result of a strategy ownership check.
 * - "own"       — strategy exists and belongs to the requesting user
 * - "other"     — strategy exists but belongs to a different user → 403
 * - "not_found" — strategy does not exist → 404
 */
export type StrategyAccessResult = "own" | "other" | "not_found";

/**
 * Dependency interface for the drift comparison route.
 * All methods receive userId to enforce per-user data isolation.
 */
export interface DriftComparisonDeps {
	/**
	 * Load aggregated backtest stats for the strategy.
	 * Returns null when the backtest result does not exist for this user.
	 */
	getBacktestStats: (options: GetBacktestStatsOptions) => Promise<BacktestStats | null>;

	/**
	 * Load aggregated live stats from trade journals within the date range.
	 * Must only return data owned by options.userId.
	 */
	getLiveStats: (options: GetLiveStatsOptions) => Promise<LiveStats>;

	/**
	 * Check whether the requesting user owns the strategy.
	 * Returns 'own', 'other', or 'not_found'.
	 */
	checkStrategyAccess: (options: CheckStrategyAccessOptions) => Promise<StrategyAccessResult>;
}

/**
 * Comparison result shape returned by the drift endpoint.
 */
export interface DriftComparison {
	strategyId: string;
	backtestStats: BacktestStats;
	liveStats: { winrate: string; expectancy: string; sharpe: string; tradeCount: number };
	zScore: string;
	pValue: string;
	driftScore: number;
	alertLevel: "none" | "warning" | "critical";
	isSignificant: boolean;
}

// ---------------------------------------------------------------------------
// Pure statistical helpers
// ---------------------------------------------------------------------------

const MIN_LIVE_TRADES = 30;
const MAX_Z = new Decimal(5);
const WARNING_THRESHOLD = 60;
const CRITICAL_THRESHOLD = 80;

export interface ZScoreInput {
	pBacktest: Decimal;
	pLive: Decimal;
	n: number;
}

/**
 * Compute the one-proportion z-test statistic.
 *
 * z = (p_live − p_backtest) / sqrt(p_backtest * (1 − p_backtest) / n)
 *
 * Returns Decimal(0) when the standard error is zero (degenerate case where
 * p_backtest is exactly 0 or 1).
 */
export function computeZScore({ pBacktest, pLive, n }: ZScoreInput): Decimal {
	const se = pBacktest.times(new Decimal(1).minus(pBacktest)).dividedBy(n).sqrt();
	if (se.isZero()) {
		return new Decimal(0);
	}
	return pLive.minus(pBacktest).dividedBy(se);
}

/**
 * Compute approximate p-value from a z-score using the normal distribution.
 *
 * For a two-tailed test:  p = 2 * (1 - Φ(|z|))
 *
 * We reuse computePValue from @combine/core/drift which implements erfc
 * approximation (Abramowitz & Stegun 7.1.26). The chi-squared erfc shortcut
 * for df=1 is equivalent to the two-tailed normal: p = erfc(|z| / sqrt(2)).
 * We compute chi2 = z^2 and delegate to the core helper.
 */
export function computePValueFromZ(z: Decimal): Decimal {
	const chi2 = z.pow(2);
	return computePValue(chi2);
}

/**
 * Map |z-score| to a drift score in [0, 100].
 *
 * score = min(100, |z| / MAX_Z * 100)
 * where MAX_Z = 5 (a z-score of 5 represents extreme divergence).
 */
export function mapZScoreToDriftScore(z: Decimal): number {
	const absZ = z.abs();
	const raw = absZ.dividedBy(MAX_Z).times(100);
	const clamped = Decimal.min(new Decimal(100), raw);
	return Math.round(clamped.toNumber() * 100) / 100;
}

function resolveAlertLevel(driftScore: number): "none" | "warning" | "critical" {
	if (driftScore >= CRITICAL_THRESHOLD) return "critical";
	if (driftScore >= WARNING_THRESHOLD) return "warning";
	return "none";
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Build the drift comparison route.
 *
 * GET /api/v1/journals/drift/:strategyId
 */
export function driftComparisonRoute(deps: DriftComparisonDeps) {
	return new Elysia().get(
		"/api/v1/journals/drift/:strategyId",
		async (ctx) => {
			const userId =
				typeof (ctx as unknown as Record<string, unknown>).userId === "string"
					? ((ctx as unknown as Record<string, unknown>).userId as string)
					: "";
			if (!userId) throw new UnauthorizedError();

			const { strategyId } = ctx.params;
			const { from, to } = ctx.query;

			// Ownership check — 403 if strategy belongs to another user, 404 if not found
			const access = await deps.checkStrategyAccess({ strategyId, userId });
			if (access === "not_found") {
				throw new NotFoundError(`Strategy ${strategyId} not found`);
			}
			if (access === "other") {
				throw new ForbiddenError(`Strategy ${strategyId} does not belong to this user`);
			}

			const [backtestStats, liveStats] = await Promise.all([
				deps.getBacktestStats({ strategyId, userId }),
				deps.getLiveStats({ strategyId, userId, from, to }),
			]);

			if (!backtestStats) {
				throw new NotFoundError(`No backtest results found for strategy ${strategyId}`);
			}

			// Minimum sample size guard
			if (liveStats.tradeCount < MIN_LIVE_TRADES) {
				const result: DriftComparison = {
					strategyId,
					backtestStats,
					liveStats: {
						winrate: liveStats.winrate,
						expectancy: liveStats.expectancy,
						sharpe: liveStats.sharpe,
						tradeCount: liveStats.tradeCount,
					},
					zScore: "0",
					pValue: "1",
					driftScore: 0,
					alertLevel: "none",
					isSignificant: false,
				};
				return ok(result);
			}

			// Compute z-test
			const pBacktest = new Decimal(backtestStats.winrate);
			const pLive = new Decimal(liveStats.winrate);
			const z = computeZScore({ pBacktest, pLive, n: liveStats.tradeCount });
			const pValue = computePValueFromZ(z);
			const driftScore = mapZScoreToDriftScore(z);
			const alertLevel = resolveAlertLevel(driftScore);
			const isSignificant = pValue.toNumber() < 0.05;

			const result: DriftComparison = {
				strategyId,
				backtestStats,
				liveStats: {
					winrate: liveStats.winrate,
					expectancy: liveStats.expectancy,
					sharpe: liveStats.sharpe,
					tradeCount: liveStats.tradeCount,
				},
				zScore: z.toFixed(10),
				pValue: pValue.toFixed(10),
				driftScore,
				alertLevel,
				isSignificant,
			};

			return ok(result);
		},
		{
			params: t.Object({ strategyId: t.String() }),
			query: t.Object({
				from: t.Optional(t.String()),
				to: t.Optional(t.String()),
			}),
		},
	);
}
