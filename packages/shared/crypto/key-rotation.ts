/**
 * Master key rotation for exchange credentials.
 *
 * Rotates the AES-256-GCM master encryption key used for all exchange API
 * credentials. The rotation is atomic: all rows are re-encrypted in a single
 * transaction, or none are updated on failure.
 *
 * Security invariants:
 *   - Key values are never logged or included in error messages
 *   - Decryption with old key happens entirely in memory
 *   - updateCredentialsInTransaction must execute in a DB transaction
 */

import { decrypt, encrypt } from "./encryption.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EncryptedCredentialRow {
	id: string;
	apiKeyEncrypted: string;
	apiSecretEncrypted: string;
}

export interface KeyRotationDeps {
	/** Hex or string form of the current (old) master key */
	oldKey: string;
	/** Hex or string form of the new master key to rotate to */
	newKey: string;
	/** Fetch all credential rows from the DB */
	fetchAllCredentials: () => Promise<EncryptedCredentialRow[]>;
	/**
	 * Persist all re-encrypted rows in a single atomic transaction.
	 * The implementation must roll back all updates if any single update fails.
	 */
	updateCredentialsInTransaction: (updates: EncryptedCredentialRow[]) => Promise<void>;
}

export interface VerifyDeps {
	newKey: string;
	fetchAllCredentials: () => Promise<EncryptedCredentialRow[]>;
}

export interface RotationReport {
	/** Number of credentials successfully re-encrypted */
	rotated: number;
	/** Number of credentials successfully verified with new key after rotation */
	verified: number;
	/** Number of credentials that failed verification */
	failed: number;
}

// ---------------------------------------------------------------------------
// Core rotation logic
// ---------------------------------------------------------------------------

/**
 * Re-encrypt all exchange credentials from oldKey to newKey.
 *
 * Steps:
 *   1. Fetch all credential rows
 *   2. Decrypt each with oldKey (fails fast on any decryption error)
 *   3. Re-encrypt each with newKey
 *   4. Persist all updates atomically via updateCredentialsInTransaction
 *
 * Throws if any credential cannot be decrypted — updateCredentialsInTransaction
 * is never called in that case, preserving the existing encrypted data.
 */
export async function rotateCredentials(deps: KeyRotationDeps): Promise<RotationReport> {
	const rows = await deps.fetchAllCredentials();

	if (rows.length === 0) {
		return { rotated: 0, verified: 0, failed: 0 };
	}

	// Phase 1: decrypt all with old key — fail fast before touching the DB
	// Re-encrypt with new key. If any row fails, throw before calling update.
	const updates: EncryptedCredentialRow[] = [];

	for (const row of rows) {
		// Decrypt with old key — throws if key is wrong or data is corrupted
		const plainApiKey = await decrypt(row.apiKeyEncrypted, deps.oldKey);
		const plainApiSecret = await decrypt(row.apiSecretEncrypted, deps.oldKey);

		// Re-encrypt with new key (new random IV each call)
		const newApiKeyEncrypted = await encrypt(plainApiKey, deps.newKey);
		const newApiSecretEncrypted = await encrypt(plainApiSecret, deps.newKey);

		updates.push({
			id: row.id,
			apiKeyEncrypted: newApiKeyEncrypted,
			apiSecretEncrypted: newApiSecretEncrypted,
		});
	}

	// Phase 2: atomic update — all rows or none
	await deps.updateCredentialsInTransaction(updates);

	return { rotated: updates.length, verified: 0, failed: 0 };
}

/**
 * Verify that all credential rows in the DB can be decrypted with newKey.
 *
 * Call this after rotateCredentials to confirm the rotation was successful.
 * Does not throw — returns counts of verified vs failed rows.
 */
export async function verifyAllCredentials(
	deps: VerifyDeps,
): Promise<Pick<RotationReport, "verified" | "failed">> {
	const rows = await deps.fetchAllCredentials();

	let verified = 0;
	let failed = 0;

	for (const row of rows) {
		try {
			await decrypt(row.apiKeyEncrypted, deps.newKey);
			await decrypt(row.apiSecretEncrypted, deps.newKey);
			verified++;
		} catch {
			failed++;
		}
	}

	return { verified, failed };
}
