import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import type { Candle } from "../../../packages/candle/types.js";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import { type Alert, type AlertRouteDeps, alertRoutes } from "../src/routes/alerts.js";
import { type CandleRouteDeps, candleRoutes } from "../src/routes/candles.js";
import { type Order, type OrderRouteDeps, orderRoutes } from "../src/routes/orders.js";
import { withMockUserId } from "./helpers/auth.js";

const BASE = "http://localhost/api/v1";

// --- Candle fixtures ---
function makeCandle(overrides: Partial<Candle> = {}): Candle {
	return {
		exchange: "binance",
		symbol: "BTC/USDT",
		timeframe: "1h",
		openTime: new Date("2026-01-01T00:00:00Z"),
		open: "50000",
		high: "51000",
		low: "49000",
		close: "50500",
		volume: "100",
		isClosed: true,
		...overrides,
	};
}

function mockCandleDeps(candles: Candle[] = [makeCandle()]): CandleRouteDeps {
	return {
		findCandles: async (opts) => {
			const filtered = candles.filter(
				(c) => c.symbol === opts.symbol && c.timeframe === opts.timeframe,
			);
			const start = (opts.page - 1) * opts.pageSize;
			return { items: filtered.slice(start, start + opts.pageSize), total: filtered.length };
		},
	};
}

// --- Alert fixtures ---
function makeAlert(overrides: Partial<Alert> = {}): Alert {
	return {
		id: "alert-1",
		strategyId: "strat-1",
		symbol: "BTC/USDT",
		direction: "long",
		entryPrice: "50000",
		status: "sent",
		createdAt: new Date("2026-01-01"),
		...overrides,
	};
}

function mockAlertDeps(alerts: Alert[] = [makeAlert()]): AlertRouteDeps {
	return {
		findAlerts: async (opts) => {
			let filtered = [...alerts];
			if (opts.strategyId) filtered = filtered.filter((a) => a.strategyId === opts.strategyId);
			if (opts.status) filtered = filtered.filter((a) => a.status === opts.status);
			const start = (opts.page - 1) * opts.pageSize;
			return { items: filtered.slice(start, start + opts.pageSize), total: filtered.length };
		},
	};
}

// --- Order fixtures ---
function makeOrder(overrides: Partial<Order> = {}): Order {
	return {
		id: "order-1",
		strategyId: "strat-1",
		symbol: "BTC/USDT",
		side: "buy",
		type: "market",
		price: "50000",
		amount: "0.1",
		filled: "0.1",
		status: "closed",
		createdAt: new Date("2026-01-01"),
		...overrides,
	};
}

function mockOrderDeps(orders: Order[] = [makeOrder()]): OrderRouteDeps {
	return {
		findOrders: async (opts) => {
			let filtered = [...orders];
			if (opts.symbol) filtered = filtered.filter((o) => o.symbol === opts.symbol);
			if (opts.status) filtered = filtered.filter((o) => o.status === opts.status);
			if (opts.strategyId) filtered = filtered.filter((o) => o.strategyId === opts.strategyId);
			const start = (opts.page - 1) * opts.pageSize;
			return { items: filtered.slice(start, start + opts.pageSize), total: filtered.length };
		},
	};
}

function createApp(
	candleDeps?: CandleRouteDeps,
	alertDeps?: AlertRouteDeps,
	orderDeps?: OrderRouteDeps,
) {
	return new Elysia()
		.use(withMockUserId())
		.use(errorHandlerPlugin)
		.use(candleRoutes(candleDeps ?? mockCandleDeps()))
		.use(alertRoutes(alertDeps ?? mockAlertDeps()))
		.use(orderRoutes(orderDeps ?? mockOrderDeps()));
}

describe("Candle routes", () => {
	test("GET /candles with required params → 200 paginated", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/candles?symbol=BTC/USDT&timeframe=1h`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.meta.total).toBe(1);
		expect(body.meta.pageSize).toBe(50);
	});

	test("GET /candles missing symbol → 422", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/candles?timeframe=1h`));
		expect(res.status).toBe(422);
	});

	test("GET /candles missing timeframe → 422", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/candles?symbol=BTC/USDT`));
		expect(res.status).toBe(422);
	});

	test("pageSize clamped to 200", async () => {
		let capturedPageSize = 0;
		const deps: CandleRouteDeps = {
			findCandles: async (opts) => {
				capturedPageSize = opts.pageSize;
				return { items: [], total: 0 };
			},
		};
		const app = createApp(deps);
		await app.handle(new Request(`${BASE}/candles?symbol=BTC/USDT&timeframe=1h&pageSize=300`));
		expect(capturedPageSize).toBe(200);
	});
});

describe("Alert routes", () => {
	test("GET /alerts → 200 paginated", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/alerts`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.meta.total).toBe(1);
	});

	test("GET /alerts?strategyId=strat-1 → filtered", async () => {
		const alerts = [
			makeAlert({ id: "a1", strategyId: "strat-1" }),
			makeAlert({ id: "a2", strategyId: "strat-2" }),
		];
		const app = createApp(undefined, mockAlertDeps(alerts));
		const res = await app.handle(new Request(`${BASE}/alerts?strategyId=strat-1`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].id).toBe("a1");
	});
});

describe("Order routes", () => {
	test("GET /orders → 200 paginated", async () => {
		const app = createApp();
		const res = await app.handle(new Request(`${BASE}/orders`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.meta.total).toBe(1);
	});

	test("GET /orders?status=closed → filtered", async () => {
		const orders = [
			makeOrder({ id: "o1", status: "closed" }),
			makeOrder({ id: "o2", status: "open" }),
		];
		const app = createApp(undefined, undefined, mockOrderDeps(orders));
		const res = await app.handle(new Request(`${BASE}/orders?status=closed`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
		expect(body.data[0].id).toBe("o1");
	});

	test("pageSize clamped to 200", async () => {
		let capturedPageSize = 0;
		const deps: OrderRouteDeps = {
			findOrders: async (opts) => {
				capturedPageSize = opts.pageSize;
				return { items: [], total: 0 };
			},
		};
		const app = createApp(undefined, undefined, deps);
		await app.handle(new Request(`${BASE}/orders?pageSize=300`));
		expect(capturedPageSize).toBe(200);
	});
});
