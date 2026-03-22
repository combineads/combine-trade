import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { strategies } from "./strategies.js";

export const strategyEvents = pgTable("strategy_events", {
	id: uuid("id").defaultRandom().primaryKey(),
	strategyId: uuid("strategy_id")
		.notNull()
		.references(() => strategies.id),
	strategyVersion: text("strategy_version").notNull(),
	symbol: text("symbol").notNull(),
	timeframe: text("timeframe").notNull(),
	eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
	direction: text("direction").notNull(),
	featuresVector: jsonb("features_vector").notNull(),
	entryPrice: text("entry_price").notNull(),
	status: text("status").notNull().default("active"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
