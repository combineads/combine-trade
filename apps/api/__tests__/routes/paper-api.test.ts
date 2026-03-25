/**
 * paper-api tests — T-14-009
 *
 * Tests for strategy-scoped paper trading endpoints:
 *   GET /api/v1/paper/:strategyId/status
 *   GET /api/v1/paper/:strategyId/orders
 *   GET /api/v1/paper/:strategyId/performance
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
const RUN_ID = "run-001";

const MOCK_POSITIONS = [
	{
		symbol: "BTCUSDT",
		side: "LONG" as const,
		size: "0.5",
		entryPrice: "60000",
		unrealizedPnl: "250",
	},
];

const MOCK_STATUS = {
	strategyId: STRATEGY_ID,
	balance: {
		available: "9750",
		reserved: "250",
		total: "10000",
	},
	positions: MOCK_POSITIONS,
	mode: "paper" as const,
	runId: RUN_ID,
};

const MOCK_ORDER = {
	id: "po-001",
	symbol: "BTCUSDT",
	side: "buy" as const,
	size: "0.5",
	price: "60000",
	status: "filled" as const,
	filledAt: "2026-01-01T00:00:00Z",
	pnl: "150",
};

const MOCK_PERFORMANCE = {
	totalPnl: "500",
	winrate: "0.6",
	tradeCount: 10,
	sharpe: "1.2",
	maxDrawdown: "0.05",
	startBalance: "10000",
	currentBalance: "10500",
	runId: RUN_ID,
};

// ---------------------------------------------------------------------------
// Mock deps
// ---------------------------------------------------------------------------

function createMockDeps(overrides: Partial<PaperApiDeps> = {}): PaperApiDeps {
	return {
		getStrategyOwner: async (strategyId) => {
			if (strategyId === STRATEGY_ID) return USER_ID;
			return null;
		},
		getPaperStatus: async (_strategyId) => MOCK_STATUS,
		listPaperOrders: async (_strategyId, _opts) => ({
			data: [MOCK_ORDER],
			total: 1,
		}),
		getPaperPerformance: async (_strategyId) => MOCK_PERFORMANCE,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function createApp(deps?: PaperApiDeps, userId = USER_ID) {
	const d = deps ?? createMockDeps();
	// Inject userId into the context to simulate betterAuth JWT middleware
	return new Elysia()
		.use(errorHandlerPlugin)
		.derive(() => ({ userId }))
		.use(paperApiRoutes(d));
}

const BASE = "http://localhost/api/v1/paper";

// ---------------------------------------------------------------------------
// GET /paper/:strategyId/status
// ---------------------------------------------------------------------------

describe("paper-api: GET /paper/:strategyId/status", () => {
	test("returns balance, positions, and mode for own strategy", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/status`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.strategyId).toBe(STRATEGY_ID);
		expect(body.data.balance.available).toBe("9750");
		expect(body.data.balance.reserved).toBe("250");
		expect(body.data.balance.total).toBe("10000");
		expect(body.data.positions).toBeArrayOfSize(1);
		expect(body.data.positions[0].symbol).toBe("BTCUSDT");
		expect(body.data.mode).toBe("paper");
		expect(body.data.runId).toBe(RUN_ID);
	});

	test("returns 403 when strategy belongs to another user", async () => {
		const app = createApp(undefined, "other-user");
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/status`));
		expect(res.status).toBe(403);
	});

	test("returns 403 when strategyId does not exist", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/${OTHER_STRATEGY_ID}/status`));
		expect(res.status).toBe(403);
	});

	test("returns 401 when no userId in context", async () => {
		const app = createApp(undefined, "");
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/status`));
		expect(res.status).toBe(401);
	});

	test("all monetary fields in balance are strings", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/status`));
		const body = await res.json();
		expect(typeof body.data.balance.available).toBe("string");
		expect(typeof body.data.balance.reserved).toBe("string");
		expect(typeof body.data.balance.total).toBe("string");
	});

	test("unrealizedPnl in positions is a string", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/status`));
		const body = await res.json();
		expect(typeof body.data.positions[0].unrealizedPnl).toBe("string");
	});
});

// ---------------------------------------------------------------------------
// GET /paper/:strategyId/orders
// ---------------------------------------------------------------------------

describe("paper-api: GET /paper/:strategyId/orders", () => {
	test("returns paginated orders with correct shape", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/orders`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.meta.total).toBe(1);
		expect(body.meta.page).toBe(1);
		expect(body.meta.pageSize).toBe(20);
	});

	test("order shape has required fields", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/orders`));
		const body = await res.json();
		const order = body.data[0];
		expect(order.id).toBeDefined();
		expect(order.symbol).toBeDefined();
		expect(order.side).toBeDefined();
		expect(order.size).toBeDefined();
		expect(order.price).toBeDefined();
		expect(order.status).toBeDefined();
		expect(order.filledAt).toBeDefined();
		expect(order.pnl).toBeDefined();
	});

	test("filters by status query param", async () => {
		let capturedOpts: unknown;
		const deps = createMockDeps({
			listPaperOrders: async (_strategyId, opts) => {
				capturedOpts = opts;
				return { data: [], total: 0 };
			},
		});
		const app = createApp(deps);
		await app.handle(new Request(`${BASE}/${STRATEGY_ID}/orders?status=filled`));
		expect((capturedOpts as { status?: string }).status).toBe("filled");
	});

	test("filters by symbol query param", async () => {
		let capturedOpts: unknown;
		const deps = createMockDeps({
			listPaperOrders: async (_strategyId, opts) => {
				capturedOpts = opts;
				return { data: [], total: 0 };
			},
		});
		const app = createApp(deps);
		await app.handle(new Request(`${BASE}/${STRATEGY_ID}/orders?symbol=ETHUSDT`));
		expect((capturedOpts as { symbol?: string }).symbol).toBe("ETHUSDT");
	});

	test("caps limit at 100", async () => {
		let capturedOpts: unknown;
		const deps = createMockDeps({
			listPaperOrders: async (_strategyId, opts) => {
				capturedOpts = opts;
				return { data: [], total: 0 };
			},
		});
		const app = createApp(deps);
		await app.handle(new Request(`${BASE}/${STRATEGY_ID}/orders?limit=999`));
		expect((capturedOpts as { limit: number }).limit).toBe(100);
	});

	test("returns 403 for another user's strategy", async () => {
		const app = createApp(undefined, "other-user");
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/orders`));
		expect(res.status).toBe(403);
	});

	test("returns 401 when no userId", async () => {
		const app = createApp(undefined, "");
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/orders`));
		expect(res.status).toBe(401);
	});
});

// ---------------------------------------------------------------------------
// GET /paper/:strategyId/performance
// ---------------------------------------------------------------------------

describe("paper-api: GET /paper/:strategyId/performance", () => {
	test("returns correct PnL, winrate, sharpe, maxDrawdown for known fixtures", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/performance`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.totalPnl).toBe("500");
		expect(body.data.winrate).toBe("0.6");
		expect(body.data.tradeCount).toBe(10);
		expect(body.data.sharpe).toBe("1.2");
		expect(body.data.maxDrawdown).toBe("0.05");
		expect(body.data.startBalance).toBe("10000");
		expect(body.data.currentBalance).toBe("10500");
		expect(body.data.runId).toBe(RUN_ID);
	});

	test("all monetary values are strings, not numbers", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/performance`));
		const body = await res.json();
		expect(typeof body.data.totalPnl).toBe("string");
		expect(typeof body.data.winrate).toBe("string");
		expect(typeof body.data.sharpe).toBe("string");
		expect(typeof body.data.maxDrawdown).toBe("string");
		expect(typeof body.data.startBalance).toBe("string");
		expect(typeof body.data.currentBalance).toBe("string");
	});

	test("tradeCount is a number", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/performance`));
		const body = await res.json();
		expect(typeof body.data.tradeCount).toBe("number");
	});

	test("returns 403 for another user's strategy", async () => {
		const app = createApp(undefined, "other-user");
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/performance`));
		expect(res.status).toBe(403);
	});

	test("returns 401 when no userId", async () => {
		const app = createApp(undefined, "");
		const res = await app.handle(new Request(`${BASE}/${STRATEGY_ID}/performance`));
		expect(res.status).toBe(401);
	});
});

// ---------------------------------------------------------------------------
// Pure function tests: computeSharpe and computeMaxDrawdown
// ---------------------------------------------------------------------------

import { computeMaxDrawdown, computeSharpe } from "../../src/routes/paper/performance.js";

describe("paper-api: computeSharpe pure function", () => {
	test("returns '0' for empty returns", () => {
		expect(computeSharpe([])).toBe("0");
	});

	test("returns '0' for single return", () => {
		expect(computeSharpe(["100"])).toBe("0");
	});

	test("computes positive sharpe for consistently positive returns", () => {
		const returns = ["10", "12", "8", "11", "9"];
		const sharpe = computeSharpe(returns);
		const val = Number.parseFloat(sharpe);
		expect(val).toBeGreaterThan(0);
	});

	test("result is a string", () => {
		expect(typeof computeSharpe(["5", "10", "15"])).toBe("string");
	});
});

describe("paper-api: computeMaxDrawdown pure function", () => {
	test("returns '0' for empty sequence", () => {
		expect(computeMaxDrawdown([])).toBe("0");
	});

	test("returns '0' for monotonically increasing balances", () => {
		expect(computeMaxDrawdown(["100", "110", "120", "130"])).toBe("0");
	});

	test("computes correct drawdown for known sequence", () => {
		// Peak = 120, trough = 90 → drawdown = (120-90)/120 = 0.25
		const dd = computeMaxDrawdown(["100", "120", "90"]);
		expect(dd).toBe("0.25");
	});

	test("result is a string", () => {
		expect(typeof computeMaxDrawdown(["100", "80"])).toBe("string");
	});
});
