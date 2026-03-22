import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const exchangeCredentials = pgTable("exchange_credentials", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	exchange: text("exchange").notNull(),
	apiKeyEncrypted: text("api_key_encrypted").notNull(),
	apiSecretEncrypted: text("api_secret_encrypted").notNull(),
	label: text("label"),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
