/**
 * Tests for master key rotation logic.
 *
 * All I/O is injected via deps — no real DB connections.
 * Tests verify:
 *   - Roundtrip re-encryption produces decryptable credentials
 *   - Wrong old key causes rotation to fail
 *   - Any single failure rolls back (all-or-nothing)
 *   - Verification detects corrupted rows
 *   - Rotation report counts are accurate
 */

import { describe, expect, mock, test } from "bun:test";
import { decrypt, encrypt } from "../encryption.js";
import {
	type KeyRotationDeps,
	type RotationReport,
	rotateCredentials,
	verifyAllCredentials,
} from "../key-rotation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OLD_KEY = "old-master-key-for-rotation-32ch";
const NEW_KEY = "new-master-key-for-rotation-32ch";

async function makeEncryptedRow(id: string, apiKey: string, apiSecret: string) {
	return {
		id,
		apiKeyEncrypted: await encrypt(apiKey, OLD_KEY),
		apiSecretEncrypted: await encrypt(apiSecret, OLD_KEY),
	};
}

// ---------------------------------------------------------------------------
// rotateCredentials
// ---------------------------------------------------------------------------

describe("rotateCredentials", () => {
	test("re-encrypts all rows with new key", async () => {
		const rows = [
			await makeEncryptedRow("cred-1", "sk-key-one", "sec-one"),
			await makeEncryptedRow("cred-2", "sk-key-two", "sec-two"),
		];

		const updated: Array<{ id: string; apiKeyEncrypted: string; apiSecretEncrypted: string }> = [];

		const deps: KeyRotationDeps = {
			oldKey: OLD_KEY,
			newKey: NEW_KEY,
			fetchAllCredentials: mock(async () => rows),
			updateCredentialsInTransaction: mock(async (updates) => {
				updated.push(...updates);
			}),
		};

		const report = await rotateCredentials(deps);

		expect(report.rotated).toBe(2);
		expect(report.failed).toBe(0);
		expect(updated).toHaveLength(2);

		// Verify new ciphertexts decrypt correctly with new key
		const decrypted1ApiKey = await decrypt(updated[0]?.apiKeyEncrypted ?? "", NEW_KEY);
		const decrypted1Secret = await decrypt(updated[0]?.apiSecretEncrypted ?? "", NEW_KEY);
		expect(decrypted1ApiKey).toBe("sk-key-one");
		expect(decrypted1Secret).toBe("sec-one");

		const decrypted2ApiKey = await decrypt(updated[1]?.apiKeyEncrypted ?? "", NEW_KEY);
		const decrypted2Secret = await decrypt(updated[1]?.apiSecretEncrypted ?? "", NEW_KEY);
		expect(decrypted2ApiKey).toBe("sk-key-two");
		expect(decrypted2Secret).toBe("sec-two");
	});

	test("new ciphertexts are different from old (new IV each time)", async () => {
		const row = await makeEncryptedRow("cred-1", "sk-api-key", "secret-val");
		const originalKeyEnc = row.apiKeyEncrypted;

		const updated: Array<{ id: string; apiKeyEncrypted: string; apiSecretEncrypted: string }> = [];

		const deps: KeyRotationDeps = {
			oldKey: OLD_KEY,
			newKey: NEW_KEY,
			fetchAllCredentials: mock(async () => [row]),
			updateCredentialsInTransaction: mock(async (updates) => {
				updated.push(...updates);
			}),
		};

		await rotateCredentials(deps);

		// New encryption produces different ciphertext
		expect(updated[0]?.apiKeyEncrypted).not.toBe(originalKeyEnc);
	});

	test("handles empty credentials table gracefully", async () => {
		const deps: KeyRotationDeps = {
			oldKey: OLD_KEY,
			newKey: NEW_KEY,
			fetchAllCredentials: mock(async () => []),
			updateCredentialsInTransaction: mock(async () => {}),
		};

		const report = await rotateCredentials(deps);

		expect(report.rotated).toBe(0);
		expect(report.failed).toBe(0);
		expect(deps.updateCredentialsInTransaction).not.toHaveBeenCalled();
	});

	test("throws and does not update if old key cannot decrypt a row", async () => {
		// Encrypt with a DIFFERENT key to simulate bad old key scenario
		const wrongKeyRow = {
			id: "cred-bad",
			apiKeyEncrypted: await encrypt("sk-key", "wrong-key-that-is-not-old-32ch"),
			apiSecretEncrypted: await encrypt("sec-val", "wrong-key-that-is-not-old-32ch"),
		};

		const deps: KeyRotationDeps = {
			oldKey: OLD_KEY,
			newKey: NEW_KEY,
			fetchAllCredentials: mock(async () => [wrongKeyRow]),
			updateCredentialsInTransaction: mock(async () => {}),
		};

		await expect(rotateCredentials(deps)).rejects.toThrow();
		expect(deps.updateCredentialsInTransaction).not.toHaveBeenCalled();
	});

	test("stops and does not call update if any row fails decryption (atomicity)", async () => {
		const goodRow = await makeEncryptedRow("cred-1", "sk-key", "sec-val");
		const badRow = {
			id: "cred-bad",
			apiKeyEncrypted: "corrupted-base64-garbage-data!!!",
			apiSecretEncrypted: await encrypt("sec-val", OLD_KEY),
		};

		const deps: KeyRotationDeps = {
			oldKey: OLD_KEY,
			newKey: NEW_KEY,
			fetchAllCredentials: mock(async () => [goodRow, badRow]),
			updateCredentialsInTransaction: mock(async () => {}),
		};

		await expect(rotateCredentials(deps)).rejects.toThrow();
		// Transaction must not be called when any row fails
		expect(deps.updateCredentialsInTransaction).not.toHaveBeenCalled();
	});

	test("report includes rotated count", async () => {
		const rows = [
			await makeEncryptedRow("cred-1", "k1", "s1"),
			await makeEncryptedRow("cred-2", "k2", "s2"),
			await makeEncryptedRow("cred-3", "k3", "s3"),
		];

		const deps: KeyRotationDeps = {
			oldKey: OLD_KEY,
			newKey: NEW_KEY,
			fetchAllCredentials: mock(async () => rows),
			updateCredentialsInTransaction: mock(async () => {}),
		};

		const report = await rotateCredentials(deps);
		expect(report.rotated).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// verifyAllCredentials
// ---------------------------------------------------------------------------

describe("verifyAllCredentials", () => {
	test("returns verified count equal to total when all rows decrypt", async () => {
		const rows = [
			await makeEncryptedRow("cred-1", "k1", "s1"),
			await makeEncryptedRow("cred-2", "k2", "s2"),
		];

		// Re-encrypt with new key to simulate post-rotation state
		const newRows = await Promise.all(
			rows.map(async (row) => ({
				id: row.id,
				apiKeyEncrypted: await encrypt(await decrypt(row.apiKeyEncrypted, OLD_KEY), NEW_KEY),
				apiSecretEncrypted: await encrypt(await decrypt(row.apiSecretEncrypted, OLD_KEY), NEW_KEY),
			})),
		);

		const deps = {
			newKey: NEW_KEY,
			fetchAllCredentials: mock(async () => newRows),
		};

		const result = await verifyAllCredentials(deps);
		expect(result.verified).toBe(2);
		expect(result.failed).toBe(0);
	});

	test("counts failed when a row cannot be decrypted with new key", async () => {
		// One row still encrypted with old key (simulates partial failure scenario)
		const rows = [
			{
				id: "cred-1",
				apiKeyEncrypted: await encrypt("k1", NEW_KEY), // correctly re-encrypted
				apiSecretEncrypted: await encrypt("s1", NEW_KEY),
			},
			{
				id: "cred-2",
				apiKeyEncrypted: await encrypt("k2", OLD_KEY), // still old key
				apiSecretEncrypted: await encrypt("s2", OLD_KEY),
			},
		];

		const deps = {
			newKey: NEW_KEY,
			fetchAllCredentials: mock(async () => rows),
		};

		const result = await verifyAllCredentials(deps);
		expect(result.verified).toBe(1);
		expect(result.failed).toBe(1);
	});

	test("returns verified=0 and failed=0 for empty table", async () => {
		const deps = {
			newKey: NEW_KEY,
			fetchAllCredentials: mock(async () => []),
		};

		const result = await verifyAllCredentials(deps);
		expect(result.verified).toBe(0);
		expect(result.failed).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// RotationReport shape
// ---------------------------------------------------------------------------

describe("RotationReport", () => {
	test("report has rotated, verified, failed fields", async () => {
		const report: RotationReport = { rotated: 5, verified: 5, failed: 0 };
		expect(report.rotated).toBe(5);
		expect(report.verified).toBe(5);
		expect(report.failed).toBe(0);
	});
});
