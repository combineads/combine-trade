/**
 * T-181: Route session extraction tests
 *
 * Verifies that:
 * 1. Routes forward the userId from auth context to repository calls
 * 2. Cross-user access returns 404 (not 403) — repository returns null for wrong userId
 * 3. Missing session (no userId) returns 401
 */
import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import type {
	CreateStrategyInput,
	Strategy,
	UpdateStrategyInput,
} from "../../../packages/core/strategy/types.js";
import type { ExecutionMode, ExecutionModeDeps } from "../../../packages/execution/types.js";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import { type KillSwitchRouteDeps, killSwitchRoutes } from "../src/routes/kill-switch.js";
import { type OrderRouteDeps, orderRoutes } from "../src/routes/orders.js";
import { type StrategyRouteDeps, strategyRoutes } from "../src/routes/strategies.js";
import { type ApiServerDeps, createApiServer } from "../src/server.js";
import { TEST_USER_ID, createMockAuth, makeAuthHeaders, withMockUserId } from "./helpers/auth.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
	return {
		id: "strat-a1",
		version: 1,
		name: "User A Strategy",
		description: null,
		code: "return features;",
		symbols: ["BTC/USDT"],
		timeframe: "1h",
		direction: "long",
		featuresDefinition: [
			{ name: "rsi", expression: "RSI(close,14)", normalization: { method: "minmax" } },
		],
		normalizationConfig: {},
		searchConfig: {},
		resultConfig: {},
		decisionConfig: {},
		executionMode: "analysis",
		apiVersion: null,
		status: "active",
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		deletedAt: null,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Strategy route — userId forwarding
// ---------------------------------------------------------------------------

describe("Strategy routes — userId forwarding", () => {
	function makeStrategyDepsWithIsolation(ownerUserId: string): StrategyRouteDeps {
		const strategies = new Map<string, Strategy & { ownerId: string }>();
		strategies.set("strat-a1", { ...makeStrategy(), ownerId: ownerUserId });

		let currentMode: ExecutionMode = "analysis";

		const strategyRepository = {
			findAll: async (userId: string) =>
				[...strategies.values()].filter((s) => s.ownerId === userId),
			findById: async (id: string, userId: string) => {
				const s = strategies.get(id);
				return s && s.ownerId === userId ? s : null;
			},
			findByNameAndVersion: async () => null,
			findActive: async (userId: string) =>
				[...strategies.values()].filter((s) => s.ownerId === userId),
			create: async (input: CreateStrategyInput, userId: string): Promise<Strategy> => {
				const s: Strategy & { ownerId: string } = {
					...makeStrategy({ id: "strat-new", name: input.name }),
					ownerId: userId,
				};
				strategies.set(s.id, s);
				return s;
			},
			update: async (id: string, input: UpdateStrategyInput, userId: string): Promise<Strategy> => {
				const existing = strategies.get(id);
				if (!existing || existing.ownerId !== userId) throw new Error("Not found");
				const updated = { ...existing, ...input, updatedAt: new Date() };
				strategies.set(id, updated);
				return updated;
			},
			softDelete: async () => {},
			createNewVersion: async (id: string, _input: UpdateStrategyInput, _userId: string) =>
				makeStrategy({ id }),
		};

		const executionModeDeps: ExecutionModeDeps = {
			loadMode: async () => currentMode,
			saveMode: async (_id: string, mode: ExecutionMode) => {
				currentMode = mode;
			},
			getSafetyGateStatus: async () => ({
				killSwitchEnabled: true,
				dailyLossLimitConfigured: true,
			}),
		};

		return { strategyRepository, executionModeDeps };
	}

	test("GET /strategies returns only the authenticated user's strategies", async () => {
		const USER_A = "user-a";
		const deps = makeStrategyDepsWithIsolation(USER_A);

		const app = new Elysia()
			.use(withMockUserId(USER_A))
			.use(errorHandlerPlugin)
			.use(strategyRoutes(deps));

		const res = await app.handle(new Request("http://localhost/api/v1/strategies"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
	});

	test("GET /strategies/:id with wrong userId returns 404", async () => {
		const USER_A = "user-a";
		const USER_B = "user-b";
		const deps = makeStrategyDepsWithIsolation(USER_A);

		// User B tries to access User A's strategy
		const app = new Elysia()
			.use(withMockUserId(USER_B))
			.use(errorHandlerPlugin)
			.use(strategyRoutes(deps));

		const res = await app.handle(new Request("http://localhost/api/v1/strategies/strat-a1"));
		expect(res.status).toBe(404);
		const body = JSON.parse(await res.text());
		expect(body.error.code).toBe("NOT_FOUND");
	});

	test("GET /strategies/:id with correct userId returns the strategy", async () => {
		const USER_A = "user-a";
		const deps = makeStrategyDepsWithIsolation(USER_A);

		const app = new Elysia()
			.use(withMockUserId(USER_A))
			.use(errorHandlerPlugin)
			.use(strategyRoutes(deps));

		const res = await app.handle(new Request("http://localhost/api/v1/strategies/strat-a1"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.id).toBe("strat-a1");
	});

	test("POST /strategies creates strategy owned by the authenticated user", async () => {
		const USER_A = "user-a";
		const deps = makeStrategyDepsWithIsolation(USER_A);
		let capturedUserId = "";
		const original = deps.strategyRepository.create.bind(deps.strategyRepository);
		deps.strategyRepository.create = async (input, userId) => {
			capturedUserId = userId;
			return original(input, userId);
		};

		const app = new Elysia()
			.use(withMockUserId(USER_A))
			.use(errorHandlerPlugin)
			.use(strategyRoutes(deps));

		const res = await app.handle(
			new Request("http://localhost/api/v1/strategies", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "New",
					code: "return [];",
					symbols: ["ETH/USDT"],
					timeframe: "4h",
					direction: "long",
					featuresDefinition: [
						{ name: "sma", expression: "SMA(close,20)", normalization: { method: "zscore" } },
					],
				}),
			}),
		);

		expect(res.status).toBe(201);
		expect(capturedUserId).toBe(USER_A);
	});

	test("PUT /strategies/:id returns 404 when updating another user's strategy", async () => {
		const USER_A = "user-a";
		const USER_B = "user-b";
		const deps = makeStrategyDepsWithIsolation(USER_A);

		const app = new Elysia()
			.use(withMockUserId(USER_B))
			.use(errorHandlerPlugin)
			.use(strategyRoutes(deps));

		const res = await app.handle(
			new Request("http://localhost/api/v1/strategies/strat-a1", {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "hijacked" }),
			}),
		);

		expect(res.status).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// Kill switch routes — userId forwarding
// ---------------------------------------------------------------------------

describe("Kill switch routes — userId forwarding", () => {
	function makeKillSwitchDeps(): KillSwitchRouteDeps & { capturedUserId: string } {
		const result = {
			capturedUserId: "",
			activate: async (
				_scope: string,
				_target: string | null,
				_trigger: string,
				userId: string,
			) => {
				result.capturedUserId = userId;
				return {
					id: "ks-1",
					scope: "global" as const,
					scopeTarget: null,
					active: true,
					triggeredBy: "manual" as const,
					triggeredAt: new Date(),
					requiresAcknowledgment: false,
					acknowledgedAt: null,
				};
			},
			deactivate: async (_id: string, userId: string) => {
				result.capturedUserId = userId;
				return {
					id: "ks-1",
					scope: "global" as const,
					scopeTarget: null,
					active: false,
					triggeredBy: "manual" as const,
					triggeredAt: new Date(),
					requiresAcknowledgment: false,
					acknowledgedAt: null,
				};
			},
			getActiveStates: async (userId: string) => {
				result.capturedUserId = userId;
				return [];
			},
			getAuditEvents: async (_page: number, _pageSize: number, userId: string) => {
				result.capturedUserId = userId;
				return { items: [], total: 0 };
			},
		};
		return result as KillSwitchRouteDeps & { capturedUserId: string };
	}

	test("POST /activate forwards userId to deps", async () => {
		const USER_A = "user-a";
		const deps = makeKillSwitchDeps();

		const app = new Elysia()
			.use(withMockUserId(USER_A))
			.use(errorHandlerPlugin)
			.use(killSwitchRoutes(deps));

		await app.handle(
			new Request("http://localhost/api/v1/risk/kill-switch/activate", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ scope: "global", trigger: "manual" }),
			}),
		);

		expect(deps.capturedUserId).toBe(USER_A);
	});

	test("GET /status forwards userId to deps", async () => {
		const USER_A = "user-a";
		const deps = makeKillSwitchDeps();

		const app = new Elysia()
			.use(withMockUserId(USER_A))
			.use(errorHandlerPlugin)
			.use(killSwitchRoutes(deps));

		await app.handle(new Request("http://localhost/api/v1/risk/kill-switch/status"));

		expect(deps.capturedUserId).toBe(USER_A);
	});
});

