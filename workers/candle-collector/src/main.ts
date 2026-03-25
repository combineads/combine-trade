import { BinanceAdapter } from "@combine/exchange/binance";
import { PgEventPublisher } from "@combine/shared/event-bus";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { CandleCollector } from "./collector.js";
import { findActiveSymbolTimeframes } from "./db.js";
import type { ExchangeConfig } from "./exchange-manager.js";
import { ExchangeCollectorManager } from "./exchange-manager.js";
import { GapRepairService } from "./gap-repair.js";
import { startHealthServer } from "./health.js";
import { DrizzleCandleRepository } from "./repository.js";

// ---------------------------------------------------------------------------
// 1. Validate required env vars
// ---------------------------------------------------------------------------
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

// EXCHANGES=binance,okx  (defaults to "binance" if not set)
const exchangeList = (process.env.EXCHANGES ?? "binance")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);

// ---------------------------------------------------------------------------
// 2. Shared infrastructure (one DB pool, one publisher)
// ---------------------------------------------------------------------------
const pool = postgres(databaseUrl);
const db = drizzle(pool);
const repository = new DrizzleCandleRepository(db);

const publisher = new PgEventPublisher({ connectionString: databaseUrl });
await publisher.connect((connectionString) => {
	const pubClient = postgres(connectionString, { max: 1 });
	return {
		unsafe: (query: string) => pubClient.unsafe(query),
	};
});

// ---------------------------------------------------------------------------
// 3. Build ExchangeConfig[] from env
//    Per-exchange symbol lists: BINANCE_SYMBOLS=BTCUSDT,ETHUSDT
//    If not set, fall back to DB active pairs for that exchange
// ---------------------------------------------------------------------------
async function buildExchangeConfigs(): Promise<ExchangeConfig[]> {
	const configs: ExchangeConfig[] = [];

	for (const exchangeId of exchangeList) {
		let symbols: string[];

		const envKey = `${exchangeId.toUpperCase()}_SYMBOLS`;
		const envSymbols = process.env[envKey];

		if (envSymbols) {
			symbols = envSymbols
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
		} else {
			// Fall back to DB-driven active pairs for this exchange
			const pairs = await findActiveSymbolTimeframes(db);
			symbols = [...new Set(pairs.map((p) => p.symbol))];
		}

		if (symbols.length === 0) {
			console.warn(`[main] No symbols configured for exchange=${exchangeId}, skipping`);
			continue;
		}

		// Build adapter for this exchange
		let adapter: ReturnType<typeof buildAdapter>;
		try {
			adapter = buildAdapter(exchangeId);
		} catch (err) {
			console.error(
				`[main] Failed to build adapter for exchange=${exchangeId}: ${(err as Error).message}`,
			);
			continue;
		}

		// Timeframe defaults to 1m; can be overridden per-exchange via env
		const tfEnvKey = `${exchangeId.toUpperCase()}_TIMEFRAME`;
		const timeframe = (process.env[tfEnvKey] ?? "1m") as "1m";

		const gapRepair = new GapRepairService(adapter, repository);

		configs.push({
			id: exchangeId,
			adapter,
			symbols,
			timeframe,
			restartDelayMs: 5_000,
			_collectorFactory: () => new CandleCollector({ adapter, repository, gapRepair, publisher }),
		});
	}

	return configs;
}

function buildAdapter(exchangeId: string) {
	switch (exchangeId.toLowerCase()) {
		case "binance":
			return new BinanceAdapter();
		default:
			throw new Error(`Unknown exchange: ${exchangeId}. Add its adapter to main.ts.`);
	}
}

// ---------------------------------------------------------------------------
// 4. Instantiate and start the manager
// ---------------------------------------------------------------------------
const configs = await buildExchangeConfigs();
const manager = new ExchangeCollectorManager(configs);
await manager.start();

// ---------------------------------------------------------------------------
// 5. Health server — aggregates per-exchange status
// ---------------------------------------------------------------------------
const healthPort = Number(process.env.HEALTH_PORT ?? 9001);
startHealthServer(manager, healthPort);

// ---------------------------------------------------------------------------
// 6. Graceful shutdown
// ---------------------------------------------------------------------------
async function shutdown(_signal: string): Promise<void> {
	await manager.stop();
	await publisher.close();
	await pool.end();

	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
