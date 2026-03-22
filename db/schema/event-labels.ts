import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { strategyEvents } from "./strategy-events.js";

export const eventLabels = pgTable("event_labels", {
	id: uuid("id").defaultRandom().primaryKey(),
	eventId: uuid("event_id")
		.notNull()
		.references(() => strategyEvents.id),
	resultType: text("result_type").notNull(),
	pnlPct: text("pnl_pct").notNull(),
	mfePct: text("mfe_pct").notNull(),
	maePct: text("mae_pct").notNull(),
	holdBars: integer("hold_bars").notNull(),
	exitPrice: text("exit_price").notNull(),
	slHitFirst: boolean("sl_hit_first"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
