import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const killSwitchState = pgTable("kill_switch_state", {
	id: uuid("id").defaultRandom().primaryKey(),
	strategyId: uuid("strategy_id"),
	isActive: boolean("is_active").notNull().default(false),
	activatedAt: timestamp("activated_at", { withTimezone: true }),
	activatedBy: text("activated_by"),
	reason: text("reason"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only audit table. Never deleted or updated (except deactivated_at). */
export const killSwitchEvents = pgTable("kill_switch_events", {
	id: uuid("id").defaultRandom().primaryKey(),
	triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull(),
	deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
	scope: text("scope").notNull(),
	scopeTarget: text("scope_target"),
	triggerType: text("trigger_type").notNull(),
	triggerDetail: text("trigger_detail").notNull(),
	hadOpenPositions: boolean("had_open_positions").notNull().default(false),
	positionsSnapshot: jsonb("positions_snapshot"),
	deactivatedBy: text("deactivated_by"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
