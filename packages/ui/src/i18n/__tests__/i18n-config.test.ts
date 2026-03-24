import { describe, expect, it } from "bun:test";
import type { Locale } from "../config";
import { defaultLocale, isValidLocale, locales } from "../config";

describe("i18n config", () => {
	it("exports locales array with ko and en", () => {
		expect(locales).toContain("ko");
		expect(locales).toContain("en");
		expect(locales).toHaveLength(2);
	});

	it("has ko as default locale", () => {
		expect(defaultLocale).toBe("ko");
	});

	it("validates known locales", () => {
		expect(isValidLocale("ko")).toBe(true);
		expect(isValidLocale("en")).toBe(true);
	});

	it("rejects unknown locales", () => {
		expect(isValidLocale("fr")).toBe(false);
		expect(isValidLocale("")).toBe(false);
		expect(isValidLocale("KO")).toBe(false);
	});

	it("Locale type includes ko and en", () => {
		const ko: Locale = "ko";
		const en: Locale = "en";
		expect(ko).toBe("ko");
		expect(en).toBe("en");
	});
});
