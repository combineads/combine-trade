import { and, between, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { decisions } from "../../../db/schema/decisions.js";
import { economicEvents, newsItems } from "../../../db/schema/macro.js";
import { strategies } from "../../../db/schema/strategies.js";
import { tradeJournals } from "../../../db/schema/trade-journals.js";
import type { RetrospectiveRepository } from "./index.js";
import type { RetrospectivePromptInput } from "@combine/core/macro/prompt-builder.js";

type Db = PostgresJsDatabase;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

/**
 * Drizzle-based RetrospectiveRepository implementation.
 * Joins trade_journals with strategies and decisions to build full RetrospectivePromptInput.
 * Saves LLM report output into trade_journals.notes.
 */
export function createRetrospectiveRepository(db: Db): RetrospectiveRepository {
	return {
		async getJournalWithContext(
			journalId: string,
		): Promise<RetrospectivePromptInput | null> {
			// 1. Fetch journal with strategy join
			const rows = await db
				.select({
					journal: tradeJournals,
					strategy: strategies,
				})
				.from(tradeJournals)
				.innerJoin(strategies, eq(tradeJournals.strategyId, strategies.id))
				.where(eq(tradeJournals.id, journalId))
				.limit(1);

			if (rows.length === 0) return null;

			const { journal, strategy } = rows[0];

			// 2. Fetch most recent decision for this event to get KNN stats + features
			const decisionRows = await db
				.select()
				.from(decisions)
				.where(eq(decisions.eventId, journal.eventId))
				.limit(1);

			const decision = decisionRows[0] ?? null;

			const winrate = decision ? Number(decision.winrate) : 0;
			const expectancy = decision ? Number(decision.expectancy) : 0;
			const sampleCount = decision ? Number(decision.sampleCount) : 0;
			const confidenceTier = decision?.confidenceTier ?? "low";
			const features =
				decision?.strategyId
					? (
							(
								await db
									.select({ features: strategies.featuresDefinition })
									.from(strategies)
									.where(eq(strategies.id, decision.strategyId))
									.limit(1)
							)[0]?.features as Record<string, number> | null
						) ?? {}
					: {};

			// 3. Fetch macro context around entry/exit times
			const entryTime = journal.entryTime;
			const exitTime = journal.exitTime ?? journal.entryTime;

			const [entryEvents, entryNews, exitEvents, exitNews] = await Promise.all([
				db
					.select()
					.from(economicEvents)
					.where(
						between(
							economicEvents.scheduledAt,
							new Date(entryTime.getTime() - TWO_HOURS_MS),
							new Date(entryTime.getTime() + TWO_HOURS_MS),
						),
					),
				db
					.select()
					.from(newsItems)
					.where(
						between(
							newsItems.publishedAt,
							new Date(entryTime.getTime() - ONE_HOUR_MS),
							new Date(entryTime.getTime() + ONE_HOUR_MS),
						),
					),
				db
					.select()
					.from(economicEvents)
					.where(
						between(
							economicEvents.scheduledAt,
							new Date(exitTime.getTime() - THIRTY_MINUTES_MS),
							new Date(exitTime.getTime() + THIRTY_MINUTES_MS),
						),
					),
				db
					.select()
					.from(newsItems)
					.where(
						between(
							newsItems.publishedAt,
							new Date(exitTime.getTime() - THIRTY_MINUTES_MS),
							new Date(exitTime.getTime() + THIRTY_MINUTES_MS),
						),
					),
			]);

			// 4. Compute derived fields
			const entryPrice = Number(journal.entryPrice);
			const exitPrice = Number(journal.exitPrice ?? journal.entryPrice);
			const rawPnl =
				journal.direction === "LONG"
					? (exitPrice - entryPrice) / entryPrice
					: (entryPrice - exitPrice) / entryPrice;
			const pnlPercent = rawPnl * 100;
			const result = pnlPercent >= 0 ? "WIN" : "LOSS";

			return {
				strategyName: strategy.name,
				symbol: journal.symbol,
				direction: journal.direction,
				timeframe: strategy.timeframe,
				entryPrice,
				exitPrice,
				pnlPercent,
				result,
				holdBars: journal.holdBars ?? 0,
				winrate,
				expectancy,
				sampleCount,
				confidenceTier,
				features,
				mfePercent: journal.mfePct ? Number(journal.mfePct) : 0,
				maePercent: journal.maePct ? Number(journal.maePct) : 0,
				macroContext: {
					entryEvents: entryEvents.map((e) => ({
						id: e.id,
						externalId: e.externalId,
						title: e.title,
						eventName: e.eventName,
						impact: e.impact as "HIGH" | "MEDIUM" | "LOW",
						scheduledAt: e.scheduledAt,
						newsCollected: e.newsCollected,
						newsCollectedAt: e.newsCollectedAt,
						createdAt: e.createdAt,
					})),
					entryNews: entryNews.map((n) => ({
						id: n.id,
						externalId: n.externalId,
						headline: n.headline,
						source: n.source,
						publishedAt: n.publishedAt,
						tags: n.tags,
						economicEventId: n.economicEventId,
						createdAt: n.createdAt,
					})),
					exitEvents: exitEvents.map((e) => ({
						id: e.id,
						externalId: e.externalId,
						title: e.title,
						eventName: e.eventName,
						impact: e.impact as "HIGH" | "MEDIUM" | "LOW",
						scheduledAt: e.scheduledAt,
						newsCollected: e.newsCollected,
						newsCollectedAt: e.newsCollectedAt,
						createdAt: e.createdAt,
					})),
					exitNews: exitNews.map((n) => ({
						id: n.id,
						externalId: n.externalId,
						headline: n.headline,
						source: n.source,
						publishedAt: n.publishedAt,
						tags: n.tags,
						economicEventId: n.economicEventId,
						createdAt: n.createdAt,
					})),
				},
			};
		},

		async saveReport(journalId: string, report: string): Promise<void> {
			await db
				.update(tradeJournals)
				.set({ notes: report, updatedAt: new Date() })
				.where(eq(tradeJournals.id, journalId));
		},
	};
}
