/**
 * Tests for I18nProvider and i18n hooks.
 *
 * Uses bun:test with react-dom/server for SSR rendering to verify:
 * - I18nProvider renders children and supplies translation context
 * - useTranslations returns correct strings for ko and en locales
 * - useLocale returns the current locale string
 * - hooks are correctly re-exported from next-intl
 */

import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import enMessages from "../messages/en.json";
import koMessages from "../messages/ko.json";
import { I18nProvider } from "../I18nProvider";
import { useFormatter, useLocale, useTranslations } from "../hooks";

// ---------------------------------------------------------------------------
// Helper components using hooks
// ---------------------------------------------------------------------------

function CommonTranslationsDisplay() {
	const t = useTranslations("common");
	return createElement("div", null, [
		createElement("span", { "data-testid": "loading", key: "loading" }, t("status.loading")),
		createElement("span", { "data-testid": "cancel", key: "cancel" }, t("actions.cancel")),
		createElement("span", { "data-testid": "save", key: "save" }, t("actions.save")),
	]);
}

function LocaleDisplay() {
	const locale = useLocale();
	return createElement("span", { "data-testid": "locale" }, locale);
}

function NestedKeysDisplay() {
	const t = useTranslations("common");
	return createElement("div", null, [
		createElement("span", { "data-testid": "status-active", key: "status-active" }, t("status.active")),
		createElement("span", { "data-testid": "direction-long", key: "direction-long" }, t("direction.long")),
	]);
}

// ---------------------------------------------------------------------------
// renderWithI18n helper using SSR
// ---------------------------------------------------------------------------

function renderSSR(
	child: React.ReactElement,
	locale: "ko" | "en",
	messages: Record<string, unknown>,
): string {
	return renderToString(
		createElement(
			I18nProvider,
			{ locale, messages },
			child,
		),
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("I18nProvider", () => {
	it("renders children without error", () => {
		const html = renderSSR(
			createElement("div", { "data-testid": "child" }, "hello"),
			"ko",
			koMessages as Record<string, unknown>,
		);
		expect(html).toContain("hello");
	});

	it("provides ko translations via useTranslations", () => {
		const html = renderSSR(
			createElement(CommonTranslationsDisplay),
			"ko",
			koMessages as Record<string, unknown>,
		);
		expect(html).toContain(koMessages.common.status.loading);
		expect(html).toContain(koMessages.common.actions.cancel);
		expect(html).toContain(koMessages.common.actions.save);
	});

	it("provides en translations via useTranslations", () => {
		const html = renderSSR(
			createElement(CommonTranslationsDisplay),
			"en",
			enMessages as Record<string, unknown>,
		);
		expect(html).toContain(enMessages.common.status.loading);
		expect(html).toContain(enMessages.common.actions.cancel);
		expect(html).toContain(enMessages.common.actions.save);
	});

	it("ko loading text is '로딩 중'", () => {
		const html = renderSSR(
			createElement(CommonTranslationsDisplay),
			"ko",
			koMessages as Record<string, unknown>,
		);
		expect(html).toContain("로딩 중");
	});

	it("en loading text is 'Loading'", () => {
		const html = renderSSR(
			createElement(CommonTranslationsDisplay),
			"en",
			enMessages as Record<string, unknown>,
		);
		expect(html).toContain("Loading");
	});

	it("accepts optional timeZone prop without error", () => {
		const html = renderToString(
			createElement(
				I18nProvider,
				{
					locale: "en",
					messages: enMessages as Record<string, unknown>,
					timeZone: "Asia/Seoul",
				},
				createElement(CommonTranslationsDisplay),
			),
		);
		expect(html).toContain("Loading");
	});
});

describe("useLocale", () => {
	it("returns 'ko' when wrapped with ko I18nProvider", () => {
		const html = renderSSR(
			createElement(LocaleDisplay),
			"ko",
			koMessages as Record<string, unknown>,
		);
		expect(html).toContain("ko");
	});

	it("returns 'en' when wrapped with en I18nProvider", () => {
		const html = renderSSR(
			createElement(LocaleDisplay),
			"en",
			enMessages as Record<string, unknown>,
		);
		expect(html).toContain("en");
	});
});

describe("nested keys via useTranslations", () => {
	it("resolves common.status.active in ko", () => {
		const html = renderSSR(
			createElement(NestedKeysDisplay),
			"ko",
			koMessages as Record<string, unknown>,
		);
		expect(html).toContain("활성");
	});

	it("resolves common.direction.long as LONG (domain standard)", () => {
		const html = renderSSR(
			createElement(NestedKeysDisplay),
			"ko",
			koMessages as Record<string, unknown>,
		);
		expect(html).toContain("LONG");
	});

	it("resolves common.status.active in en", () => {
		const html = renderSSR(
			createElement(NestedKeysDisplay),
			"en",
			enMessages as Record<string, unknown>,
		);
		expect(html).toContain("Active");
	});
});
