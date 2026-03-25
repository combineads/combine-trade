import { describe, expect, test } from "bun:test";
import { strategies } from "../schema/index.js";

/**
 * Verifies that strategies schema includes the use_llm_filter boolean column
 * added as part of the EP16 LLM filter integration.
 *
 * These are pure schema-shape tests — no DB connection required.
 * Column introspection via Drizzle column objects.
 */

// ---------------------------------------------------------------------------
// Tests: column presence
// ---------------------------------------------------------------------------

describe("strategies schema — use_llm_filter column presence", () => {
	test("schema includes useLlmFilter column", () => {
		expect(strategies.useLlmFilter).toBeDefined();
	});

	test("useLlmFilter maps to SQL column name use_llm_filter", () => {
		expect(strategies.useLlmFilter.name).toBe("use_llm_filter");
	});
});

// ---------------------------------------------------------------------------
// Tests: column type
// ---------------------------------------------------------------------------

describe("strategies schema — use_llm_filter column type", () => {
	test("useLlmFilter is a boolean column", () => {
		expect(strategies.useLlmFilter.columnType).toBe("PgBoolean");
	});

	test("useLlmFilter is NOT NULL", () => {
		expect(strategies.useLlmFilter.notNull).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Tests: default value
// ---------------------------------------------------------------------------

describe("strategies schema — use_llm_filter default value", () => {
	test("useLlmFilter has a default value", () => {
		// Drizzle exposes the default via .default on the column config
		const col = strategies.useLlmFilter as unknown as {
			config: { default: unknown; hasDefault: boolean };
		};
		expect(col.config.hasDefault).toBe(true);
	});

	test("useLlmFilter default is false", () => {
		const col = strategies.useLlmFilter as unknown as {
			config: { default: unknown };
		};
		expect(col.config.default).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Tests: existing columns are unchanged
// ---------------------------------------------------------------------------

describe("strategies schema — existing columns unchanged", () => {
	test("id column still exists and is primary key", () => {
		expect(strategies.id).toBeDefined();
		expect(strategies.id.primary).toBe(true);
	});

	test("name column still exists and is notNull", () => {
		expect(strategies.name).toBeDefined();
		expect(strategies.name.notNull).toBe(true);
	});

	test("code column still exists and is notNull", () => {
		expect(strategies.code).toBeDefined();
		expect(strategies.code.notNull).toBe(true);
	});

	test("executionMode column still exists", () => {
		expect(strategies.executionMode).toBeDefined();
	});
});
