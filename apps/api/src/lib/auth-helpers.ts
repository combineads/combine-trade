import type { AuthLike } from "../server.js";

/** The resolved session shape returned by better-auth's getSession. */
export interface ResolvedSession {
	user: { id: string };
}

/**
 * Resolve the better-auth session from a raw Request.
 *
 * Resolution order:
 *   1. Authorization: Bearer <token> header
 *   2. Cookie header (better-auth's session cookie)
 *
 * Returns null when no valid session is found.
 *
 * The function delegates entirely to `auth.api.getSession` — it does not
 * parse tokens itself. The request headers are forwarded as-is so that
 * better-auth's own resolution logic (Bearer > cookie precedence) applies.
 */
export async function requireSession(
	request: Request,
	auth: AuthLike,
): Promise<ResolvedSession | null> {
	return auth.api.getSession({ headers: request.headers });
}
