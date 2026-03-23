import { describe, expect, test, mock, beforeEach } from "bun:test";
import {
	DrizzleStrategyRepository,
	type StrategyDbDeps,
	type StrategyRow,
} from "../drizzle-repository.js";
import type { Strategy, CreateStrategyInput } from "../types.js";

const NOW = new Date("2026-03-22T12:00:00Z");
const USER_ID = "user-test-uuid";

function makeRow(overrides: Partial<StrategyRow> = {}): StrategyRow {
	return {
		id: "strat-1",
		version: 1,
		name: "Double BB",
		description: "Bollinger Band strategy",
		code: "export default {}",
		symbols: ["BTCUSDT"],
		timeframe: "1h",
		direction: "both",
		featuresDefinition: [{ name: "bb_pos", expression: "bb(close,20,2)", normalization: { method: "minmax" } }],
		normalizationConfig: {},
		searchConfig: {},
		resultConfig: {},
		decisionConfig: {},
		executionMode: "analysis",
		apiVersion: null,
		status: "active",
		createdAt: NOW,
		updatedAt: NOW,
		deletedAt: null,
		...overrides,
	};
}

function makeDeps(overrides: Partial<StrategyDbDeps> = {}): StrategyDbDeps {
	return {
		findAll: mock(() => Promise.resolve([makeRow()])),
		findById: mock(() => Promise.resolve(makeRow())),
		findByNameAndVersion: mock(() => Promise.resolve(makeRow())),
		findActive: mock(() => Promise.resolve([makeRow()])),
		create: mock(() => Promise.resolve(makeRow())),
		update: mock(() => Promise.resolve(makeRow({ updatedAt: new Date() }))),
		softDelete: mock(() => Promise.resolve()),
		...overrides,
	};
}

describe("DrizzleStrategyRepository", () => {
	test("findAll returns mapped strategies", async () => {
		const deps = makeDeps();
		const repo = new DrizzleStrategyRepository(deps);

		const result = await repo.findAll(USER_ID);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("strat-1");
		expect(result[0].name).toBe("Double BB");
		expect(result[0].symbols).toEqual(["BTCUSDT"]);
		expect(deps.findAll).toHaveBeenCalledTimes(1);
		expect(deps.findAll).toHaveBeenCalledWith(USER_ID);
	});

	test("findById returns mapped strategy", async () => {
		const deps = makeDeps();
		const repo = new DrizzleStrategyRepository(deps);

		const result = await repo.findById("strat-1", USER_ID);
		expect(result).not.toBeNull();
		expect(result!.id).toBe("strat-1");
		expect(deps.findById).toHaveBeenCalledWith("strat-1", USER_ID);
	});

	test("findById returns null when not found", async () => {
		const deps = makeDeps({
			findById: mock(() => Promise.resolve(null)),
		});
		const repo = new DrizzleStrategyRepository(deps);

		const result = await repo.findById("nonexistent", USER_ID);
		expect(result).toBeNull();
	});

	test("findByNameAndVersion delegates correctly", async () => {
		const deps = makeDeps();
		const repo = new DrizzleStrategyRepository(deps);

		await repo.findByNameAndVersion("Double BB", 1, USER_ID);
		expect(deps.findByNameAndVersion).toHaveBeenCalledWith("Double BB", 1, USER_ID);
	});

	test("findActive returns only active strategies", async () => {
		const deps = makeDeps({
			findActive: mock(() =>
				Promise.resolve([
					makeRow({ status: "active" }),
					makeRow({ id: "strat-2", status: "active" }),
				]),
			),
		});
		const repo = new DrizzleStrategyRepository(deps);

		const result = await repo.findActive(USER_ID);
		expect(result).toHaveLength(2);
		expect(deps.findActive).toHaveBeenCalledWith(USER_ID);
	});

	test("create passes input and userId, returns mapped result", async () => {
		const input: CreateStrategyInput = {
			name: "New Strategy",
			code: "export default {}",
			symbols: ["ETHUSDT"],
			timeframe: "5m",
			direction: "long",
			featuresDefinition: [],
			normalizationConfig: {},
			searchConfig: {},
			resultConfig: {},
			decisionConfig: {},
		};

		const deps = makeDeps({
			create: mock(() =>
				Promise.resolve(
					makeRow({ id: "strat-new", name: "New Strategy", symbols: ["ETHUSDT"] }),
				),
			),
		});
		const repo = new DrizzleStrategyRepository(deps);

		const result = await repo.create(input, USER_ID);
		expect(result.id).toBe("strat-new");
		expect(result.name).toBe("New Strategy");
		expect(deps.create).toHaveBeenCalledWith(input, USER_ID);
	});

	test("update passes id, input, and userId", async () => {
		const deps = makeDeps();
		const repo = new DrizzleStrategyRepository(deps);

		const result = await repo.update("strat-1", { name: "Updated" }, USER_ID);
		expect(deps.update).toHaveBeenCalledWith("strat-1", { name: "Updated" }, USER_ID);
		expect(result).not.toBeNull();
	});

	test("softDelete delegates to deps with userId", async () => {
		const deps = makeDeps();
		const repo = new DrizzleStrategyRepository(deps);

		await repo.softDelete("strat-1", USER_ID);
		expect(deps.softDelete).toHaveBeenCalledWith("strat-1", USER_ID);
	});

	test("createNewVersion increments version and creates", async () => {
		const deps = makeDeps({
			findById: mock(() => Promise.resolve(makeRow({ version: 2 }))),
			create: mock(() =>
				Promise.resolve(makeRow({ id: "strat-v3", version: 3 })),
			),
		});
		const repo = new DrizzleStrategyRepository(deps);

		const result = await repo.createNewVersion("strat-1", { code: "new code" }, USER_ID);
		expect(result.version).toBe(3);

		expect(deps.findById).toHaveBeenCalledWith("strat-1", USER_ID);

		const createCall = (deps.create as ReturnType<typeof mock>).mock.calls[0];
		const createInput = createCall[0] as Record<string, unknown>;
		expect(createInput.code).toBe("new code");
		// userId is passed as second arg to create
		expect(createCall[1]).toBe(USER_ID);
	});

	test("createNewVersion throws if strategy not found", async () => {
		const deps = makeDeps({
			findById: mock(() => Promise.resolve(null)),
		});
		const repo = new DrizzleStrategyRepository(deps);

		await expect(repo.createNewVersion("nonexistent", {}, USER_ID)).rejects.toThrow("not found");
	});

	test("maps row fields correctly to Strategy domain type", async () => {
		const row = makeRow({
			featuresDefinition: [
				{ name: "f1", expression: "rsi(close,14)", normalization: { method: "zscore", lookback: 100 } },
			],
			executionMode: "paper",
			status: "active",
		});

		const deps = makeDeps({
			findById: mock(() => Promise.resolve(row)),
		});
		const repo = new DrizzleStrategyRepository(deps);

		const result = await repo.findById("strat-1", USER_ID);
		expect(result!.featuresDefinition[0].name).toBe("f1");
		expect(result!.featuresDefinition[0].normalization.method).toBe("zscore");
		expect(result!.executionMode).toBe("paper");
		expect(result!.status).toBe("active");
	});
});
