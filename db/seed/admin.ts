/**
 * Admin seed script.
 *
 * Creates the first admin user via injectable deps so the function is
 * unit-testable without a real database. The script entry point at the bottom
 * wires in real DB dependencies when run directly via `bun run db:seed:admin`.
 *
 * Idempotent: if the admin email already exists, the script exits early.
 *
 * Environment variables:
 *   ADMIN_EMAIL    — defaults to "admin@combine.trade"
 *   ADMIN_PASSWORD — defaults to "changeme-on-first-login"
 *   ADMIN_NAME     — defaults to "Admin"
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AdminSeedConfig {
	email: string;
	password: string;
	name: string;
}

export interface AdminSeedDeps {
	/** Look up a user row by email. Returns null if not found. */
	findUserByEmail(email: string): Promise<{ id: string } | null>;
	/** Insert a new user row. */
	createUser(user: { id: string; email: string; name: string }): Promise<void>;
	/** Insert a credential account row linked to the user. */
	createAccount(account: {
		userId: string;
		providerId: string;
		accountId: string;
		password: string;
	}): Promise<void>;
	/** Hash a plain-text password (Argon2id via Bun.password in production). */
	hashPassword(password: string): Promise<string>;
}

export interface AdminSeedResult {
	id: string;
	email: string;
	/** True when the user was newly created; false when it already existed. */
	created: boolean;
}

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

/** Read admin configuration from environment variables with safe defaults. */
export function getAdminConfig(): AdminSeedConfig {
	return {
		email: process.env.ADMIN_EMAIL ?? "admin@combine.trade",
		password: process.env.ADMIN_PASSWORD ?? "changeme-on-first-login",
		name: process.env.ADMIN_NAME ?? "Admin",
	};
}

// ---------------------------------------------------------------------------
// Core seed function (pure, injectable, testable)
// ---------------------------------------------------------------------------

/**
 * Provision the first admin user.
 *
 * Idempotent: returns the existing user record if the email already exists
 * without creating any new rows.
 */
export async function seedAdmin(
	config: AdminSeedConfig,
	deps: AdminSeedDeps,
): Promise<AdminSeedResult> {
	// Idempotency check — skip if already seeded
	const existing = await deps.findUserByEmail(config.email);
	if (existing) {
		return { id: existing.id, email: config.email, created: false };
	}

	// Create new admin user
	const id = crypto.randomUUID();
	const hashedPassword = await deps.hashPassword(config.password);

	await deps.createUser({ id, email: config.email, name: config.name });
	await deps.createAccount({
		userId: id,
		providerId: "credential",
		accountId: config.email,
		password: hashedPassword,
	});

	return { id, email: config.email, created: true };
}

// ---------------------------------------------------------------------------
// Script entry point — wired with real DB deps
// ---------------------------------------------------------------------------

/**
 * This block runs only when the file is executed directly via
 * `bun run db:seed:admin`. The import() is dynamic so that unit tests that
 * import only the pure functions above never trigger DB connections.
 */
if (import.meta.main) {
	const config = getAdminConfig();

	// Validate ADMIN_PASSWORD is explicitly set before running for real.
	// The default value is intentionally weak — operators must override it.
	if (!process.env.ADMIN_PASSWORD) {
		console.warn(
			"[seed:admin] ADMIN_PASSWORD is not set. " +
				"Using default placeholder 'changeme-on-first-login'. " +
				"Change this immediately after first login.",
		);
	}

	// Dynamically import DB deps to avoid loading Drizzle/Postgres in tests.
	const [{ db }, { eq }, { authUser, authAccount }] = await Promise.all([
		import("../index.js"),
		import("drizzle-orm"),
		import("../schema/better-auth.js"),
	]);

	const { hashPassword } = await import("../../packages/shared/auth/password.js");

	const deps: AdminSeedDeps = {
		findUserByEmail: async (email: string) => {
			const rows = await db
				.select({ id: authUser.id })
				.from(authUser)
				.where(eq(authUser.email, email))
				.limit(1);
			return rows[0] ?? null;
		},
		createUser: async (user) => {
			await db.insert(authUser).values({
				id: user.id,
				email: user.email,
				name: user.name,
				emailVerified: false,
			});
		},
		createAccount: async (account) => {
			await db.insert(authAccount).values({
				id: crypto.randomUUID(),
				accountId: account.accountId,
				providerId: account.providerId,
				userId: account.userId,
				password: account.password,
			});
		},
		hashPassword,
	};

	const result = await seedAdmin(config, deps);

	if (result.created) {
		console.info(`[seed:admin] Admin user created: ${result.email} (id: ${result.id})`);
	} else {
		console.info(`[seed:admin] Admin user ${result.email} already exists — skipping.`);
	}

	process.exit(0);
}
