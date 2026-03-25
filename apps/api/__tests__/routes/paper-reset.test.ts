/**
 * paper-reset tests — T-14-010
 *
 * Tests for the paper trading reset endpoint:
 *   POST /api/v1/paper/:strategyId/reset
 */
import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { errorHandlerPlugin } from "../../src/lib/errors.js";
import { type PaperApiDeps, paperApiRoutes } from "../../src/routes/paper/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STRATEGY_ID = "strat-001";
const OTHER_STRATEGY_ID = "strat-999";
const USER_ID = "user-abc";
const CURRENT_RUN_ID = "run-001";
const NEW_RUN_ID = "run-002";

// ---------------------------------------------------------------------------
// Mock deps factory
// ---------------------------------------------------------------------------

function createMockDeps(overrides: Partial<PaperApiDeps> = {}): PaperApiDeps {
	return {
		getStrategyOwner: async (strategyId) => {
			if (strategyId === STRATEGY_ID) return USER_ID;
			return null;
		},
		getPaperStatus: async (_strategyId) => ({
			strategyId: _strategyId,
			balance: { available: "9750", reserved: "250", total: "10000" },
			positions: [],
			mode: "paper" as const,
			runId: CURRENT_RUN_ID,
		}),
		listPaperOrders: async () => ({ data: [], total: 0 }),
		getPaperPerformance: async (_strategyId) => ({
			totalPnl: "500",
			winrate: "0.6",
			tradeCount: 10,
			sharpe: "1.2",
			maxDrawdown: "0.05",
			startBalance: "10000",
			currentBalance: "10500",
			runId: CURRENT_RUN_ID,
		}),
		resetPaperRun: async (_strategyId, _opts) => ({
			newRunId: NEW_RUN_ID,
			archivedRunId: CURRENT_RUN_ID,
			initialBalance: _opts?.initialBalance ?? "10000",
		}),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function createApp(deps?: PaperApiDeps, userId = USER_ID) {
	const d = deps ?? createMockDeps();
	return new Elysia()
		.use(errorHandlerPlugin)
		.derive(() => ({ userId }))
		.use(paperApiRoutes(d));
}

const BASE = "http://localhost/api/v1/paper";

function postReset(strategyId: string, body?: Record<string, unknown>) {
	return new Request(`${BASE}/${strategyId}/reset`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
}

// ---------------------------------------------------------------------------
// POST /paper/:strategyId/reset — happy path
// ---------------------------------------------------------------------------

describe("paper-reset: POST /paper/:strategyId/reset — happy path", () => {
	test("returns newRunId, archivedRunId, and initialBalance on success", async () => {
		const app = createApp();
		const res = await app.handle(postReset(STRATEGY_ID));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.newRunId).toBe(NEW_RUN_ID);
		expect(body.data.archivedRunId).toBe(CURRENT_RUN_ID);
		expect(typeof body.data.initialBalance).toBe("string");
	});

	test("uses default initialBalance when body is omitted", async () => {
		let capturedOpts: unknown;
		const deps = createMockDeps({
			resetPaperRun: async (strategyId, opts) => {
				capturedOpts = { strategyId, opts };
				return { newRunId: NEW_RUN_ID, archivedRunId: CURRENT_RUN_ID, initialBalance: "10000" };
			},
		});
		const app = createApp(deps);
		await app.handle(postReset(STRATEGY_ID));
		expect(
			(capturedOpts as { opts: { initialBalance?: string } }).opts?.initialBalance,
		).toBeUndefined();
	});

	test("passes provided initialBalance to resetPaperRun", async () => {
		let capturedOpts: unknown;
		const deps = createMockDeps({
			resetPaperRun: async (strategyId, opts) => {
				capturedOpts = { strategyId, opts };
				return { newRunId: NEW_RUN_ID, archivedRunId: CURRENT_RUN_ID, initialBalance: "5000" };
			},
		});
		const app = createApp(deps);
		await app.handle(postReset(STRATEGY_ID, { initialBalance: "5000" }));
		expect((capturedOpts as { opts: { initialBalance: string } }).opts?.initialBalance).toBe(
			"5000",
		);
	});

	test("returned initialBalance equals the reset value", async () => {
		const deps = createMockDeps({
			resetPaperRun: async (_strategyId, opts) => ({
				newRunId: NEW_RUN_ID,
				archivedRunId: CURRENT_RUN_ID,
				initialBalance: opts?.initialBalance ?? "10000",
			}),
		});
		const app = createApp(deps);
		const res = await app.handle(postReset(STRATEGY_ID, { initialBalance: "25000" }));
		const body = await res.json();
		expect(body.data.initialBalance).toBe("25000");
	});

	test("archives current run before reset (resetPaperRun called with strategyId)", async () => {
		const calls: string[] = [];
		const deps = createMockDeps({
			resetPaperRun: async (strategyId, _opts) => {
				calls.push(strategyId);
				return { newRunId: NEW_RUN_ID, archivedRunId: CURRENT_RUN_ID, initialBalance: "10000" };
			},
		});
		const app = createApp(deps);
		await app.handle(postReset(STRATEGY_ID));
		expect(calls).toEqual([STRATEGY_ID]);
	});

	test("newRunId is different from archivedRunId", async () => {
		const app = createApp();
		const res = await app.handle(postReset(STRATEGY_ID));
		const body = await res.json();
		expect(body.data.newRunId).not.toBe(body.data.archivedRunId);
	});
});

// ---------------------------------------------------------------------------
// POST /paper/:strategyId/reset — user isolation
// ---------------------------------------------------------------------------

describe("paper-reset: user isolation", () => {
	test("returns 403 when strategy belongs to another user", async () => {
		const app = createApp(undefined, "other-user");
		const res = await app.handle(postReset(STRATEGY_ID));
		expect(res.status).toBe(403);
	});

	test("returns 403 when strategyId does not exist", async () => {
		const app = createApp();
		const res = await app.handle(postReset(OTHER_STRATEGY_ID));
		expect(res.status).toBe(403);
	});

	test("returns 401 when no userId in context", async () => {
		const app = createApp(undefined, "");
		const res = await app.handle(postReset(STRATEGY_ID));
		expect(res.status).toBe(401);
	});

	test("resetPaperRun is NOT called for unauthorized user", async () => {
		let called = false;
		const deps = createMockDeps({
			resetPaperRun: async () => {
				called = true;
				return { newRunId: "x", archivedRunId: "y", initialBalance: "10000" };
			},
		});
		const app = createApp(deps, "other-user");
		await app.handle(postReset(STRATEGY_ID));
		expect(called).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// POST /paper/:strategyId/reset — input validation
// ---------------------------------------------------------------------------

describe("paper-reset: input validation", () => {
	test("returns 400 when initialBalance is zero", async () => {
		const app = createApp();
		const res = await app.handle(postReset(STRATEGY_ID, { initialBalance: "0" }));
		expect(res.status).toBe(400);
	});

	test("returns 400 when initialBalance is negative", async () => {
		const app = createApp();
		const res = await app.handle(postReset(STRATEGY_ID, { initialBalance: "-100" }));
		expect(res.status).toBe(400);
	});

	test("returns 400 when initialBalance is non-numeric string", async () => {
		const app = createApp();
		const res = await app.handle(postReset(STRATEGY_ID, { initialBalance: "abc" }));
		expect(res.status).toBe(400);
	});

	test("accepts initialBalance as a positive decimal string", async () => {
		const app = createApp();
		const res = await app.handle(postReset(STRATEGY_ID, { initialBalance: "15000.50" }));
		expect(res.status).toBe(200);
	});

	test("accepts request with no body (uses default)", async () => {
		const app = createApp();
		// No body means no initialBalance — should fall back to strategy default
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/reset`, { method: "POST" }));
		expect(res.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// POST /paper/:strategyId/reset — atomicity
// ---------------------------------------------------------------------------

describe("paper-reset: atomicity", () => {
	test("propagates error from resetPaperRun as 500", async () => {
		const deps = createMockDeps({
			resetPaperRun: async () => {
				throw new Error("DB transaction failed");
			},
		});
		const app = createApp(deps);
		const res = await app.handle(postReset(STRATEGY_ID));
		expect(res.status).toBe(500);
	});
});
