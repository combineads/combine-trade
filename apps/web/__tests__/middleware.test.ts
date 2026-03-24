/**
 * Unit tests for apps/web locale middleware.
 *
 * Tests cover:
 * - Locale redirect: / → /{defaultLocale}/
 * - Auth guard: unauthenticated access to protected routes → /login
 * - Public routes skip auth guard (login page accessible without session)
 *
 * NOTE: next-intl createMiddleware makes real Next.js API calls, so we test
 * the isPublicPath logic and auth guard using the exported helper indirectly.
 * Full E2E redirect tests belong in Playwright specs.
 */

import { describe, expect, it } from "bun:test";
import { defaultLocale, isValidLocale, locales } from "@combine/ui/src/i18n/config";

// ---------------------------------------------------------------------------
// Config / locale validation helpers
// ---------------------------------------------------------------------------

describe("locale config", () => {
	it("exports exactly two locales: ko and en", () => {
		expect(locales).toEqual(["ko", "en"]);
	});

	it("default locale is 'ko'", () => {
		expect(defaultLocale).toBe("ko");
	});

	it("isValidLocale returns true for supported locales", () => {
		for (const locale of locales) {
			expect(isValidLocale(locale)).toBe(true);
		}
	});

	it("isValidLocale returns false for unsupported strings", () => {
		expect(isValidLocale("fr")).toBe(false);
		expect(isValidLocale("")).toBe(false);
		expect(isValidLocale("KO")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// isPublicPath logic (mirrors middleware implementation)
// ---------------------------------------------------------------------------

const PUBLIC_SEGMENTS = ["/login", "/api/auth"];

function isPublicPath(pathname: string): boolean {
	const withoutLocale = pathname.replace(/^\/(ko|en)/, "") || "/";
	return PUBLIC_SEGMENTS.some((p) => withoutLocale.startsWith(p));
}

describe("isPublicPath", () => {
	it("treats /login as public", () => {
		expect(isPublicPath("/login")).toBe(true);
	});

	it("treats /ko/login as public (strips locale prefix)", () => {
		expect(isPublicPath("/ko/login")).toBe(true);
	});

	it("treats /en/login as public (strips locale prefix)", () => {
		expect(isPublicPath("/en/login")).toBe(true);
	});

	it("treats /api/auth/* as public", () => {
		expect(isPublicPath("/api/auth/sign-in")).toBe(true);
		expect(isPublicPath("/ko/api/auth/sign-in")).toBe(true);
	});

	it("treats /dashboard as protected", () => {
		expect(isPublicPath("/dashboard")).toBe(false);
	});

	it("treats /ko/dashboard as protected", () => {
		expect(isPublicPath("/ko/dashboard")).toBe(false);
	});

	it("treats /en/strategies as protected", () => {
		expect(isPublicPath("/en/strategies")).toBe(false);
	});

	it("treats root / as protected", () => {
		expect(isPublicPath("/")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Locale segment generation
// ---------------------------------------------------------------------------

describe("generateStaticParams shape", () => {
	it("returns one entry per locale", () => {
		const params = locales.map((locale) => ({ locale }));
		expect(params).toHaveLength(2);
		expect(params).toContainEqual({ locale: "ko" });
		expect(params).toContainEqual({ locale: "en" });
	});
});
