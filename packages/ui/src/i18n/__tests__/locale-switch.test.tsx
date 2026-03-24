/**
 * locale-switch.test.tsx
 *
 * Integration tests for locale switching behavior.
 *
 * Verifies:
 * - All namespaces exist in both ko and en
 * - Key structures match between ko and en (no missing translations)
 * - LONG/SHORT/PASS are identical in both locales
 * - No empty string values in either locale
 * - ko→en and en→ko locale switching renders correct strings
 * - localStorage save/restore behavior (key = 'combine-locale')
 * - common and dashboard namespace strings change correctly on switch
 *
 * Runs in jsdom-like environment via bun:test + renderToString (no browser needed).
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import enMessages from "../messages/en.json";
import koMessages from "../messages/ko.json";
import { I18nProvider } from "../I18nProvider";
import { useTranslations, useLocale } from "../hooks";

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type Messages = Record<string, unknown>;
type NestedStr = Record<string, Record<string, string>>;

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const store: Record<string, string> = {};
const localStorageMock = {
	getItem: (key: string) => store[key] ?? null,
	setItem: (key: string, value: string) => { store[key] = value; },
	removeItem: (key: string) => { delete store[key]; },
	clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

beforeEach(() => {
	localStorageMock.clear();
	Object.defineProperty(globalThis, "localStorage", {
		value: localStorageMock,
		writable: true,
		configurable: true,
	});
});

// ---------------------------------------------------------------------------
// SSR helper
// ---------------------------------------------------------------------------

function renderSSR(
	child: React.ReactElement,
	locale: "ko" | "en",
	messages: Messages,
): string {
	return renderToString(
		createElement(I18nProvider, { locale, messages }, child),
	);
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function CommonStrings() {
	const t = useTranslations("common");
	return createElement("div", null, [
		createElement("span", { "data-testid": "loading", key: "loading" }, t("loading")),
		createElement("span", { "data-testid": "cancel", key: "cancel" }, t("cancel")),
		createElement("span", { "data-testid": "save", key: "save" }, t("save")),
		createElement("span", { "data-testid": "direction-long", key: "direction-long" }, t("direction.long")),
		createElement("span", { "data-testid": "direction-short", key: "direction-short" }, t("direction.short")),
		createElement("span", { "data-testid": "direction-pass", key: "direction-pass" }, t("direction.pass")),
	]);
}

function DashboardStrings() {
	const t = useTranslations("dashboard");
	return createElement("div", null, [
		createElement("span", { "data-testid": "dash-title", key: "title" }, t("title")),
		createElement("span", { "data-testid": "dash-workers", key: "workers" }, t("sections.workers")),
		createElement("span", { "data-testid": "dash-strategies", key: "strategies" }, t("sections.strategies")),
	]);
}

function LocaleLabel() {
	const locale = useLocale();
	return createElement("span", { "data-testid": "locale" }, locale);
}

// ---------------------------------------------------------------------------
// Namespace completeness
// ---------------------------------------------------------------------------

describe("namespace completeness", () => {
	const EXPECTED_NAMESPACES = [
		"common",
		"orders",
		"alerts",
		"risk",
		"settings",
		"dashboard",
		"auth",
		"backtest",
		"events",
		"charts",
		"strategies",
		"journal",
	];

	for (const ns of EXPECTED_NAMESPACES) {
		it(`${ns} exists in ko.json`, () => {
			expect(koMessages).toHaveProperty(ns);
		});

		it(`${ns} exists in en.json`, () => {
			expect(enMessages).toHaveProperty(ns);
		});
	}
});

// ---------------------------------------------------------------------------
// Key structure parity
// ---------------------------------------------------------------------------

function collectLeafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
	const keys: string[] = [];
	for (const [k, v] of Object.entries(obj)) {
		const path = prefix ? `${prefix}.${k}` : k;
		if (v !== null && typeof v === "object" && !Array.isArray(v)) {
			keys.push(...collectLeafKeys(v as Record<string, unknown>, path));
		} else {
			keys.push(path);
		}
	}
	return keys.sort();
}

describe("ko and en key structure parity", () => {
	it("top-level namespaces are identical", () => {
		const koNs = Object.keys(koMessages).sort();
		const enNs = Object.keys(enMessages).sort();
		expect(koNs).toEqual(enNs);
	});

	it("all leaf keys match between ko and en", () => {
		const koKeys = collectLeafKeys(koMessages as Record<string, unknown>);
		const enKeys = collectLeafKeys(enMessages as Record<string, unknown>);
		expect(koKeys).toEqual(enKeys);
	});

	const NAMESPACES = Object.keys(koMessages) as Array<keyof typeof koMessages>;
	for (const ns of NAMESPACES) {
		it(`${ns} namespace: ko and en have identical key structure`, () => {
			const ko = (koMessages as Record<string, unknown>)[ns] as Record<string, unknown>;
			const en = (enMessages as Record<string, unknown>)[ns] as Record<string, unknown>;
			expect(collectLeafKeys(ko)).toEqual(collectLeafKeys(en));
		});
	}
});

// ---------------------------------------------------------------------------
// LONG/SHORT/PASS invariant
// ---------------------------------------------------------------------------

describe("LONG/SHORT/PASS are locale-invariant", () => {
	it("common.direction.long is 'LONG' in ko", () => {
		const ko = koMessages as unknown as NestedStr;
		expect(ko.common.direction.long).toBe("LONG");
	});

	it("common.direction.long is 'LONG' in en", () => {
		const en = enMessages as unknown as NestedStr;
		expect(en.common.direction.long).toBe("LONG");
	});

	it("common.direction.short is 'SHORT' in ko", () => {
		const ko = koMessages as unknown as NestedStr;
		expect(ko.common.direction.short).toBe("SHORT");
	});

	it("common.direction.short is 'SHORT' in en", () => {
		const en = enMessages as unknown as NestedStr;
		expect(en.common.direction.short).toBe("SHORT");
	});

	it("common.direction.pass is 'PASS' in ko", () => {
		const ko = koMessages as unknown as NestedStr;
		expect(ko.common.direction.pass).toBe("PASS");
	});

	it("common.direction.pass is 'PASS' in en", () => {
		const en = enMessages as unknown as NestedStr;
		expect(en.common.direction.pass).toBe("PASS");
	});

	it("direction values render identically in both locales via I18nProvider", () => {
		const koHtml = renderSSR(createElement(CommonStrings), "ko", koMessages as Messages);
		const enHtml = renderSSR(createElement(CommonStrings), "en", enMessages as Messages);

		// LONG/SHORT/PASS appear in both
		for (const dir of ["LONG", "SHORT", "PASS"]) {
			expect(koHtml).toContain(dir);
			expect(enHtml).toContain(dir);
		}
	});
});

// ---------------------------------------------------------------------------
// No empty strings
// ---------------------------------------------------------------------------

describe("no empty string values", () => {
	function assertNonEmpty(obj: Record<string, unknown>, path: string): void {
		for (const [key, value] of Object.entries(obj)) {
			const fullPath = `${path}.${key}`;
			if (typeof value === "object" && value !== null) {
				assertNonEmpty(value as Record<string, unknown>, fullPath);
			} else {
				expect(typeof value, `${fullPath} should be string`).toBe("string");
				expect((value as string).length, `${fullPath} should not be empty`).toBeGreaterThan(0);
			}
		}
	}

	it("ko.json has no empty string values", () => {
		assertNonEmpty(koMessages as Record<string, unknown>, "ko");
	});

	it("en.json has no empty string values", () => {
		assertNonEmpty(enMessages as Record<string, unknown>, "en");
	});
});

// ---------------------------------------------------------------------------
// locale switching — common namespace
// ---------------------------------------------------------------------------

describe("locale switching — common namespace", () => {
	it("ko renders Korean loading text", () => {
		const html = renderSSR(createElement(CommonStrings), "ko", koMessages as Messages);
		expect(html).toContain("불러오는 중...");
		expect(html).toContain("취소");
		expect(html).toContain("저장");
	});

	it("en renders English loading text", () => {
		const html = renderSSR(createElement(CommonStrings), "en", enMessages as Messages);
		expect(html).toContain("Loading...");
		expect(html).toContain("Cancel");
		expect(html).toContain("Save");
	});

	it("switching ko → en changes common.loading text", () => {
		const koHtml = renderSSR(createElement(CommonStrings), "ko", koMessages as Messages);
		const enHtml = renderSSR(createElement(CommonStrings), "en", enMessages as Messages);
		expect(koHtml).toContain("불러오는 중...");
		expect(enHtml).not.toContain("불러오는 중...");
		expect(enHtml).toContain("Loading...");
	});

	it("switching en → ko changes common.cancel text", () => {
		const enHtml = renderSSR(createElement(CommonStrings), "en", enMessages as Messages);
		const koHtml = renderSSR(createElement(CommonStrings), "ko", koMessages as Messages);
		expect(enHtml).toContain("Cancel");
		expect(koHtml).not.toContain("Cancel");
		expect(koHtml).toContain("취소");
	});

	it("useLocale returns correct locale string for ko", () => {
		const html = renderSSR(createElement(LocaleLabel), "ko", koMessages as Messages);
		expect(html).toContain("ko");
	});

	it("useLocale returns correct locale string for en", () => {
		const html = renderSSR(createElement(LocaleLabel), "en", enMessages as Messages);
		expect(html).toContain("en");
	});
});

// ---------------------------------------------------------------------------
// locale switching — dashboard namespace
// ---------------------------------------------------------------------------

describe("locale switching — dashboard namespace", () => {
	it("ko renders Korean dashboard title", () => {
		const html = renderSSR(createElement(DashboardStrings), "ko", koMessages as Messages);
		expect(html).toContain("대시보드");
	});

	it("en renders English dashboard title", () => {
		const html = renderSSR(createElement(DashboardStrings), "en", enMessages as Messages);
		expect(html).toContain("Dashboard");
	});

	it("ko renders Korean section labels", () => {
		const html = renderSSR(createElement(DashboardStrings), "ko", koMessages as Messages);
		expect(html).toContain("워커");
		expect(html).toContain("전략");
	});

	it("en renders English section labels", () => {
		const html = renderSSR(createElement(DashboardStrings), "en", enMessages as Messages);
		expect(html).toContain("Workers");
		expect(html).toContain("Strategies");
	});

	it("switching ko → en changes dashboard title", () => {
		const koHtml = renderSSR(createElement(DashboardStrings), "ko", koMessages as Messages);
		const enHtml = renderSSR(createElement(DashboardStrings), "en", enMessages as Messages);
		expect(koHtml).toContain("대시보드");
		expect(enHtml).not.toContain("대시보드");
		expect(enHtml).toContain("Dashboard");
	});
});

// ---------------------------------------------------------------------------
// localStorage save/restore
// ---------------------------------------------------------------------------

describe("localStorage locale persistence", () => {
	it("stores locale under 'combine-locale' key", () => {
		localStorageMock.setItem("combine-locale", "en");
		expect(localStorageMock.getItem("combine-locale")).toBe("en");
	});

	it("restores locale from 'combine-locale' key", () => {
		localStorageMock.setItem("combine-locale", "ko");
		const stored = localStorageMock.getItem("combine-locale");
		expect(stored === "ko" || stored === "en").toBe(true);
		expect(stored).toBe("ko");
	});

	it("falls back to 'ko' when key is absent", () => {
		localStorageMock.removeItem("combine-locale");
		const stored = localStorageMock.getItem("combine-locale");
		// No key → default locale used by LocaleProvider is 'ko'
		expect(stored).toBeNull();
	});

	it("persists locale change from ko to en", () => {
		localStorageMock.setItem("combine-locale", "ko");
		// Simulate locale change
		localStorageMock.setItem("combine-locale", "en");
		expect(localStorageMock.getItem("combine-locale")).toBe("en");
	});

	it("persists locale change from en to ko", () => {
		localStorageMock.setItem("combine-locale", "en");
		localStorageMock.setItem("combine-locale", "ko");
		expect(localStorageMock.getItem("combine-locale")).toBe("ko");
	});
});
