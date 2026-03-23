import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUser } from "./better-auth.js";
import { entrySnapshots } from "./entry-snapshots.js";
import { orders } from "./orders.js";
import { strategies } from "./strategies.js";
import { strategyEvents } from "./strategy-events.js";

export const tradeJournals = pgTable("trade_journals", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => authUser.id),
	eventId: uuid("event_id")
		.notNull()
		.references(() => strategyEvents.id),
	orderId: uuid("order_id")
		.notNull()
		.references(() => orders.id),
	entrySnapshotId: uuid("entry_snapshot_id").references(() => entrySnapshots.id),
	strategyId: uuid("strategy_id")
		.notNull()
		.references(() => strategies.id),
	symbol: text("symbol").notNull(),
	direction: text("direction").notNull(),
	entryPrice: text("entry_price").notNull(),
	exitPrice: text("exit_price"),
	quantity: text("quantity").notNull(),
	grossPnl: text("gross_pnl"),
	netPnl: text("net_pnl"),
	feesPaid: text("fees_paid"),
	fundingPaid: text("funding_paid"),
	entryTime: timestamp("entry_time", { withTimezone: true }).notNull(),
	exitTime: timestamp("exit_time", { withTimezone: true }),
	holdBars: integer("hold_bars"),
	mfePct: text("mfe_pct"),
	maePct: text("mae_pct"),
	exitMarketContext: jsonb("exit_market_context"),
	matchedPatterns: jsonb("matched_patterns"),
	autoTags: text("auto_tags").array(),
	userNotes: text("user_notes"),
	notes: text("notes"),
	tags: text("tags").array(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
