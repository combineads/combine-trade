import type { AuthLike } from "../../src/server.js";

export const TEST_SECRET = "test-secret";

/**
 * Returns Authorization headers with a Bearer token.
 * Used with createMockAuth() which accepts any non-empty bearer token.
 */
export async function makeAuthHeaders(): Promise<Record<string, string>> {
	return { Authorization: "Bearer test-session-token" };
}

/**
 * Creates a minimal auth mock that accepts any Bearer token as a valid session.
 * Use this in place of a real better-auth instance in unit tests.
 */
export function createMockAuth(): AuthLike {
	return {
		handler: async (_req: Request): Promise<Response> => {
			return new Response(JSON.stringify({ error: "not implemented in tests" }), {
				status: 501,
				headers: { "content-type": "application/json" },
			});
		},
		api: {
			getSession: async (ctx: { headers: Headers }) => {
				const auth = ctx.headers.get("authorization");
				if (!auth || !auth.startsWith("Bearer ")) return null;
				const token = auth.slice(7);
				if (!token) return null;
				// Accept any non-empty bearer token as a valid session in tests
				return {
					user: { id: "user-1" },
					session: { id: "session-1" },
				};
			},
		},
	};
}
