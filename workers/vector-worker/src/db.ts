import {
	VectorRepository,
	VectorTableManager,
	normalizeFeatures,
} from "@combine/core/vector";
import type { EventLabel } from "@combine/core/vector/statistics.js";
import type { FeatureInput, SearchResponse } from "@combine/core/vector/types.js";
import { eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { decisions } from "../../../db/schema/decisions.js";
import { eventLabels } from "../../../db/schema/event-labels.js";
import { strategies } from "../../../db/schema/strategies.js";
import { strategyEvents } from "../../../db/schema/strategy-events.js";
import type { VectorHandlerDeps } from "./handler.js";

type Db = PostgresJsDatabase;

/**
 * Creates a SqlExecutor adapter from a raw postgres client.
 * Used to wire VectorTableManager and VectorRepository with the raw pg connection.
 */
function createSqlExecutor(
	rawClient: ReturnType<typeof postgres>,
): import("@combine/core/vector").SqlExecutor {
	return {
		async execute(sql: string): Promise<{ rows: Record<string, unknown>[] }> {
			const rows = await rawClient.unsafe(sql);
			return { rows: rows as Record<string, unknown>[] };
		},
	};
}

/**
 * Creates the full VectorHandlerDeps implementation wired to Drizzle (for typed queries)
 * and a raw postgres client (for dynamic vector table operations via VectorTableManager).
 */
export function createVectorDeps(
	db: Db,
	rawClient: ReturnType<typeof postgres>,
	publisher: import("@combine/shared/event-bus/types.js").EventPublisher,
): VectorHandlerDeps {
	const sqlExecutor = createSqlExecutor(rawClient);
	const tableManager = new VectorTableManager(sqlExecutor);
	const vectorRepo = new VectorRepository(sqlExecutor, tableManager);

	return {
		/** Load a strategy event by ID from the strategy_events table */
		async loadEvent(eventId: string) {
			const rows = await db
				.select()
				.from(strategyEvents)
				.where(eq(strategyEvents.id, eventId))
				.limit(1);

			const row = rows[0];
			if (!row) {
				throw new Error(`Strategy event not found: ${eventId}`);
			}

			return {
				id: row.id,
				strategyId: row.strategyId,
				strategyVersion: row.strategyVersion,
				symbol: row.symbol,
				timeframe: row.timeframe,
				direction: row.direction as "long" | "short",
				features: row.features as Array<{
					name: string;
					value: number;
					normalization: { method: string };
				}>,
				entryPrice: row.entryPrice,
			};
		},

		/** Load a strategy by ID from the strategies table */
		async loadStrategy(strategyId: string) {
			const rows = await db
				.select()
				.from(strategies)
				.where(eq(strategies.id, strategyId))
				.limit(1);

			const row = rows[0];
			if (!row) {
				throw new Error(`Strategy not found: ${strategyId}`);
			}

			return {
				id: row.id,
				version: row.version,
				direction: row.direction as "long" | "short",
				decisionConfig: row.decisionConfig as Record<string, unknown>,
			};
		},

		/** Normalize feature inputs into a [0,1] embedding vector */
		normalizeFeatures(features: FeatureInput[]): number[] {
			return normalizeFeatures(features);
		},

		/** Ensure the dynamic vector table exists for the given strategy+version+dimension */
		async ensureTable(
			strategyId: string,
			version: number,
			dimension: number,
		): Promise<string> {
			return tableManager.ensureTable(strategyId, version, dimension);
		},

		/** Store a vector embedding. Idempotent: duplicate event_id is a no-op. */
		async storeVector(
			strategyId: string,
			version: number,
			eventId: string,
			symbol: string,
			timeframe: string,
			embedding: number[],
		): Promise<void> {
			await vectorRepo.store(strategyId, version, eventId, symbol, timeframe, embedding);
		},

		/**
		 * Search for similar vectors via kNN (L2) with look-ahead bias prevention.
		 *
		 * CRITICAL: Only vectors whose corresponding strategy_events.open_time is strictly
		 * less than the current event's open_time are considered. This prevents the model
		 * from "seeing the future" (look-ahead bias).
		 *
		 * Implementation: uses a raw SQL JOIN between the dynamic vector table and
		 * strategy_events, filtering event_time < beforeTime where beforeTime is the
		 * open_time of the strategy_event that was most recently inserted into the
		 * vector table for this strategy+version+symbol scope.
		 */
		async searchVectors(
			strategyId: string,
			version: number,
			symbol: string,
			queryVector: number[],
		): Promise<SearchResponse> {
			const tableName = tableManager.getTableName(strategyId, version);
			const vectorLiteral = `[${queryVector.join(",")}]`;
			const topK = 50;
			const dimension = queryVector.length;
			const threshold = Math.sqrt(dimension) * 0.3;
			const minSamples = 30;

			// Look-ahead bias prevention: find the open_time of the current event
			// (the most recently added vector in this scope) to use as the time boundary.
			// We only search vectors whose strategy_events.open_time < current event's open_time.
			const currentTimeResult = await sqlExecutor.execute(
				`SELECT se.open_time
				FROM ${tableName} v
				JOIN strategy_events se ON se.id = v.event_id
				WHERE v.symbol = '${symbol}'
				ORDER BY v.created_at DESC
				LIMIT 1`,
			);

			const currentOpenTime = currentTimeResult.rows[0]?.open_time as string | undefined;

			let rows: Record<string, unknown>[];

			if (currentOpenTime) {
				// Filter: event_time < currentOpenTime (strict look-ahead bias prevention)
				rows = (
					await sqlExecutor.execute(
						`SELECT v.event_id, v.embedding <-> '${vectorLiteral}' AS distance
						FROM ${tableName} v
						JOIN strategy_events se ON se.id = v.event_id
						WHERE v.symbol = '${symbol}'
						  AND se.open_time < '${currentOpenTime}'
						ORDER BY v.embedding <-> '${vectorLiteral}'
						LIMIT ${topK}`,
					)
				).rows;
			} else {
				// Fallback: no current event found — return insufficient
				return {
					status: "INSUFFICIENT",
					results: [],
					threshold,
					totalCandidates: 0,
					validCount: 0,
				};
			}

			const allResults = rows.map((row) => ({
				eventId: row.event_id as string,
				distance: Number(row.distance),
			}));

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
		},

		/** Load event labels for the given event IDs from the event_labels table */
		async loadLabels(eventIds: string[]): Promise<EventLabel[]> {
			if (eventIds.length === 0) return [];

			const rows = await db
				.select({
					resultType: eventLabels.resultType,
					pnlPct: eventLabels.pnlPct,
				})
				.from(eventLabels)
				.where(inArray(eventLabels.eventId, eventIds));

			return rows.map((row) => ({
				resultType: row.resultType as EventLabel["resultType"],
				pnlPct: Number(row.pnlPct),
			}));
		},

		/** Persist a decision record to the decisions table and return its ID */
		async saveDecision(decision: Record<string, unknown>): Promise<string> {
			const rows = await db
				.insert(decisions)
				.values({
					eventId: decision.eventId as string,
					strategyId: decision.strategyId as string,
					strategyVersion: String(decision.strategyVersion),
					symbol: decision.symbol as string,
					direction: decision.direction as string,
					sampleCount: String(decision.sampleCount),
					winrate: String(decision.winrate),
					expectancy: String(decision.expectancy),
					avgWin: String(decision.avgWin),
					avgLoss: String(decision.avgLoss),
					ciLower: decision.ciLower != null ? String(decision.ciLower) : null,
					ciUpper: decision.ciUpper != null ? String(decision.ciUpper) : null,
					confidenceTier: decision.confidenceTier != null ? String(decision.confidenceTier) : null,
					similarityTop1Score: null,
					decisionReason: decision.reason as string,
					executionMode: "analysis",
				})
				.returning({ id: decisions.id });

			const row = rows[0];
			if (!row) {
				throw new Error("Failed to persist decision");
			}

			return row.id;
		},

		publisher,
	};
}
