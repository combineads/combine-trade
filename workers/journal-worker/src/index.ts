import { Channels, PgEventSubscriber } from "@combine/shared/event-bus";
import postgres from "postgres";
import { JournalEventHandler } from "./journal-event-handler.js";
import type { EventBus, EventBusSubscription } from "./journal-event-handler.js";
import { createJournalStorage } from "./db.js";
import { drizzle } from "drizzle-orm/postgres-js";

// 1. Validate DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

// 2. Create Drizzle db instance
const pool = postgres(databaseUrl);
const db = drizzle(pool);

// 3. Create PgEventSubscriber + connect
const subscriber = new PgEventSubscriber({ connectionString: databaseUrl });
await subscriber.connect((connectionString) => {
	const client = postgres(connectionString, { max: 1 });
	const listeners = new Map<string, (payload: string) => void>();

	// Use postgres LISTEN via typed query
	return {
		listenTo(channel: string, handler: (payload: string) => void) {
			listeners.set(channel, handler);
			// Fire and forget: start listening
			void client.listen(channel, (payload) => handler(payload));
			return () => {
				listeners.delete(channel);
			};
		},
		async close() {
			await client.end();
		},
	};
});

// 4. Adapt PgEventSubscriber to JournalEventHandler's EventBus interface
const eventBus: EventBus = {
	subscribe(
		eventType: string,
		handler: (event: unknown) => Promise<void>,
	): EventBusSubscription {
		const channel =
			eventType === "label_ready"
				? Channels.labelReady
				: { name: eventType };

		const subscription = subscriber.subscribe(channel as typeof Channels.labelReady, handler);
		return {
			unsubscribe() {
				subscription.unsubscribe();
			},
		};
	},
};

// 5. Create storage and start handler
const storage = createJournalStorage(db);
const handler = new JournalEventHandler(eventBus, storage);
const subscription = handler.start();

console.log("Journal worker started");

// 6. Graceful shutdown on SIGTERM/SIGINT
async function shutdown(signal: string): Promise<void> {
	console.log(`Received ${signal}, shutting down...`);
	subscription.unsubscribe();
	await subscriber.close();
	await pool.end();
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
