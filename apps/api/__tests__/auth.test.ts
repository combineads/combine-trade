import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { signAccessToken, signRefreshToken } from "../../../packages/shared/auth/jwt.js";
import { hashPassword } from "../../../packages/shared/auth/password.js";
import { errorHandlerPlugin } from "../src/lib/errors.js";
import { ok } from "../src/lib/response.js";
import { authPlugin } from "../src/middleware/auth.js";
import { type AuthRouteDeps, type UserRecord, authRoutes } from "../src/routes/auth.js";

const ACCESS_SECRET = "test-access-secret-at-least-32-chars";
const REFRESH_SECRET = "test-refresh-secret-at-least-32-chars";

async function createTestUser(): Promise<UserRecord> {
	return {
		id: "user-1",
		username: "admin",
		passwordHash: await hashPassword("correct-password"),
		role: "admin",
	};
}

async function createMockDeps(): Promise<AuthRouteDeps> {
	const user = await createTestUser();
	return {
		accessSecret: ACCESS_SECRET,
		refreshSecret: REFRESH_SECRET,
		findUserByUsername: async (username: string) => (username === user.username ? user : null),
	};
}

async function createAuthApp() {
	const deps = await createMockDeps();
	return new Elysia().use(errorHandlerPlugin).use(authRoutes(deps));
}

const BASE = "http://localhost/api/v1/auth";

function postJson(url: string, body: Record<string, unknown>) {
	return new Request(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("Auth routes", () => {
	describe("POST /auth/login", () => {
		test("valid credentials → 200 with token pair", async () => {
			const app = await createAuthApp();
			const res = await app.handle(
				postJson(`${BASE}/login`, { username: "admin", password: "correct-password" }),
			);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data.accessToken).toBeTruthy();
			expect(body.data.refreshToken).toBeTruthy();
			expect(body.data.accessToken.split(".")).toHaveLength(3);
		});

		test("wrong password → 401", async () => {
			const app = await createAuthApp();
			const res = await app.handle(
				postJson(`${BASE}/login`, { username: "admin", password: "wrong" }),
			);
			expect(res.status).toBe(401);
			const body = JSON.parse(await res.text());
			expect(body.error.code).toBe("UNAUTHORIZED");
		});

		test("unknown user → 401", async () => {
			const app = await createAuthApp();
			const res = await app.handle(
				postJson(`${BASE}/login`, { username: "nobody", password: "anything" }),
			);
			expect(res.status).toBe(401);
		});

		test("missing body fields → 422", async () => {
			const app = await createAuthApp();
			const res = await app.handle(postJson(`${BASE}/login`, { username: "admin" }));
			expect(res.status).toBe(422);
		});
	});

	describe("POST /auth/refresh", () => {
		test("valid refresh token → 200 with new token pair", async () => {
			const app = await createAuthApp();
			const refreshToken = await signRefreshToken({ sub: "user-1", role: "admin" }, REFRESH_SECRET);
			const res = await app.handle(postJson(`${BASE}/refresh`, { refreshToken }));
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data.accessToken).toBeTruthy();
			expect(body.data.refreshToken).toBeTruthy();
		});

		test("expired refresh token → 401", async () => {
			const app = await createAuthApp();
			const refreshToken = await signRefreshToken(
				{ sub: "user-1", role: "admin" },
				REFRESH_SECRET,
				"0s",
			);
			await new Promise((r) => setTimeout(r, 10));
			const res = await app.handle(postJson(`${BASE}/refresh`, { refreshToken }));
			expect(res.status).toBe(401);
		});

		test("tampered refresh token → 401", async () => {
			const app = await createAuthApp();
			const res = await app.handle(postJson(`${BASE}/refresh`, { refreshToken: "bad.token.here" }));
			expect(res.status).toBe(401);
		});
	});

	describe("POST /auth/logout", () => {
		test("returns 200", async () => {
			const app = await createAuthApp();
			const res = await app.handle(new Request(`${BASE}/logout`, { method: "POST" }));
			expect(res.status).toBe(200);
		});
	});
});

describe("Auth middleware", () => {
	function createProtectedApp() {
		return new Elysia()
			.use(errorHandlerPlugin)
			.use(authPlugin({ accessSecret: ACCESS_SECRET }))
			.get("/protected", ({ user }) => ok(user));
	}

	test("valid token → passes with user context", async () => {
		const app = createProtectedApp();
		const token = await signAccessToken({ sub: "user-1", role: "admin" }, ACCESS_SECRET);
		const res = await app.handle(
			new Request("http://localhost/protected", {
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.sub).toBe("user-1");
		expect(body.data.role).toBe("admin");
	});

	test("missing authorization header → 401", async () => {
		const app = createProtectedApp();
		const res = await app.handle(new Request("http://localhost/protected"));
		expect(res.status).toBe(401);
		const body = JSON.parse(await res.text());
		expect(body.error.code).toBe("UNAUTHORIZED");
	});

	test("malformed token → 401", async () => {
		const app = createProtectedApp();
		const res = await app.handle(
			new Request("http://localhost/protected", {
				headers: { authorization: "Bearer invalid-token" },
			}),
		);
		expect(res.status).toBe(401);
	});

	test("expired token → 401", async () => {
		const app = createProtectedApp();
		const token = await signAccessToken({ sub: "user-1", role: "admin" }, ACCESS_SECRET, "0s");
		await new Promise((r) => setTimeout(r, 10));
		const res = await app.handle(
			new Request("http://localhost/protected", {
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		expect(res.status).toBe(401);
	});
});
