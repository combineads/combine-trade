import { index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Append-only metrics history table.
 * Each row is one 60-second flush snapshot for one pipeline stage.
 * Retention policy: rows older than 30 days are purged by the cleanup job.
 */
export const pipelineMetrics = pgTable(
	"pipeline_metrics",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		/** Pipeline stage name (e.g. "vector", "strategy", "label"). */
		stage: text("stage").notNull(),
		/** p50 latency in milliseconds for this flush window. */
		p50: numeric("p50").notNull(),
		/** p95 latency in milliseconds for this flush window. */
		p95: numeric("p95").notNull(),
		/** p99 latency in milliseconds for this flush window. */
		p99: numeric("p99").notNull(),
		/** Number of latency samples recorded in this flush window. */
		count: integer("count").notNull(),
		/** Number of errors recorded in this flush window. */
		errors: integer("errors").notNull(),
		/** Number of events recorded in this flush window. */
		events: integer("events").notNull(),
		/** Unix timestamp (ms) when the in-memory snapshot was captured. */
		capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
		/** Row insertion timestamp. */
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("pipeline_metrics_stage_captured_idx").on(table.stage, table.capturedAt),
		index("pipeline_metrics_captured_at_idx").on(table.capturedAt),
	],
);
