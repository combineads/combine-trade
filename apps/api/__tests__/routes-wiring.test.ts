import { describe, expect, test } from "bun:test";
import { createApiServer, type ApiServerDeps } from "../src/server";

function createStubDeps(): ApiServerDeps {
	return {
		jwtSecret: "test-secret",
		masterEncryptionKey: "0".repeat(64),
		strategyRepository: {
			findAll: async () => [],
			findById: async () => null,
			findByNameAndVersion: async () => null,
			findActive: async () => [],
			create: async () => { throw new Error("stub"); },
			update: async () => { throw new Error("stub"); },
			softDelete: async () => { throw new Error("stub"); },
			createNewVersion: async () => { throw new Error("stub"); },
		},
		executionModeDeps: {
			loadMode: async () => "analysis" as const,
			saveMode: async () => {},
			getSafetyGateStatus: async () => ({ killSwitchEnabled: false, dailyLossLimitConfigured: false }),
		},
		killSwitchDeps: {
			activate: async () => { throw new Error("stub"); },
			deactivate: async () => { throw new Error("stub"); },
			getActiveStates: async () => [],
			getAuditEvents: async () => ({ items: [], total: 0 }),
		},
		findUserByUsername: async () => null,
		sseSubscribe: () => () => {},
		credentialDeps: {
			masterKey: "0".repeat(64),
			findByUserId: async () => [],
			findById: async () => null,
			create: async () => { throw new Error("stub"); },
			update: async () => { throw new Error("stub"); },
			remove: async () => { throw new Error("stub"); },
		},
		eventDeps: {
			findEventById: async () => null,
			findEventsByStrategy: async () => ({ items: [], total: 0 }),
			getStrategyStatistics: async () => ({ winRate: 0, expectancy: 0, avgPnl: 0, sampleCount: 0, totalEvents: 0, longCount: 0, shortCount: 0 }),
			strategyExists: async () => true,
		},
		orderDeps: {
			findOrders: async () => ({ items: [], total: 0 }),
		},
		candleDeps: {
			findCandles: async () => ({ items: [], total: 0 }),
		},
		alertDeps: {
			findAlerts: async () => ({ items: [], total: 0 }),
		},
		backtestDeps: {
			runBacktest: async () => ({ trades: [], stats: {} as any }),
			strategyExists: async () => true,
		},
	};
}

describe("API routes wiring", () => {
	test("events route returns paginated response", async () => {
		const app = createApiServer(createStubDeps());
		const res = await app.handle(new Request("http://localhost/api/v1/strategies/s1/events"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeDefined();
	});

	test("orders route returns paginated response", async () => {
		const app = createApiServer(createStubDeps());
		const res = await app.handle(new Request("http://localhost/api/v1/orders"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeDefined();
	});

	test("candles route returns paginated response", async () => {
		const app = createApiServer(createStubDeps());
		const res = await app.handle(new Request("http://localhost/api/v1/candles?symbol=BTCUSDT&timeframe=1m"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeDefined();
	});

	test("alerts route returns paginated response", async () => {
		const app = createApiServer(createStubDeps());
		const res = await app.handle(new Request("http://localhost/api/v1/alerts"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeDefined();
	});

	test("backtest route accepts POST", async () => {
		const app = createApiServer(createStubDeps());
		const res = await app.handle(new Request("http://localhost/api/v1/backtest", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				strategyId: "s1",
				symbol: "BTCUSDT",
				timeframe: "1h",
				from: "2025-01-01",
				to: "2025-06-01",
			}),
		}));
		expect(res.status).toBe(200);
	});
});
