import type { SqlExecutor } from "./sql-types.js";

const HNSW_M = 16;
const HNSW_EF_CONSTRUCTION = 64;

export interface MigrationOptions {
	confirmed: boolean;
}

export interface MigrationResult {
	tableName: string;
	oldDimension: number;
	newDimension: number;
	dimensionChanged: boolean;
	rowsCopied: number;
	archivedAs?: string;
}

/**
 * Migrate a vector table schema when the embedding dimension changes.
 *
 * Same dimension: create temp table → copy all rows → drop old → rename temp.
 * Different dimension: archive old table (rename, never drop) → create new empty table.
 *
 * Safety: requires explicit { confirmed: true } to proceed.
 */
export async function migrateTable(
	tableName: string,
	newDimension: number,
	executor: SqlExecutor,
	options?: MigrationOptions,
): Promise<MigrationResult> {
	if (!options?.confirmed) {
		throw new Error(
			"ERR_MIGRATION_NOT_CONFIRMED: Pass { confirmed: true } to proceed with migration",
		);
	}

	// Detect current dimension from pg_attribute
	// pgvector stores dimension in atttypmod as: dimension + 4
	const dimResult = await executor.execute(
		`SELECT atttypmod FROM pg_attribute
		WHERE attrelid = '${tableName}'::regclass
		AND attname = 'embedding'
		AND attnum > 0`,
	);

	const atttypmod = Number(dimResult.rows[0]?.atttypmod ?? 4);
	const oldDimension = atttypmod - 4;

	const dimensionChanged = oldDimension !== newDimension;

	if (dimensionChanged) {
		return archiveAndCreateNew(tableName, oldDimension, newDimension, executor);
	}

	return copyAndRebuild(tableName, oldDimension, newDimension, executor);
}

async function archiveAndCreateNew(
	tableName: string,
	oldDimension: number,
	newDimension: number,
	executor: SqlExecutor,
): Promise<MigrationResult> {
	const archiveName = `${tableName}_archive_${Date.now()}`;

	// Archive old table by renaming it (never drop)
	await executor.execute(`ALTER TABLE ${tableName} RENAME TO ${archiveName}`);

	// Create new empty table with the new dimension
	await executor.execute(
		`CREATE TABLE ${tableName} (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			event_id UUID NOT NULL UNIQUE,
			symbol TEXT NOT NULL,
			timeframe TEXT NOT NULL,
			embedding vector(${newDimension}) NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
	);

	// Create HNSW index on the new table
	await executor.execute(
		`CREATE INDEX IF NOT EXISTS ${tableName}_hnsw_idx
		ON ${tableName} USING hnsw (embedding vector_l2_ops)
		WITH (m = ${HNSW_M}, ef_construction = ${HNSW_EF_CONSTRUCTION})`,
	);

	// Create symbol index
	await executor.execute(
		`CREATE INDEX IF NOT EXISTS ${tableName}_symbol_idx ON ${tableName} (symbol)`,
	);

	return {
		tableName,
		oldDimension,
		newDimension,
		dimensionChanged: true,
		rowsCopied: 0,
		archivedAs: archiveName,
	};
}

async function copyAndRebuild(
	tableName: string,
	oldDimension: number,
	newDimension: number,
	executor: SqlExecutor,
): Promise<MigrationResult> {
	const tmpName = `${tableName}_migration_tmp`;

	// Count rows to copy
	const countResult = await executor.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
	const rowCount = Number(countResult.rows[0]?.count ?? 0);

	// Create temp table with same schema
	await executor.execute(
		`CREATE TABLE ${tmpName} (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			event_id UUID NOT NULL UNIQUE,
			symbol TEXT NOT NULL,
			timeframe TEXT NOT NULL,
			embedding vector(${newDimension}) NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
	);

	// Copy compatible data
	await executor.execute(
		`INSERT INTO ${tmpName} (id, event_id, symbol, timeframe, embedding, created_at)
		SELECT id, event_id, symbol, timeframe, embedding, created_at
		FROM ${tableName}`,
	);

	// Drop old table
	await executor.execute(`DROP TABLE ${tableName}`);

	// Rename temp to original name
	await executor.execute(`ALTER TABLE ${tmpName} RENAME TO ${tableName}`);

	// Create HNSW index on rebuilt table
	await executor.execute(
		`CREATE INDEX IF NOT EXISTS ${tableName}_hnsw_idx
		ON ${tableName} USING hnsw (embedding vector_l2_ops)
		WITH (m = ${HNSW_M}, ef_construction = ${HNSW_EF_CONSTRUCTION})`,
	);

	// Create symbol index
	await executor.execute(
		`CREATE INDEX IF NOT EXISTS ${tableName}_symbol_idx ON ${tableName} (symbol)`,
	);

	return {
		tableName,
		oldDimension,
		newDimension,
		dimensionChanged: false,
		rowsCopied: rowCount,
	};
}
