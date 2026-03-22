import { describe, expect, test } from "bun:test";
import { extractEventName, parseImpactFromTitle, shouldCollect } from "../impact-parser.js";

describe("parseImpactFromTitle", () => {
	test("★★★ → HIGH", () => {
		expect(parseImpactFromTitle("★★★ FOMC Rate Decision")).toBe("HIGH");
	});

	test("★★ → MEDIUM", () => {
		expect(parseImpactFromTitle("★★ CPI m/m")).toBe("MEDIUM");
	});

	test("★ → LOW", () => {
		expect(parseImpactFromTitle("★ Building Permits")).toBe("LOW");
	});

	test("⭐⭐⭐ → HIGH (alternate star)", () => {
		expect(parseImpactFromTitle("⭐⭐⭐ Non-Farm Payrolls")).toBe("HIGH");
	});

	test("⭐⭐ → MEDIUM (alternate star)", () => {
		expect(parseImpactFromTitle("⭐⭐ Retail Sales")).toBe("MEDIUM");
	});

	test("no stars → LOW", () => {
		expect(parseImpactFromTitle("Fed Chair Powell Speaks")).toBe("LOW");
	});

	test("more than 3 stars → HIGH", () => {
		expect(parseImpactFromTitle("★★★★ Special Event")).toBe("HIGH");
	});

	test("mixed stars counted correctly", () => {
		expect(parseImpactFromTitle("★⭐★ Mixed")).toBe("HIGH");
	});

	test("empty string → LOW", () => {
		expect(parseImpactFromTitle("")).toBe("LOW");
	});
});

describe("extractEventName", () => {
	test("removes stars and trims", () => {
		expect(extractEventName("★★★ FOMC Rate Decision")).toBe("FOMC Rate Decision");
	});

	test("handles no stars", () => {
		expect(extractEventName("Fed Chair Powell Speaks")).toBe("Fed Chair Powell Speaks");
	});

	test("handles trailing stars", () => {
		expect(extractEventName("CPI m/m ★★")).toBe("CPI m/m");
	});

	test("handles multiple groups of stars", () => {
		expect(extractEventName("★★ US ★ CPI")).toBe("US  CPI");
	});
});

describe("shouldCollect", () => {
	test("HIGH → true", () => {
		expect(shouldCollect("HIGH")).toBe(true);
	});

	test("MEDIUM → true", () => {
		expect(shouldCollect("MEDIUM")).toBe(true);
	});

	test("LOW → false by default", () => {
		expect(shouldCollect("LOW")).toBe(false);
	});

	test("LOW → true when includeLow", () => {
		expect(shouldCollect("LOW", true)).toBe(true);
	});
});
