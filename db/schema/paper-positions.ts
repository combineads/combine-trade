import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { strategies } from "./strategies.js";
import { users } from "./users.js";

export const paperPositions = pgTable("paper_positions", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	strategyId: uuid("strategy_id")
		.notNull()
		.references(() => strategies.id),
	symbol: text("symbol").notNull(),
	side: text("side").notNull(),
	quantity: text("quantity").notNull(),
	entryPrice: text("entry_price").notNull(),
	unrealizedPnl: text("unrealized_pnl").notNull().default("0"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
