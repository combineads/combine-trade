import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const strategies = pgTable("strategies", {
	id: uuid("id").defaultRandom().primaryKey(),
	version: integer("version").notNull().default(1),
	name: text("name").notNull(),
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
	status: text("status").notNull().default("active"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
