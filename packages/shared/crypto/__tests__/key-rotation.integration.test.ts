/**
 * Integration tests for master key rotation.
 *
 * Uses real AES-256-GCM encrypt/decrypt (no mocks) to verify the full
 * rotation pipeline end-to-end.
 *
 * Key material in this file is test-only. Never use production values.
 */

import { describe, expect, test } from "bun:test";
import { decrypt, encrypt } from "../encryption.js";
import {
	type EncryptedCredentialRow,
	rotateCredentials,
	verifyAllCredentials,
} from "../key-rotation.js";

const OLD_KEY =
	"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NEW_KEY =
	"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const WRONG_KEY =
	"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

/** Helper: create N encrypted credentials with given key */
async function buildCredentials(
	count: number,
	key: string,
): Promise<{ rows: EncryptedCredentialRow[]; plaintexts: string[][] }> {
	const rows: EncryptedCredentialRow[] = [];
	const plaintexts: string[][] = [];
	for (let i = 0; i < count; i++) {
		const apiKey = `api-key-${i}-${Date.now()}`;
		const apiSecret = `api-secret-${i}-${Date.now()}`;
		rows.push({
			id: `cred-${i}`,
			apiKeyEncrypted: await encrypt(apiKey, key),
			apiSecretEncrypted: await encrypt(apiSecret, key),
		});
		plaintexts.push([apiKey, apiSecret]);
	}
	return { rows, plaintexts };
}

describe("key-rotation integration", () => {
	test("rotates 5 credentials with pre/post plaintext identity", async () => {
		const { rows, plaintexts } = await buildCredentials(5, OLD_KEY);
		let store = [...rows];

		const report = await rotateCredentials({
			oldKey: OLD_KEY,
			newKey: NEW_KEY,
			fetchAllCredentials: async () => store,
			updateCredentialsInTransaction: async (updates) => {
				store = updates;
			},
		});

		expect(report.rotated).toBe(5);

		// Verify plaintext identity after rotation
		for (let i = 0; i < 5; i++) {
			const decKey = await decrypt(store[i].apiKeyEncrypted, NEW_KEY);
			const decSecret = await decrypt(store[i].apiSecretEncrypted, NEW_KEY);
			expect(decKey).toBe(plaintexts[i][0]);
			expect(decSecret).toBe(plaintexts[i][1]);
		}
	});

	test("old key cannot decrypt after rotation", async () => {
		const { rows } = await buildCredentials(2, OLD_KEY);
		let store = [...rows];

		await rotateCredentials({
			oldKey: OLD_KEY,
			newKey: NEW_KEY,
			fetchAllCredentials: async () => store,
			updateCredentialsInTransaction: async (updates) => {
				store = updates;
			},
		});

		await expect(decrypt(store[0].apiKeyEncrypted, OLD_KEY)).rejects.toThrow();
	});

	test("saveAll failure leaves store unchanged", async () => {
		const { rows } = await buildCredentials(3, OLD_KEY);
		const original = rows.map((r) => ({ ...r }));

		await expect(
			rotateCredentials({
				oldKey: OLD_KEY,
				newKey: NEW_KEY,
				fetchAllCredentials: async () => rows,
				updateCredentialsInTransaction: async () => {
					throw new Error("DB transaction failed");
				},
			}),
		).rejects.toThrow("DB transaction failed");

		// Original rows unchanged
		expect(rows).toEqual(original);
	});

	test("wrong old key throws before update", async () => {
		const { rows } = await buildCredentials(2, OLD_KEY);
		let updated = false;

		await expect(
			rotateCredentials({
				oldKey: WRONG_KEY,
				newKey: NEW_KEY,
				fetchAllCredentials: async () => rows,
				updateCredentialsInTransaction: async () => {
					updated = true;
				},
			}),
		).rejects.toThrow();

		expect(updated).toBe(false);
	});

	test("empty credentials table returns zero rotated", async () => {
		const report = await rotateCredentials({
			oldKey: OLD_KEY,
			newKey: NEW_KEY,
			fetchAllCredentials: async () => [],
			updateCredentialsInTransaction: async () => {},
		});

		expect(report.rotated).toBe(0);
	});

	test("verifyAllCredentials happy path", async () => {
		const { rows } = await buildCredentials(3, NEW_KEY);

		const result = await verifyAllCredentials({
			newKey: NEW_KEY,
			fetchAllCredentials: async () => rows,
		});

		expect(result.verified).toBe(3);
		expect(result.failed).toBe(0);
	});

	test("verifyAllCredentials detects wrong key", async () => {
		const { rows } = await buildCredentials(2, OLD_KEY);

		const result = await verifyAllCredentials({
			newKey: WRONG_KEY,
			fetchAllCredentials: async () => rows,
		});

		expect(result.verified).toBe(0);
		expect(result.failed).toBe(2);
	});

	test("ciphertext changes after rotation (new IV)", async () => {
		const { rows } = await buildCredentials(1, OLD_KEY);
		const originalCipher = rows[0].apiKeyEncrypted;
		let store = [...rows];

		await rotateCredentials({
			oldKey: OLD_KEY,
			newKey: NEW_KEY,
			fetchAllCredentials: async () => store,
			updateCredentialsInTransaction: async (updates) => {
				store = updates;
			},
		});

		expect(store[0].apiKeyEncrypted).not.toBe(originalCipher);
	});

	test("idempotent re-rotation preserves plaintext", async () => {
		const { rows, plaintexts } = await buildCredentials(2, OLD_KEY);
		let store = [...rows];

		// First rotation: OLD → NEW
		await rotateCredentials({
			oldKey: OLD_KEY,
			newKey: NEW_KEY,
			fetchAllCredentials: async () => store,
			updateCredentialsInTransaction: async (updates) => {
				store = updates;
			},
		});

		// Second rotation: NEW → OLD (back to original key)
		await rotateCredentials({
			oldKey: NEW_KEY,
			newKey: OLD_KEY,
			fetchAllCredentials: async () => store,
			updateCredentialsInTransaction: async (updates) => {
				store = updates;
			},
		});

		const dec = await decrypt(store[0].apiKeyEncrypted, OLD_KEY);
		expect(dec).toBe(plaintexts[0][0]);
	});

	test("10 credential batch rotation", async () => {
		const { rows, plaintexts } = await buildCredentials(10, OLD_KEY);
		let store = [...rows];

		const report = await rotateCredentials({
			oldKey: OLD_KEY,
			newKey: NEW_KEY,
			fetchAllCredentials: async () => store,
			updateCredentialsInTransaction: async (updates) => {
				store = updates;
			},
		});

		expect(report.rotated).toBe(10);

		const verify = await verifyAllCredentials({
			newKey: NEW_KEY,
			fetchAllCredentials: async () => store,
		});
		expect(verify.verified).toBe(10);
		expect(verify.failed).toBe(0);
	});
});
