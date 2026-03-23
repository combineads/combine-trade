import { Elysia } from "elysia";
import type { AuthLike } from "../../src/server.js";

export const TEST_SECRET = "test-secret";
export const TEST_USER_ID = "user-1";

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
					user: { id: TEST_USER_ID },
					session: { id: "session-1" },
				};
			},
		},
	};
}

/**
 * Elysia plugin that injects a `userId` into context for route unit tests.
 * Use this when testing route handlers in isolation (without the full server),
 * to simulate the userId that betterAuthPlugin derives globally in production.
 */
export function withMockUserId(userId: string = TEST_USER_ID) {
	return new Elysia({ name: `mock-user-id-${userId}` }).derive({ as: "global" }, () => ({
		userId,
	}));
}
