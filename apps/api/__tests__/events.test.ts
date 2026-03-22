import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import type { StrategyEvent } from "../../../packages/core/strategy/event-types.js";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import { type EventQueryOptions, type EventRouteDeps, eventRoutes } from "../src/routes/events.js";

function makeEvent(overrides: Partial<StrategyEvent> = {}): StrategyEvent {
	return {
		id: "evt-1",
		strategyId: "strat-1",
		strategyVersion: 1,
		exchange: "binance",
		symbol: "BTC/USDT",
		timeframe: "1h",
		openTime: new Date("2026-01-01T00:00:00Z"),
		direction: "long",
		features: [{ name: "rsi", value: 0.7 }],
		entryPrice: "50000",
		status: "active",
		createdAt: new Date("2026-01-01T00:00:01Z"),
		...overrides,
	};
}

function createMockDeps(events: StrategyEvent[] = [makeEvent()]): EventRouteDeps {
	const validStrategies = new Set(["strat-1"]);

	return {
		findEventById: async (id: string) => events.find((e) => e.id === id) ?? null,
		findEventsByStrategy: async (opts: EventQueryOptions) => {
			let filtered = events.filter((e) => e.strategyId === opts.id);
			if (opts.symbol) filtered = filtered.filter((e) => e.symbol === opts.symbol);
			if (opts.direction) filtered = filtered.filter((e) => e.direction === opts.direction);
			const { dateFrom, dateTo } = opts;
			if (dateFrom) filtered = filtered.filter((e) => e.openTime >= dateFrom);
			if (dateTo) filtered = filtered.filter((e) => e.openTime <= dateTo);
			const start = (opts.page - 1) * opts.pageSize;
			const items = filtered.slice(start, start + opts.pageSize);
			return { items, total: filtered.length };
		},
		getStrategyStatistics: async () => ({
			winrate: 0.65,
			avgWin: 2.1,
			avgLoss: 1.2,
			expectancy: 0.945,
			sampleCount: 50,
			status: "SUFFICIENT" as const,
			totalEvents: 50,
			longCount: 30,
			shortCount: 20,
		}),
		strategyExists: async (id: string) => validStrategies.has(id),
	};
}

function createApp(deps?: EventRouteDeps) {
	return new Elysia().use(errorHandlerPlugin).use(eventRoutes(deps ?? createMockDeps()));
}

const BASE = "http://localhost/api/v1";

describe("Event routes", () => {
	describe("GET /strategies/:strategyId/events", () => {
		test("returns paginated events", async () => {
			const app = createApp();
			const res = await app.handle(new Request(`${BASE}/strategies/strat-1/events`));
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data).toBeArrayOfSize(1);
			expect(body.meta.total).toBe(1);
			expect(body.meta.page).toBe(1);
			expect(body.meta.pageSize).toBe(20);
		});

		test("filters by symbol", async () => {
			const events = [
				makeEvent({ id: "evt-1", symbol: "BTC/USDT" }),
				makeEvent({ id: "evt-2", symbol: "ETH/USDT" }),
			];
			const app = createApp(createMockDeps(events));
			const res = await app.handle(
				new Request(`${BASE}/strategies/strat-1/events?symbol=ETH/USDT`),
			);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data).toBeArrayOfSize(1);
			expect(body.data[0].symbol).toBe("ETH/USDT");
		});

		test("clamps pageSize to 100", async () => {
			const deps = createMockDeps();
			let capturedPageSize = 0;
			const origFind = deps.findEventsByStrategy;
			deps.findEventsByStrategy = async (opts) => {
				capturedPageSize = opts.pageSize;
				return origFind(opts);
			};
			const app = createApp(deps);
			await app.handle(new Request(`${BASE}/strategies/strat-1/events?pageSize=200`));
			expect(capturedPageSize).toBe(100);
		});

		test("returns 404 for unknown strategy", async () => {
			const app = createApp();
			const res = await app.handle(new Request(`${BASE}/strategies/unknown/events`));
			expect(res.status).toBe(404);
			const body = JSON.parse(await res.text());
			expect(body.error.code).toBe("NOT_FOUND");
		});
	});

	describe("GET /strategies/:strategyId/statistics", () => {
		test("returns statistics", async () => {
			const app = createApp();
			const res = await app.handle(new Request(`${BASE}/strategies/strat-1/statistics`));
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data.winrate).toBe(0.65);
			expect(body.data.expectancy).toBe(0.945);
			expect(body.data.totalEvents).toBe(50);
			expect(body.data.longCount).toBe(30);
			expect(body.data.shortCount).toBe(20);
		});

		test("returns 404 for unknown strategy", async () => {
			const app = createApp();
			const res = await app.handle(new Request(`${BASE}/strategies/unknown/statistics`));
			expect(res.status).toBe(404);
			const body = JSON.parse(await res.text());
			expect(body.error.code).toBe("NOT_FOUND");
		});
	});

	describe("GET /events/:id", () => {
		test("returns event by id", async () => {
			const app = createApp();
			const res = await app.handle(new Request(`${BASE}/events/evt-1`));
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data.id).toBe("evt-1");
			expect(body.data.symbol).toBe("BTC/USDT");
		});

		test("returns 404 for unknown event", async () => {
			const app = createApp();
			const res = await app.handle(new Request(`${BASE}/events/nonexistent`));
			expect(res.status).toBe(404);
			const body = JSON.parse(await res.text());
			expect(body.error.code).toBe("NOT_FOUND");
		});
	});
});
