import { PgEventPublisher } from "@combine/shared/event-bus";
import { BinanceAdapter } from "@combine/exchange/binance";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { CandleCollector } from "./collector.js";
import { findActiveSymbolTimeframes } from "./db.js";
import { GapRepairService } from "./gap-repair.js";
import { DrizzleCandleRepository } from "./repository.js";

// 1. Validate DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

// 2. Create Drizzle db instance
const pool = postgres(databaseUrl);
const db = drizzle(pool);

// 3. Create repository and adapter
const repository = new DrizzleCandleRepository(db);
const adapter = new BinanceAdapter();

// 4. Create PgEventPublisher + connect
const publisher = new PgEventPublisher({ connectionString: databaseUrl });
await publisher.connect((connectionString) => {
	const pubClient = postgres(connectionString, { max: 1 });
	return {
		unsafe: (query: string) => pubClient.unsafe(query),
	};
});

// 5. Create GapRepairService
const gapRepair = new GapRepairService(adapter, repository);

// 6. Build CandleCollectorDeps factory
function createCollector(): CandleCollector {
	return new CandleCollector({ adapter, repository, gapRepair, publisher });
}

// 7. Track active pairs and collectors
const activePairs = new Set<string>();
const collectors = new Map<string, CandleCollector>();

function pairKey(symbol: string, timeframe: string): string {
	return `${symbol}:${timeframe}`;
}

async function startNewPairs(): Promise<void> {
	const pairs = await findActiveSymbolTimeframes(db);

	for (const { symbol, timeframe } of pairs) {
		const key = pairKey(symbol, timeframe);
		if (activePairs.has(key)) continue;

		activePairs.add(key);
		const collector = createCollector();
		collectors.set(key, collector);

		// Start each collector concurrently — do not await
		void collector.start("binance", symbol, timeframe).catch((err: Error) => {
			console.error(`[candle-collector] Collector ${key} failed: ${err.message}`);
		});
	}
}

// 8. Load initial pairs and start collectors
await startNewPairs();

// 9. Poll every 60 seconds for new pairs
const pollInterval = setInterval(() => {
	void startNewPairs().catch((err: Error) => {
		console.error(`[candle-collector] Pair refresh failed: ${err.message}`);
	});
}, 60_000);

console.log("Candle collector started");

// 10. Graceful shutdown on SIGTERM/SIGINT
async function shutdown(signal: string): Promise<void> {
	console.log(`Received ${signal}, shutting down...`);
	clearInterval(pollInterval);

	await Promise.all([...collectors.values()].map((c) => c.stop()));

	await publisher.close();
	await pool.end();
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
