import { describe, expect, test } from "bun:test";
import { VectorRepository } from "../repository.js";
import type { SqlExecutor } from "../sql-types.js";
import type { VectorTableManager } from "../table-manager.js";

function createMockTableManager(): VectorTableManager {
	return {
		getTableName: (strategyId: string, version: number) =>
			`vectors_${strategyId.replace(/-/g, "_")}_v${version}`,
		tableExists: () => true,
		ensureTable: async () => "vectors_strat_1_v1",
		dropTable: async () => {},
	} as VectorTableManager;
}

function createMockExecutor(
	searchResults: Array<{ event_id: string; distance: number }> = [],
): SqlExecutor & { queries: string[]; params: unknown[][] } {
	const queries: string[] = [];
	const params: unknown[][] = [];
	return {
		queries,
		params,
		async execute(sql: string, p?: unknown[]) {
			queries.push(sql);
			params.push(p ?? []);
			if (sql.includes("ORDER BY")) {
				return {
					rows: searchResults.map((r) => ({
						event_id: r.event_id,
						distance: r.distance.toString(),
					})),
				};
			}
			return { rows: [] };
		},
	};
}

describe("VectorRepository", () => {
	test("store generates correct INSERT SQL", async () => {
		const executor = createMockExecutor();
		const tableManager = createMockTableManager();
		const repo = new VectorRepository(executor, tableManager);

		await repo.store("strat-1", 1, "evt-1", "BTCUSDT", "1m", [0.1, 0.5, 0.9]);

		const insertSQL = executor.queries.find((q) => q.includes("INSERT INTO"));
		expect(insertSQL).toBeDefined();
		expect(insertSQL).toContain("vectors_strat_1_v1");
		expect(insertSQL).toContain("ON CONFLICT (event_id) DO NOTHING");
	});

	test("store includes embedding as vector literal", async () => {
		const executor = createMockExecutor();
		const tableManager = createMockTableManager();
		const repo = new VectorRepository(executor, tableManager);

		await repo.store("strat-1", 1, "evt-1", "BTCUSDT", "1m", [0.1, 0.5, 0.9]);

		const insertSQL = executor.queries.find((q) => q.includes("INSERT INTO"));
		expect(insertSQL).toContain("[0.1,0.5,0.9]");
	});

	test("search targets correct table", async () => {
		const executor = createMockExecutor([]);
		const tableManager = createMockTableManager();
		const repo = new VectorRepository(executor, tableManager);

		await repo.search("strat-1", 1, "BTCUSDT", [0.1, 0.5, 0.9]);

		const searchSQL = executor.queries.find((q) => q.includes("ORDER BY"));
		expect(searchSQL).toContain("vectors_strat_1_v1");
	});

	test("search includes WHERE symbol for isolation", async () => {
		const executor = createMockExecutor([]);
		const tableManager = createMockTableManager();
		const repo = new VectorRepository(executor, tableManager);

		await repo.search("strat-1", 1, "BTCUSDT", [0.1, 0.5, 0.9]);

		const searchSQL = executor.queries.find((q) => q.includes("ORDER BY"));
		expect(searchSQL).toContain("symbol = 'BTCUSDT'");
	});

	test("search uses L2 distance operator", async () => {
		const executor = createMockExecutor([]);
		const tableManager = createMockTableManager();
		const repo = new VectorRepository(executor, tableManager);

		await repo.search("strat-1", 1, "BTCUSDT", [0.1, 0.5, 0.9]);

		const searchSQL = executor.queries.find((q) => q.includes("ORDER BY"));
		expect(searchSQL).toContain("<->");
	});

	test("computeThreshold returns √d × 0.3", () => {
		const executor = createMockExecutor();
		const tableManager = createMockTableManager();
		const repo = new VectorRepository(executor, tableManager);

		expect(repo.computeThreshold(1)).toBeCloseTo(0.3);
		expect(repo.computeThreshold(4)).toBeCloseTo(0.6);
		expect(repo.computeThreshold(9)).toBeCloseTo(0.9);
		expect(repo.computeThreshold(5)).toBeCloseTo(Math.sqrt(5) * 0.3);
	});

	test("search filters by threshold and returns SUFFICIENT", async () => {
		// 35 results within threshold, 15 outside
		const results: Array<{ event_id: string; distance: number }> = [];
		for (let i = 0; i < 35; i++) {
			results.push({ event_id: `evt-${i}`, distance: 0.1 });
		}
		for (let i = 35; i < 50; i++) {
			results.push({ event_id: `evt-${i}`, distance: 10.0 });
		}

		const executor = createMockExecutor(results);
		const tableManager = createMockTableManager();
		const repo = new VectorRepository(executor, tableManager);

		const response = await repo.search("strat-1", 1, "BTCUSDT", [0.1, 0.5, 0.9]);

		expect(response.status).toBe("SUFFICIENT");
		expect(response.validCount).toBe(35);
		expect(response.results).toHaveLength(35);
	});

	test("search returns INSUFFICIENT when < 30 valid results", async () => {
		const results: Array<{ event_id: string; distance: number }> = [];
		for (let i = 0; i < 20; i++) {
			results.push({ event_id: `evt-${i}`, distance: 0.1 });
		}
		for (let i = 20; i < 50; i++) {
			results.push({ event_id: `evt-${i}`, distance: 10.0 });
		}

		const executor = createMockExecutor(results);
		const tableManager = createMockTableManager();
		const repo = new VectorRepository(executor, tableManager);

		const response = await repo.search("strat-1", 1, "BTCUSDT", [0.1, 0.5, 0.9]);

		expect(response.status).toBe("INSUFFICIENT");
		expect(response.validCount).toBe(20);
		expect(response.results).toHaveLength(0);
	});

	test("search defaults to top_k=50", async () => {
		const executor = createMockExecutor([]);
		const tableManager = createMockTableManager();
		const repo = new VectorRepository(executor, tableManager);

		await repo.search("strat-1", 1, "BTCUSDT", [0.1, 0.5, 0.9]);

		const searchSQL = executor.queries.find((q) => q.includes("LIMIT"));
		expect(searchSQL).toContain("LIMIT 50");
	});

	test("search without beforeTimestamp has no created_at filter", async () => {
		const executor = createMockExecutor([]);
		const tableManager = createMockTableManager();
		const repo = new VectorRepository(executor, tableManager);

		await repo.search("strat-1", 1, "BTCUSDT", [0.1, 0.5, 0.9]);

		const searchSQL = executor.queries.find((q) => q.includes("ORDER BY"));
		expect(searchSQL).not.toContain("created_at");
	});

	test("search with beforeTimestamp includes created_at < filter", async () => {
		const executor = createMockExecutor([]);
		const tableManager = createMockTableManager();
		const repo = new VectorRepository(executor, tableManager);

		const ts = new Date("2024-01-15T12:00:00Z");
		await repo.search("strat-1", 1, "BTCUSDT", [0.1, 0.5, 0.9], { beforeTimestamp: ts });

		const searchSQL = executor.queries.find((q) => q.includes("ORDER BY"));
		expect(searchSQL).toContain("created_at");
		expect(searchSQL).toContain("<");
		expect(searchSQL).toContain("2024-01-15");
	});

	test("beforeTimestamp filter is added to WHERE clause alongside symbol", async () => {
		const executor = createMockExecutor([]);
		const tableManager = createMockTableManager();
		const repo = new VectorRepository(executor, tableManager);

		const ts = new Date("2024-06-01T00:00:00Z");
		await repo.search("strat-1", 1, "ETHUSDT", [0.1, 0.5], { beforeTimestamp: ts });

		const searchSQL = executor.queries.find((q) => q.includes("ORDER BY"));
		expect(searchSQL).toContain("symbol = 'ETHUSDT'");
		expect(searchSQL).toContain("created_at");
	});
});
