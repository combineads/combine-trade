/**
 * Thin factory wrapper around better-auth/react createAuthClient.
 *
 * This module lives in packages/ui so that both apps/web and apps/desktop
 * can create auth clients with a consistent interface. The actual client
 * instance (bound to baseURL from env vars) must be created in each app
 * and injected into the AuthProvider via the `authClient` prop.
 *
 * Why a wrapper: better-auth/react's createAuthClient returns a richly-typed
 * object that is hard to mock in tests. This factory exposes only the surface
 * we need and provides a stable type for dependency injection.
 */
import { createAuthClient as _createAuthClient } from "better-auth/react";

export interface BetterAuthClientOptions {
	/** Full URL of the API server, e.g. process.env.NEXT_PUBLIC_API_URL */
	baseURL: string;
}

/** The subset of the better-auth client used by packages/ui */
export interface BetterAuthClientInstance {
	signIn: ReturnType<typeof _createAuthClient>["signIn"];
	signOut: ReturnType<typeof _createAuthClient>["signOut"];
	useSession: ReturnType<typeof _createAuthClient>["useSession"];
	getSession: ReturnType<typeof _createAuthClient>["getSession"];
}

/**
 * Create a better-auth React client instance.
 *
 * Call this once at app startup (e.g. apps/web/src/lib/auth-client.ts) and
 * pass the result to AuthProvider via the `authClient` prop.
 */
export function createBetterAuthClient(options: BetterAuthClientOptions): BetterAuthClientInstance {
	const client = _createAuthClient({ baseURL: options.baseURL });
	return {
		signIn: client.signIn,
		signOut: client.signOut,
		useSession: client.useSession,
		getSession: client.getSession,
	};
}
