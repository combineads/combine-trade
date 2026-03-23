import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUser } from "./better-auth.js";

export const strategies = pgTable(
	"strategies",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => authUser.id),
		version: integer("version").notNull().default(1),
		name: text("name").notNull(),
		description: text("description"),
		code: text("code").notNull(),
		symbols: text("symbols").array().notNull(),
		timeframe: text("timeframe").notNull(),
		direction: text("direction").notNull(),
		featuresDefinition: jsonb("features_definition").notNull(),
		normalizationConfig: jsonb("normalization_config").notNull(),
		searchConfig: jsonb("search_config").notNull(),
		resultConfig: jsonb("result_config").notNull(),
		decisionConfig: jsonb("decision_config").notNull(),
		executionMode: text("execution_mode").notNull().default("analysis"),
		apiVersion: text("api_version"),
		status: text("status").notNull().default("draft"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(table) => [
		index("strategies_user_id_idx").on(table.userId),
		index("strategies_name_version_idx").on(table.name, table.version),
		index("strategies_status_idx").on(table.status),
	],
);
