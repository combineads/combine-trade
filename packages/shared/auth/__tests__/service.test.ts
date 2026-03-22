import { describe, expect, test, mock } from "bun:test";
import {
	AuthService,
	type AuthServiceDeps,
	type AuthUser,
} from "../service.js";

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
	return {
		id: "user-1",
		email: "admin@combine.trade",
		passwordHash: "$argon2id$hashed",
		...overrides,
	};
}

function makeDeps(overrides: Partial<AuthServiceDeps> = {}): AuthServiceDeps {
	return {
		findUserByEmail: mock(() => Promise.resolve(makeUser())),
		comparePassword: mock(() => Promise.resolve(true)),
		signAccessToken: mock(() => Promise.resolve("access-jwt")),
		signRefreshToken: mock(() => Promise.resolve("refresh-jwt")),
		verifyRefreshToken: mock(() =>
			Promise.resolve({ userId: "user-1", type: "refresh" as const, jti: "jti-1" }),
		),
		revokeRefreshToken: mock(() => Promise.resolve()),
		...overrides,
	};
}

describe("AuthService.login", () => {
	test("returns tokens on valid credentials", async () => {
		const deps = makeDeps();
		const svc = new AuthService(deps);

		const result = await svc.login("admin@combine.trade", "correct-password");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.accessToken).toBe("access-jwt");
			expect(result.refreshToken).toBe("refresh-jwt");
		}
	});

	test("calls findUserByEmail with given email", async () => {
		const deps = makeDeps();
		const svc = new AuthService(deps);

		await svc.login("admin@combine.trade", "pw");
		expect(deps.findUserByEmail).toHaveBeenCalledWith("admin@combine.trade");
	});

	test("returns error when user not found", async () => {
		const deps = makeDeps({
			findUserByEmail: mock(() => Promise.resolve(null)),
		});
		const svc = new AuthService(deps);

		const result = await svc.login("unknown@test.com", "pw");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("invalid_credentials");
		}
	});

	test("returns error when password is wrong", async () => {
		const deps = makeDeps({
			comparePassword: mock(() => Promise.resolve(false)),
		});
		const svc = new AuthService(deps);

		const result = await svc.login("admin@combine.trade", "wrong");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("invalid_credentials");
		}
	});

	test("uses same error for user-not-found and wrong-password", async () => {
		const deps1 = makeDeps({ findUserByEmail: mock(() => Promise.resolve(null)) });
		const deps2 = makeDeps({ comparePassword: mock(() => Promise.resolve(false)) });
		const svc1 = new AuthService(deps1);
		const svc2 = new AuthService(deps2);

		const r1 = await svc1.login("x@y.com", "pw");
		const r2 = await svc2.login("admin@combine.trade", "wrong");
		expect(r1.ok).toBe(false);
		expect(r2.ok).toBe(false);
		if (!r1.ok && !r2.ok) {
			expect(r1.error).toBe(r2.error);
		}
	});

	test("signs tokens with user id", async () => {
		const deps = makeDeps();
		const svc = new AuthService(deps);

		await svc.login("admin@combine.trade", "pw");
		expect(deps.signAccessToken).toHaveBeenCalledWith("user-1");
		expect(deps.signRefreshToken).toHaveBeenCalledWith("user-1");
	});
});

describe("AuthService.refresh", () => {
	test("returns new access token on valid refresh token", async () => {
		const deps = makeDeps();
		const svc = new AuthService(deps);

		const result = await svc.refresh("valid-refresh-token");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.accessToken).toBe("access-jwt");
		}
	});

	test("verifies the refresh token", async () => {
		const deps = makeDeps();
		const svc = new AuthService(deps);

		await svc.refresh("some-token");
		expect(deps.verifyRefreshToken).toHaveBeenCalledWith("some-token");
	});

	test("returns error when refresh token is invalid", async () => {
		const deps = makeDeps({
			verifyRefreshToken: mock(() => Promise.reject(new Error("invalid"))),
		});
		const svc = new AuthService(deps);

		const result = await svc.refresh("bad-token");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("invalid_token");
		}
	});

	test("signs new access token with userId from refresh payload", async () => {
		const deps = makeDeps({
			verifyRefreshToken: mock(() =>
				Promise.resolve({ userId: "user-42", type: "refresh" as const, jti: "jti-x" }),
			),
		});
		const svc = new AuthService(deps);

		await svc.refresh("tok");
		expect(deps.signAccessToken).toHaveBeenCalledWith("user-42");
	});
});

describe("AuthService.logout", () => {
	test("revokes the refresh token jti", async () => {
		const deps = makeDeps();
		const svc = new AuthService(deps);

		const result = await svc.logout("valid-refresh-token");
		expect(result.ok).toBe(true);
		expect(deps.verifyRefreshToken).toHaveBeenCalledWith("valid-refresh-token");
		expect(deps.revokeRefreshToken).toHaveBeenCalledWith("jti-1");
	});

	test("returns error when token is invalid", async () => {
		const deps = makeDeps({
			verifyRefreshToken: mock(() => Promise.reject(new Error("bad"))),
		});
		const svc = new AuthService(deps);

		const result = await svc.logout("bad-token");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("invalid_token");
		}
	});

	test("returns error when jti is missing", async () => {
		const deps = makeDeps({
			verifyRefreshToken: mock(() =>
				Promise.resolve({ userId: "user-1", type: "refresh" as const }),
			),
		});
		const svc = new AuthService(deps);

		const result = await svc.logout("tok");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("invalid_token");
		}
	});
});
