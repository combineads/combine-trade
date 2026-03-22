import { betterAuth } from "better-auth";

/**
 * Configuration shape for the better-auth instance factory.
 *
 * The `database` property accepts a Drizzle adapter instance injected at
 * runtime so that `packages/shared` does not hold a direct reference to the
 * database singleton (which lives in `db/`). Callers (apps/api) construct the
 * adapter and pass it here.
 *
 * Example (in apps/api):
 *   import { drizzleAdapter } from "better-auth/adapters/drizzle";
 *   import { db } from "../../db/index.js";
 *   import { createAuth } from "packages/shared/auth/better-auth.js";
 *
 *   export const auth = createAuth({
 *     database: drizzleAdapter(db, { provider: "pg" }),
 *     trustedOrigins: [process.env.ALLOWED_ORIGIN ?? "http://localhost:3001"],
 *   });
 */
export interface BetterAuthConfig {
	/** Drizzle adapter instance (or any object accepted by better-auth's `database` option). */
	database: unknown;
	/** Origins permitted to include credentials. Defaults to localhost dev port. */
	trustedOrigins?: string[];
}

/**
 * Create and return a better-auth instance.
 *
 * This is the single export point for the better-auth instance in the codebase.
 * `packages/core` MUST NOT import this module (domain isolation rule).
 */
export function createAuth(config: BetterAuthConfig) {
	return betterAuth({
		// biome-ignore lint/suspicious/noExplicitAny: better-auth accepts any adapter-compatible value
		database: config.database as any,
		emailAndPassword: { enabled: true },
		advanced: {
			cookiePrefix: "combine-trade",
			generateId: () => crypto.randomUUID(),
		},
		trustedOrigins: config.trustedOrigins ?? ["http://localhost:3001"],
	});
}

/** Convenience type alias for the auth instance returned by `createAuth`. */
export type Auth = ReturnType<typeof createAuth>;
