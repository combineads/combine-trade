import { describe, expect, test } from "bun:test";
import type { StrategyRepository } from "../repository.js";
import { StrategyCrudService } from "../service.js";
import type { CreateStrategyInput, Strategy, UpdateStrategyInput } from "../types.js";

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
	return {
		id: "test-uuid-1",
		version: 1,
		name: "SMA Cross",
		description: null,
		code: "defineFeature('sma_diff', close[0] - sma(close, 20)[0], { method: 'minmax' });",
		symbols: ["BTCUSDT"],
		timeframe: "1m",
		direction: "long",
		featuresDefinition: [
			{ name: "sma_diff", expression: "close - sma(20)", normalization: { method: "minmax" } },
		],
		normalizationConfig: {},
		searchConfig: {},
		resultConfig: {},
		decisionConfig: {},
		executionMode: "analysis",
		apiVersion: null,
		status: "draft",
		createdAt: new Date(),
		updatedAt: new Date(),
		deletedAt: null,
		...overrides,
	};
}

function createMockRepository(): StrategyRepository & {
	strategies: Strategy[];
} {
	const strategies: Strategy[] = [];
	let counter = 0;

	return {
		strategies,
		async create(input: CreateStrategyInput): Promise<Strategy> {
			counter++;
			const strategy = makeStrategy({
				id: `uuid-${counter}`,
				...input,
				description: input.description ?? null,
				executionMode: input.executionMode ?? "analysis",
				apiVersion: input.apiVersion ?? null,
				status: "draft",
			});
			strategies.push(strategy);
			return strategy;
		},
		async findById(id: string): Promise<Strategy | null> {
			return strategies.find((s) => s.id === id && !s.deletedAt) ?? null;
		},
		async findByNameAndVersion(name: string, version: number): Promise<Strategy | null> {
			return (
				strategies.find((s) => s.name === name && s.version === version && !s.deletedAt) ?? null
			);
		},
		async findActive(): Promise<Strategy[]> {
			return strategies.filter((s) => s.status === "active" && !s.deletedAt);
		},
		async findAll(): Promise<Strategy[]> {
			return strategies.filter((s) => !s.deletedAt);
		},
		async update(id: string, input: UpdateStrategyInput): Promise<Strategy> {
			const idx = strategies.findIndex((s) => s.id === id);
			if (idx === -1) throw new Error("Not found");
			Object.assign(strategies[idx]!, input, { updatedAt: new Date() });
			return strategies[idx]!;
		},
		async softDelete(id: string): Promise<void> {
			const strategy = strategies.find((s) => s.id === id);
			if (strategy) strategy.deletedAt = new Date();
		},
		async createNewVersion(id: string, input: UpdateStrategyInput): Promise<Strategy> {
			const existing = strategies.find((s) => s.id === id);
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
			strategies.push(newVersion);
			return newVersion;
		},
	};
}

const validInput: CreateStrategyInput = {
	name: "SMA Cross",
	code: "defineFeature('sma_diff', close[0] - sma(close, 20)[0], { method: 'minmax' });",
	symbols: ["BTCUSDT"],
	timeframe: "1m",
	direction: "long",
	featuresDefinition: [
		{ name: "sma_diff", expression: "close - sma(20)", normalization: { method: "minmax" } },
	],
	normalizationConfig: {},
	searchConfig: {},
	resultConfig: {},
	decisionConfig: {},
};

describe("StrategyCrudService", () => {
	test("create with valid features succeeds", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		const strategy = await service.create(validInput);
		expect(strategy.name).toBe("SMA Cross");
		expect(strategy.featuresDefinition.length).toBe(1);
		expect(strategy.status).toBe("draft");
	});

	test("create without features throws ERR_USER_FEATURES_REQUIRED", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		await expect(service.create({ ...validInput, featuresDefinition: [] })).rejects.toThrow(
			"At least one feature definition is required",
		);
	});

	test("create with invalid feature (missing name) throws", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		await expect(
			service.create({
				...validInput,
				featuresDefinition: [
					{ name: "", expression: "close", normalization: { method: "minmax" } },
				],
			}),
		).rejects.toThrow("Feature must have name and expression");
	});

	test("findById returns strategy", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		const created = await service.create(validInput);
		const found = await service.findById(created.id);
		expect(found).not.toBeNull();
		expect(found!.name).toBe("SMA Cross");
	});

	test("findActive returns only active strategies", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		await service.create(validInput);
		// Default status is draft, not active
		const active = await service.findActive();
		expect(active.length).toBe(0);
	});

	test("update with valid features succeeds", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		const created = await service.create(validInput);
		const updated = await service.update(created.id, { name: "Updated Cross" });
		expect(updated.name).toBe("Updated Cross");
	});

	test("createNewVersion preserves old version and increments", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		const v1 = await service.create(validInput);
		const v2 = await service.createNewVersion(v1.id, { name: "SMA Cross V2" });

		expect(v2.version).toBe(2);
		expect(v2.name).toBe("SMA Cross V2");

		// v1 still exists
		const allStrategies = await service.findAll();
		expect(allStrategies.length).toBe(2);
	});

	test("softDelete sets deletedAt and excludes from findById", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		const created = await service.create(validInput);
		await service.softDelete(created.id);

		const found = await service.findById(created.id);
		expect(found).toBeNull();
	});

	test("update with empty features throws", async () => {
		const repo = createMockRepository();
		const service = new StrategyCrudService(repo);

		const created = await service.create(validInput);
		await expect(service.update(created.id, { featuresDefinition: [] })).rejects.toThrow(
			"At least one feature definition is required",
		);
	});
});
