import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";

/**
 * Session cookie name — must match `cookiePrefix` in
 * packages/shared/auth/better-auth.ts: cookiePrefix = "combine-trade"
 * better-auth appends ".session_token" to form the full cookie name.
 */
const SESSION_COOKIE = "combine-trade.session_token";

/**
 * Path segments (without locale prefix) that are publicly accessible
 * without an authenticated session.
 */
const PUBLIC_SEGMENTS = ["/login", "/api/auth"];

/** next-intl middleware: handles locale detection and path prefixing. */
const intlMiddleware = createMiddleware(routing);

/**
 * Returns true when the locale-stripped pathname matches a public route.
 * e.g. "/ko/login" → "/login" → matches PUBLIC_SEGMENTS.
 */
function isPublicPath(pathname: string): boolean {
	// Strip leading locale prefix (/ko, /en, …) before matching.
	const withoutLocale = pathname.replace(/^\/(ko|en)/, "") || "/";
	return PUBLIC_SEGMENTS.some((p) => withoutLocale.startsWith(p));
}

export function middleware(request: NextRequest): NextResponse {
	const { pathname } = request.nextUrl;

	// Let next-intl handle locale detection and redirection first.
	// This converts `/` → `/ko/` and `/dashboard` → `/ko/dashboard`, etc.
	const intlResponse = intlMiddleware(request);

	// If intl middleware issued a redirect (3xx), honour it immediately.
	if (intlResponse.status >= 300 && intlResponse.status < 400) {
		return intlResponse;
	}

	// Auth guard: redirect unauthenticated users to /login.
	if (!isPublicPath(pathname) && !request.cookies.has(SESSION_COOKIE)) {
		const locale = intlResponse.headers.get("x-next-intl-locale") ?? routing.defaultLocale;
		return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
	}

	return intlResponse;
}

export const config = {
	/*
	 * Match all paths except Next.js internals and static assets.
	 * _next/static, _next/image, and favicon.ico are excluded.
	 */
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
