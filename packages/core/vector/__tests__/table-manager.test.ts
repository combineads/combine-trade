import { describe, expect, test } from "bun:test";
import type { SqlExecutor } from "../sql-types.js";
import { VectorTableManager } from "../table-manager.js";

function createMockExecutor(): SqlExecutor & { queries: string[] } {
	const queries: string[] = [];
	return {
		queries,
		async execute(sql: string): Promise<{ rows: Record<string, unknown>[] }> {
			queries.push(sql);
			// Simulate responses based on query content
			if (sql.includes("SELECT COUNT(*)")) {
				// Return table count
				const count = queries.filter((q) => q.includes("CREATE TABLE")).length;
				return { rows: [{ count: count.toString() }] };
			}
			if (sql.includes("SELECT table_name FROM vector_table_registry")) {
				return { rows: [] };
			}
			return { rows: [] };
		},
	};
}

describe("VectorTableManager", () => {
	test("getTableName returns sanitized name", () => {
		const executor = createMockExecutor();
		const manager = new VectorTableManager(executor);
		expect(manager.getTableName("abc-123", 1)).toBe("vectors_abc_123_v1");
	});

	test("getTableName sanitizes special characters", () => {
		const executor = createMockExecutor();
		const manager = new VectorTableManager(executor);
		expect(manager.getTableName("a'b;c--d", 2)).toBe("vectors_abc__d_v2");
	});

	test("ensureTable creates table with correct SQL", async () => {
		const executor = createMockExecutor();
		const manager = new VectorTableManager(executor);

		await manager.ensureTable("strat-1", 1, 5);

		const createSQL = executor.queries.find((q) => q.includes("CREATE TABLE"));
		expect(createSQL).toBeDefined();
		expect(createSQL).toContain("vectors_strat_1_v1");
		expect(createSQL).toContain("vector(5)");
		expect(createSQL).toContain("event_id");
	});

	test("ensureTable creates HNSW index", async () => {
		const executor = createMockExecutor();
		const manager = new VectorTableManager(executor);

		await manager.ensureTable("strat-1", 1, 5);

		const indexSQL = executor.queries.find((q) => q.includes("USING hnsw"));
		expect(indexSQL).toBeDefined();
		expect(indexSQL).toContain("vector_l2_ops");
		expect(indexSQL).toContain("m = 16");
		expect(indexSQL).toContain("ef_construction = 64");
	});

	test("ensureTable inserts into registry", async () => {
		const executor = createMockExecutor();
		const manager = new VectorTableManager(executor);

		await manager.ensureTable("strat-1", 1, 5);

		const registrySQL = executor.queries.find((q) =>
			q.includes("INSERT INTO vector_table_registry"),
		);
		expect(registrySQL).toBeDefined();
		expect(registrySQL).toContain("strat-1");
	});

	test("ensureTable is idempotent (uses IF NOT EXISTS)", async () => {
		const executor = createMockExecutor();
		const manager = new VectorTableManager(executor);

		await manager.ensureTable("strat-1", 1, 5);
		await manager.ensureTable("strat-1", 1, 5);

		// Second call uses cache, generates fewer queries
		const createQueries = executor.queries.filter((q) => q.includes("CREATE TABLE"));
		expect(createQueries).toHaveLength(1);
	});

	test("tableExists uses cache after ensureTable", async () => {
		const executor = createMockExecutor();
		const manager = new VectorTableManager(executor);

		expect(manager.tableExists("strat-1", 1)).toBe(false);
		await manager.ensureTable("strat-1", 1, 5);
		expect(manager.tableExists("strat-1", 1)).toBe(true);
	});

	test("dropTable removes table and clears cache", async () => {
		const executor = createMockExecutor();
		const manager = new VectorTableManager(executor);

		await manager.ensureTable("strat-1", 1, 5);
		await manager.dropTable("strat-1", 1);

		expect(manager.tableExists("strat-1", 1)).toBe(false);
		const dropSQL = executor.queries.find((q) => q.includes("DROP TABLE"));
		expect(dropSQL).toBeDefined();
		expect(dropSQL).toContain("vectors_strat_1_v1");
	});

	test("table count guard rejects at 1000", async () => {
		const countOverride = 1000;
		const executor: SqlExecutor & { queries: string[] } = {
			queries: [],
			async execute(sql: string) {
				this.queries.push(sql);
				if (sql.includes("SELECT COUNT(*)")) {
					return { rows: [{ count: countOverride.toString() }] };
				}
				return { rows: [] };
			},
		};
		const manager = new VectorTableManager(executor);

		await expect(manager.ensureTable("new-strat", 1, 5)).rejects.toThrow("ERR_USER_TABLE_LIMIT");
	});
});
