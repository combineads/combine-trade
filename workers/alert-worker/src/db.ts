import type { AlertContext } from "@combine/alert";
import type { DecisionResult } from "@combine/core/decision";
import type { ExecutionMode } from "@combine/execution";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { alerts } from "../../../db/schema/alerts.js";
import { decisions } from "../../../db/schema/decisions.js";
import { strategies } from "../../../db/schema/strategies.js";
import { strategyEvents } from "../../../db/schema/strategy-events.js";

type Db = PostgresJsDatabase;

/**
 * Load the execution mode for a given strategy.
 * Falls back to "analysis" if the strategy is not found.
 */
export async function loadExecutionMode(db: Db, strategyId: string): Promise<ExecutionMode> {
	const [row] = await db
		.select({ executionMode: strategies.executionMode })
		.from(strategies)
		.where(eq(strategies.id, strategyId))
		.limit(1);

	return (row?.executionMode ?? "analysis") as ExecutionMode;
}

/**
 * Check whether an alert has already been sent for a given event.
 * Returns true if a record exists in the alerts table for this eventId.
 */
export async function isAlertSent(db: Db, eventId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: alerts.id })
		.from(alerts)
		.where(eq(alerts.eventId, eventId))
		.limit(1);

	return row !== undefined;
}

/**
 * Save an alert record for the given event.
 * Uses sentinel values for channel and message — actual content is owned by handler.ts.
 */
export async function saveAlert(
	db: Db,
	eventId: string,
	status: "sent" | "failed",
): Promise<void> {
	await db.insert(alerts).values({
		eventId,
		channel: "slack",
		message: "",
		deliveryState: status,
		sentAt: status === "sent" ? new Date() : null,
	});
}

/**
 * Load the AlertContext for a given event by joining strategy_events and strategies.
 * tp and sl are not stored in the DB; sentinel empty strings are returned.
 */
export async function loadAlertContext(db: Db, eventId: string): Promise<AlertContext> {
	const [row] = await db
		.select({
			strategyName: strategies.name,
			symbol: strategyEvents.symbol,
			timeframe: strategyEvents.timeframe,
			entryPrice: strategyEvents.entryPrice,
		})
		.from(strategyEvents)
		.innerJoin(strategies, eq(strategyEvents.strategyId, strategies.id))
		.where(eq(strategyEvents.id, eventId))
		.limit(1);

	if (!row) {
		throw new Error(`Alert context not found for eventId=${eventId}`);
	}

	return {
		strategyName: row.strategyName,
		symbol: row.symbol,
		timeframe: row.timeframe,
		entryPrice: row.entryPrice,
		tp: "",
		sl: "",
		topSimilarity: 0,
	};
}

/**
 * Load the DecisionResult for a given event from the decisions table.
 */
export async function loadDecisionResult(db: Db, eventId: string): Promise<DecisionResult> {
	const [row] = await db
		.select()
		.from(decisions)
		.where(eq(decisions.eventId, eventId))
		.limit(1);

	if (!row) {
		throw new Error(`Decision not found for eventId=${eventId}`);
	}

	return {
		decision: row.direction as DecisionResult["decision"],
		reason: row.decisionReason as DecisionResult["reason"],
		statistics: {
			winrate: Number(row.winrate),
			avgWin: Number(row.avgWin),
			avgLoss: Number(row.avgLoss),
			expectancy: Number(row.expectancy),
			sampleCount: Number(row.sampleCount),
		},
		ciLower: Number(row.ciLower ?? 0),
		ciUpper: Number(row.ciUpper ?? 0),
		confidenceTier: (row.confidenceTier ?? "low") as DecisionResult["confidenceTier"],
	};
}
