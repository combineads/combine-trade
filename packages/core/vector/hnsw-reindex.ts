import type { SqlExecutor } from "./sql-types.js";

const HNSW_M = 16;
const HNSW_EF_CONSTRUCTION = 64;

export interface ReindexResult {
	tableName: string;
	hnswIndexName: string;
	symbolIndexName: string;
	config: { m: number; efConstruction: number };
}

/**
 * Drops and recreates the HNSW and symbol indexes for a vector table.
 *
 * After a backtest inserts many vectors in bulk, the HNSW index may be stale
 * or degraded. Calling this rebuilds it from scratch for optimal query performance.
 *
 * Uses the same HNSW config as VectorTableManager: m=16, ef_construction=64.
 */
export async function reindexTable(
	tableName: string,
	executor: SqlExecutor,
): Promise<ReindexResult> {
	const hnswIndexName = `${tableName}_hnsw_idx`;
	const symbolIndexName = `${tableName}_symbol_idx`;

	// Drop existing HNSW index (IF EXISTS to tolerate missing index)
	await executor.execute(`DROP INDEX IF EXISTS ${hnswIndexName}`);

	// Drop existing symbol index
	await executor.execute(`DROP INDEX IF EXISTS ${symbolIndexName}`);

	// Recreate HNSW index for L2 distance
	await executor.execute(
		`CREATE INDEX ${hnswIndexName}
		ON ${tableName} USING hnsw (embedding vector_l2_ops)
		WITH (m = ${HNSW_M}, ef_construction = ${HNSW_EF_CONSTRUCTION})`,
	);

	// Recreate symbol index for isolation queries
	await executor.execute(
		`CREATE INDEX ${symbolIndexName} ON ${tableName} (symbol)`,
	);

	return {
		tableName,
		hnswIndexName,
		symbolIndexName,
		config: { m: HNSW_M, efConstruction: HNSW_EF_CONSTRUCTION },
	};
}
