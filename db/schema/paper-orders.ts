import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUser } from "./better-auth.js";
import { strategies } from "./strategies.js";
import { strategyEvents } from "./strategy-events.js";

export const paperOrders = pgTable("paper_orders", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => authUser.id),
	strategyId: uuid("strategy_id")
		.notNull()
		.references(() => strategies.id),
	eventId: uuid("event_id").references(() => strategyEvents.id),
	exchange: text("exchange").notNull(),
	symbol: text("symbol").notNull(),
	side: text("side").notNull(),
	orderType: text("order_type").notNull(),
	price: text("price").notNull(),
	quantity: text("quantity").notNull(),
	filledQuantity: text("filled_quantity").notNull().default("0"),
	status: text("status").notNull().default("planned"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
