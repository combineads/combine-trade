import { describe, expect, mock, test } from "bun:test";
import {
	DrizzleStrategyRepository,
	type StrategyDbDeps,
	type StrategyRow,
} from "../drizzle-repository.js";
import type { StrategyRepository } from "../repository.js";
import { StrategyCrudService } from "../service.js";
import type { CreateStrategyInput, Strategy } from "../types.js";

const NOW = new Date("2026-03-25T12:00:00Z");
const USER_ID = "user-llm-filter-test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<StrategyRow> = {}): StrategyRow {
	return {
		id: "strat-llm-1",
		version: 1,
		name: "LLM Filter Test",
		description: null,
		code: "export default {}",
		symbols: ["BTCUSDT"],
		timeframe: "1h",
		direction: "both",
		featuresDefinition: [
			{ name: "bb_pos", expression: "bb(close,20,2)", normalization: { method: "minmax" } },
		],
		normalizationConfig: {},
		searchConfig: {},
		resultConfig: {},
		decisionConfig: {},
		executionMode: "analysis",
		apiVersion: null,
		status: "draft",
		useLlmFilter: false,
		createdAt: NOW,
		updatedAt: NOW,
		deletedAt: null,
		...overrides,
	};
}

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
	return {
		id: "strat-llm-1",
		version: 1,
		name: "LLM Filter Test",
		description: null,
		code: "export default {}",
		symbols: ["BTCUSDT"],
		timeframe: "1h",
		direction: "both",
		featuresDefinition: [
			{ name: "bb_pos", expression: "bb(close,20,2)", normalization: { method: "minmax" } },
		],
		normalizationConfig: {},
		searchConfig: {},
		resultConfig: {},
		decisionConfig: {},
		executionMode: "analysis",
		apiVersion: null,
		status: "draft",
		useLlmFilter: false,
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

// ---------------------------------------------------------------------------
// Tests: StrategyRow and domain Strategy type include useLlmFilter
// ---------------------------------------------------------------------------

describe("strategies — use_llm_filter domain type", () => {
	test("Strategy type includes useLlmFilter field", () => {
		const strategy = makeStrategy();
		expect("useLlmFilter" in strategy).toBe(true);
	});

	test("new strategies default useLlmFilter to false", () => {
		const strategy = makeStrategy();
		expect(strategy.useLlmFilter).toBe(false);
	});

	test("strategy can be created with useLlmFilter = true", () => {
		const strategy = makeStrategy({ useLlmFilter: true });
		expect(strategy.useLlmFilter).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Tests: DrizzleStrategyRepository maps useLlmFilter from row
// ---------------------------------------------------------------------------

describe("DrizzleStrategyRepository — useLlmFilter mapping", () => {
	test("maps useLlmFilter = false from row", async () => {
		const deps = makeDeps({
			findById: mock(() => Promise.resolve(makeRow({ useLlmFilter: false }))),
		});
		const repo = new DrizzleStrategyRepository(deps);

		const result = await repo.findById("strat-llm-1", USER_ID);
		expect(result).not.toBeNull();
		expect(result!.useLlmFilter).toBe(false);
	});

	test("maps useLlmFilter = true from row", async () => {
		const deps = makeDeps({
			findById: mock(() => Promise.resolve(makeRow({ useLlmFilter: true }))),
		});
		const repo = new DrizzleStrategyRepository(deps);

		const result = await repo.findById("strat-llm-1", USER_ID);
		expect(result!.useLlmFilter).toBe(true);
	});

	test("create passes useLlmFilter = true through deps", async () => {
		const createMock = mock(() => Promise.resolve(makeRow({ useLlmFilter: true })));
		const deps = makeDeps({ create: createMock });
		const repo = new DrizzleStrategyRepository(deps);

		const input: CreateStrategyInput = {
			name: "LLM Filter Test",
			code: "export default {}",
			symbols: ["BTCUSDT"],
			timeframe: "1h",
			direction: "both",
			featuresDefinition: [
				{ name: "bb_pos", expression: "bb(close,20,2)", normalization: { method: "minmax" } },
			],
			normalizationConfig: {},
			searchConfig: {},
			resultConfig: {},
			decisionConfig: {},
			useLlmFilter: true,
		};

		const result = await repo.create(input, USER_ID);
		expect(result.useLlmFilter).toBe(true);
		expect(createMock).toHaveBeenCalledWith(input, USER_ID);
	});

	test("update passes useLlmFilter through deps", async () => {
		const updateMock = mock(() => Promise.resolve(makeRow({ useLlmFilter: true })));
		const deps = makeDeps({ update: updateMock });
		const repo = new DrizzleStrategyRepository(deps);

		const result = await repo.update("strat-llm-1", { useLlmFilter: true }, USER_ID);
		expect(result.useLlmFilter).toBe(true);
		expect(updateMock).toHaveBeenCalledWith("strat-llm-1", { useLlmFilter: true }, USER_ID);
	});

	test("findAll maps useLlmFilter on all rows", async () => {
		const deps = makeDeps({
			findAll: mock(() =>
				Promise.resolve([
					makeRow({ id: "s1", useLlmFilter: false }),
					makeRow({ id: "s2", useLlmFilter: true }),
				]),
			),
		});
		const repo = new DrizzleStrategyRepository(deps);

		const results = await repo.findAll(USER_ID);
		expect(results).toHaveLength(2);
		expect(results[0]!.useLlmFilter).toBe(false);
		expect(results[1]!.useLlmFilter).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Tests: StrategyCrudService propagates useLlmFilter
// ---------------------------------------------------------------------------

describe("StrategyCrudService — useLlmFilter propagation", () => {
	function createMockRepository(): StrategyRepository {
		const store: Strategy[] = [];
		let counter = 0;
		return {
			async create(input: CreateStrategyInput, _userId: string): Promise<Strategy> {
				counter++;
				const strategy = makeStrategy({
					id: `uuid-${counter}`,
					...input,
					description: input.description ?? null,
					executionMode: input.executionMode ?? "analysis",
					apiVersion: input.apiVersion ?? null,
					useLlmFilter: input.useLlmFilter ?? false,
					status: "draft",
				});
				store.push(strategy);
				return strategy;
			},
			async findById(id: string): Promise<Strategy | null> {
				return store.find((s) => s.id === id && !s.deletedAt) ?? null;
			},
			async findByNameAndVersion(name: string, version: number): Promise<Strategy | null> {
				return store.find((s) => s.name === name && s.version === version && !s.deletedAt) ?? null;
			},
			async findActive(): Promise<Strategy[]> {
				return store.filter((s) => s.status === "active" && !s.deletedAt);
			},
			async findAll(): Promise<Strategy[]> {
				return store.filter((s) => !s.deletedAt);
			},
			async update(id: string, input, _userId): Promise<Strategy> {
				const idx = store.findIndex((s) => s.id === id);
				if (idx === -1) throw new Error("Not found");
				Object.assign(store[idx]!, input, { updatedAt: new Date() });
				return store[idx]!;
			},
			async softDelete(id: string): Promise<void> {
				const s = store.find((s) => s.id === id);
				if (s) s.deletedAt = new Date();
			},
			async createNewVersion(id: string, input, _userId): Promise<Strategy> {
				const existing = store.find((s) => s.id === id);
				if (!existing) throw new Error("Not found");
				counter++;
				const newVersion = makeStrategy({
					...existing,
					...input,
					id: `uuid-${counter}`,
					version: existing.version + 1,
					createdAt: new Date(),
					updatedAt: new Date(),
					deletedAt: null,
				});
				store.push(newVersion);
				return newVersion;
			},
		};
	}

	const baseInput: CreateStrategyInput = {
		name: "LLM Filter Strategy",
		code: "export default {}",
		symbols: ["BTCUSDT"],
		timeframe: "1h",
		direction: "both",
		featuresDefinition: [
			{ name: "bb_pos", expression: "bb(close,20,2)", normalization: { method: "minmax" } },
		],
		normalizationConfig: {},
		searchConfig: {},
		resultConfig: {},
		decisionConfig: {},
	};

	test("new strategy defaults useLlmFilter to false when not provided", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		const strategy = await service.create(baseInput, USER_ID);
		expect(strategy.useLlmFilter).toBe(false);
	});

	test("strategy created with useLlmFilter = true persists correctly", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		const strategy = await service.create({ ...baseInput, useLlmFilter: true }, USER_ID);
		expect(strategy.useLlmFilter).toBe(true);
	});

	test("update can toggle useLlmFilter from false to true", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		const created = await service.create(baseInput, USER_ID);
		expect(created.useLlmFilter).toBe(false);

		const updated = await service.update(created.id, { useLlmFilter: true }, USER_ID);
		expect(updated.useLlmFilter).toBe(true);
	});

	test("update can toggle useLlmFilter from true to false", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		const created = await service.create({ ...baseInput, useLlmFilter: true }, USER_ID);
		expect(created.useLlmFilter).toBe(true);

		const updated = await service.update(created.id, { useLlmFilter: false }, USER_ID);
		expect(updated.useLlmFilter).toBe(false);
	});

	test("API response DTO includes useLlmFilter field", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		const strategy = await service.create({ ...baseInput, useLlmFilter: true }, USER_ID);
		// Simulate what the API would return (direct object from service)
		const dto = strategy as Record<string, unknown>;
		expect("useLlmFilter" in dto).toBe(true);
		expect(dto.useLlmFilter).toBe(true);
	});
});
