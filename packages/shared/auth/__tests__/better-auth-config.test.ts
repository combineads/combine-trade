import { describe, expect, test } from "bun:test";
import {
	authAccount,
	authSession,
	authUser,
	authVerification,
} from "../../../../db/schema/better-auth.js";

// We cannot import the full createAuth() factory in unit tests because it
// requires a live Drizzle database adapter. Instead we validate:
//   1. The schema table exports are structurally correct.
//   2. Each required column exists on each table's "columns" descriptor.

describe("better-auth schema tables", () => {
	test("authUser table is exported and named 'user'", () => {
		// biome-ignore lint/suspicious/noExplicitAny: runtime introspection
		const table = authUser as any;
		expect(table[Symbol.for("drizzle:Name")]).toBe("user");
	});

	test("authSession table is exported and named 'session'", () => {
		// biome-ignore lint/suspicious/noExplicitAny: runtime introspection
		const table = authSession as any;
		expect(table[Symbol.for("drizzle:Name")]).toBe("session");
	});

	test("authAccount table is exported and named 'account'", () => {
		// biome-ignore lint/suspicious/noExplicitAny: runtime introspection
		const table = authAccount as any;
		expect(table[Symbol.for("drizzle:Name")]).toBe("account");
	});

	test("authVerification table is exported and named 'verification'", () => {
		// biome-ignore lint/suspicious/noExplicitAny: runtime introspection
		const table = authVerification as any;
		expect(table[Symbol.for("drizzle:Name")]).toBe("verification");
	});

	test("authUser has required columns: id, name, email, emailVerified, createdAt, updatedAt", () => {
		// biome-ignore lint/suspicious/noExplicitAny: runtime introspection
		const columns = Object.keys((authUser as any)[Symbol.for("drizzle:Columns")]);
		expect(columns).toContain("id");
		expect(columns).toContain("name");
		expect(columns).toContain("email");
		expect(columns).toContain("emailVerified");
		expect(columns).toContain("createdAt");
		expect(columns).toContain("updatedAt");
	});

	test("authSession has required columns: id, expiresAt, token, userId, createdAt, updatedAt", () => {
		// biome-ignore lint/suspicious/noExplicitAny: runtime introspection
		const columns = Object.keys((authSession as any)[Symbol.for("drizzle:Columns")]);
		expect(columns).toContain("id");
		expect(columns).toContain("expiresAt");
		expect(columns).toContain("token");
		expect(columns).toContain("userId");
		expect(columns).toContain("createdAt");
		expect(columns).toContain("updatedAt");
	});

	test("authAccount has required columns: id, accountId, providerId, userId, password, createdAt, updatedAt", () => {
		// biome-ignore lint/suspicious/noExplicitAny: runtime introspection
		const columns = Object.keys((authAccount as any)[Symbol.for("drizzle:Columns")]);
		expect(columns).toContain("id");
		expect(columns).toContain("accountId");
		expect(columns).toContain("providerId");
		expect(columns).toContain("userId");
		expect(columns).toContain("password");
		expect(columns).toContain("createdAt");
		expect(columns).toContain("updatedAt");
	});

	test("authVerification has required columns: id, identifier, value, expiresAt, createdAt", () => {
		// biome-ignore lint/suspicious/noExplicitAny: runtime introspection
		const columns = Object.keys((authVerification as any)[Symbol.for("drizzle:Columns")]);
		expect(columns).toContain("id");
		expect(columns).toContain("identifier");
		expect(columns).toContain("value");
		expect(columns).toContain("expiresAt");
		expect(columns).toContain("createdAt");
	});
});

describe("createAuth factory", () => {
	test("createAuth is importable and is a function", async () => {
		const { createAuth } = await import("../better-auth.js");
		expect(typeof createAuth).toBe("function");
	});

	test("createAuth accepts BetterAuthConfig interface (shape check only)", async () => {
		// We only verify the factory signature at the type level — we do not call
		// createAuth() here because better-auth asynchronously validates the DB
		// adapter, which would throw with a mock object. The factory shape is
		// validated by the TypeScript compiler during `bun run typecheck`.
		const { createAuth } = await import("../better-auth.js");
		// Verify the function has the correct arity
		expect(createAuth.length).toBe(1);
	});
});
