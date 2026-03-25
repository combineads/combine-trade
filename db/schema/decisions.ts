import { jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { strategies } from "./strategies.js";
import { strategyEvents } from "./strategy-events.js";

/** Append-only audit table. Every decision is recorded, including PASS. */
export const decisions = pgTable("decisions", {
	id: uuid("id").defaultRandom().primaryKey(),
	eventId: uuid("event_id")
		.notNull()
		.references(() => strategyEvents.id),
	strategyId: uuid("strategy_id")
		.notNull()
		.references(() => strategies.id),
	strategyVersion: text("strategy_version").notNull(),
	symbol: text("symbol").notNull(),
	direction: text("direction").notNull(),
	sampleCount: text("sample_count").notNull(),
	winrate: text("winrate").notNull(),
	expectancy: text("expectancy").notNull(),
	avgWin: text("avg_win").notNull(),
	avgLoss: text("avg_loss").notNull(),
	ciLower: text("ci_lower"),
	ciUpper: text("ci_upper"),
	confidenceTier: text("confidence_tier"),
	similarityTop1Score: text("similarity_top1_score"),
	decisionReason: text("decision_reason").notNull(),
	executionMode: text("execution_mode").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

	// LLM evaluation fields
	// Populated only when strategies.use_llm_filter is enabled (T-16-017).
	// kNN-only decisions leave all five columns NULL.
	llmAction: text("llm_action"),
	llmReason: text("llm_reason"),
	// REAL in DB (single-precision float); application layer uses Decimal.js for comparisons
	llmConfidence: real("llm_confidence"),
	llmRiskFactors: jsonb("llm_risk_factors"),
	llmEvaluatedAt: timestamp("llm_evaluated_at", { withTimezone: true }),
});
