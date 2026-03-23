import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import { type PaperRouteDeps, paperRoutes } from "../src/routes/paper.js";

function createMockDeps(): PaperRouteDeps {
	return {
		getPaperStatus: async () => ({
			balance: "10000",
			positions: [
				{
					symbol: "BTCUSDT",
					side: "LONG" as const,
					size: "0.1",
					entryPrice: "50000",
					unrealizedPnl: "500",
				},
			],
			unrealizedPnl: "500",
			totalPnl: "1200",
		}),
		listPaperOrders: async (_query) => ({
			data: [
				{
					id: "po-1",
					symbol: "BTCUSDT",
					side: "BUY",
					size: "0.1",
					price: "50000",
					status: "filled",
					createdAt: "2026-01-01T00:00:00Z",
				},
			],
			total: 1,
		}),
		getPaperPerformance: async (_period) => ({
			summaries: [{ period: "day", pnl: "100", trades: 5, winrate: 0.6 }],
		}),
		getPaperComparison: async () => ({
			backtest: { winrate: 0.65, expectancy: 1.2, trades: 100 },
			paper: { winrate: 0.6, expectancy: 1.0, trades: 20 },
			delta: { winrateDiff: -0.05, expectancyDiff: -0.2 },
		}),
		resetPaper: async (balance) => ({ success: true as const, balance }),
	};
}

function createApp(deps?: PaperRouteDeps) {
	return new Elysia().use(errorHandlerPlugin).use(paperRoutes(deps ?? createMockDeps()));
}

const BASE = "http://localhost/api/v1";

describe("Paper trading routes", () => {
	test("GET /paper/status returns balance + positions + PnL", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/paper/status`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.balance).toBe("10000");
		expect(body.data.positions).toBeArrayOfSize(1);
		expect(body.data.unrealizedPnl).toBe("500");
	});

	test("GET /paper/orders returns paginated list", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/paper/orders`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.meta.total).toBe(1);
	});

	test("GET /paper/performance returns summaries", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/paper/performance?period=day`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.summaries).toBeArrayOfSize(1);
	});

	test("GET /paper/comparison returns backtest + paper + delta", async () => {
		const app = createApp();
		const res = await app.handle(
			new Request(`${BASE}/paper/comparison?strategyId=s1&symbol=BTCUSDT`),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.backtest).toBeDefined();
		expect(body.data.paper).toBeDefined();
		expect(body.data.delta).toBeDefined();
	});

	test("POST /paper/reset returns success with balance", async () => {
		const app = createApp();
		const res = await app.handle(
			new Request(`${BASE}/paper/reset`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ initialBalance: "5000" }),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.success).toBe(true);
		expect(body.data.balance).toBe("5000");
	});
});
