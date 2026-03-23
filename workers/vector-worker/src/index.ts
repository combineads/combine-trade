import {
	Channels,
	PgEventPublisher,
	PgEventSubscriber,
} from "@combine/shared/event-bus";
import type { StrategyEventCreatedPayload } from "@combine/shared/event-bus";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createVectorDeps } from "./db.js";
import { VectorEventHandler } from "./handler.js";

// 1. Validate DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

// 2. Create Drizzle db instance and raw client for vector table ops
const pool = postgres(databaseUrl);
const db = drizzle(pool);

// 3. Create raw client for dynamic SQL (VectorTableManager / search)
const rawClient = postgres(databaseUrl, { max: 5 });

// 4. Create PgEventPublisher + connect
const publisher = new PgEventPublisher({ connectionString: databaseUrl });
await publisher.connect((connectionString) => {
	const pubClient = postgres(connectionString, { max: 1 });
	return {
		unsafe: (query: string) => pubClient.unsafe(query),
	};
});

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

// 6. Wire VectorHandlerDeps with publisher
const deps = createVectorDeps(db, rawClient, publisher);

// 7. Create the handler
const handler = new VectorEventHandler(deps);

// 8. Subscribe to strategy_event_created
const subscription = subscriber.subscribe(
	Channels.strategyEventCreated,
	async (payload: StrategyEventCreatedPayload) => {
		await handler.handle({
			eventId: payload.eventId,
			strategyId: payload.strategyId,
			symbol: payload.symbol,
			version: payload.version,
		});
		// NOTIFY decision_completed is handled inside VectorEventHandler via publisher
	},
);

console.log("Vector worker started");

// 9. Graceful shutdown on SIGTERM/SIGINT
async function shutdown(signal: string): Promise<void> {
	console.log(`Received ${signal}, shutting down...`);
	subscription.unsubscribe();
	await subscriber.close();
	await publisher.close();
	await rawClient.end();
	await pool.end();
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
