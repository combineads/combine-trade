import { describe, expect, test } from "bun:test";
import type { SqlExecutor } from "../sql-types.js";
import { migrateTable } from "../table-migrator.js";

function createMockExecutor(overrides?: {
	currentDimension?: number;
	rowCount?: number;
}): SqlExecutor & { queries: string[] } {
	const queries: string[] = [];
	const dim = overrides?.currentDimension ?? 5;
	const rows = overrides?.rowCount ?? 10;

	return {
		queries,
		async execute(sql: string): Promise<{ rows: Record<string, unknown>[] }> {
			queries.push(sql);

			if (sql.includes("atttypmod") || sql.toLowerCase().includes("pg_attribute")) {
				// Return current dimension from pg_attribute atttypmod
				// pgvector stores dimension as atttypmod = dimension + 4
				return { rows: [{ atttypmod: (dim + 4).toString() }] };
			}
			if (sql.toUpperCase().startsWith("SELECT COUNT(*)") || sql.includes("COUNT(*)")) {
				return { rows: [{ count: rows.toString() }] };
			}
			return { rows: [] };
		},
	};
}

describe("migrateTable", () => {
	test("throws ERR_MIGRATION_NOT_CONFIRMED without confirmation", async () => {
		const executor = createMockExecutor();
		await expect(
			migrateTable("vectors_strat_v1", 5, executor),
		).rejects.toThrow("ERR_MIGRATION_NOT_CONFIRMED");
	});

	test("throws ERR_MIGRATION_NOT_CONFIRMED when confirmed is false", async () => {
		const executor = createMockExecutor();
		await expect(
			migrateTable("vectors_strat_v1", 5, executor, { confirmed: false }),
		).rejects.toThrow("ERR_MIGRATION_NOT_CONFIRMED");
	});

	test("same dimension: creates new table, copies data, drops old, renames", async () => {
		const executor = createMockExecutor({ currentDimension: 5 });

		const result = await migrateTable("vectors_strat_v1", 5, executor, { confirmed: true });

		expect(result.dimensionChanged).toBe(false);
		expect(result.rowsCopied).toBe(10);

		// Should create a temp table
		const createQuery = executor.queries.find(
			(q) => q.includes("CREATE TABLE") && q.includes("_migration_tmp"),
		);
		expect(createQuery).toBeDefined();

		// Should copy rows
		const copyQuery = executor.queries.find(
			(q) => q.toUpperCase().includes("INSERT INTO") && q.includes("_migration_tmp"),
		);
		expect(copyQuery).toBeDefined();

		// Should drop old table
		const dropQuery = executor.queries.find(
			(q) => q.includes("DROP TABLE") && q.includes("vectors_strat_v1"),
		);
		expect(dropQuery).toBeDefined();

		// Should rename temp table to original name
		const renameQuery = executor.queries.find(
			(q) => q.toUpperCase().includes("ALTER TABLE") && q.includes("RENAME TO"),
		);
		expect(renameQuery).toBeDefined();
	});

	test("dimension change: archives old table instead of copying data", async () => {
		const executor = createMockExecutor({ currentDimension: 5 });

		const result = await migrateTable("vectors_strat_v1", 10, executor, { confirmed: true });

		expect(result.dimensionChanged).toBe(true);
		expect(result.rowsCopied).toBe(0);
		expect(result.archivedAs).toBeDefined();

		// Should rename old table to an archive name (not drop it)
		const archiveRename = executor.queries.find(
			(q) => q.toUpperCase().includes("ALTER TABLE") && q.includes("_archive_"),
		);
		expect(archiveRename).toBeDefined();

		// Should NOT have a DROP TABLE on the original
		const dropOld = executor.queries.find(
			(q) => q.includes("DROP TABLE") && q.includes("vectors_strat_v1") && !q.includes("IF NOT EXISTS"),
		);
		expect(dropOld).toBeUndefined();

		// Should create new empty table with new dimension
		const createNew = executor.queries.find(
			(q) => q.includes("CREATE TABLE") && q.includes("vector(10)"),
		);
		expect(createNew).toBeDefined();
	});

	test("dimension change: new table gets HNSW index with correct config", async () => {
		const executor = createMockExecutor({ currentDimension: 5 });

		await migrateTable("vectors_strat_v1", 10, executor, { confirmed: true });

		const hnswQuery = executor.queries.find((q) => q.includes("USING hnsw"));
		expect(hnswQuery).toBeDefined();
		expect(hnswQuery).toContain("m = 16");
		expect(hnswQuery).toContain("ef_construction = 64");
	});

	test("same dimension: new table gets HNSW index with correct config", async () => {
		const executor = createMockExecutor({ currentDimension: 8 });

		await migrateTable("vectors_strat_v1", 8, executor, { confirmed: true });

		const hnswQuery = executor.queries.find((q) => q.includes("USING hnsw"));
		expect(hnswQuery).toBeDefined();
		expect(hnswQuery).toContain("m = 16");
		expect(hnswQuery).toContain("ef_construction = 64");
	});

	test("returns correct migration result shape", async () => {
		const executor = createMockExecutor({ currentDimension: 5, rowCount: 42 });

		const result = await migrateTable("vectors_strat_v1", 5, executor, { confirmed: true });

		expect(result).toMatchObject({
			tableName: "vectors_strat_v1",
			oldDimension: 5,
			newDimension: 5,
			dimensionChanged: false,
			rowsCopied: 42,
		});
	});

	test("dimension change result has archivedAs and zero rowsCopied", async () => {
		const executor = createMockExecutor({ currentDimension: 3 });

		const result = await migrateTable("vectors_strat_v1", 7, executor, { confirmed: true });

		expect(result.tableName).toBe("vectors_strat_v1");
		expect(result.oldDimension).toBe(3);
		expect(result.newDimension).toBe(7);
		expect(result.dimensionChanged).toBe(true);
		expect(result.rowsCopied).toBe(0);
		expect(typeof result.archivedAs).toBe("string");
		expect(result.archivedAs).toContain("_archive_");
	});
});
