import type { TokenPayload } from "./token.js";

export interface AuthGuardDeps {
	verifyToken: (token: string) => Promise<TokenPayload>;
	publicPaths: string[];
}

export interface AuthGuardResult {
	allowed: boolean;
	userId?: string;
	error?: "missing_token" | "invalid_format" | "token_expired" | "invalid_token";
}

/**
 * Create an auth guard function.
 * Returns a function that checks if a request is authenticated.
 */
export function createAuthGuard(
	deps: AuthGuardDeps,
): (path: string, authorization: string | undefined) => Promise<AuthGuardResult> {
	return async (path: string, authorization: string | undefined): Promise<AuthGuardResult> => {
		// Check public paths
		if (deps.publicPaths.some((p) => path.startsWith(p))) {
			return { allowed: true };
		}

		// Check for Authorization header
		if (!authorization) {
			return { allowed: false, error: "missing_token" };
		}

		// Validate Bearer format
		if (!authorization.startsWith("Bearer ")) {
			return { allowed: false, error: "invalid_format" };
		}

		const token = authorization.slice(7);

		// Verify token
		try {
			const payload = await deps.verifyToken(token);
			return { allowed: true, userId: payload.userId };
		} catch (err) {
			const message = (err as Error).message;
			if (message.includes("exp") && message.includes("claim")) {
				return { allowed: false, error: "token_expired" };
			}
			return { allowed: false, error: "invalid_token" };
		}
	};
}
