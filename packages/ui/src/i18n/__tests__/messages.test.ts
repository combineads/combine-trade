import { describe, expect, it } from "bun:test";
import enMessages from "../messages/en.json";
import koMessages from "../messages/ko.json";

describe("message files", () => {
	it("ko.json has common namespace", () => {
		expect(koMessages).toHaveProperty("common");
	});

	it("en.json has common namespace", () => {
		expect(enMessages).toHaveProperty("common");
	});

	it("ko.json common namespace has required keys", () => {
		const common = koMessages.common;
		expect(common).toHaveProperty("nav");
		expect(common).toHaveProperty("actions");
		expect(common).toHaveProperty("status");
		expect(common).toHaveProperty("trading");
		expect(common).toHaveProperty("error");
		expect(common).toHaveProperty("confirm");
	});

	it("en.json common namespace has required keys", () => {
		const common = enMessages.common;
		expect(common).toHaveProperty("nav");
		expect(common).toHaveProperty("actions");
		expect(common).toHaveProperty("status");
		expect(common).toHaveProperty("trading");
		expect(common).toHaveProperty("error");
		expect(common).toHaveProperty("confirm");
	});

	it("ko and en have same top-level namespace keys", () => {
		const koKeys = Object.keys(koMessages).sort();
		const enKeys = Object.keys(enMessages).sort();
		expect(koKeys).toEqual(enKeys);
	});

	it("ko and en common namespace have same keys", () => {
		const koCommonKeys = Object.keys(koMessages.common).sort();
		const enCommonKeys = Object.keys(enMessages.common).sort();
		expect(koCommonKeys).toEqual(enCommonKeys);
	});

	it("all message values are non-empty strings", () => {
		const assertNonEmpty = (obj: Record<string, unknown>, path: string) => {
			for (const [key, value] of Object.entries(obj)) {
				const fullPath = `${path}.${key}`;
				if (typeof value === "object" && value !== null) {
					assertNonEmpty(value as Record<string, unknown>, fullPath);
				} else {
					expect(typeof value).toBe("string");
					expect((value as string).length).toBeGreaterThan(0);
				}
			}
		};
		assertNonEmpty(koMessages as Record<string, unknown>, "ko");
		assertNonEmpty(enMessages as Record<string, unknown>, "en");
	});
});
