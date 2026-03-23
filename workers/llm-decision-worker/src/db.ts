import type { DecisionMacroContext, LlmDecision, RecentTrade } from "@combine/core/macro/decision-prompt-builder.js";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { decisions } from "../../../db/schema/decisions.js";
import { economicEvents, newsItems } from "../../../db/schema/macro.js";
import { strategyEvents } from "../../../db/schema/strategy-events.js";
import { tradeJournals } from "../../../db/schema/trade-journals.js";
import type { LlmDecisionRepository } from "./index.js";

type Db = PostgresJsDatabase;
type PublishSql = { unsafe: (query: string) => Promise<unknown> };

/**
 * Fetch the kNN decision record (joined with strategy_events for features).
 * Returns null if the decision does not exist.
 */
export async function getKnnDecision(
	db: Db,
	decisionId: string,
): Promise<{
	id: string;
	strategyId: string;
	direction: string;
	winrate: number;
	expectancy: number;
	sampleCount: number;
	confidenceTier: string;
	features: Record<string, number>;
} | null> {
	const [row] = await db
		.select({
			id: decisions.id,
			strategyId: decisions.strategyId,
			direction: decisions.direction,
			winrate: decisions.winrate,
			expectancy: decisions.expectancy,
			sampleCount: decisions.sampleCount,
			confidenceTier: decisions.confidenceTier,
			features: strategyEvents.features,
		})
		.from(decisions)
		.innerJoin(strategyEvents, eq(decisions.eventId, strategyEvents.id))
		.where(eq(decisions.id, decisionId))
		.limit(1);

	if (!row) return null;

	return {
		id: row.id,
		strategyId: row.strategyId,
		direction: row.direction,
		winrate: Number(row.winrate),
		expectancy: Number(row.expectancy),
		sampleCount: Number(row.sampleCount),
		confidenceTier: row.confidenceTier ?? "low",
		features: (row.features ?? {}) as Record<string, number>,
	};
}

/**
 * Fetch recent closed trades for a strategy (up to `limit`).
 */
export async function getRecentTrades(
	db: Db,
	strategyId: string,
	limit = 10,
): Promise<RecentTrade[]> {
	const rows = await db
		.select({
			direction: tradeJournals.direction,
			netPnl: tradeJournals.netPnl,
			exitTime: tradeJournals.exitTime,
			autoTags: tradeJournals.autoTags,
		})
		.from(tradeJournals)
		.where(eq(tradeJournals.strategyId, strategyId))
		.orderBy(desc(tradeJournals.exitTime))
		.limit(limit);

	const now = Date.now();

	return rows.map((row) => {
		const exitMs = row.exitTime ? row.exitTime.getTime() : now;
		const daysAgo = Math.floor((now - exitMs) / (1000 * 60 * 60 * 24));
		const pnl = Number(row.netPnl ?? 0);
		return {
			daysAgo,
			direction: row.direction,
			result: pnl >= 0 ? "WIN" : "LOSS",
			pnlPercent: pnl,
			tags: (row.autoTags ?? []) as string[],
		};
	});
}

/**
 * Fetch macro context (economic events + recent news) around a given timestamp.
 */
export async function getMacroContext(db: Db, timestamp: Date): Promise<DecisionMacroContext> {
	const windowStart = new Date(timestamp.getTime() - 24 * 60 * 60 * 1000);
	const windowEnd = new Date(timestamp.getTime() + 24 * 60 * 60 * 1000);

	const [upcomingRows, newsRows] = await Promise.all([
		db
			.select({
				eventName: economicEvents.eventName,
				impact: economicEvents.impact,
				scheduledAt: economicEvents.scheduledAt,
			})
			.from(economicEvents)
			.where(
				and(
					gte(economicEvents.scheduledAt, windowStart),
					lte(economicEvents.scheduledAt, windowEnd),
				),
			)
			.orderBy(economicEvents.scheduledAt)
			.limit(10),

		db
			.select({
				headline: newsItems.headline,
				publishedAt: newsItems.publishedAt,
			})
			.from(newsItems)
			.where(gte(newsItems.publishedAt, windowStart))
			.orderBy(desc(newsItems.publishedAt))
			.limit(5),
	]);

	const upcomingEvents = upcomingRows.map((row) => {
		const hoursUntil = Math.round(
			(row.scheduledAt.getTime() - timestamp.getTime()) / (1000 * 60 * 60),
		);
		return { name: row.eventName, impact: row.impact, hoursUntil };
	});

	const recentNews = newsRows.map((row) => {
		const hoursAgo = Math.round(
			(timestamp.getTime() - row.publishedAt.getTime()) / (1000 * 60 * 60),
		);
		return { headline: row.headline, hoursAgo };
	});

	const highImpactNext24h = upcomingRows.filter(
		(r) =>
			r.impact === "high" &&
			r.scheduledAt.getTime() > timestamp.getTime() &&
			r.scheduledAt.getTime() < timestamp.getTime() + 24 * 60 * 60 * 1000,
	).length;

	return { upcomingEvents, recentNews, highImpactNext24h };
}

/**
 * Update the decisions row with the LLM verdict and final direction.
 */
export async function updateWithLlmResult(
	db: Db,
	decisionId: string,
	llmResult: LlmDecision,
	finalDirection: string,
): Promise<void> {
	await db
		.update(decisions)
		.set({
			direction: finalDirection,
			decisionReason: `LLM(${llmResult.action}): ${llmResult.reason}`,
		})
		.where(eq(decisions.id, decisionId));
}

/**
 * NOTIFY decision_completed with the decision payload.
 */
export async function publishDecisionCompleted(
	publishSql: PublishSql,
	db: Db,
	decisionId: string,
): Promise<void> {
	const [row] = await db
		.select({
			strategyId: decisions.strategyId,
			symbol: decisions.symbol,
			direction: decisions.direction,
		})
		.from(decisions)
		.where(eq(decisions.id, decisionId))
		.limit(1);

	if (!row) return;

	const payload = JSON.stringify({
		strategyId: row.strategyId,
		symbol: row.symbol,
		direction: row.direction,
		decisionId,
	}).replace(/'/g, "''");

	await publishSql.unsafe(`NOTIFY decision_completed, '${payload}'`);
}

/**
 * Build a Drizzle-based LlmDecisionRepository using the standalone functions above.
 */
export function createLlmDecisionRepository(
	db: Db,
	publishSql: PublishSql,
): LlmDecisionRepository {
	return {
		getKnnDecision: (decisionId) => getKnnDecision(db, decisionId),
		getRecentTrades: (strategyId) => getRecentTrades(db, strategyId),
		getMacroContext: (_strategyId) => getMacroContext(db, new Date()),
		updateWithLlmResult: (decisionId, llmResult, finalDirection) =>
			updateWithLlmResult(db, decisionId, llmResult, finalDirection),
		publishDecisionCompleted: (decisionId, direction, _sizeModifier) =>
			publishDecisionCompleted(publishSql, db, decisionId),
	};
}
