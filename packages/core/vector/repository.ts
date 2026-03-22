import type { SqlExecutor } from "./sql-types.js";
import type { VectorTableManager } from "./table-manager.js";
import type { SearchResponse, SearchResult } from "./types.js";

const DEFAULT_TOP_K = 50;
const MIN_SAMPLES = 30;
const THRESHOLD_FACTOR = 0.3;

/**
 * Vector repository: stores embeddings and performs L2 similarity search
 * with strict strategy+version+symbol isolation.
 */
export class VectorRepository {
	constructor(
		private readonly sql: SqlExecutor,
		private readonly tableManager: VectorTableManager,
	) {}

	/** Store a vector embedding. Idempotent: duplicate event_id is no-op. */
	async store(
		strategyId: string,
		version: number,
		eventId: string,
		symbol: string,
		timeframe: string,
		embedding: number[],
	): Promise<void> {
		const tableName = this.tableManager.getTableName(strategyId, version);
		const vectorLiteral = `[${embedding.join(",")}]`;

		await this.sql.execute(
			`INSERT INTO ${tableName} (event_id, symbol, timeframe, embedding)
			VALUES ('${eventId}', '${symbol}', '${timeframe}', '${vectorLiteral}')
			ON CONFLICT (event_id) DO NOTHING`,
		);
	}

	/**
	 * L2 similarity search with threshold filtering and min_samples gate.
	 * Searches only within the specific strategy+version table and symbol.
	 */
	async search(
		strategyId: string,
		version: number,
		symbol: string,
		queryVector: number[],
		options?: { topK?: number; minSamples?: number },
	): Promise<SearchResponse> {
		const tableName = this.tableManager.getTableName(strategyId, version);
		const topK = options?.topK ?? DEFAULT_TOP_K;
		const minSamples = options?.minSamples ?? MIN_SAMPLES;
		const threshold = this.computeThreshold(queryVector.length);
		const vectorLiteral = `[${queryVector.join(",")}]`;

		const result = await this.sql.execute(
			`SELECT event_id, embedding <-> '${vectorLiteral}' AS distance
			FROM ${tableName}
			WHERE symbol = '${symbol}'
			ORDER BY embedding <-> '${vectorLiteral}'
			LIMIT ${topK}`,
		);

		const allResults: SearchResult[] = result.rows.map((row) => ({
			eventId: row.event_id as string,
			distance: Number(row.distance),
		}));

		// Post-filter by threshold
		const validResults = allResults.filter((r) => r.distance <= threshold);
		const validCount = validResults.length;

		if (validCount < minSamples) {
			return {
				status: "INSUFFICIENT",
				results: [],
				threshold,
				totalCandidates: allResults.length,
				validCount,
			};
		}

		return {
			status: "SUFFICIENT",
			results: validResults,
			threshold,
			totalCandidates: allResults.length,
			validCount,
		};
	}

	/** Compute similarity threshold: √d × 0.3 */
	computeThreshold(dimension: number): number {
		return Math.sqrt(dimension) * THRESHOLD_FACTOR;
	}
}
