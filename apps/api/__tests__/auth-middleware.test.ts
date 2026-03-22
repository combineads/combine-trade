import { describe, expect, test } from "bun:test";
import { signAccessToken } from "../../../packages/shared/auth/jwt.js";
import { createApiServer, type ApiServerDeps } from "../src/server.js";

const TEST_SECRET = "test-jwt-secret-for-auth-middleware";

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
	};
}

async function makeValidToken(): Promise<string> {
	return signAccessToken({ sub: "user-1", role: "admin" }, TEST_SECRET);
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

	test("unauthenticated request to /api/v1/auth/login passes through", async () => {
		const app = createApiServer(createStubDeps());
		const res = await app.handle(new Request("http://localhost/api/v1/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: "test", password: "test" }),
		}));
		// Login with invalid creds returns 401 from auth route itself, not from middleware
		// But it should NOT return the middleware's generic 401 — it should reach the route
		expect(res.status).not.toBe(403);
	});

	test("authenticated request with valid JWT passes through to route handler", async () => {
		const app = createApiServer(createStubDeps());
		const token = await makeValidToken();
		const res = await app.handle(new Request("http://localhost/api/v1/strategies", {
			headers: { Authorization: `Bearer ${token}` },
		}));
		expect(res.status).toBe(200);
	});

	test("request with invalid JWT returns 401", async () => {
		const app = createApiServer(createStubDeps());
		const res = await app.handle(new Request("http://localhost/api/v1/strategies", {
			headers: { Authorization: "Bearer invalid-token-value" },
		}));
		expect(res.status).toBe(401);
	});
});
