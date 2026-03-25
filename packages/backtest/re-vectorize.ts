import type { MigrationResult } from "@combine/core/vector/table-migrator.js";

/**
 * Narrowed injected form of migrateTable.
 * The DI layer binds the SQL executor before injection — re-vectorize never
 * touches infrastructure directly.
 */
export type MigrateTableFn = (
	tableName: string,
	newDimension: number,
	options: { confirmed: true },
) => Promise<MigrationResult>;

/** A historical strategy event stored in the database */
export interface StoredEvent {
	eventId: string;
	strategyId: string;
	version: number;
	symbol: string;
	timeframe: string;
	/** ISO timestamp string or Date */
	openTime: Date;
}

/** A computed feature vector ready to persist */
export interface FeatureVector {
	eventId: string;
	symbol: string;
	timeframe: string;
	embedding: number[];
}

/** Dependency interface for re-vectorization — all side effects injected */
export interface ReVectorizeDeps {
	/** Fetch all historical events for the given strategy + old version */
	loadEvents(strategyId: string, version: number): Promise<StoredEvent[]>;
	/** Run one event through the new version's sandbox; returns null if not applicable */
	executeStrategy(event: StoredEvent): Promise<FeatureVector | null>;
	/** Persist a computed vector to the new version's table */
	storeVector(vector: FeatureVector, tableName: string): Promise<void>;
	/** Injected table migrator — provisions the new version's vector table */
	migrateTable: MigrateTableFn;
	/** Flip the live active-version pointer after all vectors are stored */
	updateActiveVersion(strategyId: string, newVersion: number): Promise<void>;
	/** Progress logger */
	log: (msg: string) => void;
}

/** Configuration for a re-vectorization run */
export interface ReVectorizeConfig {
	strategyId: string;
	oldVersion: number;
	newVersion: number;
	/** Safety gate — must be exactly `true` to proceed */
	confirmed: true;
}

/** Result of a completed re-vectorization run */
export interface ReVectorizeResult {
	/** Number of events successfully vectorized and stored */
	reVectorized: number;
	/** Number of events where executeStrategy returned null */
	skipped: number;
	/** Total elapsed time in milliseconds */
	durationMs: number;
	/** Name of the new version's vector table */
	newTableName: string;
}

/**
 * Pure helper: build the vector table name for a given strategy + version.
 * Matches the VectorTableManager convention: `vectors_{strategyId}_{version}`.
 */
export function buildTableName(strategyId: string, version: number): string {
	const sanitized = strategyId.replace(/[^a-zA-Z0-9_-]/g, "").replace(/-/g, "_");
	return `vectors_${sanitized}_v${version}`;
}

/**
 * Re-vectorize all historical events for a strategy version change.
 *
 * Safety invariants:
 * - Requires `{ confirmed: true }` in config; throws ERR_REVECTORIZE_NOT_CONFIRMED otherwise.
 * - `updateActiveVersion` is called only after all vectors are successfully stored.
 * - If `storeVector` throws, the error propagates immediately without calling `updateActiveVersion`.
 * - Old version's table is NOT deleted — archival is an operational concern.
 * - Runs entirely offline; live trading path is not referenced or paused.
 */
export async function runReVectorize(
	deps: ReVectorizeDeps,
	config: ReVectorizeConfig,
): Promise<ReVectorizeResult> {
	if (!config.confirmed) {
		throw new Error(
			"ERR_REVECTORIZE_NOT_CONFIRMED: Pass { confirmed: true } to proceed with re-vectorization",
		);
	}

	const { strategyId, oldVersion, newVersion } = config;
	const newTableName = buildTableName(strategyId, newVersion);
	const startedAt = Date.now();

	deps.log(`[re-vectorize] Starting: ${strategyId} v${oldVersion} → v${newVersion}`);

	// Provision the new version's vector table (executor is pre-bound in the DI layer)
	await deps.migrateTable(newTableName, 0, { confirmed: true });

	// Load all historical events from the old version
	const events = await deps.loadEvents(strategyId, oldVersion);
	deps.log(`[re-vectorize] Loaded ${events.length} events from v${oldVersion}`);

	let reVectorized = 0;
	let skipped = 0;

	for (const event of events) {
		const vector = await deps.executeStrategy(event);

		if (vector === null) {
			skipped++;
			continue;
		}

		// storeVector errors propagate immediately — updateActiveVersion never called
		await deps.storeVector(vector, newTableName);
		reVectorized++;
	}

	deps.log(`[re-vectorize] Stored ${reVectorized} vectors, skipped ${skipped}`);

	// Only flip the live pointer after all vectors are successfully stored
	await deps.updateActiveVersion(strategyId, newVersion);

	deps.log(`[re-vectorize] Active version updated to v${newVersion}`);

	return {
		reVectorized,
		skipped,
		durationMs: Date.now() - startedAt,
		newTableName,
	};
}
