import { describe, expect, test, mock } from "bun:test";
import {
	signAccessToken,
	signRefreshToken,
	verifyToken,
	type TokenDeps,
} from "../token.js";

const TEST_SECRET = "test-secret-key-that-is-at-least-32-chars-long!!";

function makeDeps(overrides: Partial<TokenDeps> = {}): TokenDeps {
	return {
		secret: TEST_SECRET,
		saveRefreshToken: mock(() => Promise.resolve()),
		isRefreshTokenRevoked: mock(() => Promise.resolve(false)),
		...overrides,
	};
}

describe("signAccessToken", () => {
	test("returns a signed JWT string", async () => {
		const deps = makeDeps();
		const token = await signAccessToken("user-1", deps);
		expect(typeof token).toBe("string");
		expect(token.split(".")).toHaveLength(3); // header.payload.signature
	});

	test("token contains userId claim", async () => {
		const deps = makeDeps();
		const token = await signAccessToken("user-1", deps);
		const payload = await verifyToken(token, deps);
		expect(payload.userId).toBe("user-1");
	});

	test("token has type=access", async () => {
		const deps = makeDeps();
		const token = await signAccessToken("user-1", deps);
		const payload = await verifyToken(token, deps);
		expect(payload.type).toBe("access");
	});
});

describe("signRefreshToken", () => {
	test("returns a signed JWT string", async () => {
		const deps = makeDeps();
		const token = await signRefreshToken("user-1", deps);
		expect(typeof token).toBe("string");
		expect(token.split(".")).toHaveLength(3);
	});

	test("saves refresh token to DB", async () => {
		const deps = makeDeps();
		await signRefreshToken("user-1", deps);
		expect(deps.saveRefreshToken).toHaveBeenCalledTimes(1);
	});

	test("token contains userId and type=refresh", async () => {
		const deps = makeDeps();
		const token = await signRefreshToken("user-1", deps);
		const payload = await verifyToken(token, deps);
		expect(payload.userId).toBe("user-1");
		expect(payload.type).toBe("refresh");
	});
});

describe("verifyToken", () => {
	test("verifies a valid access token", async () => {
		const deps = makeDeps();
		const token = await signAccessToken("user-1", deps);
		const payload = await verifyToken(token, deps);
		expect(payload.userId).toBe("user-1");
		expect(payload.type).toBe("access");
	});

	test("rejects token with wrong secret", async () => {
		const deps = makeDeps();
		const token = await signAccessToken("user-1", deps);

		const wrongDeps = makeDeps({ secret: "wrong-secret-key-that-is-at-least-32-chars!!" });
		await expect(verifyToken(token, wrongDeps)).rejects.toThrow();
	});

	test("rejects malformed token", async () => {
		const deps = makeDeps();
		await expect(verifyToken("not.a.token", deps)).rejects.toThrow();
	});

	test("rejects revoked refresh token", async () => {
		const deps = makeDeps({
			isRefreshTokenRevoked: mock(() => Promise.resolve(true)),
		});
		const token = await signRefreshToken("user-1", deps);
		await expect(verifyToken(token, deps)).rejects.toThrow("revoked");
	});

	test("accepts non-revoked refresh token", async () => {
		const deps = makeDeps();
		const token = await signRefreshToken("user-1", deps);
		const payload = await verifyToken(token, deps);
		expect(payload.userId).toBe("user-1");
	});
});
