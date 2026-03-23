import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { PgEventPublisher } from "@combine/shared/event-bus";
import { candles } from "../../../db/schema/candles.js";
import { eventLabels } from "../../../db/schema/event-labels.js";
import { strategyEvents } from "../../../db/schema/strategy-events.js";
import { strategies } from "../../../db/schema/strategies.js";
import type { CandleBar } from "@combine/core/label";

type Db = ReturnType<typeof drizzle>;

/**
 * Find strategy events that have not yet been labeled.
 * Returns events ordered by created_at ascending, limited to `limit` rows.
 */
export async function findUnlabeledEvents(db: Db, limit: number) {
	// Events without a corresponding event_label are unlabeled.
	// We use a subquery-free approach: left join + is null check via a nested select.
	// Simpler: fetch events where id NOT IN (SELECT event_id FROM event_labels).
	// Drizzle doesn't have a built-in NOT IN subquery helper, so we join and filter.
	const rows = await db
		.select({
			id: strategyEvents.id,
			strategyId: strategyEvents.strategyId,
			strategyVersion: strategyEvents.strategyVersion,
			exchange: strategyEvents.exchange,
			symbol: strategyEvents.symbol,
			timeframe: strategyEvents.timeframe,
			openTime: strategyEvents.openTime,
			direction: strategyEvents.direction,
			entryPrice: strategyEvents.entryPrice,
		})
		.from(strategyEvents)
		.leftJoin(eventLabels, eq(eventLabels.eventId, strategyEvents.id))
		.where(isNull(eventLabels.id))
		.orderBy(asc(strategyEvents.createdAt))
		.limit(limit);

	return rows as Array<{
		id: string;
		strategyId: string;
		strategyVersion: number;
		exchange: string;
		symbol: string;
		timeframe: string;
		openTime: Date;
		direction: "long" | "short";
		entryPrice: string;
	}>;
}

/**
 * Find candles for a symbol/timeframe after `fromTime`, ordered by open_time ascending.
 */
export async function findCandlesForward(
	db: Db,
	symbol: string,
	timeframe: string,
	fromTime: Date,
	count: number,
): Promise<CandleBar[]> {
	const rows = await db
		.select({
			open: candles.open,
			high: candles.high,
			low: candles.low,
			close: candles.close,
		})
		.from(candles)
		.where(
			and(
				eq(candles.symbol, symbol),
				eq(candles.timeframe, timeframe),
				gt(candles.openTime, fromTime),
			),
		)
		.orderBy(asc(candles.openTime))
		.limit(count);

	return rows;
}

/**
 * Persist a label for the given event. Idempotent: skips if already labeled.
 * Returns the label id on success, or null if skipped.
 */
export async function saveLabel(
	db: Db,
	eventId: string,
	label: {
		resultType: string;
		pnlPct: string;
		mfePct: string;
		maePct: string;
		holdBars: number;
		exitPrice: string;
		slHitFirst: boolean;
	},
): Promise<string | null> {
	// Check idempotency: if a label already exists for this event, skip.
	const existing = await db
		.select({ id: eventLabels.id })
		.from(eventLabels)
		.where(eq(eventLabels.eventId, eventId))
		.limit(1);

	if (existing.length > 0) {
		return null;
	}

	const inserted = await db
		.insert(eventLabels)
		.values({
			eventId,
			resultType: label.resultType,
			pnlPct: label.pnlPct,
			mfePct: label.mfePct,
			maePct: label.maePct,
			holdBars: label.holdBars,
			exitPrice: label.exitPrice,
			slHitFirst: label.slHitFirst,
		})
		.returning({ id: eventLabels.id });

	return inserted[0]?.id ?? null;
}

/**
 * Load a strategy's result config for label calculation.
 */
export async function loadStrategy(
	db: Db,
	strategyId: string,
): Promise<{ id: string; resultConfig: { tpPct: number; slPct: number; maxHoldBars: number } }> {
	const rows = await db
		.select({ id: strategies.id, resultConfig: strategies.resultConfig })
		.from(strategies)
		.where(eq(strategies.id, strategyId))
		.limit(1);

	if (rows.length === 0) {
		throw new Error(`Strategy not found: ${strategyId}`);
	}

	const row = rows[0];
	return {
		id: row.id,
		resultConfig: row.resultConfig as { tpPct: number; slPct: number; maxHoldBars: number },
	};
}

/**
 * Check whether a strategy event has already been labeled.
 */
export async function isAlreadyLabeled(db: Db, eventId: string): Promise<boolean> {
	const rows = await db
		.select({ id: eventLabels.id })
		.from(eventLabels)
		.where(eq(eventLabels.eventId, eventId))
		.limit(1);

	return rows.length > 0;
}

/**
 * Create a connected PgEventPublisher.
 */
export function createPublisher(connectionString: string): PgEventPublisher {
	const publisher = new PgEventPublisher({ connectionString });
	void publisher.connect((cs) => {
		const sql = postgres(cs, { max: 1 });
		return { unsafe: (query: string) => sql.unsafe(query) };
	});
	return publisher;
}
