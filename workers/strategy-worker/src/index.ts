import {
	Channels,
	PgEventPublisher,
	PgEventSubscriber,
} from "@combine/shared/event-bus";
import type { CandleClosedPayload } from "@combine/shared/event-bus";
import { StrategyExecutor } from "@combine/core/strategy";
import { StrategySandbox } from "@combine/core/strategy";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
	createCandleRepository,
	createStrategyEventRepository,
	findActiveStrategies,
} from "./db.js";
import { StrategyEvaluator } from "./evaluator.js";
import { startHealthServer } from "./health.js";

// 1. Validate DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

// 2. Create Drizzle db instance
const pool = postgres(databaseUrl);
const db = drizzle(pool);

// 3. Create PgEventPublisher + connect
const publisher = new PgEventPublisher({ connectionString: databaseUrl });
await publisher.connect((connectionString) => {
	const pubClient = postgres(connectionString, { max: 1 });
	return {
		unsafe: (query: string) => pubClient.unsafe(query),
	};
});

// 4. Create PgEventSubscriber + connect
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

// 5. Initialize V8 (QuickJS) sandbox + executor
const sandbox = new StrategySandbox();
await sandbox.initialize();
const executor = new StrategyExecutor({ sandbox });

// 6. Wire repositories
const strategyEventRepo = createStrategyEventRepository(db);
const candleRepo = createCandleRepository(db);

// 7. Create StrategyEvaluator
const evaluator = new StrategyEvaluator({
	executor,
	strategyEventRepo,
	candleRepo,
	publisher,
	findActiveStrategies: (symbol, timeframe) => findActiveStrategies(db, symbol, timeframe),
});

// 8. Start health server
startHealthServer(evaluator);

// 9. Subscribe to candle_closed
const subscription = subscriber.subscribe(
	Channels.candleClosed,
	async (payload: CandleClosedPayload) => {
		const { exchange, symbol, timeframe, openTime } = payload;
		const results = await evaluator.evaluate(
			exchange,
			symbol,
			timeframe as import("@combine/shared").Timeframe,
			new Date(openTime),
		);

		const failed = results.filter((r) => !r.success);
		if (failed.length > 0) {
			for (const f of failed) {
				console.error(
					`[strategy-worker] Strategy "${f.strategyName}" (${f.strategyId}) failed: ${f.error}`,
				);
			}
		}
	},
);

console.log("Strategy worker started");

// 10. Graceful shutdown on SIGTERM/SIGINT
async function shutdown(signal: string): Promise<void> {
	console.log(`Received ${signal}, shutting down...`);
	subscription.unsubscribe();
	await subscriber.close();
	await publisher.close();
	sandbox.dispose();
	await pool.end();
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
