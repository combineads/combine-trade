import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { strategies } from "./strategies.js";

export const strategyEvents = pgTable(
	"strategy_events",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		strategyId: uuid("strategy_id")
			.notNull()
			.references(() => strategies.id),
		strategyVersion: integer("strategy_version").notNull(),
		exchange: text("exchange").notNull(),
		symbol: text("symbol").notNull(),
		timeframe: text("timeframe").notNull(),
		openTime: timestamp("open_time", { withTimezone: true }).notNull(),
		direction: text("direction").notNull(),
		features: jsonb("features").notNull(),
		entryPrice: text("entry_price").notNull(),
		status: text("status").notNull().default("active"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("strategy_events_strategy_version_idx").on(
			table.strategyId,
			table.strategyVersion,
			table.symbol,
			table.timeframe,
		),
		index("strategy_events_open_time_idx").on(table.openTime),
	],
);
