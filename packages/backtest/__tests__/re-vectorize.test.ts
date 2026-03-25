import { describe, expect, test } from "bun:test";
import {
	type FeatureVector,
	type ReVectorizeConfig,
	type ReVectorizeDeps,
	type StoredEvent,
	buildTableName,
	runReVectorize,
} from "../re-vectorize.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(idx: number, version = 1): StoredEvent {
	return {
		eventId: `evt-${idx}`,
		strategyId: "strat-a",
		version,
		symbol: "BTCUSDT",
		timeframe: "1h",
		openTime: new Date(1704067200000 + idx * 3_600_000),
	};
}

function makeVector(event: StoredEvent): FeatureVector {
	return {
		eventId: event.eventId,
		symbol: event.symbol,
		timeframe: event.timeframe,
		embedding: [0.1, 0.2, 0.3],
	};
}

function makeDeps(overrides: Partial<ReVectorizeDeps> = {}): ReVectorizeDeps & {
	loadEventsCalls: Array<[string, number]>;
	executeStrategyCalls: StoredEvent[];
	storeVectorCalls: Array<[FeatureVector, string]>;
	migrateTableCalls: unknown[];
	updateActiveVersionCalls: Array<[string, number]>;
	logs: string[];
} {
	const loadEventsCalls: Array<[string, number]> = [];
	const executeStrategyCalls: StoredEvent[] = [];
	const storeVectorCalls: Array<[FeatureVector, string]> = [];
	const migrateTableCalls: unknown[] = [];
	const updateActiveVersionCalls: Array<[string, number]> = [];
	const logs: string[] = [];

	return {
		loadEventsCalls,
		executeStrategyCalls,
		storeVectorCalls,
		migrateTableCalls,
		updateActiveVersionCalls,
		logs,

		loadEvents:
			overrides.loadEvents ??
			(async (strategyId, version) => {
				loadEventsCalls.push([strategyId, version]);
				return [];
			}),

		executeStrategy:
			overrides.executeStrategy ??
			(async (event) => {
				executeStrategyCalls.push(event);
				return makeVector(event);
			}),

		storeVector:
			overrides.storeVector ??
			(async (vector, tableName) => {
				storeVectorCalls.push([vector, tableName]);
			}),

		migrateTable:
			overrides.migrateTable ??
			((async (tableName: string, newDimension: number, options: { confirmed: true }) => {
				migrateTableCalls.push([tableName, newDimension, options]);
				return {
					tableName,
					oldDimension: 0,
					newDimension,
					dimensionChanged: false,
					rowsCopied: 0,
				};
			}) as ReVectorizeDeps["migrateTable"]),

		updateActiveVersion:
			overrides.updateActiveVersion ??
			(async (strategyId, newVersion) => {
				updateActiveVersionCalls.push([strategyId, newVersion]);
			}),

		log:
			overrides.log ??
			((msg) => {
				logs.push(msg);
			}),
	};
}

function makeConfig(overrides: Partial<ReVectorizeConfig> = {}): ReVectorizeConfig {
	return {
		strategyId: "strat-a",
		oldVersion: 1,
		newVersion: 2,
		confirmed: true,
		...overrides,
	} as ReVectorizeConfig;
}

// ---------------------------------------------------------------------------
// buildTableName
// ---------------------------------------------------------------------------

describe("buildTableName", () => {
	test("uses vectors_{strategyId}_{version} convention", () => {
		expect(buildTableName("strat-a", 2)).toBe("vectors_strat_a_v2");
	});

	test("sanitizes special characters from strategyId", () => {
		expect(buildTableName("my.strategy!", 3)).toBe("vectors_mystrategy_v3");
	});

	test("replaces hyphens with underscores", () => {
		expect(buildTableName("double-bb", 1)).toBe("vectors_double_bb_v1");
	});
});

// ---------------------------------------------------------------------------
// runReVectorize — safety gate
// ---------------------------------------------------------------------------

