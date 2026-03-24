import { describe, expect, test } from "bun:test";
import type { SqlExecutor } from "../sql-types.js";
import { reindexTable } from "../hnsw-reindex.js";

function createMockExecutor(): SqlExecutor & { queries: string[] } {
	const queries: string[] = [];
	return {
		queries,
		async execute(sql: string): Promise<{ rows: Record<string, unknown>[] }> {
			queries.push(sql);
			return { rows: [] };
		},
	};
}

describe("reindexTable", () => {
	test("drops existing HNSW index before recreating", async () => {
		const executor = createMockExecutor();
		await reindexTable("vectors_strat_v1", executor);

		const dropQuery = executor.queries.find(
			(q) => q.toUpperCase().includes("DROP INDEX") && q.includes("_hnsw_idx"),
		);
		expect(dropQuery).toBeDefined();
	});

	test("recreates HNSW index with m=16 and ef_construction=64", async () => {
		const executor = createMockExecutor();
		await reindexTable("vectors_strat_v1", executor);

		const createQuery = executor.queries.find(
			(q) => q.includes("USING hnsw") && q.includes("vector_l2_ops"),
		);
		expect(createQuery).toBeDefined();
		expect(createQuery).toContain("m = 16");
		expect(createQuery).toContain("ef_construction = 64");
	});

	test("recreates symbol index", async () => {
		const executor = createMockExecutor();
		await reindexTable("vectors_strat_v1", executor);

		const symbolDrop = executor.queries.find(
			(q) => q.toUpperCase().includes("DROP INDEX") && q.includes("_symbol_idx"),
		);
		expect(symbolDrop).toBeDefined();

		const symbolCreate = executor.queries.find(
			(q) => q.includes("CREATE INDEX") && q.includes("_symbol_idx"),
		);
		expect(symbolCreate).toBeDefined();
	});

	test("drop comes before create in query order", async () => {
		const executor = createMockExecutor();
		await reindexTable("vectors_strat_v1", executor);

		const dropIdx = executor.queries.findIndex(
			(q) => q.toUpperCase().includes("DROP INDEX") && q.includes("_hnsw_idx"),
		);
		const createIdx = executor.queries.findIndex(
			(q) => q.includes("USING hnsw"),
		);

		expect(dropIdx).toBeGreaterThanOrEqual(0);
		expect(createIdx).toBeGreaterThanOrEqual(0);
		expect(dropIdx).toBeLessThan(createIdx);
	});

	test("returns result with correct shape", async () => {
		const executor = createMockExecutor();
		const result = await reindexTable("vectors_strat_v1", executor);

		expect(result).toMatchObject({
			tableName: "vectors_strat_v1",
			hnswIndexName: "vectors_strat_v1_hnsw_idx",
			symbolIndexName: "vectors_strat_v1_symbol_idx",
			config: { m: 16, efConstruction: 64 },
		});
	});

	test("uses the correct table name in all index queries", async () => {
		const executor = createMockExecutor();
		await reindexTable("vectors_custom_table", executor);

		const allQueries = executor.queries.join("\n");
		expect(allQueries).toContain("vectors_custom_table_hnsw_idx");
		expect(allQueries).toContain("vectors_custom_table_symbol_idx");
		expect(allQueries).toContain("vectors_custom_table");
	});

	test("uses IF EXISTS on drop to avoid errors on missing index", async () => {
		const executor = createMockExecutor();
		await reindexTable("vectors_strat_v1", executor);

		const dropHnsw = executor.queries.find(
			(q) => q.toUpperCase().includes("DROP INDEX") && q.includes("_hnsw_idx"),
		);
		expect(dropHnsw?.toUpperCase()).toContain("IF EXISTS");
	});
});
