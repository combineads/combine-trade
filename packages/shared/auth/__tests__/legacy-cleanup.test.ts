import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const AUTH_DIR = join(import.meta.dir, "..");

describe("Legacy auth cleanup", () => {
	describe("deleted files must not exist", () => {
		test("jwt.ts is gone", () => {
			expect(existsSync(join(AUTH_DIR, "jwt.ts"))).toBe(false);
		});

		test("token.ts is gone", () => {
			expect(existsSync(join(AUTH_DIR, "token.ts"))).toBe(false);
		});

		test("middleware.ts is gone", () => {
			expect(existsSync(join(AUTH_DIR, "middleware.ts"))).toBe(false);
		});

		test("service.ts is gone", () => {
			expect(existsSync(join(AUTH_DIR, "service.ts"))).toBe(false);
		});

		test("types.ts is gone", () => {
			expect(existsSync(join(AUTH_DIR, "types.ts"))).toBe(false);
		});
	});

	describe("preserved files must still exist", () => {
		test("encryption.ts is present", () => {
			expect(existsSync(join(AUTH_DIR, "encryption.ts"))).toBe(true);
		});

		test("password.ts is present", () => {
			expect(existsSync(join(AUTH_DIR, "password.ts"))).toBe(true);
		});

		test("better-auth.ts is present", () => {
			expect(existsSync(join(AUTH_DIR, "better-auth.ts"))).toBe(true);
		});
	});
});
