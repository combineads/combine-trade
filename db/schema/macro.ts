import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const economicEvents = pgTable("economic_events", {
	id: uuid("id").defaultRandom().primaryKey(),
	externalId: text("external_id").notNull().unique(),
	title: text("title").notNull(),
	eventName: text("event_name").notNull(),
	impact: text("impact").notNull(),
	scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
	newsCollected: boolean("news_collected").notNull().default(false),
	newsCollectedAt: timestamp("news_collected_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const newsItems = pgTable("news_items", {
	id: uuid("id").defaultRandom().primaryKey(),
	externalId: text("external_id").notNull().unique(),
	headline: text("headline").notNull(),
	source: text("source").notNull(),
	publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
	tags: text("tags").array().notNull().default([]),
	economicEventId: uuid("economic_event_id").references(() => economicEvents.id),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
