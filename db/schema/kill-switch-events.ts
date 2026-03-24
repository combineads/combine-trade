import { jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * Append-only audit table for kill switch activations.
 * Records every activation with a positions snapshot for post-mortem analysis.
 * deactivatedAt is the only mutable column (updated on deactivation).
 */
export const killSwitchEvents = pgTable("kill_switch_audit_events", {
	/** Primary key for this audit record. */
	id: uuid("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	/** FK reference to the kill switch state that fired. */
	killSwitchStateId: varchar("kill_switch_state_id").notNull(),
	/** Mirrors KillSwitchTrigger — why the kill switch fired. */
	triggerType: varchar("trigger_type").notNull(),
	/** Human-readable description of why it fired. */
	triggerReason: text("trigger_reason").notNull(),
	/** Mirrors KillSwitchScope — the scope of the kill switch. */
	scope: varchar("scope").notNull(),
	/** exchangeId or strategyId; null for global scope. */
	scopeTarget: varchar("scope_target"),
	/** Open position records at the time of activation, stored as JSONB. */
	positionsSnapshot: jsonb("positions_snapshot").notNull(),
	/** When the kill switch was activated. */
	activatedAt: timestamp("activated_at", { withTimezone: true }).notNull(),
	/** When the kill switch was deactivated; null until deactivated. */
	deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
	/** userId or "system" that deactivated; null until deactivated. */
	deactivatedBy: varchar("deactivated_by"),
});
