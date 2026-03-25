import { BinanceAdapter } from "@combine/exchange/binance";
import { PgEventPublisher } from "@combine/shared/event-bus";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { CandleCollector } from "./collector.js";
import { GapRepairService } from "./gap-repair.js";
import { startHealthServer } from "./health.js";
import { DrizzleCandleRepository } from "./repository.js";

// 1. Validate DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

// 2. Parse CANDLE_SYMBOLS (comma-separated, whitespace-trimmed)
//    Falls back to DB-driven strategy lookup when not set (legacy behavior via index.ts)
const symbolsEnv = process.env.CANDLE_SYMBOLS;
const symbols: string[] = symbolsEnv
	? symbolsEnv
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
	: [];

const timeframe = (process.env.CANDLE_TIMEFRAME ?? "1m") as "1m";

if (symbols.length === 0) {
	console.error(
		"CANDLE_SYMBOLS not set or empty. Set CANDLE_SYMBOLS=BTCUSDT,ETHUSDT,SOLUSDT to use this entrypoint.",
	);
	process.exit(1);
}

// 3. Create Drizzle db instance
const pool = postgres(databaseUrl);
const db = drizzle(pool);

// 4. Create repository and adapter
const repository = new DrizzleCandleRepository(db);
const adapter = new BinanceAdapter();

// 5. Create PgEventPublisher + connect
const publisher = new PgEventPublisher({ connectionString: databaseUrl });
await publisher.connect((connectionString) => {
	const pubClient = postgres(connectionString, { max: 1 });
	return {
		unsafe: (query: string) => pubClient.unsafe(query),
	};
});

// 6. Create GapRepairService
const gapRepair = new GapRepairService(adapter, repository);

// 7. Build single CandleCollector with all symbols
//    All symbols share one publisher (one DB connection pool) as specified.
const collector = new CandleCollector({ adapter, repository, gapRepair, publisher });

// 8. Start health server
const healthServer = startHealthServer(collector);
void collector.startMulti("binance", symbols, timeframe).catch((err: Error) => {
	console.error(`[candle-collector] Fatal error in startMulti: ${err.message}`);
	process.exit(1);
});

// 10. Graceful shutdown on SIGTERM/SIGINT
async function shutdown(_signal: string): Promise<void> {
	await collector.stop();
	await publisher.close();
	await pool.end();
	healthServer.stop();
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
