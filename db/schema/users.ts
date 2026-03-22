import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: uuid("id").defaultRandom().primaryKey(),
	email: text("email").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	name: text("name").notNull(),
	role: text("role").notNull().default("user"),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
