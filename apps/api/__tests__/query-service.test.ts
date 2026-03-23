import { describe, expect, mock, test } from "bun:test";
import { ApiQueryService, type QueryServiceDeps } from "../src/services/query-service.js";

function makeDeps(overrides: Partial<QueryServiceDeps> = {}): QueryServiceDeps {
	return {
		findEventById: mock(() => Promise.resolve(null)),
		findEventsByStrategy: mock(() => Promise.resolve({ items: [], total: 0 })),
		getStrategyStatistics: mock(() =>
			Promise.resolve({
				winrate: 0,
				avgWin: 0,
				avgLoss: 0,
				expectancy: 0,
				sampleCount: 0,
				status: "INSUFFICIENT" as const,
				totalEvents: 0,
				longCount: 0,
				shortCount: 0,
			}),
		),
		strategyExists: mock(() => Promise.resolve(true)),
		findCandles: mock(() => Promise.resolve({ items: [], total: 0 })),
		findOrders: mock(() => Promise.resolve({ items: [], total: 0 })),
		findAlerts: mock(() => Promise.resolve({ items: [], total: 0 })),
		...overrides,
	};
}

describe("ApiQueryService", () => {
	test("findEventsByStrategy passes pagination correctly", async () => {
		const deps = makeDeps({
			findEventsByStrategy: mock(() =>
				Promise.resolve({
					// biome-ignore lint/suspicious/noExplicitAny: test mock requires flexible typing
					items: [{ id: "e1" }] as any[],
					total: 50,
				}),
			),
		});
		const svc = new ApiQueryService(deps);

		const result = await svc.findEventsByStrategy({
			strategyId: "s1",
			page: 3,
			pageSize: 10,
		});

		expect(result.items).toHaveLength(1);
		expect(result.total).toBe(50);
		const call = (deps.findEventsByStrategy as ReturnType<typeof mock>).mock.calls[0];
		expect(call[0]).toMatchObject({ strategyId: "s1", page: 3, pageSize: 10 });
	});

	test("findEventsByStrategy forwards filters", async () => {
		const deps = makeDeps();
		const svc = new ApiQueryService(deps);

		await svc.findEventsByStrategy({
			strategyId: "s1",
			page: 1,
			pageSize: 20,
			symbol: "BTCUSDT",
			direction: "long",
			dateFrom: new Date("2026-01-01"),
			dateTo: new Date("2026-03-01"),
		});

		const call = (deps.findEventsByStrategy as ReturnType<typeof mock>).mock.calls[0];
		expect(call[0]).toMatchObject({
			symbol: "BTCUSDT",
			direction: "long",
		});
		expect(call[0].dateFrom).toBeInstanceOf(Date);
		expect(call[0].dateTo).toBeInstanceOf(Date);
	});

	test("findEventById delegates to deps", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test mock requires flexible typing
		const event = { id: "e1", strategyId: "s1" } as any;
		const deps = makeDeps({
			findEventById: mock(() => Promise.resolve(event)),
		});
		const svc = new ApiQueryService(deps);

		const result = await svc.findEventById("e1");
		expect(result).toEqual(event);
	});

	test("findEventById returns null for missing", async () => {
		const svc = new ApiQueryService(makeDeps());
		const result = await svc.findEventById("nonexistent");
		expect(result).toBeNull();
	});

	test("getStrategyStatistics delegates to deps", async () => {
		const stats = {
			winrate: 0.65,
			avgWin: 100,
			avgLoss: -50,
			expectancy: 40,
			sampleCount: 30,
			status: "SUFFICIENT" as const,
			totalEvents: 100,
			longCount: 60,
			shortCount: 40,
		};
		const deps = makeDeps({
			getStrategyStatistics: mock(() => Promise.resolve(stats)),
		});
		const svc = new ApiQueryService(deps);

		const result = await svc.getStrategyStatistics("s1");
		expect(result).toEqual(stats);
	});

	test("strategyExists delegates to deps", async () => {
		const deps = makeDeps({
			strategyExists: mock(() => Promise.resolve(false)),
		});
		const svc = new ApiQueryService(deps);

		expect(await svc.strategyExists("s1")).toBe(false);
	});

	test("findCandles passes options correctly", async () => {
		const deps = makeDeps({
			findCandles: mock(() =>
				Promise.resolve({
					// biome-ignore lint/suspicious/noExplicitAny: test mock requires flexible typing
					items: [{ symbol: "BTCUSDT" }] as any[],
					total: 100,
				}),
			),
		});
		const svc = new ApiQueryService(deps);

		const result = await svc.findCandles({
			symbol: "BTCUSDT",
			timeframe: "1h",
			page: 2,
			pageSize: 50,
		});

		expect(result.items).toHaveLength(1);
		expect(result.total).toBe(100);
	});

	test("findCandles forwards date range", async () => {
		const deps = makeDeps();
		const svc = new ApiQueryService(deps);

		await svc.findCandles({
			symbol: "ETHUSDT",
			timeframe: "4h",
			page: 1,
			pageSize: 20,
			from: new Date("2026-01-01"),
			to: new Date("2026-03-01"),
		});

		const call = (deps.findCandles as ReturnType<typeof mock>).mock.calls[0];
		expect(call[0].from).toBeInstanceOf(Date);
		expect(call[0].to).toBeInstanceOf(Date);
	});

	test("findOrders passes filters", async () => {
		const deps = makeDeps({
			findOrders: mock(() =>
				Promise.resolve({
					// biome-ignore lint/suspicious/noExplicitAny: test mock requires flexible typing
					items: [{ id: "o1", status: "open" }] as any[],
					total: 5,
				}),
			),
		});
		const svc = new ApiQueryService(deps);

		const result = await svc.findOrders({
			symbol: "BTCUSDT",
			status: "open",
			strategyId: "s1",
			page: 1,
			pageSize: 20,
		});

		expect(result.items).toHaveLength(1);
		expect(result.total).toBe(5);
		const call = (deps.findOrders as ReturnType<typeof mock>).mock.calls[0];
		expect(call[0]).toMatchObject({
			symbol: "BTCUSDT",
			status: "open",
			strategyId: "s1",
		});
	});

	test("findAlerts passes filters", async () => {
		const deps = makeDeps({
			findAlerts: mock(() =>
				Promise.resolve({
					// biome-ignore lint/suspicious/noExplicitAny: test mock requires flexible typing
					items: [{ id: "a1" }] as any[],
					total: 3,
				}),
			),
		});
		const svc = new ApiQueryService(deps);

		const result = await svc.findAlerts({
			strategyId: "s1",
			status: "pending",
			page: 1,
			pageSize: 20,
		});

		expect(result.items).toHaveLength(1);
		expect(result.total).toBe(3);
	});

	test("returns empty results for no data", async () => {
		const svc = new ApiQueryService(makeDeps());

		const events = await svc.findEventsByStrategy({ strategyId: "s1", page: 1, pageSize: 20 });
		expect(events.items).toEqual([]);
		expect(events.total).toBe(0);

		const candles = await svc.findCandles({ symbol: "X", timeframe: "1m", page: 1, pageSize: 20 });
		expect(candles.items).toEqual([]);

		const orders = await svc.findOrders({ page: 1, pageSize: 20 });
		expect(orders.items).toEqual([]);

		const alerts = await svc.findAlerts({ page: 1, pageSize: 20 });
		expect(alerts.items).toEqual([]);
	});
});
