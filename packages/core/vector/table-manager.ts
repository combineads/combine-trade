import type { SqlExecutor } from "./sql-types.js";

const MAX_TABLES = 1000;

/**
 * Manages dynamic per-strategy vector tables with pgvector HNSW indexes.
 * Single access point for all dynamic vector table operations.
 */
export class VectorTableManager {
	private existingTables = new Set<string>();

	constructor(
		private readonly sql: SqlExecutor,
		private readonly hnswConfig = { m: 16, efConstruction: 64 },
	) {}

	/** Returns sanitized table name for a strategy+version */
	getTableName(strategyId: string, version: number): string {
		const sanitized = strategyId.replace(/[^a-zA-Z0-9_-]/g, "").replace(/-/g, "_");
		return `vectors_${sanitized}_v${version}`;
	}

	/** Check if table is known to exist (from cache) */
	tableExists(strategyId: string, version: number): boolean {
		return this.existingTables.has(this.getTableName(strategyId, version));
	}

	/** Create vector table if it doesn't exist. Idempotent. */
	async ensureTable(strategyId: string, version: number, dimension: number): Promise<string> {
		const tableName = this.getTableName(strategyId, version);

		// Cache check — skip DB round-trip if already known
		if (this.existingTables.has(tableName)) {
			return tableName;
		}

		// Table count guard
		const countResult = await this.sql.execute(
			"SELECT COUNT(*) as count FROM vector_table_registry WHERE status = 'active'",
		);
		const count = Number(countResult.rows[0]?.count ?? 0);
		if (count >= MAX_TABLES) {
			throw new Error(
				`ERR_USER_TABLE_LIMIT: Cannot create vector table — limit of ${MAX_TABLES} active tables reached`,
			);
		}

		// Create table with pgvector column
		await this.sql.execute(
			`CREATE TABLE IF NOT EXISTS ${tableName} (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				event_id UUID NOT NULL UNIQUE,
				symbol TEXT NOT NULL,
				timeframe TEXT NOT NULL,
				embedding vector(${dimension}) NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)`,
		);

		// Create HNSW index for L2 distance
		await this.sql.execute(
			`CREATE INDEX IF NOT EXISTS ${tableName}_hnsw_idx
			ON ${tableName} USING hnsw (embedding vector_l2_ops)
			WITH (m = ${this.hnswConfig.m}, ef_construction = ${this.hnswConfig.efConstruction})`,
		);

		// Create symbol index for isolation queries
		await this.sql.execute(
			`CREATE INDEX IF NOT EXISTS ${tableName}_symbol_idx ON ${tableName} (symbol)`,
		);

		// Register in vector_table_registry
		await this.sql.execute(
			`INSERT INTO vector_table_registry (strategy_id, version, table_name, dimension, status)
			VALUES ('${strategyId}', ${version}, '${tableName}', ${dimension}, 'active')
			ON CONFLICT (strategy_id, version) DO NOTHING`,
		);

		this.existingTables.add(tableName);
		return tableName;
	}

	/** Drop vector table and remove from registry */
	async dropTable(strategyId: string, version: number): Promise<void> {
		const tableName = this.getTableName(strategyId, version);

		await this.sql.execute(`DROP TABLE IF EXISTS ${tableName}`);

		await this.sql.execute(
			`UPDATE vector_table_registry SET status = 'archived'
			WHERE strategy_id = '${strategyId}' AND version = ${version}`,
		);

		this.existingTables.delete(tableName);
	}
}
