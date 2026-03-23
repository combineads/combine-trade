import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Routes that do not require an authenticated session.
 * The /api/auth path is the better-auth handler mounted in apps/api.
 */
const PUBLIC_PATHS = ["/login", "/api/auth"];

/**
 * Session cookie name must match the `cookiePrefix` configured in
 * packages/shared/auth/better-auth.ts: cookiePrefix = "combine-trade"
 * better-auth appends ".session_token" to form the full cookie name.
 */
const SESSION_COOKIE = "combine-trade.session_token";

export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
	const hasSession = request.cookies.has(SESSION_COOKIE);

	if (!isPublic && !hasSession) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	return NextResponse.next();
}

export const config = {
	/*
	 * Match all paths except Next.js internals and static assets.
	 * _next/static, _next/image, and favicon.ico are excluded so
	 * they always load without a session check.
	 */
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
