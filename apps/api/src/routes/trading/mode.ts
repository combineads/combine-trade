import { Elysia, t } from "elysia";
import { NotFoundError, ReadinessGateError, UnauthorizedError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";
import { type ReadinessReport, READINESS_THRESHOLD, meetsReadinessGate } from "./readiness.js";

export type TradingMode = "analysis" | "alert" | "paper" | "live";

/** Dependencies for POST /api/v1/trading/mode/:strategyId */
export interface TradingModeRouteDeps {
	/** Check ownership: returns true if the strategy belongs to userId */
	strategyExists: (strategyId: string, userId: string) => Promise<boolean>;
	/** Get current readiness report for gate evaluation */
	getReadinessScore: (strategyId: string, userId: string) => Promise<ReadinessReport>;
	/** Get the strategy's current execution mode */
	getCurrentMode: (strategyId: string, userId: string) => Promise<TradingMode>;
	/**
	 * Atomically set the strategy's execution mode.
	 * Gate check must be completed before this call.
	 */
	setMode: (strategyId: string, mode: TradingMode) => Promise<void>;
}

/** Dependencies for GET /api/v1/trading/readiness/:strategyId */
export interface ReadinessRouteDeps {
	strategyExists: (strategyId: string, userId: string) => Promise<boolean>;
	getReadinessReport: (strategyId: string, userId: string) => Promise<ReadinessReport>;
}

function extractUserId(ctx: Record<string, unknown>): string {
	return typeof ctx.userId === "string" ? ctx.userId : "";
}

/**
 * POST /api/v1/trading/mode/:strategyId
 *
 * - Body: { mode: 'paper' | 'live' | ... }
 * - Rejects with 422 READINESS_GATE_FAILED if transitioning to live and score < 70
 * - Paper and live→paper transitions always succeed
 * - Returns { strategyId, mode, readinessScore }
 */
export function tradingModeRoutes(deps: TradingModeRouteDeps) {
	return new Elysia({ prefix: "/api/v1/trading/mode" }).post(
		"/:strategyId",
		async (ctx) => {
			const userId = extractUserId(ctx as unknown as Record<string, unknown>);
			if (!userId) throw new UnauthorizedError();

			const { strategyId } = ctx.params;
			const { mode } = ctx.body;

			const exists = await deps.strategyExists(strategyId, userId);
			if (!exists) throw new NotFoundError(`Strategy ${strategyId} not found`);

			// Get readiness score (needed for both gate check and response)
			const report = await deps.getReadinessScore(strategyId, userId);

			// Enforce readiness gate only for transitions TO live
			if (mode === "live" && !meetsReadinessGate(report.overall)) {
				throw new ReadinessGateError(report.overall, READINESS_THRESHOLD);
			}

			await deps.setMode(strategyId, mode);

			return ok({ strategyId, mode, readinessScore: report.overall });
		},
		{
			params: t.Object({ strategyId: t.String() }),
			body: t.Object({
				mode: t.Union([
					t.Literal("analysis"),
					t.Literal("alert"),
					t.Literal("paper"),
					t.Literal("live"),
				]),
			}),
		},
	);
}

/**
 * GET /api/v1/trading/readiness/:strategyId
 *
 * Returns ReadinessReport: { overall, components: { paper, backtest, risk }, canGoLive }
 */
export function readinessRoutes(deps: ReadinessRouteDeps) {
	return new Elysia({ prefix: "/api/v1/trading/readiness" }).get(
		"/:strategyId",
		async (ctx) => {
			const userId = extractUserId(ctx as unknown as Record<string, unknown>);
			if (!userId) throw new UnauthorizedError();

			const { strategyId } = ctx.params;

			const exists = await deps.strategyExists(strategyId, userId);
			if (!exists) throw new NotFoundError(`Strategy ${strategyId} not found`);

			const report = await deps.getReadinessReport(strategyId, userId);
			return ok(report);
		},
		{
			params: t.Object({ strategyId: t.String() }),
		},
	);
}
