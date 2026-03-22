import { describe, expect, test } from "bun:test";
import { decrypt, encrypt } from "../encryption.js";

const MASTER_KEY = "test-master-key-for-encryption-32chars!";

describe("AES-256-GCM encryption", () => {
	test("encrypt returns base64 string", async () => {
		const result = await encrypt("my-api-key", MASTER_KEY);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
		// Base64 doesn't contain the original plaintext
		expect(result).not.toContain("my-api-key");
	});

	test("decrypt recovers original plaintext", async () => {
		const plaintext = "super-secret-api-key-12345";
		const encrypted = await encrypt(plaintext, MASTER_KEY);
		const decrypted = await decrypt(encrypted, MASTER_KEY);
		expect(decrypted).toBe(plaintext);
	});

	test("different encryptions produce different ciphertexts (unique IV)", async () => {
		const plaintext = "same-text";
		const enc1 = await encrypt(plaintext, MASTER_KEY);
		const enc2 = await encrypt(plaintext, MASTER_KEY);
		expect(enc1).not.toBe(enc2);

		// Both decrypt to the same plaintext
		expect(await decrypt(enc1, MASTER_KEY)).toBe(plaintext);
		expect(await decrypt(enc2, MASTER_KEY)).toBe(plaintext);
	});

	test("wrong master key fails to decrypt", async () => {
		const encrypted = await encrypt("secret", MASTER_KEY);
		try {
			await decrypt(encrypted, "wrong-key-that-is-also-32-chars!");
			expect(true).toBe(false); // should not reach
		} catch (err) {
			expect(err).toBeDefined();
		}
	});

	test("tampered ciphertext fails to decrypt", async () => {
		const encrypted = await encrypt("secret", MASTER_KEY);
		// Flip a character in the middle
		const tampered = `${encrypted.slice(0, 20)}X${encrypted.slice(21)}`;
		try {
			await decrypt(tampered, MASTER_KEY);
			expect(true).toBe(false);
		} catch (err) {
			expect(err).toBeDefined();
		}
	});

	test("handles empty string", async () => {
		const encrypted = await encrypt("", MASTER_KEY);
		const decrypted = await decrypt(encrypted, MASTER_KEY);
		expect(decrypted).toBe("");
	});

	test("handles unicode content", async () => {
		const plaintext = "API키-テスト-🔑";
		const encrypted = await encrypt(plaintext, MASTER_KEY);
		const decrypted = await decrypt(encrypted, MASTER_KEY);
		expect(decrypted).toBe(plaintext);
	});

	test("handles long API secret", async () => {
		const longSecret = "a".repeat(1024);
		const encrypted = await encrypt(longSecret, MASTER_KEY);
		const decrypted = await decrypt(encrypted, MASTER_KEY);
		expect(decrypted).toBe(longSecret);
	});
});
