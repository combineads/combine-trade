import { describe, expect, test } from "bun:test";
import { comparePassword, hashPassword } from "../password.js";

describe("Password hashing", () => {
	test("hashPassword returns non-plaintext string", async () => {
		const hash = await hashPassword("mypassword");
		expect(hash).not.toBe("mypassword");
		expect(hash.length).toBeGreaterThan(20);
	});

	test("comparePassword returns true for correct password", async () => {
		const hash = await hashPassword("correct-password");
		const result = await comparePassword("correct-password", hash);
		expect(result).toBe(true);
	});

	test("comparePassword returns false for wrong password", async () => {
		const hash = await hashPassword("correct-password");
		const result = await comparePassword("wrong-password", hash);
		expect(result).toBe(false);
	});

	test("hashPassword produces different hashes for same input (salted)", async () => {
		const hash1 = await hashPassword("same-password");
		const hash2 = await hashPassword("same-password");
		expect(hash1).not.toBe(hash2);
	});
});
