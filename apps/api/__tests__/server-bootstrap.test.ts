import { describe, expect, mock, test } from "bun:test";
import { type ApiServerDeps, createApiServer } from "../src/server.js";
import { createMockAuth, makeAuthHeaders } from "./helpers/auth.js";

function makeDeps(overrides: Partial<ApiServerDeps> = {}): ApiServerDeps {
	return {
		auth: createMockAuth(),
		masterEncryptionKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		strategyRepository: {
			findAll: mock(() => Promise.resolve([])),
			findById: mock(() => Promise.resolve(null)),
			findByNameAndVersion: mock(() => Promise.resolve(null)),
			findActive: mock(() => Promise.resolve([])),
			create: mock(() => Promise.resolve({} as never)),
			update: mock(() => Promise.resolve({} as never)),
			softDelete: mock(() => Promise.resolve()),
			createNewVersion: mock(() => Promise.resolve({} as never)),
		},
		executionModeDeps: {
			loadMode: mock(() => Promise.resolve("analysis" as const)),
			saveMode: mock(() => Promise.resolve()),
			getSafetyGateStatus: mock(() =>
				Promise.resolve({ killSwitchEnabled: true, dailyLossLimitConfigured: true }),
			),
		},
		killSwitchDeps: {
			activate: mock(() => Promise.resolve({} as never)),
			deactivate: mock(() => Promise.resolve({} as never)),
			getActiveStates: mock(() => Promise.resolve([])),
			getAuditEvents: mock(() => Promise.resolve({ items: [], total: 0 })),
		},
		sseSubscribe: mock(() => () => {}),
		credentialDeps: {
			masterKey: "0".repeat(64),
			findByUserId: async () => [],
			findById: async () => null,
			create: async () => {
				throw new Error("stub");
			},
			update: async () => {
				throw new Error("stub");
			},
			remove: async () => {},
		},
		eventDeps: {
			findEventById: async () => null,
			findEventsByStrategy: async () => ({ items: [], total: 0 }),
			getStrategyStatistics: async () => ({
				winRate: 0,
				expectancy: 0,
				avgPnl: 0,
				sampleCount: 0,
				totalEvents: 0,
				longCount: 0,
				shortCount: 0,
			}),
			strategyExists: async () => true,
		},
		orderDeps: { findOrders: async () => ({ items: [], total: 0 }) },
		candleDeps: { findCandles: async () => ({ items: [], total: 0 }) },
		alertDeps: { findAlerts: async () => ({ items: [], total: 0 }) },
		backtestDeps: {
			runBacktest: async () => ({ trades: [], stats: {} as never }),
			strategyExists: async () => true,
		},
		journalDeps: {
			listJournals: async () => ({ data: [], total: 0 }),
			getJournal: async () => null,
			searchJournals: async () => ({ data: [], total: 0 }),
			getJournalAnalytics: async () => ({ tagStats: [], overallWinrate: 0, overallExpectancy: 0 }),
		},
		paperDeps: {
			getPaperStatus: async () => ({
				balance: "0",
				positions: [],
				unrealizedPnl: "0",
				totalPnl: "0",
			}),
			listPaperOrders: async () => ({ data: [], total: 0 }),
			getPaperPerformance: async () => ({ summaries: [] }),
			getPaperComparison: async () => ({ backtest: {}, paper: {}, delta: {} }),
			resetPaper: async (b) => ({ success: true as const, balance: b }),
		},
		...overrides,
	};
}

describe("createApiServer", () => {
	test("creates an Elysia app instance", () => {
		const deps = makeDeps();
		const app = createApiServer(deps);
		expect(app).toBeDefined();
	});

	test("health endpoint responds 200", async () => {
		const deps = makeDeps();
		const app = createApiServer(deps);

		const res = await app.handle(new Request("http://localhost/api/v1/health"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("ok");
	});

	test("protected endpoint without token returns 401", async () => {
		const deps = makeDeps();
		const app = createApiServer(deps);

		const res = await app.handle(new Request("http://localhost/api/v1/strategies"));
		expect(res.status).toBe(401);
	});

	test("better-auth route is forwarded to auth handler", async () => {
		const deps = makeDeps();
		const app = createApiServer(deps);

		const res = await app.handle(
			new Request("http://localhost/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "admin@example.com", password: "test" }),
			}),
		);
		// Mock handler returns 501, but endpoint is reached (not blocked by guard)
		expect(res.status).toBe(501);
	});

	test("kill switch status endpoint is accessible", async () => {
		const deps = makeDeps();
		const app = createApiServer(deps);
		const headers = await makeAuthHeaders();

		const res = await app.handle(
			new Request("http://localhost/api/v1/risk/kill-switch/status", { headers }),
		);
		expect(res.status).toBe(200);
	});

	test("SSE stream endpoint is accessible", async () => {
		const deps = makeDeps();
		const app = createApiServer(deps);
		const headers = await makeAuthHeaders();

		const res = await app.handle(new Request("http://localhost/api/v1/stream", { headers }));
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
	});
});
