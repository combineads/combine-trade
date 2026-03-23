import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import type {
	CreateStrategyInput,
	Strategy,
	UpdateStrategyInput,
} from "../../../packages/core/strategy/types.js";
import type { ExecutionMode, ExecutionModeDeps } from "../../../packages/execution/types.js";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import { type StrategyRouteDeps, strategyRoutes } from "../src/routes/strategies.js";
import { TEST_USER_ID, withMockUserId } from "./helpers/auth.js";

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
	return {
		id: "strat-1",
		version: 1,
		name: "Test Strategy",
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

function createMockDeps(): StrategyRouteDeps {
	const strategies = new Map<string, Strategy>();
	strategies.set("strat-1", makeStrategy());

	let currentMode: ExecutionMode = "analysis";

	const strategyRepository = {
		findAll: async (_userId: string) => [...strategies.values()],
		findById: async (id: string, _userId: string) => strategies.get(id) ?? null,
		findByNameAndVersion: async () => null,
		findActive: async (_userId: string) => [...strategies.values()],
		create: async (input: CreateStrategyInput, _userId: string): Promise<Strategy> => {
			const s = makeStrategy({
				id: "strat-new",
				name: input.name,
				code: input.code,
				symbols: input.symbols,
			});
			strategies.set(s.id, s);
			return s;
		},
		update: async (id: string, input: UpdateStrategyInput, _userId: string): Promise<Strategy> => {
			const existing = strategies.get(id);
			if (!existing) throw new Error(`Not found: ${id}`);
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
		getSafetyGateStatus: async () => ({ killSwitchEnabled: true, dailyLossLimitConfigured: true }),
	};

	return { strategyRepository, executionModeDeps };
}

function createApp(deps?: StrategyRouteDeps) {
	return new Elysia()
		.use(withMockUserId())
		.use(errorHandlerPlugin)
		.use(strategyRoutes(deps ?? createMockDeps()));
}

const BASE = "http://localhost/api/v1/strategies";

describe("Strategy routes", () => {
	describe("GET /api/v1/strategies", () => {
		test("returns all strategies", async () => {
			const app = createApp();
			const res = await app.handle(new Request(BASE));
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data).toBeArrayOfSize(1);
			expect(body.data[0].name).toBe("Test Strategy");
		});

		test("returns empty array when no strategies", async () => {
			const deps = createMockDeps();
			deps.strategyRepository.findAll = async () => [];
			const app = createApp(deps);
			const res = await app.handle(new Request(BASE));
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data).toBeArrayOfSize(0);
		});

		test("passes userId from context to repository", async () => {
			const deps = createMockDeps();
			let capturedUserId = "";
			deps.strategyRepository.findAll = async (uid) => {
				capturedUserId = uid;
				return [];
			};
			const app = new Elysia()
				.use(withMockUserId(TEST_USER_ID))
				.use(errorHandlerPlugin)
				.use(strategyRoutes(deps));
			await app.handle(new Request(BASE));
			expect(capturedUserId).toBe(TEST_USER_ID);
		});
	});

	describe("GET /api/v1/strategies/:id", () => {
		test("returns strategy by id", async () => {
			const app = createApp();
			const res = await app.handle(new Request(`${BASE}/strat-1`));
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data.id).toBe("strat-1");
			expect(body.data.name).toBe("Test Strategy");
		});

		test("returns 404 for unknown id", async () => {
			const app = createApp();
			const res = await app.handle(new Request(`${BASE}/nonexistent`));
			expect(res.status).toBe(404);
			const body = JSON.parse(await res.text());
			expect(body.error.code).toBe("NOT_FOUND");
		});

		test("returns 404 when userId does not own the strategy", async () => {
			const deps = createMockDeps();
			// Repository returns null for wrong userId
			deps.strategyRepository.findById = async (_id: string, uid: string) => {
				if (uid !== TEST_USER_ID) return null;
				return makeStrategy();
			};
			const app = new Elysia()
				.use(withMockUserId("other-user"))
				.use(errorHandlerPlugin)
				.use(strategyRoutes(deps));
			const res = await app.handle(new Request(`${BASE}/strat-1`));
			expect(res.status).toBe(404);
		});
	});

	describe("POST /api/v1/strategies", () => {
		test("creates strategy with valid body", async () => {
			const app = createApp();
			const res = await app.handle(
				new Request(BASE, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						name: "New Strategy",
						code: "return [];",
						symbols: ["ETH/USDT"],
						timeframe: "4h",
						direction: "both",
						featuresDefinition: [
							{ name: "sma", expression: "SMA(close,20)", normalization: { method: "zscore" } },
						],
					}),
				}),
			);
			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.data.name).toBe("New Strategy");
		});

		test("rejects missing required fields", async () => {
			const app = createApp();
			const res = await app.handle(
				new Request(BASE, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: "incomplete" }),
				}),
			);
			expect(res.status).toBe(422);
		});

		test("passes userId from context to repository on create", async () => {
			const deps = createMockDeps();
			let capturedUserId = "";
			deps.strategyRepository.create = async (_input: CreateStrategyInput, uid: string) => {
				capturedUserId = uid;
				return makeStrategy({ id: "strat-new" });
			};
			const app = new Elysia()
				.use(withMockUserId(TEST_USER_ID))
				.use(errorHandlerPlugin)
				.use(strategyRoutes(deps));
			await app.handle(
				new Request(BASE, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						name: "New Strategy",
						code: "return [];",
						symbols: ["ETH/USDT"],
						timeframe: "4h",
						direction: "both",
						featuresDefinition: [
							{ name: "sma", expression: "SMA(close,20)", normalization: { method: "zscore" } },
						],
					}),
				}),
			);
			expect(capturedUserId).toBe(TEST_USER_ID);
		});
	});

	describe("PUT /api/v1/strategies/:id", () => {
		test("updates strategy fields", async () => {
			const app = createApp();
			const res = await app.handle(
				new Request(`${BASE}/strat-1`, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: "Updated Name", description: "new desc" }),
				}),
			);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data.name).toBe("Updated Name");
			expect(body.data.description).toBe("new desc");
		});

		test("returns 404 for unknown id", async () => {
			const app = createApp();
			const res = await app.handle(
				new Request(`${BASE}/nonexistent`, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: "nope" }),
				}),
			);
			expect(res.status).toBe(404);
			const body = JSON.parse(await res.text());
			expect(body.error.code).toBe("NOT_FOUND");
		});
	});

	describe("PUT /api/v1/strategies/:id/mode", () => {
		test("changes execution mode", async () => {
			const app = createApp();
			const res = await app.handle(
				new Request(`${BASE}/strat-1/mode`, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ mode: "paper" }),
				}),
			);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data.strategyId).toBe("strat-1");
			expect(body.data.mode).toBe("paper");
		});

		test("returns 404 for unknown strategy", async () => {
			const app = createApp();
			const res = await app.handle(
				new Request(`${BASE}/nonexistent/mode`, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ mode: "paper" }),
				}),
			);
			expect(res.status).toBe(404);
			const body = JSON.parse(await res.text());
			expect(body.error.code).toBe("NOT_FOUND");
		});

		test("rejects invalid mode value", async () => {
			const app = createApp();
			const res = await app.handle(
				new Request(`${BASE}/strat-1/mode`, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ mode: "invalid" }),
				}),
			);
			expect(res.status).toBe(422);
		});

		test("rejects live mode when safety gates fail", async () => {
			const deps = createMockDeps();
			deps.executionModeDeps.getSafetyGateStatus = async () => ({
				killSwitchEnabled: false,
				dailyLossLimitConfigured: false,
			});
			const app = createApp(deps);
			const res = await app.handle(
				new Request(`${BASE}/strat-1/mode`, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ mode: "live" }),
				}),
			);
			expect(res.status).toBe(422);
			const body = JSON.parse(await res.text());
			expect(body.error.code).toBe("VALIDATION_ERROR");
		});
	});
});
