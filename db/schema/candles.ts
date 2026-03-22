import { boolean, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const candles = pgTable(
	"candles",
	{
		exchange: text("exchange").notNull(),
		symbol: text("symbol").notNull(),
		timeframe: text("timeframe").notNull(),
		openTime: timestamp("open_time", { withTimezone: true }).notNull(),
		open: text("open").notNull(),
		high: text("high").notNull(),
		low: text("low").notNull(),
		close: text("close").notNull(),
		volume: text("volume").notNull(),
		isClosed: boolean("is_closed").notNull().default(false),
		source: text("source"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		primaryKey({
			columns: [table.exchange, table.symbol, table.timeframe, table.openTime],
			name: "candles_pk",
		}),
		index("candles_symbol_timeframe_idx").on(table.symbol, table.timeframe),
	],
);
