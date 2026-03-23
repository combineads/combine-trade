import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUser } from "./better-auth.js";
import { decisions } from "./decisions.js";
import { strategies } from "./strategies.js";
import { strategyEvents } from "./strategy-events.js";

export const orders = pgTable(
	"orders",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUser.id),
		eventId: uuid("event_id")
			.notNull()
			.references(() => strategyEvents.id),
		decisionId: uuid("decision_id")
			.notNull()
			.references(() => decisions.id),
		strategyId: uuid("strategy_id")
			.notNull()
			.references(() => strategies.id),
		exchange: text("exchange").notNull(),
		symbol: text("symbol").notNull(),
		side: text("side").notNull(),
		orderType: text("order_type").notNull(),
		price: text("price").notNull(),
		quantity: text("quantity").notNull(),
		filledQuantity: text("filled_quantity").notNull().default("0"),
		slPrice: text("sl_price"),
		tpPrice: text("tp_price"),
		status: text("status").notNull().default("planned"),
		exchangeOrderId: text("exchange_order_id"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("orders_user_id_idx").on(table.userId)],
);
