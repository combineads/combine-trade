import { describe, expect, test } from "bun:test";
import { createApiServer, type ApiServerDeps } from "../src/server";
import { makeAuthHeaders, TEST_SECRET } from "./helpers/auth";

function createStubDeps(): ApiServerDeps {
	return {
		jwtSecret: TEST_SECRET,
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
		journalDeps: {
			listJournals: async () => ({ data: [], total: 0 }),
			getJournal: async () => null,
			searchJournals: async () => ({ data: [], total: 0 }),
			getJournalAnalytics: async () => ({ tagStats: [], overallWinrate: 0, overallExpectancy: 0 }),
		},
		paperDeps: {
			getPaperStatus: async () => ({ balance: "0", positions: [], unrealizedPnl: "0", totalPnl: "0" }),
			listPaperOrders: async () => ({ data: [], total: 0 }),
			getPaperPerformance: async () => ({ summaries: [] }),
			getPaperComparison: async () => ({ backtest: {}, paper: {}, delta: {} }),
			resetPaper: async (b) => ({ success: true as const, balance: b }),
		},
	};
}

describe("API routes wiring", () => {
	test("events route returns paginated response", async () => {
		const app = createApiServer(createStubDeps());
		const headers = await makeAuthHeaders();
		const res = await app.handle(new Request("http://localhost/api/v1/strategies/s1/events", { headers }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeDefined();
	});

	test("orders route returns paginated response", async () => {
		const app = createApiServer(createStubDeps());
		const headers = await makeAuthHeaders();
		const res = await app.handle(new Request("http://localhost/api/v1/orders", { headers }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeDefined();
	});

	test("candles route returns paginated response", async () => {
		const app = createApiServer(createStubDeps());
		const headers = await makeAuthHeaders();
		const res = await app.handle(new Request("http://localhost/api/v1/candles?symbol=BTCUSDT&timeframe=1m", { headers }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeDefined();
	});

	test("alerts route returns paginated response", async () => {
		const app = createApiServer(createStubDeps());
		const headers = await makeAuthHeaders();
		const res = await app.handle(new Request("http://localhost/api/v1/alerts", { headers }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeDefined();
	});

	test("backtest route accepts POST", async () => {
		const app = createApiServer(createStubDeps());
		const headers = await makeAuthHeaders();
		const res = await app.handle(new Request("http://localhost/api/v1/backtest", {
			method: "POST",
			headers: { ...headers, "Content-Type": "application/json" },
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
