import { describe, expect, test } from "bun:test";
import { tradeJournals } from "../schema/index.js";

/**
 * Verifies that trade_journals schema includes the three new columns added
 * as part of the macro context and retrospective extension migration.
 *
 * These are pure schema-shape tests — no DB connection required.
 * Column introspection via Drizzle column objects (name, dataType, notNull).
 */

// ---------------------------------------------------------------------------
// Tests: column presence
// ---------------------------------------------------------------------------

describe("trade_journals migration — column presence", () => {
	test("schema includes entryMacroContext column", () => {
		expect(tradeJournals.entryMacroContext).toBeDefined();
	});

	test("schema includes retrospectiveReport column", () => {
		expect(tradeJournals.retrospectiveReport).toBeDefined();
	});

	test("schema includes retrospectiveGeneratedAt column", () => {
		expect(tradeJournals.retrospectiveGeneratedAt).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Tests: SQL column name mapping (snake_case)
// ---------------------------------------------------------------------------

describe("trade_journals migration — SQL column name mapping", () => {
	test("entryMacroContext maps to entry_macro_context", () => {
		expect(tradeJournals.entryMacroContext.name).toBe("entry_macro_context");
	});

	test("retrospectiveReport maps to retrospective_report", () => {
		expect(tradeJournals.retrospectiveReport.name).toBe("retrospective_report");
	});

	test("retrospectiveGeneratedAt maps to retrospective_generated_at", () => {
		expect(tradeJournals.retrospectiveGeneratedAt.name).toBe("retrospective_generated_at");
	});
});

// ---------------------------------------------------------------------------
// Tests: column types
// ---------------------------------------------------------------------------

describe("trade_journals migration — column types", () => {
	test("entryMacroContext is a JSONB column", () => {
		expect(tradeJournals.entryMacroContext.columnType).toBe("PgJsonb");
	});

	test("retrospectiveReport is a TEXT column", () => {
		expect(tradeJournals.retrospectiveReport.columnType).toBe("PgText");
	});

	test("retrospectiveGeneratedAt is a TIMESTAMPTZ column", () => {
		// Drizzle timestamp with withTimezone uses PgTimestamp type
		expect(tradeJournals.retrospectiveGeneratedAt.columnType).toBe("PgTimestamp");
	});

	test("retrospectiveGeneratedAt has withTimezone enabled", () => {
		// Access the config via the column's internal config
		const col = tradeJournals.retrospectiveGeneratedAt as unknown as {
			config: { withTimezone: boolean };
		};
		expect(col.config.withTimezone).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Tests: nullable constraints (all three columns must be nullable)
// ---------------------------------------------------------------------------

describe("trade_journals migration — all new columns are nullable", () => {
	test("entryMacroContext is nullable", () => {
		expect(tradeJournals.entryMacroContext.notNull).toBe(false);
	});

	test("retrospectiveReport is nullable", () => {
		expect(tradeJournals.retrospectiveReport.notNull).toBe(false);
	});

	test("retrospectiveGeneratedAt is nullable", () => {
		expect(tradeJournals.retrospectiveGeneratedAt.notNull).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Tests: existing required columns are unchanged
// ---------------------------------------------------------------------------

describe("trade_journals migration — existing columns unchanged", () => {
	test("id column still exists and is primary key", () => {
		expect(tradeJournals.id).toBeDefined();
		expect(tradeJournals.id.primary).toBe(true);
	});

	test("userId column still exists and is notNull", () => {
		expect(tradeJournals.userId).toBeDefined();
		expect(tradeJournals.userId.notNull).toBe(true);
	});

	test("symbol column still exists and is notNull", () => {
		expect(tradeJournals.symbol).toBeDefined();
		expect(tradeJournals.symbol.notNull).toBe(true);
	});

	test("entryPrice column still exists and is notNull", () => {
		expect(tradeJournals.entryPrice).toBeDefined();
		expect(tradeJournals.entryPrice.notNull).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Tests: JSONB column accepts a sample macro context object structure
// ---------------------------------------------------------------------------

describe("trade_journals migration — JSONB round-trip type compatibility", () => {
	test("entryMacroContext column type is compatible with macro context object", () => {
		// Verify this is a JSONB column that can accept arbitrary object values.
		// The sample macro context shape: { indicators: {}, events: [] }
		const sampleMacroContext = {
			indicators: { vix: 18.5, dxy: 104.2 },
			events: [{ name: "FOMC", impact: "HIGH", scheduled: "2026-03-26T18:00:00Z" }],
		};
		// The column is JSONB — we verify the column type accepts any JSON value.
		// Since JSONB is free-form at the DB level, we just confirm the column type.
		expect(tradeJournals.entryMacroContext.columnType).toBe("PgJsonb");
		// The sample object is a valid JSON value
		expect(JSON.stringify(sampleMacroContext)).toBeTruthy();
		const roundTripped = JSON.parse(JSON.stringify(sampleMacroContext));
		expect(roundTripped.indicators.vix).toBe(18.5);
		expect(roundTripped.events[0].name).toBe("FOMC");
	});
});
