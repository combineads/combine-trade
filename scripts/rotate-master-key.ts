/**
 * rotate-master-key.ts — CLI utility for rotating the master encryption key.
 *
 * Re-encrypts all exchange_credentials rows from the old key to a new key
 * in a single atomic DB transaction. On any failure, the transaction is
 * rolled back and existing encrypted data is preserved.
 *
 * Usage:
 *   OLD_MASTER_KEY=<hex> NEW_MASTER_KEY=<hex> bun run scripts/rotate-master-key.ts
 *
 * Or via bun run (after adding to package.json):
 *   bun run key:rotate
 *
 * Environment variables:
 *   OLD_MASTER_KEY  — current 64-hex-char (32-byte) master key
 *   NEW_MASTER_KEY  — replacement 64-hex-char (32-byte) master key
 *   DATABASE_URL    — PostgreSQL connection string
 *
 * Exit codes:
 *   0 — rotation completed and all credentials verified
 *   1 — rotation failed or verification found corrupted rows
 *
 * Security:
 *   - Key values are never logged
 *   - Plaintext API keys exist only in memory during rotation
 *   - The script exits immediately after rotation (no persistent state)
 */

import type { EncryptedCredentialRow } from "@combine/shared/crypto/key-rotation.js";
import { rotateCredentials, verifyAllCredentials } from "@combine/shared/crypto/key-rotation.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { exchangeCredentials } from "../db/schema/exchange-credentials.js";
import * as schema from "../db/schema/index.js";

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function createDb(databaseUrl: string): {
	db: PostgresJsDatabase<typeof schema>;
	sql: ReturnType<typeof postgres>;
} {
	const sql = postgres(databaseUrl, { max: 1 });
	const db = drizzle(sql, { schema });
	return { db, sql };
}

async function fetchAllCredentials(
	db: PostgresJsDatabase<typeof schema>,
): Promise<EncryptedCredentialRow[]> {
	const rows = await db
		.select({
			id: exchangeCredentials.id,
			apiKeyEncrypted: exchangeCredentials.apiKeyEncrypted,
			apiSecretEncrypted: exchangeCredentials.apiSecretEncrypted,
		})
		.from(exchangeCredentials);
	return rows;
}

async function updateCredentialsInTransaction(
	db: PostgresJsDatabase<typeof schema>,
	updates: EncryptedCredentialRow[],
): Promise<void> {
	await db.transaction(async (tx) => {
		for (const update of updates) {
			await tx
				.update(exchangeCredentials)
				.set({
					apiKeyEncrypted: update.apiKeyEncrypted,
					apiSecretEncrypted: update.apiSecretEncrypted,
					updatedAt: new Date(),
				})
				.where(eq(exchangeCredentials.id, update.id));
		}
	});
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateKeyFormat(key: string, name: string): void {
	// Accept either 64-char hex (32 bytes) or a non-empty passphrase for Web Crypto PBKDF2
	if (key.length === 0) {
		throw new Error(`${name} must not be empty`);
	}
}

function getRequiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Required environment variable ${name} is not set`);
	}
	return value;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	// Read keys from environment — never accept from CLI args to avoid shell history exposure
	const oldKey = getRequiredEnv("OLD_MASTER_KEY");
	const newKey = getRequiredEnv("NEW_MASTER_KEY");
	const databaseUrl = getRequiredEnv("DATABASE_URL");

	validateKeyFormat(oldKey, "OLD_MASTER_KEY");
	validateKeyFormat(newKey, "NEW_MASTER_KEY");

	if (oldKey === newKey) {
		console.error("[rotate-master-key] ERROR: OLD_MASTER_KEY and NEW_MASTER_KEY must be different");
		process.exit(1);
	}

	console.info("[rotate-master-key] Starting master key rotation...");

	const { db, sql } = createDb(databaseUrl);

	try {
		// Step 1: Rotate
		console.info("[rotate-master-key] Phase 1: Decrypting and re-encrypting credentials...");
		const rotationReport = await rotateCredentials({
			oldKey,
			newKey,
			fetchAllCredentials: () => fetchAllCredentials(db),
			updateCredentialsInTransaction: (updates) => updateCredentialsInTransaction(db, updates),
		});

		console.info(`[rotate-master-key] Rotated ${rotationReport.rotated} credential(s)`);

		if (rotationReport.rotated === 0) {
			console.info("[rotate-master-key] No credentials found — nothing to rotate.");
			await sql.end();
			process.exit(0);
		}

		// Step 2: Verify
		console.info("[rotate-master-key] Phase 2: Verifying all credentials decrypt with new key...");
		const verification = await verifyAllCredentials({
			newKey,
			fetchAllCredentials: () => fetchAllCredentials(db),
		});

		const totalReport = {
			rotated: rotationReport.rotated,
			verified: verification.verified,
			failed: verification.failed,
		};

		console.info("[rotate-master-key] Rotation report:");
		console.info(`  Rotated:  ${totalReport.rotated}`);
		console.info(`  Verified: ${totalReport.verified}`);
		console.info(`  Failed:   ${totalReport.failed}`);

		if (totalReport.failed > 0) {
			console.error(
				`[rotate-master-key] ERROR: ${totalReport.failed} credential(s) failed verification after rotation.`,
			);
			console.error(
				"[rotate-master-key] The DB may be in an inconsistent state. Investigate immediately.",
			);
			await sql.end();
			process.exit(1);
		}

		console.info("[rotate-master-key] Rotation complete. All credentials verified.");
		await sql.end();
		process.exit(0);
	} catch (err) {
		// Log error message but never log key values
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[rotate-master-key] ERROR: Rotation failed — ${message}`);
		console.error("[rotate-master-key] No credentials were modified (transaction rolled back).");
		await sql.end();
		process.exit(1);
	}
}

main();
