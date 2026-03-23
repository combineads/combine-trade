import { describe, expect, test } from "bun:test";
import { createApiServer, type ApiServerDeps } from "../src/server";
import type { Credential, CredentialRouteDeps } from "../src/routes/credentials";
import { createMockAuth, makeAuthHeaders } from "./helpers/auth";

function createTestCredential(overrides: Partial<Credential> = {}): Credential {
	return {
		id: "cred-1",
		userId: "user-1",
		exchange: "binance",
		label: "Main account",
		isActive: true,
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		...overrides,
	};
}

function createStubDeps(): ApiServerDeps {
	const credentials: Credential[] = [createTestCredential()];

	return {
		auth: createMockAuth(),
		masterEncryptionKey: "a".repeat(64),
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
			masterKey: "a".repeat(64),
			findByUserId: async (_userId: string) => credentials,
			findById: async (id: string) => credentials.find((c) => c.id === id) ?? null,
			create: async (input) => ({
				id: "cred-new",
				userId: input.userId,
				exchange: input.exchange,
				label: input.label,
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			}),
			update: async (id, input) => {
				const cred = credentials.find((c) => c.id === id);
				if (!cred) throw new Error("not found");
				return { ...cred, ...input, updatedAt: new Date() };
			},
			remove: async () => {},
		},
		eventDeps: {
			findEventById: async () => null,
			findEventsByStrategy: async () => ({ items: [], total: 0 }),
			getStrategyStatistics: async () => ({ winRate: 0, expectancy: 0, avgPnl: 0, sampleCount: 0, totalEvents: 0, longCount: 0, shortCount: 0 }),
			strategyExists: async () => true,
		},
		orderDeps: { findOrders: async () => ({ items: [], total: 0 }) },
		candleDeps: { findCandles: async () => ({ items: [], total: 0 }) },
		alertDeps: { findAlerts: async () => ({ items: [], total: 0 }) },
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

describe("Credential routes wiring", () => {
	test("GET /api/v1/credentials returns credentials list", async () => {
		const app = createApiServer(createStubDeps());
		const headers = await makeAuthHeaders();
		const res = await app.handle(new Request("http://localhost/api/v1/credentials", { headers }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArray();
		expect(body.data.length).toBe(1);
		expect(body.data[0].exchange).toBe("binance");
	});

	test("POST /api/v1/credentials creates a credential", async () => {
		const app = createApiServer(createStubDeps());
		const authHeaders = await makeAuthHeaders();
		const res = await app.handle(
			new Request("http://localhost/api/v1/credentials", {
				method: "POST",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({
					exchange: "binance",
					apiKey: "test-api-key",
					apiSecret: "test-api-secret",
					label: "Test",
				}),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.exchange).toBe("binance");
	});

	test("PUT /api/v1/credentials/:id updates a credential", async () => {
		const app = createApiServer(createStubDeps());
		const authHeaders = await makeAuthHeaders();
		const res = await app.handle(
			new Request("http://localhost/api/v1/credentials/cred-1", {
				method: "PUT",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({ label: "Updated label" }),
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.label).toBe("Updated label");
	});

	test("DELETE /api/v1/credentials/:id deletes a credential", async () => {
		const app = createApiServer(createStubDeps());
		const headers = await makeAuthHeaders();
		const res = await app.handle(
			new Request("http://localhost/api/v1/credentials/cred-1", {
				method: "DELETE",
				headers,
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.deleted).toBe(true);
	});

	test("PUT /api/v1/credentials/:unknown returns 404", async () => {
		const app = createApiServer(createStubDeps());
		const authHeaders = await makeAuthHeaders();
		const res = await app.handle(
			new Request("http://localhost/api/v1/credentials/unknown-id", {
				method: "PUT",
				headers: { ...authHeaders, "Content-Type": "application/json" },
				body: JSON.stringify({ label: "test" }),
			}),
		);
		expect(res.status).toBe(404);
	});
});
