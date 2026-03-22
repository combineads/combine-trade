import { describe, expect, test, mock } from "bun:test";
import {
	encrypt,
	decrypt,
	maskApiKey,
	type CredentialServiceDeps,
	CredentialService,
} from "../encryption.js";

// 32-byte hex key (64 hex chars)
const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("encrypt / decrypt", () => {
	test("roundtrip produces original plaintext", () => {
		const plaintext = "sk-live-abc123secretkey";
		const encrypted = encrypt(plaintext, TEST_KEY);
		const decrypted = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.tag, TEST_KEY);
		expect(decrypted).toBe(plaintext);
	});

	test("different IVs for same plaintext", () => {
		const plaintext = "same-key";
		const e1 = encrypt(plaintext, TEST_KEY);
		const e2 = encrypt(plaintext, TEST_KEY);
		expect(e1.iv).not.toBe(e2.iv);
	});

	test("wrong master key fails decryption", () => {
		const encrypted = encrypt("secret", TEST_KEY);
		const wrongKey = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
		expect(() => decrypt(encrypted.ciphertext, encrypted.iv, encrypted.tag, wrongKey)).toThrow();
	});

	test("tampered ciphertext fails decryption", () => {
		const encrypted = encrypt("secret", TEST_KEY);
		// Flip a character in the ciphertext
		const tampered = encrypted.ciphertext.slice(0, -2) + "ff";
		expect(() => decrypt(tampered, encrypted.iv, encrypted.tag, TEST_KEY)).toThrow();
	});

	test("tampered auth tag fails decryption", () => {
		const encrypted = encrypt("secret", TEST_KEY);
		const tampered = encrypted.tag.slice(0, -2) + "ff";
		expect(() => decrypt(encrypted.ciphertext, encrypted.iv, tampered, TEST_KEY)).toThrow();
	});

	test("handles empty string", () => {
		const encrypted = encrypt("", TEST_KEY);
		const decrypted = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.tag, TEST_KEY);
		expect(decrypted).toBe("");
	});

	test("handles unicode content", () => {
		const plaintext = "키-시크릿-🔑";
		const encrypted = encrypt(plaintext, TEST_KEY);
		const decrypted = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.tag, TEST_KEY);
		expect(decrypted).toBe(plaintext);
	});
});

describe("maskApiKey", () => {
	test("masks middle of key", () => {
		expect(maskApiKey("sk-live-abcdefgh1234")).toBe("sk-****1234");
	});

	test("masks short key", () => {
		expect(maskApiKey("abc1234")).toBe("abc****1234");
	});

	test("handles very short key (< 7 chars)", () => {
		expect(maskApiKey("abcd")).toBe("****");
	});

	test("preserves first 3 and last 4 chars for normal keys", () => {
		const masked = maskApiKey("0123456789");
		expect(masked.startsWith("012")).toBe(true);
		expect(masked.endsWith("6789")).toBe(true);
		expect(masked).toBe("012****6789");
	});
});

describe("CredentialService", () => {
	function makeDeps(overrides: Partial<CredentialServiceDeps> = {}): CredentialServiceDeps {
		return {
			masterKey: TEST_KEY,
			saveCredential: mock(() => Promise.resolve()),
			getCredential: mock(() =>
				Promise.resolve({
					id: "cred-1",
					exchangeId: "binance",
					apiKey: "encrypted-key",
					apiKeyIv: "iv1",
					apiKeyTag: "tag1",
					apiSecret: "encrypted-secret",
					apiSecretIv: "iv2",
					apiSecretTag: "tag2",
					label: "Main",
				}),
			),
			deleteCredential: mock(() => Promise.resolve()),
			listCredentials: mock(() =>
				Promise.resolve([
					{ id: "cred-1", exchangeId: "binance", label: "Main", apiKeyPreview: "sk-****1234" },
				]),
			),
			...overrides,
		};
	}

	test("save encrypts both apiKey and apiSecret", async () => {
		const deps = makeDeps();
		const svc = new CredentialService(deps);

		await svc.save("binance", "sk-live-key123", "secret-value-456", "Main");
		expect(deps.saveCredential).toHaveBeenCalledTimes(1);

		const call = (deps.saveCredential as ReturnType<typeof mock>).mock.calls[0];
		const saved = call[0] as Record<string, string>;
		expect(saved.exchangeId).toBe("binance");
		expect(saved.label).toBe("Main");
		// Encrypted values should not equal plaintext
		expect(saved.apiKey).not.toBe("sk-live-key123");
		expect(saved.apiSecret).not.toBe("secret-value-456");
		// Should have IV and tag for both
		expect(saved.apiKeyIv).toBeDefined();
		expect(saved.apiKeyTag).toBeDefined();
		expect(saved.apiSecretIv).toBeDefined();
		expect(saved.apiSecretTag).toBeDefined();
	});

	test("get decrypts both apiKey and apiSecret", async () => {
		// Set up: encrypt real values, store them, then retrieve and decrypt
		const realKey = "sk-live-real";
		const realSecret = "super-secret";
		const encKey = encrypt(realKey, TEST_KEY);
		const encSecret = encrypt(realSecret, TEST_KEY);

		const deps = makeDeps({
			getCredential: mock(() =>
				Promise.resolve({
					id: "cred-1",
					exchangeId: "binance",
					apiKey: encKey.ciphertext,
					apiKeyIv: encKey.iv,
					apiKeyTag: encKey.tag,
					apiSecret: encSecret.ciphertext,
					apiSecretIv: encSecret.iv,
					apiSecretTag: encSecret.tag,
					label: "Main",
				}),
			),
		});
		const svc = new CredentialService(deps);

		const result = await svc.get("cred-1");
		expect(result).not.toBeNull();
		if (result) {
			expect(result.apiKey).toBe(realKey);
			expect(result.apiSecret).toBe(realSecret);
		}
	});

	test("get returns null when credential not found", async () => {
		const deps = makeDeps({
			getCredential: mock(() => Promise.resolve(null)),
		});
		const svc = new CredentialService(deps);

		const result = await svc.get("nonexistent");
		expect(result).toBeNull();
	});

	test("delete delegates to deps", async () => {
		const deps = makeDeps();
		const svc = new CredentialService(deps);

		await svc.delete("cred-1");
		expect(deps.deleteCredential).toHaveBeenCalledWith("cred-1");
	});

	test("list returns masked credentials", async () => {
		const deps = makeDeps();
		const svc = new CredentialService(deps);

		const list = await svc.list();
		expect(list).toHaveLength(1);
		expect(list[0].id).toBe("cred-1");
		expect(list[0].exchangeId).toBe("binance");
	});
});
