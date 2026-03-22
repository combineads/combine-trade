import { describe, expect, test, mock } from "bun:test";
import {
	createAuthGuard,
	type AuthGuardDeps,
	type AuthGuardResult,
} from "../middleware.js";

function makeDeps(overrides: Partial<AuthGuardDeps> = {}): AuthGuardDeps {
	return {
		verifyToken: mock(() =>
			Promise.resolve({ userId: "user-1", type: "access" as const }),
		),
		publicPaths: ["/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/health"],
		...overrides,
	};
}

describe("createAuthGuard", () => {
	test("allows public paths without token", async () => {
		const deps = makeDeps();
		const guard = createAuthGuard(deps);

		const result = await guard("/api/v1/health", undefined);
		expect(result.allowed).toBe(true);
		expect(deps.verifyToken).not.toHaveBeenCalled();
	});

	test("allows /api/v1/auth/login without token", async () => {
		const deps = makeDeps();
		const guard = createAuthGuard(deps);

		const result = await guard("/api/v1/auth/login", undefined);
		expect(result.allowed).toBe(true);
	});

	test("rejects protected path without token", async () => {
		const deps = makeDeps();
		const guard = createAuthGuard(deps);

		const result = await guard("/api/v1/strategies", undefined);
		expect(result.allowed).toBe(false);
		expect(result.error).toBe("missing_token");
	});

	test("rejects protected path with invalid Bearer format", async () => {
		const deps = makeDeps();
		const guard = createAuthGuard(deps);

		const result = await guard("/api/v1/strategies", "NotBearer token");
		expect(result.allowed).toBe(false);
		expect(result.error).toBe("invalid_format");
	});

	test("allows protected path with valid token", async () => {
		const deps = makeDeps();
		const guard = createAuthGuard(deps);

		const result = await guard("/api/v1/strategies", "Bearer valid-token");
		expect(result.allowed).toBe(true);
		expect(result.userId).toBe("user-1");
	});

	test("rejects with token_expired when verification throws expired error", async () => {
		const deps = makeDeps({
			verifyToken: mock(() => Promise.reject(new Error('"exp" claim timestamp check failed'))),
		});
		const guard = createAuthGuard(deps);

		const result = await guard("/api/v1/strategies", "Bearer expired-token");
		expect(result.allowed).toBe(false);
		expect(result.error).toBe("token_expired");
	});

	test("rejects with invalid_token on other verification errors", async () => {
		const deps = makeDeps({
			verifyToken: mock(() => Promise.reject(new Error("signature mismatch"))),
		});
		const guard = createAuthGuard(deps);

		const result = await guard("/api/v1/strategies", "Bearer bad-token");
		expect(result.allowed).toBe(false);
		expect(result.error).toBe("invalid_token");
	});

	test("rejects revoked token", async () => {
		const deps = makeDeps({
			verifyToken: mock(() => Promise.reject(new Error("Token has been revoked"))),
		});
		const guard = createAuthGuard(deps);

		const result = await guard("/api/v1/strategies", "Bearer revoked-token");
		expect(result.allowed).toBe(false);
		expect(result.error).toBe("invalid_token");
	});

	test("passes token string to verifyToken", async () => {
		const deps = makeDeps();
		const guard = createAuthGuard(deps);

		await guard("/api/v1/strategies", "Bearer my-jwt-token");
		expect(deps.verifyToken).toHaveBeenCalledWith("my-jwt-token");
	});
});
