/**
 * Unit tests for scripts/i18n-check.ts logic.
 *
 * Tests the pure comparison functions without touching the filesystem.
 * Verifies:
 * - collectKeys produces sorted dot-path leaf keys
 * - missingInB correctly reports asymmetric keys
 * - compareMessages detects mismatches and perfect consistency
 * - compareMessages is consistent for the actual ko.json / en.json pair
 */

import { describe, expect, it } from "bun:test";
import enMessages from "../messages/en.json";
import koMessages from "../messages/ko.json";
import {
	collectKeys,
	compareMessages,
	missingInB,
} from "../../../../../scripts/i18n-check";

// ---------------------------------------------------------------------------
// collectKeys
// ---------------------------------------------------------------------------

describe("collectKeys", () => {
	it("returns leaf keys as dot-path strings", () => {
		const obj = { a: "1", b: { c: "2", d: "3" } };
		const keys = collectKeys(obj as Record<string, unknown>);
		expect(keys).toContain("a");
		expect(keys).toContain("b.c");
		expect(keys).toContain("b.d");
	});

	it("returns a sorted list", () => {
		const obj = { z: "1", a: "2", m: "3" };
		const keys = collectKeys(obj as Record<string, unknown>);
		expect(keys).toEqual(["a", "m", "z"]);
	});

	it("handles deeply nested objects", () => {
		const obj = { a: { b: { c: "deep" } } };
		const keys = collectKeys(obj as Record<string, unknown>);
		expect(keys).toEqual(["a.b.c"]);
	});

	it("handles empty object", () => {
		expect(collectKeys({})).toEqual([]);
	});

	it("collects multiple leaf values at the same level", () => {
		const obj = { common: { loading: "Loading", error: "Error" } };
		const keys = collectKeys(obj as Record<string, unknown>);
		expect(keys).toEqual(["common.error", "common.loading"]);
	});
});

// ---------------------------------------------------------------------------
// missingInB
// ---------------------------------------------------------------------------

describe("missingInB", () => {
	it("returns keys in a that are not in b", () => {
		const a = ["x", "y", "z"];
		const b = ["x", "z"];
		expect(missingInB(a, b)).toEqual(["y"]);
	});

	it("returns empty array when all keys of a are in b", () => {
		const a = ["a", "b"];
		const b = ["a", "b", "c"];
		expect(missingInB(a, b)).toEqual([]);
	});

	it("returns empty array for empty inputs", () => {
		expect(missingInB([], [])).toEqual([]);
	});

	it("returns all of a when b is empty", () => {
		const a = ["a", "b"];
		expect(missingInB(a, [])).toEqual(["a", "b"]);
	});
});

// ---------------------------------------------------------------------------
// compareMessages
// ---------------------------------------------------------------------------