describe("runReVectorize — safety gate", () => {
	test("throws ERR_REVECTORIZE_NOT_CONFIRMED when confirmed is not true", async () => {
		const deps = makeDeps();
		// Force pass a config without confirmed (TypeScript cast to bypass type check)
		const badConfig = { strategyId: "strat-a", oldVersion: 1, newVersion: 2 } as ReVectorizeConfig;

		await expect(runReVectorize(deps, badConfig)).rejects.toThrow("ERR_REVECTORIZE_NOT_CONFIRMED");
	});

	test("no dep is called before the confirmation check", async () => {
		const deps = makeDeps();
		const badConfig = { strategyId: "strat-a", oldVersion: 1, newVersion: 2 } as ReVectorizeConfig;

		await expect(runReVectorize(deps, badConfig)).rejects.toThrow();

		expect(deps.loadEventsCalls).toHaveLength(0);
		expect(deps.executeStrategyCalls).toHaveLength(0);
		expect(deps.storeVectorCalls).toHaveLength(0);
		expect(deps.migrateTableCalls).toHaveLength(0);
		expect(deps.updateActiveVersionCalls).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// runReVectorize — happy path
// ---------------------------------------------------------------------------

describe("runReVectorize — happy path", () => {
	test("5 events → executeStrategy called 5 times, storeVector called 5 times, reVectorized: 5", async () => {
		const events = Array.from({ length: 5 }, (_, i) => makeEvent(i));

		const deps = makeDeps({
			loadEvents: async () => events,
		});
		// Capture the calls via the default handlers (they push into the arrays)
		const trackedDeps = {
			...deps,
			loadEvents: async (_strategyId: string, _version: number) => {
				deps.loadEventsCalls.push([_strategyId, _version]);
				return events;
			},
			executeStrategy: async (event: StoredEvent) => {
				deps.executeStrategyCalls.push(event);
				return makeVector(event);
			},
			storeVector: async (vector: FeatureVector, tableName: string) => {
				deps.storeVectorCalls.push([vector, tableName]);
			},
		};

		const result = await runReVectorize(trackedDeps, makeConfig());

		expect(trackedDeps.executeStrategyCalls).toHaveLength(5);
		expect(trackedDeps.storeVectorCalls).toHaveLength(5);
		expect(result.reVectorized).toBe(5);
		expect(result.skipped).toBe(0);
	});

	test("executeStrategy returns null for 2 events → skipped: 2, storeVector called 3 times", async () => {
		const events = Array.from({ length: 5 }, (_, i) => makeEvent(i));
		const storeVectorCalls: Array<[FeatureVector, string]> = [];

		const deps = makeDeps({
			loadEvents: async () => events,
			executeStrategy: async (event) => {
				// Return null for indices 1 and 3
				const idx = events.indexOf(event);
				if (idx === 1 || idx === 3) return null;
				return makeVector(event);
			},
			storeVector: async (vector, tableName) => {
				storeVectorCalls.push([vector, tableName]);
			},
		});

		const result = await runReVectorize(deps, makeConfig());

		expect(storeVectorCalls).toHaveLength(3);
		expect(result.reVectorized).toBe(3);
		expect(result.skipped).toBe(2);
	});

	test("updateActiveVersion called exactly once with newVersion after all vectors stored", async () => {
		const events = Array.from({ length: 3 }, (_, i) => makeEvent(i));
		const updateCalls: Array<[string, number]> = [];
		const storeOrder: string[] = [];
		let updateCalledAfterStore = false;

		const deps = makeDeps({
			loadEvents: async () => events,
			storeVector: async (vector, _tableName) => {
				storeOrder.push(vector.eventId);
			},
			updateActiveVersion: async (strategyId, newVersion) => {
				updateCalls.push([strategyId, newVersion]);
				// Check all 3 vectors were stored before this call
				updateCalledAfterStore = storeOrder.length === 3;
			},
		});

		await runReVectorize(deps, makeConfig());

		expect(updateCalls).toHaveLength(1);
		expect(updateCalls[0]).toEqual(["strat-a", 2]);
		expect(updateCalledAfterStore).toBe(true);
	});

	test("migrateTable called once with correct new table name and { confirmed: true }", async () => {
		const migrateTableCalls: unknown[][] = [];

		const deps = makeDeps({
			loadEvents: async () => [],
			migrateTable: async (
				tableName: string,
				newDimension: number,
				options: { confirmed: true },
			) => {
				migrateTableCalls.push([tableName, newDimension, options]);
				return {
					tableName,
					oldDimension: 0,
					newDimension,
					dimensionChanged: false,
					rowsCopied: 0,
				};
			},
		});

		await runReVectorize(deps, makeConfig());

		expect(migrateTableCalls).toHaveLength(1);
		const [tableName, , options] = migrateTableCalls[0] as [string, number, { confirmed: boolean }];
		expect(tableName).toBe("vectors_strat_a_v2");
		expect(options).toEqual({ confirmed: true });
	});

	test("newTableName in result matches {strategyId}_{newVersion} convention", async () => {
		const deps = makeDeps({ loadEvents: async () => [] });
		const result = await runReVectorize(deps, makeConfig());
		expect(result.newTableName).toBe("vectors_strat_a_v2");
	});

	test("durationMs is a positive number", async () => {
		const deps = makeDeps({ loadEvents: async () => [] });
		const result = await runReVectorize(deps, makeConfig());
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
	});
});

// ---------------------------------------------------------------------------
// runReVectorize — error propagation
// ---------------------------------------------------------------------------

describe("runReVectorize — error propagation", () => {
	test("storeVector throws → error propagated, updateActiveVersion never called", async () => {
		const events = [makeEvent(0), makeEvent(1)];
		const updateCalls: Array<[string, number]> = [];

		const deps = makeDeps({
			loadEvents: async () => events,
			storeVector: async () => {
				throw new Error("DB_WRITE_FAILURE");
			},
			updateActiveVersion: async (strategyId, newVersion) => {
				updateCalls.push([strategyId, newVersion]);
			},
		});

		await expect(runReVectorize(deps, makeConfig())).rejects.toThrow("DB_WRITE_FAILURE");
		expect(updateCalls).toHaveLength(0);
	});
});
