import { Elysia, t } from "elysia";
import type { BacktestReport } from "../../../../packages/backtest/report.js";
import { ApiError, NotFoundError, ValidationError } from "../lib/errors.js";
import { ok } from "../lib/response.js";

export interface BacktestRequest {
	strategyId: string;
	symbol: string;
	timeframe: string;
	from: string;
	to: string;
	initialBalance?: number;
}

export interface BacktestRouteDeps {
	runBacktest: (req: BacktestRequest) => Promise<BacktestReport>;
	strategyExists: (id: string) => Promise<boolean>;
}

export function backtestRoutes(deps: BacktestRouteDeps) {
	return new Elysia().post(
		"/api/v1/backtest",
		async ({ body }) => {
			if (new Date(body.from) >= new Date(body.to)) {
				throw new ValidationError("'from' must be before 'to'");
			}

			const exists = await deps.strategyExists(body.strategyId);
			if (!exists) throw new NotFoundError(`Strategy ${body.strategyId} not found`);

			try {
				const result = await deps.runBacktest(body);
				return ok(result);
			} catch (err) {
				if (err instanceof ApiError) throw err;
				throw new ApiError(500, "BACKTEST_FAILED", "Backtest execution failed");
			}
		},
		{
			body: t.Object({
				strategyId: t.String(),
				symbol: t.String(),
				timeframe: t.String(),
				from: t.String(),
				to: t.String(),
				initialBalance: t.Optional(t.Number()),
			}),
		},
	);
}
