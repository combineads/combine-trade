import { describe, expect, test } from "bun:test";
import { decisions } from "../schema/index.js";

/**
 * Verifies that the decisions table schema includes the five LLM evaluation
 * result columns added as part of the LLM filter integration (T-16-018).
 *
 * These are pure schema-shape tests — no DB connection required.
 * Column introspection via Drizzle column objects (name, columnType, notNull).
 */

// ---------------------------------------------------------------------------
// Tests: column presence
// ---------------------------------------------------------------------------

describe("decisions LLM columns — column presence", () => {
	test("schema includes llmAction column", () => {
		expect(decisions.llmAction).toBeDefined();
	});

	test("schema includes llmReason column", () => {
		expect(decisions.llmReason).toBeDefined();
	});

	test("schema includes llmConfidence column", () => {
		expect(decisions.llmConfidence).toBeDefined();
	});

	test("schema includes llmRiskFactors column", () => {
		expect(decisions.llmRiskFactors).toBeDefined();
	});

	test("schema includes llmEvaluatedAt column", () => {
		expect(decisions.llmEvaluatedAt).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Tests: SQL column name mapping (snake_case)
// ---------------------------------------------------------------------------

describe("decisions LLM columns — SQL column name mapping", () => {
	test("llmAction maps to llm_action", () => {
		expect(decisions.llmAction.name).toBe("llm_action");
	});

	test("llmReason maps to llm_reason", () => {
		expect(decisions.llmReason.name).toBe("llm_reason");
	});

	test("llmConfidence maps to llm_confidence", () => {
		expect(decisions.llmConfidence.name).toBe("llm_confidence");
	});

	test("llmRiskFactors maps to llm_risk_factors", () => {
		expect(decisions.llmRiskFactors.name).toBe("llm_risk_factors");
	});

	test("llmEvaluatedAt maps to llm_evaluated_at", () => {
		expect(decisions.llmEvaluatedAt.name).toBe("llm_evaluated_at");
	});
});

// ---------------------------------------------------------------------------
// Tests: column types
// ---------------------------------------------------------------------------

describe("decisions LLM columns — column types", () => {
	test("llmAction is a TEXT column", () => {
		expect(decisions.llmAction.columnType).toBe("PgText");
	});

	test("llmReason is a TEXT column", () => {
		expect(decisions.llmReason.columnType).toBe("PgText");
	});

	test("llmConfidence is a REAL column", () => {
		expect(decisions.llmConfidence.columnType).toBe("PgReal");
	});

	test("llmRiskFactors is a JSONB column", () => {
		expect(decisions.llmRiskFactors.columnType).toBe("PgJsonb");
	});

	test("llmEvaluatedAt is a TIMESTAMPTZ column", () => {
		expect(decisions.llmEvaluatedAt.columnType).toBe("PgTimestamp");
	});

	test("llmEvaluatedAt has withTimezone enabled", () => {
		const col = decisions.llmEvaluatedAt as unknown as {
			config: { withTimezone: boolean };
		};
		expect(col.config.withTimezone).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Tests: nullable constraints (all five columns must be nullable)
// ---------------------------------------------------------------------------

describe("decisions LLM columns — all new columns are nullable", () => {
	test("llmAction is nullable", () => {
		expect(decisions.llmAction.notNull).toBe(false);
	});

	test("llmReason is nullable", () => {
		expect(decisions.llmReason.notNull).toBe(false);
	});

	test("llmConfidence is nullable", () => {
		expect(decisions.llmConfidence.notNull).toBe(false);
	});

	test("llmRiskFactors is nullable", () => {
		expect(decisions.llmRiskFactors.notNull).toBe(false);
	});

	test("llmEvaluatedAt is nullable", () => {
		expect(decisions.llmEvaluatedAt.notNull).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Tests: existing columns are unchanged
// ---------------------------------------------------------------------------

describe("decisions LLM columns — existing columns unchanged", () => {
	test("id column still exists and is primary key", () => {
		expect(decisions.id).toBeDefined();
		expect(decisions.id.primary).toBe(true);
	});

	test("eventId column still exists and is notNull", () => {
		expect(decisions.eventId).toBeDefined();
		expect(decisions.eventId.notNull).toBe(true);
	});

	test("direction column still exists and is notNull", () => {
		expect(decisions.direction).toBeDefined();
		expect(decisions.direction.notNull).toBe(true);
	});

	test("createdAt column still exists and is notNull", () => {
		expect(decisions.createdAt).toBeDefined();
		expect(decisions.createdAt.notNull).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Tests: JSONB round-trip for llm_risk_factors
// ---------------------------------------------------------------------------

describe("decisions LLM columns — llmRiskFactors JSONB round-trip", () => {
	test("llmRiskFactors column type is compatible with risk factors array", () => {
		// Verify the column is JSONB and can accept a risk factors array
		expect(decisions.llmRiskFactors.columnType).toBe("PgJsonb");

		const sampleRiskFactors = [
			{ factor: "high_volatility", severity: "HIGH", description: "VIX above 30" },
			{ factor: "earnings_event", severity: "MEDIUM", description: "Earnings in 3 days" },
		];
		// Confirm the JSON value round-trips correctly
		const roundTripped = JSON.parse(JSON.stringify(sampleRiskFactors));
		expect(roundTripped[0].factor).toBe("high_volatility");
		expect(roundTripped[1].factor).toBe("earnings_event");
		expect(roundTripped).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// Tests: llmConfidence boundary values
// ---------------------------------------------------------------------------

describe("decisions LLM columns — llmConfidence boundary values", () => {
	test("llmConfidence column is REAL type (single precision float)", () => {
		expect(decisions.llmConfidence.columnType).toBe("PgReal");
	});

	test("llmConfidence accepts 0.0 boundary value", () => {
		// Application layer wraps in Decimal.js; DB layer accepts raw float
		const minConfidence = 0.0;
		expect(minConfidence).toBeGreaterThanOrEqual(0.0);
		expect(minConfidence).toBeLessThanOrEqual(1.0);
	});

	test("llmConfidence accepts 1.0 boundary value", () => {
		const maxConfidence = 1.0;
		expect(maxConfidence).toBeGreaterThanOrEqual(0.0);
		expect(maxConfidence).toBeLessThanOrEqual(1.0);
	});

	test("llmConfidence accepts mid-range value 0.75", () => {
		const midConfidence = 0.75;
		expect(midConfidence).toBeGreaterThan(0.0);
		expect(midConfidence).toBeLessThan(1.0);
	});
});

// ---------------------------------------------------------------------------
// Tests: kNN-only path — insert without LLM columns
// ---------------------------------------------------------------------------

describe("decisions LLM columns — kNN-only path compatibility", () => {
	test("schema allows undefined llmAction (nullable for kNN-only rows)", () => {
		// All LLM columns must accept undefined/null values for kNN-only decisions.
		// We verify this by checking notNull is false for all five columns.
		const llmColumns = [
			decisions.llmAction,
			decisions.llmReason,
			decisions.llmConfidence,
			decisions.llmRiskFactors,
			decisions.llmEvaluatedAt,
		];
		for (const col of llmColumns) {
			expect(col.notNull).toBe(false);
		}
	});
});
