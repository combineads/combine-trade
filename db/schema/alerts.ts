import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { strategyEvents } from "./strategy-events.js";

export const alerts = pgTable("alerts", {
	id: uuid("id").defaultRandom().primaryKey(),
	eventId: uuid("event_id")
		.notNull()
		.references(() => strategyEvents.id),
	channel: text("channel").notNull(),
	message: text("message").notNull(),
	deliveryState: text("delivery_state").notNull().default("pending"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	sentAt: timestamp("sent_at", { withTimezone: true }),
});
