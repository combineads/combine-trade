import { describe, expect, test } from "bun:test";
import { createApiServer, type ApiServerDeps } from "../src/server.js";
import { createMockAuth } from "./helpers/auth.js";

function createStubDeps(): ApiServerDeps {
	return {
		auth: createMockAuth(),
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

describe("Global auth middleware", () => {
	test("unauthenticated request to protected route returns 401", async () => {
		const app = createApiServer(createStubDeps());
		const res = await app.handle(new Request("http://localhost/api/v1/strategies"));
		expect(res.status).toBe(401);
	});

	test("unauthenticated request to /api/v1/health returns 200", async () => {
		const app = createApiServer(createStubDeps());
		const res = await app.handle(new Request("http://localhost/api/v1/health"));
		expect(res.status).toBe(200);
	});

	test("unauthenticated request to /api/auth/** is forwarded to better-auth handler", async () => {
		const app = createApiServer(createStubDeps());
		const res = await app.handle(new Request("http://localhost/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "test@example.com", password: "test" }),
		}));
		// The mock handler returns 501 — it reached better-auth, not the guard
		expect(res.status).toBe(501);
	});

	test("authenticated request with valid session token passes through to route handler", async () => {
		const app = createApiServer(createStubDeps());
		const res = await app.handle(new Request("http://localhost/api/v1/strategies", {
			headers: { Authorization: "Bearer test-session-token" },
		}));
		expect(res.status).toBe(200);
	});

	test("request with no bearer token returns 401", async () => {
		const app = createApiServer(createStubDeps());
		const res = await app.handle(new Request("http://localhost/api/v1/strategies", {
			headers: { Authorization: "Bearer " },
		}));
		expect(res.status).toBe(401);
	});
});
