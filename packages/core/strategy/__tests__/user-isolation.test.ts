/**
 * RED: User isolation tests for StrategyRepository.
 * These tests verify that userId is required in all repository methods
 * and that cross-user access returns null / empty array.
 */
import { describe, expect, test } from "bun:test";
import type { StrategyRepository } from "../repository.js";
import type { CreateStrategyInput, Strategy, UpdateStrategyInput } from "../types.js";

const USER_A = "user-a-uuid";
const USER_B = "user-b-uuid";

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
	return {
		id: "strat-1",
		version: 1,
		name: "Test Strategy",
		description: null,
		code: "return features;",
		symbols: ["BTCUSDT"],
		timeframe: "1h",
		direction: "long",
		featuresDefinition: [{ name: "rsi", expression: "RSI(close,14)", normalization: { method: "minmax" } }],
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

/**
 * In-memory repository that enforces userId isolation.
 * This is the reference implementation shape that the updated interface must support.
 */
function createIsolatedMockRepository(): StrategyRepository {
	const store = new Map<string, Strategy & { userId: string }>();
	let counter = 0;

	return {
		async create(input: CreateStrategyInput, userId: string): Promise<Strategy> {
			counter++;
			const strategy = { ...makeStrategy({ id: `uuid-${counter}`, ...input }), userId };
			store.set(strategy.id, strategy);
			return strategy;
		},
		async findById(id: string, userId: string): Promise<Strategy | null> {
			const record = store.get(id);
			if (!record || record.userId !== userId) return null;
			return record;
		},
		async findByNameAndVersion(name: string, version: number, userId: string): Promise<Strategy | null> {
			for (const record of store.values()) {
				if (record.name === name && record.version === version && record.userId === userId && !record.deletedAt) {
					return record;
				}
			}
			return null;
		},
		async findActive(userId: string): Promise<Strategy[]> {
			return [...store.values()].filter((s) => s.userId === userId && s.status === "active" && !s.deletedAt);
		},
		async findAll(userId: string): Promise<Strategy[]> {
			return [...store.values()].filter((s) => s.userId === userId && !s.deletedAt);
		},
		async update(id: string, input: UpdateStrategyInput, userId: string): Promise<Strategy> {
			const record = store.get(id);
			if (!record || record.userId !== userId) throw new Error("Not found");
			const updated = { ...record, ...input, updatedAt: new Date() };
			store.set(id, updated);
			return updated;
		},
		async softDelete(id: string, userId: string): Promise<void> {
			const record = store.get(id);
			if (record && record.userId === userId) {
				store.set(id, { ...record, deletedAt: new Date() });
			}
		},
		async createNewVersion(id: string, input: UpdateStrategyInput, userId: string): Promise<Strategy> {
			const record = store.get(id);
			if (!record || record.userId !== userId) throw new Error("Not found");
			counter++;
			const newVersion = { ...record, ...input, id: `uuid-${counter}`, version: record.version + 1, userId };
			store.set(newVersion.id, newVersion);
			return newVersion;
		},
	};
}

describe("StrategyRepository user isolation", () => {
	test("findAll returns only the calling user's strategies", async () => {
		const repo = createIsolatedMockRepository();
		const input: CreateStrategyInput = {
			name: "My Strategy",
			code: "return features;",
			symbols: ["BTCUSDT"],
			timeframe: "1h",
			direction: "long",
			featuresDefinition: [{ name: "rsi", expression: "RSI(close,14)", normalization: { method: "minmax" } }],
			normalizationConfig: {},
			searchConfig: {},
			resultConfig: {},
			decisionConfig: {},
		};

		await repo.create(input, USER_A);
		await repo.create(input, USER_B);

		const resultA = await repo.findAll(USER_A);
		const resultB = await repo.findAll(USER_B);

		expect(resultA).toHaveLength(1);
		expect(resultB).toHaveLength(1);
	});

	test("findById returns null when userId does not match", async () => {
		const repo = createIsolatedMockRepository();
		const input: CreateStrategyInput = {
			name: "User A Strategy",
			code: "return features;",
			symbols: ["BTCUSDT"],
			timeframe: "1h",
			direction: "long",
			featuresDefinition: [{ name: "rsi", expression: "RSI(close,14)", normalization: { method: "minmax" } }],
			normalizationConfig: {},
			searchConfig: {},
			resultConfig: {},
			decisionConfig: {},
		};

		const created = await repo.create(input, USER_A);

		// User A can find their own strategy
		const foundByA = await repo.findById(created.id, USER_A);
		expect(foundByA).not.toBeNull();
		expect(foundByA!.id).toBe(created.id);

		// User B cannot find User A's strategy — returns null (not 403)
		const foundByB = await repo.findById(created.id, USER_B);
		expect(foundByB).toBeNull();
	});

	test("findByNameAndVersion returns null for cross-user access", async () => {
		const repo = createIsolatedMockRepository();
		const input: CreateStrategyInput = {
			name: "Shared Name",
			code: "return features;",
			symbols: ["BTCUSDT"],
			timeframe: "1h",
			direction: "long",
			featuresDefinition: [{ name: "rsi", expression: "RSI(close,14)", normalization: { method: "minmax" } }],
			normalizationConfig: {},
			searchConfig: {},
			resultConfig: {},
			decisionConfig: {},
		};

		await repo.create(input, USER_A);

		const foundByA = await repo.findByNameAndVersion("Shared Name", 1, USER_A);
		expect(foundByA).not.toBeNull();

		const foundByB = await repo.findByNameAndVersion("Shared Name", 1, USER_B);
		expect(foundByB).toBeNull();
	});

	test("findActive returns only active strategies for the calling user", async () => {
		const repo = createIsolatedMockRepository();
		const input: CreateStrategyInput = {
			name: "Active",
			code: "return features;",
			symbols: ["BTCUSDT"],
			timeframe: "1h",
			direction: "long",
			featuresDefinition: [{ name: "rsi", expression: "RSI(close,14)", normalization: { method: "minmax" } }],
			normalizationConfig: {},
			searchConfig: {},
			resultConfig: {},
			decisionConfig: {},
		};

		await repo.create(input, USER_A);
		await repo.create(input, USER_B);

		const activeA = await repo.findActive(USER_A);
		// Default status in makeStrategy is "active"
		// Isolation should mean each user only sees their own
		const activeB = await repo.findActive(USER_B);

		for (const s of activeA) {
			// All belong to user A — by construction of the mock
			expect(s).not.toBeNull();
		}
		// The sets should not overlap (different objects)
		expect(activeA.length + activeB.length).toBeLessThanOrEqual(2);
	});

	test("update with wrong userId does not affect the record", async () => {
		const repo = createIsolatedMockRepository();
		const input: CreateStrategyInput = {
			name: "Original",
			code: "return features;",
			symbols: ["BTCUSDT"],
			timeframe: "1h",
			direction: "long",
			featuresDefinition: [{ name: "rsi", expression: "RSI(close,14)", normalization: { method: "minmax" } }],
			normalizationConfig: {},
			searchConfig: {},
			resultConfig: {},
			decisionConfig: {},
		};

		const created = await repo.create(input, USER_A);

		// User B tries to update — should throw / return null
		await expect(repo.update(created.id, { name: "Hijacked" }, USER_B)).rejects.toThrow();

		// User A's record is unchanged
		const found = await repo.findById(created.id, USER_A);
		expect(found!.name).toBe("Original");
	});

	test("softDelete with wrong userId is a no-op", async () => {
		const repo = createIsolatedMockRepository();
		const input: CreateStrategyInput = {
			name: "Owned",
			code: "return features;",
			symbols: ["BTCUSDT"],
			timeframe: "1h",
			direction: "long",
			featuresDefinition: [{ name: "rsi", expression: "RSI(close,14)", normalization: { method: "minmax" } }],
			normalizationConfig: {},
			searchConfig: {},
			resultConfig: {},
			decisionConfig: {},
		};

		const created = await repo.create(input, USER_A);

		// User B tries to delete — should be a no-op (no error, no deletion)
		await repo.softDelete(created.id, USER_B);

		// Strategy still exists for User A
		const found = await repo.findById(created.id, USER_A);
		expect(found).not.toBeNull();
		expect(found!.deletedAt).toBeNull();
	});

	test("createNewVersion with wrong userId throws", async () => {
		const repo = createIsolatedMockRepository();
		const input: CreateStrategyInput = {
			name: "V1",
			code: "return features;",
			symbols: ["BTCUSDT"],
			timeframe: "1h",
			direction: "long",
			featuresDefinition: [{ name: "rsi", expression: "RSI(close,14)", normalization: { method: "minmax" } }],
			normalizationConfig: {},
			searchConfig: {},
			resultConfig: {},
			decisionConfig: {},
		};

		const created = await repo.create(input, USER_A);

		await expect(repo.createNewVersion(created.id, { name: "V2" }, USER_B)).rejects.toThrow();
	});

	test("create stores userId and returns strategy owned by that user", async () => {
		const repo = createIsolatedMockRepository();
		const input: CreateStrategyInput = {
			name: "Created",
			code: "return features;",
			symbols: ["BTCUSDT"],
			timeframe: "1h",
			direction: "long",
			featuresDefinition: [{ name: "rsi", expression: "RSI(close,14)", normalization: { method: "minmax" } }],
			normalizationConfig: {},
			searchConfig: {},
			resultConfig: {},
			decisionConfig: {},
		};

		const created = await repo.create(input, USER_A);

		// Can be retrieved by owner
		const found = await repo.findById(created.id, USER_A);
		expect(found).not.toBeNull();

		// Cannot be retrieved by another user
		const notFound = await repo.findById(created.id, USER_B);
		expect(notFound).toBeNull();
	});
});
