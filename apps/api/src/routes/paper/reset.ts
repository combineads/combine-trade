import Decimal from "decimal.js";
import { Elysia, t } from "elysia";
import { ApiError, ForbiddenError, UnauthorizedError } from "../../lib/errors.js";
import { ok } from "../../lib/response.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaperResetOptions {
	/** Override initial balance — must be a positive Decimal string. Omit to use strategy default. */
	initialBalance?: string;
}

export interface PaperResetResult {
	newRunId: string;
	archivedRunId: string;
	initialBalance: string;
}

export interface PaperResetDeps {
	getStrategyOwner: (strategyId: string) => Promise<string | null>;
	resetPaperRun: (strategyId: string, opts?: PaperResetOptions) => Promise<PaperResetResult>;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Validate initialBalance string.
 * Returns an error message when invalid, or null when valid.
 */
export function validateInitialBalance(value: string): string | null {
	let d: Decimal;
	try {
		d = new Decimal(value);
	} catch {
		return "initialBalance must be a valid numeric string";
	}
	if (d.isNaN() || !d.isFinite()) {
		return "initialBalance must be a finite number";
	}
	if (d.lte(0)) {
		return "initialBalance must be greater than zero";
	}
	return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function paperResetRoute(deps: PaperResetDeps) {
	return new Elysia().post(
		"/api/v1/paper/:strategyId/reset",
		async (ctx) => {
			const userId =
				typeof (ctx as unknown as Record<string, unknown>).userId === "string"
					? ((ctx as unknown as Record<string, unknown>).userId as string)
					: "";

			if (!userId) throw new UnauthorizedError();

			const owner = await deps.getStrategyOwner(ctx.params.strategyId);
			if (owner !== userId) throw new ForbiddenError();

			// Validate optional initialBalance
			const rawBalance = (ctx.body as { initialBalance?: string } | undefined)?.initialBalance;
			if (rawBalance !== undefined) {
				const err = validateInitialBalance(rawBalance);
				if (err) throw new ApiError(400, "INVALID_INITIAL_BALANCE", err);
			}

			const result = await deps.resetPaperRun(ctx.params.strategyId, {
				initialBalance: rawBalance,
			});

			return ok(result);
		},
		{
			params: t.Object({ strategyId: t.String() }),
			body: t.Optional(
				t.Object({
					initialBalance: t.Optional(t.String()),
				}),
			),
		},
	);
}
