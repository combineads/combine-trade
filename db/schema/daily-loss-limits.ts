import { date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUser } from "./better-auth.js";

export const dailyLossLimits = pgTable(
	"daily_loss_limits",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUser.id),
		strategyId: uuid("strategy_id"),
		limitAmount: text("limit_amount").notNull(),
		resetHour: integer("reset_hour").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("daily_loss_limits_user_id_idx").on(table.userId)],
);

export const dailyPnlTracking = pgTable(
	"daily_pnl_tracking",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUser.id),
		date: date("date").notNull(),
		strategyId: uuid("strategy_id"),
		symbol: text("symbol"),
		realizedPnl: text("realized_pnl").notNull().default("0"),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("daily_pnl_tracking_user_id_idx").on(table.userId)],
);
