import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { economicEvents, newsItems } from "../../../db/schema/macro.js";
import type { CalendarEventRepository } from "./calendar-collector.js";
import type { NewsEventRepository, PendingEvent } from "./news-collector.js";
import type { CreateEconomicEventInput, CreateNewsItemInput } from "@combine/core/macro/types.js";

type Db = PostgresJsDatabase;

/**
 * Drizzle-based CalendarEventRepository implementation.
 * Upserts economic events by external_id (idempotent).
 */
export function createCalendarEventRepository(db: Db): CalendarEventRepository {
	return {
		async upsertByExternalId(input: CreateEconomicEventInput): Promise<void> {
			await db
				.insert(economicEvents)
				.values({
					externalId: input.externalId,
					title: input.title,
					eventName: input.eventName,
					impact: input.impact,
					scheduledAt: input.scheduledAt,
				})
				.onConflictDoUpdate({
					target: economicEvents.externalId,
					set: {
						title: input.title,
						eventName: input.eventName,
						impact: input.impact,
						scheduledAt: input.scheduledAt,
					},
				});
		},
	};
}

/**
 * Drizzle-based NewsEventRepository implementation.
 * Upserts news items by external_id (idempotent).
 * Provides pending event lookup and mark-collected for NewsCollector.
 */
export function createNewsEventRepository(db: Db): NewsEventRepository {
	return {
		async findPendingEvents(): Promise<PendingEvent[]> {
			const rows = await db
				.select({
					id: economicEvents.id,
					externalId: economicEvents.externalId,
					scheduledAt: economicEvents.scheduledAt,
				})
				.from(economicEvents)
				.where(eq(economicEvents.newsCollected, false));

			return rows.map((row) => ({
				id: row.id,
				externalId: row.externalId,
				scheduledAt: row.scheduledAt,
			}));
		},

		async upsertNews(input: CreateNewsItemInput): Promise<void> {
			await db
				.insert(newsItems)
				.values({
					externalId: input.externalId,
					headline: input.headline,
					source: input.source,
					publishedAt: input.publishedAt,
					tags: input.tags,
					economicEventId: input.economicEventId ?? null,
				})
				.onConflictDoUpdate({
					target: newsItems.externalId,
					set: {
						headline: input.headline,
						source: input.source,
						publishedAt: input.publishedAt,
						tags: input.tags,
						economicEventId: input.economicEventId ?? null,
					},
				});
		},

		async markCollected(eventId: string): Promise<void> {
			await db
				.update(economicEvents)
				.set({
					newsCollected: true,
					newsCollectedAt: new Date(),
				})
				.where(eq(economicEvents.id, eventId));
		},
	};
}