describe("compareMessages", () => {
	it("reports isConsistent=true when both objects have identical keys", () => {
		const ko = { common: { loading: "불러오는 중...", error: "오류" } };
		const en = { common: { loading: "Loading...", error: "Error" } };
		const result = compareMessages(
			ko as Record<string, unknown>,
			en as Record<string, unknown>,
		);
		expect(result.isConsistent).toBe(true);
		expect(result.missingInEn).toEqual([]);
		expect(result.missingInKo).toEqual([]);
	});

	it("reports keys in ko but missing in en", () => {
		const ko = { common: { loading: "불러오는 중...", cancel: "취소" } };
		const en = { common: { loading: "Loading..." } };
		const result = compareMessages(
			ko as Record<string, unknown>,
			en as Record<string, unknown>,
		);
		expect(result.isConsistent).toBe(false);
		expect(result.missingInEn).toContain("common.cancel");
		expect(result.missingInKo).toEqual([]);
	});

	it("reports keys in en but missing in ko", () => {
		const ko = { common: { loading: "불러오는 중..." } };
		const en = { common: { loading: "Loading...", save: "Save" } };
		const result = compareMessages(
			ko as Record<string, unknown>,
			en as Record<string, unknown>,
		);
		expect(result.isConsistent).toBe(false);
		expect(result.missingInKo).toContain("common.save");
		expect(result.missingInEn).toEqual([]);
	});

	it("reports both directions when both have unique keys", () => {
		const ko = { ns: { a: "A", b: "B" } };
		const en = { ns: { a: "A", c: "C" } };
		const result = compareMessages(
			ko as Record<string, unknown>,
			en as Record<string, unknown>,
		);
		expect(result.isConsistent).toBe(false);
		expect(result.missingInEn).toContain("ns.b");
		expect(result.missingInKo).toContain("ns.c");
	});

	it("exposes koKeys and enKeys counts", () => {
		const ko = { a: "1", b: "2" };
		const en = { a: "1", b: "2" };
		const result = compareMessages(
			ko as Record<string, unknown>,
			en as Record<string, unknown>,
		);
		expect(result.koKeys).toHaveLength(2);
		expect(result.enKeys).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// Real message files
// ---------------------------------------------------------------------------

describe("ko.json and en.json are fully consistent", () => {
	it("all top-level namespaces exist in both locales", () => {
		const koNs = Object.keys(koMessages).sort();
		const enNs = Object.keys(enMessages).sort();
		expect(koNs).toEqual(enNs);
	});

	it("no keys are missing in en.json compared to ko.json", () => {
		const result = compareMessages(
			koMessages as Record<string, unknown>,
			enMessages as Record<string, unknown>,
		);
		expect(result.missingInEn).toEqual([]);
	});

	it("no keys are missing in ko.json compared to en.json", () => {
		const result = compareMessages(
			koMessages as Record<string, unknown>,
			enMessages as Record<string, unknown>,
		);
		expect(result.missingInKo).toEqual([]);
	});

	it("total key count is the same in both locales", () => {
		const result = compareMessages(
			koMessages as Record<string, unknown>,
			enMessages as Record<string, unknown>,
		);
		expect(result.koKeys.length).toBe(result.enKeys.length);
	});

	it("LONG/SHORT/PASS are identical in both locales", () => {
		const ko = koMessages as Record<string, Record<string, Record<string, string>>>;
		const en = enMessages as Record<string, Record<string, Record<string, string>>>;
		expect(ko.common.direction.long).toBe("LONG");
		expect(en.common.direction.long).toBe("LONG");
		expect(ko.common.direction.short).toBe("SHORT");
		expect(en.common.direction.short).toBe("SHORT");
		expect(ko.common.direction.pass).toBe("PASS");
		expect(en.common.direction.pass).toBe("PASS");
	});

	it("no empty string values in ko.json", () => {
		const assertNonEmpty = (obj: Record<string, unknown>, path: string) => {
			for (const [key, value] of Object.entries(obj)) {
				const fullPath = `${path}.${key}`;
				if (typeof value === "object" && value !== null) {
					assertNonEmpty(value as Record<string, unknown>, fullPath);
				} else {
					expect(
						typeof value,
						`${fullPath} should be a string`,
					).toBe("string");
					expect(
						(value as string).length,
						`${fullPath} should not be empty`,
					).toBeGreaterThan(0);
				}
			}
		};
		assertNonEmpty(koMessages as Record<string, unknown>, "ko");
	});

	it("no empty string values in en.json", () => {
		const assertNonEmpty = (obj: Record<string, unknown>, path: string) => {
			for (const [key, value] of Object.entries(obj)) {
				const fullPath = `${path}.${key}`;
				if (typeof value === "object" && value !== null) {
					assertNonEmpty(value as Record<string, unknown>, fullPath);
				} else {
					expect(
						typeof value,
						`${fullPath} should be a string`,
					).toBe("string");
					expect(
						(value as string).length,
						`${fullPath} should not be empty`,
					).toBeGreaterThan(0);
				}
			}
		};
		assertNonEmpty(enMessages as Record<string, unknown>, "en");
	});
});
