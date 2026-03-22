import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const paperBalances = pgTable("paper_balances", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	exchange: text("exchange").notNull(),
	balance: text("balance").notNull(),
	initialBalance: text("initial_balance").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
