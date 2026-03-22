import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const fundingRates = pgTable(
	"funding_rates",
	{
		exchange: text("exchange").notNull(),
		symbol: text("symbol").notNull(),
		fundingRate: text("funding_rate").notNull(),
		fundingTime: timestamp("funding_time", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		{
			pk: {
				columns: [table.exchange, table.symbol, table.fundingTime],
				name: "funding_rates_pk",
			},
		},
	],
);
