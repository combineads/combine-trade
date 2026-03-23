import { Channels, PgEventSubscriber } from "@combine/shared/event-bus";
import { decrypt, encrypt } from "@combine/shared/crypto/encryption.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { startExecutionWorker } from "./entry.js";
import { createExecutionDeps } from "./db.js";

// 1. Validate DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

// 2. Validate MASTER_ENCRYPTION_KEY
const masterEncryptionKey = process.env.MASTER_ENCRYPTION_KEY;
if (!masterEncryptionKey) {
	console.error("MASTER_ENCRYPTION_KEY not set");
	process.exit(1);
}

// 3. Round-trip test: encrypt then decrypt to verify key is valid
const ROUND_TRIP_PLAINTEXT = "combine-trade-key-validation";
try {
	const ciphertext = await encrypt(ROUND_TRIP_PLAINTEXT, masterEncryptionKey);
	const decrypted = await decrypt(ciphertext, masterEncryptionKey);
	if (decrypted !== ROUND_TRIP_PLAINTEXT) {
		console.error("MASTER_ENCRYPTION_KEY round-trip validation failed: decrypted value mismatch");
		process.exit(1);
	}
} catch (err) {
	console.error(
		"MASTER_ENCRYPTION_KEY round-trip validation failed:",
		(err as Error).message,
	);
	process.exit(1);
}

// 4. Create Drizzle db instance
const pool = postgres(databaseUrl);
const db = drizzle(pool);

// 5. Create PgEventSubscriber + connect
const subscriber = new PgEventSubscriber({ connectionString: databaseUrl });
await subscriber.connect((connectionString) => {
	const client = postgres(connectionString, { max: 1 });

	return {
		listenTo(channel: string, handler: (payload: string) => void) {
			void client.listen(channel, (payload) => handler(payload));
			return () => {};
		},
		async close() {
			await client.end();
		},
	};
});

// 6. Build subscribe adapter for ExecutionWorkerEntryDeps
const subscribe: Parameters<typeof createExecutionDeps>[2] = (channel, handler) => {
	return subscriber.subscribe(
		{ name: channel } as typeof Channels.decisionCompleted,
		handler,
	);
};

// 7. Wire all deps
const deps = createExecutionDeps(db, masterEncryptionKey, subscribe);

// 8. Start worker
startExecutionWorker(deps);

console.log("Execution worker started");

// 9. Graceful shutdown on SIGTERM/SIGINT
async function shutdown(signal: string): Promise<void> {
	console.log(`Received ${signal}, shutting down...`);
	await subscriber.close();
	await pool.end();
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
