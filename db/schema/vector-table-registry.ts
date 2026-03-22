import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const vectorTableRegistry = pgTable(
	"vector_table_registry",
	{
		strategyId: uuid("strategy_id").notNull(),
		version: integer("version").notNull(),
		tableName: text("table_name").notNull(),
		dimension: integer("dimension").notNull(),
		rowCount: integer("row_count").notNull().default(0),
		status: text("status").notNull().default("active"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		{
			pk: {
				columns: [table.strategyId, table.version],
				name: "vector_table_registry_pk",
			},
		},
	],
);
