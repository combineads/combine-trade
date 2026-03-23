import { describe, expect, test } from "bun:test";
import {
	type AdminSeedConfig,
	type AdminSeedDeps,
	getAdminConfig,
	seedAdmin,
} from "../seed/admin.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides?: Partial<AdminSeedDeps>): AdminSeedDeps & {
	users: Map<string, { id: string; email: string; name: string }>;
	accounts: Array<{ userId: string; providerId: string; accountId: string; password: string }>;
} {
	const users = new Map<string, { id: string; email: string; name: string }>();
	const accounts: Array<{
		userId: string;
		providerId: string;
		accountId: string;
		password: string;
	}> = [];

	return {
		users,
		accounts,
		findUserByEmail: async (email: string) => users.get(email) ?? null,
		createUser: async (user) => {
			users.set(user.email, user);
		},
		createAccount: async (account) => {
			accounts.push(account);
		},
		hashPassword: async (password: string) => `hashed:${password}`,
		...overrides,
	};
}

const baseConfig: AdminSeedConfig = {
	email: "admin@combine.trade",
	password: "changeme-on-first-login",
	name: "Admin",
};

// ---------------------------------------------------------------------------
// Tests: seed function return value
// ---------------------------------------------------------------------------

describe("seedAdmin — return value", () => {
	test("returns admin user record with id and email on creation", async () => {
		const deps = makeDeps();
		const result = await seedAdmin(baseConfig, deps);

		expect(result.id).toBeString();
		expect(result.id.length).toBeGreaterThan(0);
		expect(result.email).toBe(baseConfig.email);
		expect(result.created).toBe(true);
	});

	test("created flag is true when a new user is seeded", async () => {
		const deps = makeDeps();
		const result = await seedAdmin(baseConfig, deps);
		expect(result.created).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Tests: idempotency
// ---------------------------------------------------------------------------

describe("seedAdmin — idempotency", () => {
	test("second call returns the same user id without re-creating", async () => {
		const deps = makeDeps();

		const first = await seedAdmin(baseConfig, deps);
		const second = await seedAdmin(baseConfig, deps);

		expect(second.id).toBe(first.id);
		expect(second.email).toBe(first.email);
	});

	test("second call returns created: false", async () => {
		const deps = makeDeps();
		await seedAdmin(baseConfig, deps);
		const second = await seedAdmin(baseConfig, deps);
		expect(second.created).toBe(false);
	});

	test("second call does not insert a duplicate user row", async () => {
		const deps = makeDeps();
		await seedAdmin(baseConfig, deps);
		await seedAdmin(baseConfig, deps);
		// Only one entry in the users map
		expect(deps.users.size).toBe(1);
	});

	test("second call does not insert a duplicate account row", async () => {
		const deps = makeDeps();
		await seedAdmin(baseConfig, deps);
		await seedAdmin(baseConfig, deps);
		// Only one account created
		expect(deps.accounts.length).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Tests: env var configuration
// ---------------------------------------------------------------------------

describe("getAdminConfig — env var fallbacks", () => {
	test("falls back to default email when ADMIN_EMAIL is unset", () => {
		process.env.ADMIN_EMAIL = undefined;
		process.env.ADMIN_PASSWORD = undefined;
		process.env.ADMIN_NAME = undefined;

		const config = getAdminConfig();
		expect(config.email).toBe("admin@combine.trade");
	});

	test("falls back to default name when ADMIN_NAME is unset", () => {
		process.env.ADMIN_NAME = undefined;
		const config = getAdminConfig();
		expect(config.name).toBe("Admin");
	});

	test("falls back to default password when ADMIN_PASSWORD is unset", () => {
		process.env.ADMIN_PASSWORD = undefined;
		const config = getAdminConfig();
		expect(config.password).toBe("changeme-on-first-login");
	});

	test("uses ADMIN_EMAIL env var when set", () => {
		process.env.ADMIN_EMAIL = "custom@example.com";
		const config = getAdminConfig();
		expect(config.email).toBe("custom@example.com");
		process.env.ADMIN_EMAIL = undefined;
	});

	test("uses ADMIN_NAME env var when set", () => {
		process.env.ADMIN_NAME = "CustomAdmin";
		const config = getAdminConfig();
		expect(config.name).toBe("CustomAdmin");
		process.env.ADMIN_NAME = undefined;
	});

	test("uses ADMIN_PASSWORD env var when set", () => {
		process.env.ADMIN_PASSWORD = "supersecret";
		const config = getAdminConfig();
		expect(config.password).toBe("supersecret");
		process.env.ADMIN_PASSWORD = undefined;
	});
});

// ---------------------------------------------------------------------------
// Tests: password hashing
// ---------------------------------------------------------------------------

describe("seedAdmin — password handling", () => {
	test("stored account password is the hashed value (not plaintext)", async () => {
		const deps = makeDeps();
		await seedAdmin(baseConfig, deps);

		const account = deps.accounts[0];
		expect(account).toBeDefined();
		// Our test hashPassword prepends "hashed:" — verify plaintext is NOT stored
		expect(account?.password).not.toBe(baseConfig.password);
		expect(account?.password).toBe(`hashed:${baseConfig.password}`);
	});

	test("hashPassword is called exactly once during seed", async () => {
		let callCount = 0;
		const deps = makeDeps({
			hashPassword: async (p: string) => {
				callCount++;
				return `hashed:${p}`;
			},
		});

		await seedAdmin(baseConfig, deps);
		expect(callCount).toBe(1);
	});

	test("hashPassword is NOT called on second run (idempotent path)", async () => {
		let callCount = 0;
		const deps = makeDeps({
			hashPassword: async (p: string) => {
				callCount++;
				return `hashed:${p}`;
			},
		});

		await seedAdmin(baseConfig, deps);
		callCount = 0; // reset after first seed
		await seedAdmin(baseConfig, deps);
		expect(callCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Tests: account shape
// ---------------------------------------------------------------------------

describe("seedAdmin — account creation", () => {
	test("creates a credential provider account for the admin", async () => {
		const deps = makeDeps();
		await seedAdmin(baseConfig, deps);

		const account = deps.accounts[0];
		expect(account).toBeDefined();
		expect(account?.providerId).toBe("credential");
		expect(account?.accountId).toBe(baseConfig.email);
	});

	test("account userId matches the returned user id", async () => {
		const deps = makeDeps();
		const result = await seedAdmin(baseConfig, deps);

		const account = deps.accounts[0];
		expect(account?.userId).toBe(result.id);
	});
});
