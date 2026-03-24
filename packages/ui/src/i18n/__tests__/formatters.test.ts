import { describe, expect, it } from "bun:test";
import {
	formatDate,
	formatDateTime,
	formatNumber,
	formatPercent,
	formatPrice,
	formatRelativeTime,
} from "../formatters";

describe("formatNumber", () => {
	it("formats integer with thousand separator for ko", () => {
		expect(formatNumber(1234567, "ko")).toBe("1,234,567");
	});

	it("formats integer with thousand separator for en", () => {
		expect(formatNumber(1234567, "en")).toBe("1,234,567");
	});

	it("formats decimal number for ko", () => {
		expect(formatNumber(1234.56, "ko")).toBe("1,234.56");
	});

	it("formats decimal number for en", () => {
		expect(formatNumber(1234.56, "en")).toBe("1,234.56");
	});

	it("accepts string input (Decimal.js compatible)", () => {
		expect(formatNumber("1234.56", "ko")).toBe("1,234.56");
	});

	it("respects custom options like minimumFractionDigits", () => {
		expect(formatNumber(1234, "en", { minimumFractionDigits: 2 })).toBe(
			"1,234.00",
		);
	});
});

describe("formatPrice", () => {
	it("formats price with USDT suffix for ko", () => {
		expect(formatPrice(1234.56, "ko", "USDT")).toBe("1,234.56 USDT");
	});

	it("formats price with USDT suffix for en", () => {
		expect(formatPrice(1234.56, "en", "USDT")).toBe("1,234.56 USDT");
	});

	it("defaults to USDT when no currency provided", () => {
		expect(formatPrice(1234.56, "ko")).toBe("1,234.56 USDT");
	});

	it("accepts string input (Decimal.js compatible)", () => {
		expect(formatPrice("1234.56", "ko", "USDT")).toBe("1,234.56 USDT");
	});

	it("formats with BTC suffix", () => {
		expect(formatPrice(0.00123456, "en", "BTC")).toBe("0.00123456 BTC");
	});
});

describe("formatPercent", () => {
	it("formats percent for ko", () => {
		expect(formatPercent(0.1234, "ko")).toBe("12.34%");
	});

	it("formats percent for en", () => {
		expect(formatPercent(0.1234, "en")).toBe("12.34%");
	});

	it("accepts string input (Decimal.js compatible)", () => {
		expect(formatPercent("0.1234", "ko")).toBe("12.34%");
	});

	it("formats zero percent", () => {
		expect(formatPercent(0, "ko")).toBe("0%");
	});

	it("formats negative percent", () => {
		expect(formatPercent(-0.05, "en")).toBe("-5%");
	});
});

describe("formatDate", () => {
	const date = new Date("2026-03-24T00:00:00.000Z");

	it("formats date in medium style for ko", () => {
		expect(formatDate(date, "ko")).toBe("2026년 3월 24일");
	});

	it("formats date in medium style for en", () => {
		expect(formatDate(date, "en")).toBe("Mar 24, 2026");
	});

	it("formats date as short for ko", () => {
		const result = formatDate(date, "ko", "short");
		expect(result).toMatch(/2026/);
	});

	it("formats date as short for en", () => {
		const result = formatDate(date, "en", "short");
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("formats date as long for ko", () => {
		const result = formatDate(date, "ko", "long");
		expect(result).toMatch(/2026/);
	});

	it("accepts string input", () => {
		expect(formatDate("2026-03-24T00:00:00.000Z", "ko")).toBe("2026년 3월 24일");
	});

	it("accepts numeric timestamp", () => {
		const ts = new Date("2026-03-24T00:00:00.000Z").getTime();
		expect(formatDate(ts, "ko")).toBe("2026년 3월 24일");
	});
});

describe("formatDateTime", () => {
	const date = new Date("2026-03-24T14:30:00.000Z");

	it("returns a non-empty string for ko", () => {
		const result = formatDateTime(date, "ko");
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("returns a non-empty string for en", () => {
		const result = formatDateTime(date, "en");
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("accepts string input", () => {
		const result = formatDateTime("2026-03-24T14:30:00.000Z", "ko");
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});
});

describe("formatRelativeTime", () => {
	it("returns a string for a past date", () => {
		const past = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago
		const result = formatRelativeTime(past, "ko");
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("returns a string for a future date", () => {
		const future = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
		const result = formatRelativeTime(future, "en");
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("ko: 3 minutes ago contains expected text", () => {
		const past = new Date(Date.now() - 3 * 60 * 1000 - 500);
		const result = formatRelativeTime(past, "ko");
		// Intl.RelativeTimeFormat ko: "3분 전"
		expect(result).toMatch(/분/);
	});

	it("en: 3 minutes ago contains expected text", () => {
		const past = new Date(Date.now() - 3 * 60 * 1000 - 500);
		const result = formatRelativeTime(past, "en");
		// Intl.RelativeTimeFormat en: "3 minutes ago"
		expect(result).toMatch(/minute/i);
	});

	it("accepts numeric timestamp", () => {
		const ts = Date.now() - 60 * 1000;
		const result = formatRelativeTime(ts, "ko");
		expect(typeof result).toBe("string");
	});
});
