import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUser } from "./better-auth.js";
import { strategies } from "./strategies.js";

export const paperRuns = pgTable("paper_runs", {
	id: uuid("id").defaultRandom().primaryKey(),
	strategyId: uuid("strategy_id")
		.notNull()
		.references(() => strategies.id),
	userId: text("user_id")
		.notNull()
		.references(() => authUser.id),
	runId: uuid("run_id").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
	startBalance: numeric("start_balance", { precision: 28, scale: 8 }).notNull(),
	finalBalance: numeric("final_balance", { precision: 28, scale: 8 }).notNull(),
	tradeCount: integer("trade_count").notNull().default(0),
	winCount: integer("win_count").notNull().default(0),
	lossCount: integer("loss_count").notNull().default(0),
	totalPnl: numeric("total_pnl", { precision: 28, scale: 8 }).notNull().default("0"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
