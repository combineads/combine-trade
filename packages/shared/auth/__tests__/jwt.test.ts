import { describe, expect, test } from "bun:test";
import { decodeToken, signAccessToken, signRefreshToken, verifyToken } from "../jwt.js";
import type { JwtPayload } from "../types.js";

const SECRET = "test-secret-key-at-least-32-chars-long";
const payload: JwtPayload = { sub: "user-1", role: "admin" };

describe("JWT", () => {
	test("signAccessToken returns non-empty string", async () => {
		const token = await signAccessToken(payload, SECRET);
		expect(token).toBeTruthy();
		expect(typeof token).toBe("string");
		expect(token.split(".")).toHaveLength(3);
	});

	test("verifyToken returns correct payload", async () => {
		const token = await signAccessToken(payload, SECRET);
		const result = await verifyToken(token, SECRET);
		expect(result.sub).toBe("user-1");
		expect(result.role).toBe("admin");
		expect(result.iat).toBeDefined();
		expect(result.exp).toBeDefined();
	});

	test("verifyToken throws for wrong secret", async () => {
		const token = await signAccessToken(payload, SECRET);
		try {
			await verifyToken(token, "wrong-secret-key-that-is-different");
			expect(true).toBe(false); // should not reach
		} catch (err: unknown) {
			const e = err as { status: number; code: string };
			expect(e.status).toBe(401);
			expect(e.code).toBe("INVALID_TOKEN");
		}
	});

	test("verifyToken throws for expired token", async () => {
		const token = await signAccessToken(payload, SECRET, "0s");
		// Wait a tiny bit to ensure expiry
		await new Promise((r) => setTimeout(r, 10));
		try {
			await verifyToken(token, SECRET);
			expect(true).toBe(false);
		} catch (err: unknown) {
			const e = err as { status: number; code: string };
			expect(e.status).toBe(401);
			expect(e.code).toBe("INVALID_TOKEN");
		}
	});

	test("decodeToken returns payload without verification", async () => {
		const token = await signAccessToken(payload, SECRET);
		const result = decodeToken(token);
		expect(result).not.toBeNull();
		expect(result!.sub).toBe("user-1");
		expect(result!.role).toBe("admin");
	});

	test("decodeToken returns null for garbage", () => {
		expect(decodeToken("not-a-jwt")).toBeNull();
		expect(decodeToken("")).toBeNull();
	});

	test("signRefreshToken differs from access token", async () => {
		const access = await signAccessToken(payload, SECRET);
		const refresh = await signRefreshToken(payload, SECRET);
		expect(access).not.toBe(refresh);

		const decoded = decodeToken(refresh);
		expect(decoded).not.toBeNull();
	});
});
