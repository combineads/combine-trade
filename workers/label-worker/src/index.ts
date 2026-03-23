import { Channels, PgEventSubscriber } from "@combine/shared/event-bus";
import type { StrategyEventCreatedPayload } from "@combine/shared/event-bus";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
	createPublisher,
	findCandlesForward,
	findUnlabeledEvents,
	isAlreadyLabeled as dbIsAlreadyLabeled,
	loadStrategy,
	saveLabel,
} from "./db.js";
import { LabelScanner } from "./scanner.js";
import type { LabelScannerDeps } from "./scanner.js";
import { startHealthServer } from "./health.js";

// 1. Validate DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

// 2. Create Drizzle db + publisher
const pool = postgres(databaseUrl);
const db = drizzle(pool);
const publisher = createPublisher(databaseUrl);

// 3. Create PgEventSubscriber + connect
const subscriber = new PgEventSubscriber({ connectionString: databaseUrl });
await subscriber.connect((connectionString) => {
	const client = postgres(connectionString, { max: 1 });

	return {
		listenTo(channel: string, handler: (payload: string) => void) {
			void client.listen(channel, (payload) => handler(payload));
			return () => {
				// postgres.js listen cleanup is handled on client.end()
			};
		},
		async close() {
			await client.end();
		},
	};
});

// 4. Build LabelScannerDeps
const deps: LabelScannerDeps = {
	findUnlabeledEvents: () => findUnlabeledEvents(db, 100),

	loadStrategy: (strategyId: string) => loadStrategy(db, strategyId),

	loadForwardCandles: (
		_exchange: string,
		symbol: string,
		timeframe: string,
		openTime: Date,
		count: number,
	) => findCandlesForward(db, symbol, timeframe, openTime, count),

	hasGap: async (
		_exchange: string,
		symbol: string,
		timeframe: string,
		from: Date,
		count: number,
	) => {
		// Gap detection: if we can't retrieve at least `count` candles forward, there is a gap.
		const rows = await findCandlesForward(db, symbol, timeframe, from, count);
		return rows.length < count;
	},

	isAlreadyLabeled: (eventId: string) => dbIsAlreadyLabeled(db, eventId),

	saveLabel: async (label: Record<string, unknown>): Promise<string> => {
		const eventId = label.eventId as string;
		const id = await saveLabel(db, eventId, {
			resultType: label.resultType as string,
			pnlPct: label.pnlPct as string,
			mfePct: label.mfePct as string,
			maePct: label.maePct as string,
			holdBars: label.holdBars as number,
			exitPrice: label.exitPrice as string,
			slHitFirst: label.slHitFirst as boolean,
		});
		if (!id) {
			throw new Error(`Label already exists for event ${eventId}`);
		}
		return id;
	},

	publisher,
};

const scanner = new LabelScanner(deps);

// 5. Catch-up poll at startup (once)
console.log("Label worker: running catch-up scan...");
await scanner.scan();

// 6. Subscribe to strategy_event_created
const subscription = subscriber.subscribe(
	Channels.strategyEventCreated,
	async (_payload: StrategyEventCreatedPayload) => {
		// On each new strategy event, run a targeted scan.
		// The scanner will fetch unlabeled events and process matured ones.
		await scanner.scan();
	},
);

// 7. Start health server
const health = startHealthServer();

console.log("Label worker started");

// 8. Graceful shutdown on SIGTERM/SIGINT
async function shutdown(signal: string): Promise<void> {
	console.log(`Received ${signal}, shutting down...`);
	subscription.unsubscribe();
	await subscriber.close();
	await publisher.close();
	health.stop();
	await pool.end();
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