// ---------------------------------------------------------------------------
// Orders route — userId forwarding
// ---------------------------------------------------------------------------

describe("Orders route — userId forwarding", () => {
	test("GET /orders forwards userId from context to findOrders", async () => {
		const USER_A = "user-a";
		let capturedUserId = "";
		const deps: OrderRouteDeps = {
			findOrders: async (opts) => {
				capturedUserId = opts.userId;
				return { items: [], total: 0 };
			},
		};

		const app = new Elysia()
			.use(withMockUserId(USER_A))
			.use(errorHandlerPlugin)
			.use(orderRoutes(deps));

		await app.handle(new Request("http://localhost/api/v1/orders"));
		expect(capturedUserId).toBe(USER_A);
	});
});

// ---------------------------------------------------------------------------
// Full server: cross-user access with mock auth
// ---------------------------------------------------------------------------

describe("Full server — cross-user access via real auth middleware", () => {
	function makeFullServerDeps(strategyOwnerId: string): ApiServerDeps {
		const strategies = new Map<string, Strategy & { ownerId: string }>();
		strategies.set("strat-a1", { ...makeStrategy(), ownerId: strategyOwnerId });

		return {
			auth: createMockAuth(), // returns userId = TEST_USER_ID for any Bearer token
			masterEncryptionKey: "0".repeat(64),
			strategyRepository: {
				findAll: async (userId: string) =>
					[...strategies.values()].filter((s) => s.ownerId === userId),
				findById: async (id: string, userId: string) => {
					const s = strategies.get(id);
					return s && s.ownerId === userId ? s : null;
				},
				findByNameAndVersion: async () => null,
				findActive: async (userId: string) =>
					[...strategies.values()].filter((s) => s.ownerId === userId),
				create: async () => {
					throw new Error("stub");
				},
				update: async () => {
					throw new Error("stub");
				},
				softDelete: async () => {
					throw new Error("stub");
				},
				createNewVersion: async () => {
					throw new Error("stub");
				},
			},
			executionModeDeps: {
				loadMode: async () => "analysis" as const,
				saveMode: async () => {},
				getSafetyGateStatus: async () => ({
					killSwitchEnabled: true,
					dailyLossLimitConfigured: true,
				}),
			},
			killSwitchDeps: {
				activate: async () => {
					throw new Error("stub");
				},
				deactivate: async () => {
					throw new Error("stub");
				},
				getActiveStates: async () => [],
				getAuditEvents: async () => ({ items: [], total: 0 }),
			},
			sseSubscribe: () => () => {},
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
				getJournalAnalytics: async () => ({
					tagStats: [],
					overallWinrate: 0,
					overallExpectancy: 0,
				}),
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
		};
	}

	test("authenticated request: userId from session is passed to repository", async () => {
		// createMockAuth returns userId = TEST_USER_ID for any Bearer token
		// The strategy is owned by TEST_USER_ID, so it should be found
		const deps = makeFullServerDeps(TEST_USER_ID);
		const app = createApiServer(deps);
		const headers = await makeAuthHeaders();

		const res = await app.handle(
			new Request("http://localhost/api/v1/strategies/strat-a1", { headers }),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.id).toBe("strat-a1");
	});

	test("authenticated request: strategy owned by different user returns 404", async () => {
		// Strategy is owned by "other-user", but mock auth always returns TEST_USER_ID
		const deps = makeFullServerDeps("other-user");
		const app = createApiServer(deps);
		const headers = await makeAuthHeaders();

		const res = await app.handle(
			new Request("http://localhost/api/v1/strategies/strat-a1", { headers }),
		);
		expect(res.status).toBe(404);
		const body = JSON.parse(await res.text());
		expect(body.error.code).toBe("NOT_FOUND");
	});

	test("unauthenticated request returns 401", async () => {
		const deps = makeFullServerDeps(TEST_USER_ID);
		const app = createApiServer(deps);

		const res = await app.handle(new Request("http://localhost/api/v1/strategies/strat-a1"));
		expect(res.status).toBe(401);
	});

	test("GET /strategies with auth returns only the session user's strategies", async () => {
		const deps = makeFullServerDeps(TEST_USER_ID);
		const app = createApiServer(deps);
		const headers = await makeAuthHeaders();

		const res = await app.handle(new Request("http://localhost/api/v1/strategies", { headers }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toBeArrayOfSize(1);
	});

	test("GET /strategies with auth returns empty for different user's strategies", async () => {
		// Strategies owned by "other-user", session is TEST_USER_ID
		const deps = makeFullServerDeps("other-user");
		const app = createApiServer(deps);
		const headers = await makeAuthHeaders();

		const res = await app.handle(new Request("http://localhost/api/v1/strategies", { headers }));
		expect(res.status).toBe(200);
		const body = await res.json();
		// Returns 200 empty list — not 404, because findAll with wrong userId returns []
		expect(body.data).toBeArrayOfSize(0);
	});
});
