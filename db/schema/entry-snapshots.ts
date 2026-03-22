import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { strategyEvents } from "./strategy-events.js";

export const entrySnapshots = pgTable("entry_snapshots", {
	id: uuid("id").defaultRandom().primaryKey(),
	eventId: uuid("event_id")
		.notNull()
		.references(() => strategyEvents.id),
	snapshotType: text("snapshot_type").notNull(),
	data: jsonb("data").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
