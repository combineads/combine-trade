import { Elysia, t } from "elysia";
import { ForbiddenError, UnauthorizedError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaperPosition {
	symbol: string;
	side: "LONG" | "SHORT";
	size: string;
	entryPrice: string;
	unrealizedPnl: string;
}

export interface PaperBalance {
	available: string;
	reserved: string;
	total: string;
}

export interface PaperStatusResult {
	strategyId: string;
	balance: PaperBalance;
	positions: PaperPosition[];
	mode: "paper" | "live";
	runId: string;
}

export interface PaperStatusDeps {
	getStrategyOwner: (strategyId: string) => Promise<string | null>;
	getPaperStatus: (strategyId: string) => Promise<PaperStatusResult>;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function paperStatusRoute(deps: PaperStatusDeps) {
	return new Elysia().get(
		"/api/v1/paper/:strategyId/status",
		async (ctx) => {
			const userId =
				typeof (ctx as unknown as Record<string, unknown>).userId === "string"
					? ((ctx as unknown as Record<string, unknown>).userId as string)
					: "";

			if (!userId) throw new UnauthorizedError();

			const owner = await deps.getStrategyOwner(ctx.params.strategyId);
			if (owner !== userId) throw new ForbiddenError();

			const status = await deps.getPaperStatus(ctx.params.strategyId);

			return ok(status);
		},
		{
			params: t.Object({ strategyId: t.String() }),
		},
	);
}
