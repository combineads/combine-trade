/**
 * run-double-bb-backtest.ts — Double-BB LONG/SHORT backtest execution script.
 *
 * Runs a 3-year backtest for both Double-BB LONG and SHORT strategies:
 *   1. Query strategy IDs from DB by name
 *   2. Load 3yr BTCUSDT 1m candles from DB
 *   3. Execute backtest via runBacktest / resumeFromCheckpoint
 *   4. Label events and compute BacktestReport
 *   5. Validate stats (trades >= 100, expectancy > 0) — warn only
 *   6. REINDEX CONCURRENTLY on HNSW indexes
 *   7. Save JSON report to reports/
 *
 * Look-ahead bias prevention:
 *   Each bar i only sees candles[max(0, i-WINDOW_SIZE)..i] — never future data.
 *
 * Checkpoint support:
 *   Progress is saved every CHECKPOINT_EVERY_N events to
 *   reports/checkpoint-{strategyId}-v{version}.json
 *   On restart, the script resumes from the last checkpoint.
 *
 * Usage:
 *   bun run scripts/run-double-bb-backtest.ts
 *
 * Exit codes:
 *   0 — success (stats warnings do not cause non-zero exit)
 *   1 — fatal error (DB unavailable, strategy not found, etc.)
 */

import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type BacktestCheckpoint,
	type BacktestEvent,
	type BacktestResult,
	type LabeledEvent,
	computeReport,
	labelBacktestEvent,
	resumeFromCheckpoint,
	runBacktest,
} from "@combine/backtest";
import type { Candle } from "@combine/candle";
import type { CandleData } from "@combine/core/strategy";
import type { Exchange, Timeframe } from "@combine/shared";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { candles as candlesTable } from "../db/schema/candles.js";
import { strategies as strategiesTable } from "../db/schema/strategies.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Indicator warm-up window passed to StrategyExecutor per bar. */
const WINDOW_SIZE = 300;

/** Save a checkpoint after every N events during backtest. */
const CHECKPOINT_EVERY_N = 500;

/** Backtest covers this many years of historical data. */
const BACKTEST_YEARS = 3;

/** Strategy version used for backtest. */
const STRATEGY_VERSION = 1;

/** BTCUSDT 1m on Binance — matches T-206 data load. */
const SYMBOL = "BTCUSDT";
const EXCHANGE = "binance";
const TIMEFRAME = "1m";

/** TP/SL config for labeling — derived from DoubleBB resultConfig. */
const RESULT_CONFIG = {
	tpPct: 2.0, // 2× ATR-based, approximated as 2% for labeling
	slPct: 1.0, // 1× ATR-based, approximated as 1% for labeling
	maxHoldBars: 60,
};

/** Directory for reports and checkpoints. */
const REPORTS_DIR = join(import.meta.dir, "../reports");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BacktestRunConfig {
	strategyId: string;
	strategyName: string;
	direction: "long" | "short";
	strategyCode: string;
}

export interface BacktestSummary {
	strategyId: string;
	strategyName: string;
	direction: "long" | "short";
	totalEvents: number;
	expectancy: number;
	winrate: number;
	statsValid: boolean;
	durationMs: number;
	reportPath: string;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/** Query Double-BB strategy record by direction from DB. */
export async function findDoubleBBStrategy(
	db: PostgresJsDatabase,
	direction: "long" | "short",
): Promise<{ id: string; name: string; code: string; direction: string } | null> {
	const nameSuffix = direction.toUpperCase();
	const rows = await db
		.select({
			id: strategiesTable.id,
			name: strategiesTable.name,
			code: strategiesTable.code,
			direction: strategiesTable.direction,
		})
		.from(strategiesTable)
		.where(eq(strategiesTable.name, `Double-BB-${nameSuffix}`))
		.limit(1);
	return rows[0] ?? null;
}

/** Load all 3yr 1m candles for BTCUSDT/binance from DB, sorted ascending. */
export async function loadCandles(
	db: PostgresJsDatabase,
	fromDate: Date,
	toDate: Date,
): Promise<Candle[]> {
	const rows = await db
		.select()
		.from(candlesTable)
		.where(
			and(
				eq(candlesTable.exchange, EXCHANGE),
				eq(candlesTable.symbol, SYMBOL),
				eq(candlesTable.timeframe, TIMEFRAME),
				gte(candlesTable.openTime, fromDate),
				lte(candlesTable.openTime, toDate),
			),
		)
		.orderBy(asc(candlesTable.openTime));

	return rows.map((r) => ({
		exchange: r.exchange as Exchange,
		symbol: r.symbol,
		timeframe: r.timeframe as Timeframe,
		openTime: r.openTime,
		open: r.open,
		high: r.high,
		low: r.low,
		close: r.close,
		volume: r.volume,
		isClosed: r.isClosed,
	}));
}

// ---------------------------------------------------------------------------
// Checkpoint helpers
// ---------------------------------------------------------------------------

function checkpointPath(strategyId: string): string {
	return join(REPORTS_DIR, `checkpoint-${strategyId}-v${STRATEGY_VERSION}.json`);
}

export async function loadCheckpointFromFile(
	strategyId: string,
): Promise<BacktestCheckpoint | null> {
	const path = checkpointPath(strategyId);
	if (!existsSync(path)) return null;
	try {
		const raw = await readFile(path, "utf-8");
		const parsed = JSON.parse(raw) as BacktestCheckpoint & {
			events: Array<BacktestEvent & { openTime: string }>;
		};
		// Deserialize Date fields from ISO strings
		return {
			...parsed,
			events: parsed.events.map((e) => ({
				...e,
				openTime: new Date(e.openTime),
			})),
		};
	} catch {
		console.warn(`[checkpoint] Failed to load checkpoint at ${path} — starting fresh`);
		return null;
	}
}

export async function saveCheckpointToFile(
	strategyId: string,
	checkpoint: BacktestCheckpoint,
): Promise<void> {
	ensureReportsDir();
	const path = checkpointPath(strategyId);
	await writeFile(path, JSON.stringify(checkpoint, null, 2), "utf-8");
}

async function deleteCheckpointFile(strategyId: string): Promise<void> {
	const path = checkpointPath(strategyId);
	if (existsSync(path)) {
		const { unlink } = await import("node:fs/promises");
		await unlink(path);
	}
}

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

function ensureReportsDir(): void {
	if (!existsSync(REPORTS_DIR)) {
		mkdirSync(REPORTS_DIR, { recursive: true });
	}
}

function reportPath(direction: "long" | "short", date: string): string {
	return join(REPORTS_DIR, `double-bb-backtest-${direction}-${date}.json`);
}

export async function saveReportToFile(
	direction: "long" | "short",
	report: object,
	result: BacktestResult,
): Promise<string> {
	ensureReportsDir();
	const dateStr = new Date().toISOString().slice(0, 10);
	const path = reportPath(direction, dateStr);
	const payload = {
		generatedAt: new Date().toISOString(),
		direction,
		durationMs: result.durationMs,
		totalCandles: result.totalCandles,
		...report,
	};
	await writeFile(path, JSON.stringify(payload, null, 2), "utf-8");
	return path;
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

let _lastProgressPct = -1;

function printProgress(processed: number, total: number): void {
	const pct = total > 0 ? Math.floor((processed / total) * 100) : 0;
	if (pct === _lastProgressPct) return;
	_lastProgressPct = pct;
	const filled = "#".repeat(Math.floor(pct / 5));
	const empty = ".".repeat(20 - filled.length);
	process.stdout.write(
		`\r  [${filled}${empty}] ${pct}% (${processed.toLocaleString()}/${total.toLocaleString()})   `,
	);
	if (processed >= total) process.stdout.write("\n");
}

// ---------------------------------------------------------------------------
// Execute a single strategy backtest
// ---------------------------------------------------------------------------

export async function runStrategyBacktest(
	config: BacktestRunConfig,
	allCandles: Candle[],
): Promise<{ result: BacktestResult; reportPath: string; statsValid: boolean }> {
	const { strategyId, strategyName, direction, strategyCode } = config;

	console.info(`\n[backtest] Starting: ${strategyName} (${strategyId})`);
	console.info(`  Candle count: ${allCandles.length.toLocaleString()}`);

	// Lazy-import sandbox/executor to keep the top-level module importable without live DB
	const { StrategySandbox } = await import("@combine/core/strategy/sandbox.js");
	const { StrategyExecutor } = await import("@combine/core/strategy");

	const sandbox = new StrategySandbox({ timeoutMs: 1000 });
	await sandbox.initialize();

	const executor = new StrategyExecutor({ sandbox });

	/**
	 * executeStrategy for BacktestEngineDeps.
	 *
	 * Look-ahead bias prevention: for candle at index i in allCandles,
	 * the executor receives only candles[max(0, i-WINDOW_SIZE)..i].
	 * barIndex is always the last element of that window slice.
	 */
	const executeStrategy = async (
		candle: Candle,
	): Promise<{ entryPrice: string; direction: "long" | "short" } | null> => {
		// Binary search for candle index in sorted allCandles array
		const candleMs = candle.openTime.getTime();
		let lo = 0;
		let hi = allCandles.length - 1;
		let candleIndex = -1;
		while (lo <= hi) {
			const mid = (lo + hi) >>> 1;
			const midCandle = allCandles[mid];
			const t = midCandle ? midCandle.openTime.getTime() : -1;
			if (t === candleMs) {
				candleIndex = mid;
				break;
			}
			if (t < candleMs) lo = mid + 1;
			else hi = mid - 1;
		}
		if (candleIndex === -1) return null;

		// Build windowed slice — no future candles (look-ahead bias prevention)
		const windowStart = Math.max(0, candleIndex - WINDOW_SIZE + 1);
		const windowCandles = allCandles.slice(windowStart, candleIndex + 1);

		const candleData: CandleData = {
			open: windowCandles.map((c) => Number(c.open)),
			high: windowCandles.map((c) => Number(c.high)),
			low: windowCandles.map((c) => Number(c.low)),
			close: windowCandles.map((c) => Number(c.close)),
			volume: windowCandles.map((c) => Number(c.volume)),
		};

		const sandboxResult = await executor.execute({
			code: strategyCode,
			symbol: SYMBOL,
			timeframe: TIMEFRAME,
			direction,
			candles: candleData,
			barIndex: windowCandles.length - 1,
			indicatorConfig: {
				bb: [
					{ source: "close", period: 20, stddev: 2 },
					{ source: "open", period: 4, stddev: 4 },
				],
				sma: [{ period: 20 }, { period: 50 }, { period: 100 }, { period: 200 }],
				atr: [{ period: 14 }],
			},
		});

		if (!sandboxResult.entryCondition) return null;

		return {
			entryPrice: candle.close,
			direction,
		};
	};

	// Load checkpoint if available
	const checkpoint = await loadCheckpointFromFile(strategyId);
	if (checkpoint) {
		console.info(
			`  Resuming from checkpoint: lastCandleIndex=${checkpoint.lastCandleIndex}, events=${checkpoint.events.length}`,
		);
	}

	_lastProgressPct = -1;

	// Run or resume backtest
	const result: BacktestResult = checkpoint
		? await resumeFromCheckpoint(
				allCandles,
				checkpoint,
				{
					strategyId,
					version: STRATEGY_VERSION,
					executeStrategy,
					saveCheckpoint: (cp) => saveCheckpointToFile(strategyId, cp),
					loadCheckpoint: () => loadCheckpointFromFile(strategyId),
				},
				{
					checkpointEveryN: CHECKPOINT_EVERY_N,
					onProgress: printProgress,
				},
			)
		: await runBacktest(
				allCandles,
				{
					strategyId,
					version: STRATEGY_VERSION,
					executeStrategy,
					saveCheckpoint: (cp) => saveCheckpointToFile(strategyId, cp),
					loadCheckpoint: () => loadCheckpointFromFile(strategyId),
				},
				{
					checkpointEveryN: CHECKPOINT_EVERY_N,
					onProgress: printProgress,
				},
			);

	console.info(
		`  Backtest complete: ${result.events.length} events in ${(result.durationMs / 1000).toFixed(1)}s`,
	);

	// Label events for report
	console.info("  Labeling events...");
	const labeledEvents: LabeledEvent[] = result.events.map((event) => ({
		event,
		label: labelBacktestEvent(event, allCandles, RESULT_CONFIG),
	}));

	// Compute report
	const report = computeReport(labeledEvents);

	// Stats validation (warn only — do not exit)
	const trades = report.totalEvents;
	const expectancy = report.expectancy;
	let statsValid = true;

	if (trades < 100) {
		console.warn(
			`  WARNING: trades=${trades} < 100 (minimum threshold). Consider adjusting parameters.`,
		);
		statsValid = false;
	}
	if (expectancy <= 0) {
		console.warn(
			`  WARNING: expectancy=${expectancy.toFixed(4)} <= 0. Strategy may not be profitable.`,
		);
		statsValid = false;
	}

	if (statsValid) {
		console.info(
			`  Stats OK: trades=${trades}, expectancy=${expectancy.toFixed(4)}, winrate=${(report.winrate * 100).toFixed(1)}%`,
		);
	}

	// Save report
	const savedPath = await saveReportToFile(direction, report, result);
	console.info(`  Report saved: ${savedPath}`);

	// Remove checkpoint on success
	await deleteCheckpointFile(strategyId);

	return { result, reportPath: savedPath, statsValid };
}

// ---------------------------------------------------------------------------
// HNSW reindex
// ---------------------------------------------------------------------------

export async function reindexHnswIndexes(db: PostgresJsDatabase): Promise<void> {
	console.info("\n[reindex] Running REINDEX INDEX CONCURRENTLY on HNSW indexes...");

	// Query pgvector HNSW indexes from pg_indexes
	const rows = await db.execute(
		sql`
			SELECT indexname
			FROM pg_indexes
			WHERE indexdef ILIKE '%hnsw%'
			ORDER BY indexname
		`,
	);

	const indexNames: string[] = (rows as Array<{ indexname: string }>).map((r) => r.indexname);

	if (indexNames.length === 0) {
		console.info("  No HNSW indexes found — skipping REINDEX.");
		return;
	}

	console.info(`  Found ${indexNames.length} HNSW index(es): ${indexNames.join(", ")}`);

	for (const indexName of indexNames) {
		console.info(`  REINDEX INDEX CONCURRENTLY ${indexName}...`);
		// REINDEX CONCURRENTLY cannot run in a transaction — use raw SQL execute
		await db.execute(sql.raw(`REINDEX INDEX CONCURRENTLY "${indexName}"`));
		console.info(`    Done: ${indexName}`);
	}

	console.info("  HNSW REINDEX complete.");
}

// ---------------------------------------------------------------------------
// Stats helpers (used for summary re-computation)
// ---------------------------------------------------------------------------

function computeStatsForSummary(
	events: BacktestEvent[],
	allCandles: Candle[],
): { expectancy: number; winrate: number } {
	const labeled: LabeledEvent[] = events.map((event) => ({
		event,
		label: labelBacktestEvent(event, allCandles, RESULT_CONFIG),
	}));
	const report = computeReport(labeled);
	return { expectancy: report.expectancy, winrate: report.winrate };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

if (import.meta.main) {
	const { db } = await import("../db/index.js");

	try {
		// Date range: now - 3yr to now
		const now = new Date();
		const fromDate = new Date(now);
		fromDate.setUTCFullYear(now.getUTCFullYear() - BACKTEST_YEARS);

		console.info(
			`[double-bb-backtest] Date range: ${fromDate.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`,
		);

		// Fetch strategy records
		console.info("\n[setup] Querying Double-BB strategies from DB...");
		const [longStrategy, shortStrategy] = await Promise.all([
			findDoubleBBStrategy(db, "long"),
			findDoubleBBStrategy(db, "short"),
		]);

		if (!longStrategy) {
			console.error(
				"[setup] ERROR: Double-BB-LONG strategy not found in DB. Run T-102 seed first.",
			);
			process.exit(1);
		}
		if (!shortStrategy) {
			console.error(
				"[setup] ERROR: Double-BB-SHORT strategy not found in DB. Run T-102 seed first.",
			);
			process.exit(1);
		}

		console.info(`  LONG  strategy: id=${longStrategy.id}`);
		console.info(`  SHORT strategy: id=${shortStrategy.id}`);

		// Load 3yr candles once — shared for both strategies
		console.info(`\n[setup] Loading ${BACKTEST_YEARS}yr ${SYMBOL} ${TIMEFRAME} candles from DB...`);
		const allCandles = await loadCandles(db, fromDate, now);
		console.info(`  Loaded: ${allCandles.length.toLocaleString()} candles`);

		if (allCandles.length < WINDOW_SIZE) {
			console.error(
				`[setup] ERROR: Not enough candles (${allCandles.length} < ${WINDOW_SIZE}). Ensure T-206 data load is complete.`,
			);
			process.exit(1);
		}

		// Run LONG backtest
		const longRun = await runStrategyBacktest(
			{
				strategyId: longStrategy.id,
				strategyName: longStrategy.name,
				direction: "long",
				strategyCode: longStrategy.code,
			},
			allCandles,
		);

		// Run SHORT backtest
		const shortRun = await runStrategyBacktest(
			{
				strategyId: shortStrategy.id,
				strategyName: shortStrategy.name,
				direction: "short",
				strategyCode: shortStrategy.code,
			},
			allCandles,
		);

		// HNSW reindex
		await reindexHnswIndexes(db);

		// Final summary
		console.info("\n[summary] ===== BACKTEST COMPLETE =====");

		const longStats = computeStatsForSummary(longRun.result.events, allCandles);
		const shortStats = computeStatsForSummary(shortRun.result.events, allCandles);

		const summaries: BacktestSummary[] = [
			{
				strategyId: longStrategy.id,
				strategyName: longStrategy.name,
				direction: "long",
				totalEvents: longRun.result.events.length,
				expectancy: longStats.expectancy,
				winrate: longStats.winrate,
				statsValid: longRun.statsValid,
				durationMs: longRun.result.durationMs,
				reportPath: longRun.reportPath,
			},
			{
				strategyId: shortStrategy.id,
				strategyName: shortStrategy.name,
				direction: "short",
				totalEvents: shortRun.result.events.length,
				expectancy: shortStats.expectancy,
				winrate: shortStats.winrate,
				statsValid: shortRun.statsValid,
				durationMs: shortRun.result.durationMs,
				reportPath: shortRun.reportPath,
			},
		];

		for (const s of summaries) {
			const status = s.statsValid ? "OK" : "WARN";
			console.info(
				`  [${status}] ${s.strategyName}: events=${s.totalEvents}, expectancy=${s.expectancy.toFixed(4)}, winrate=${(s.winrate * 100).toFixed(1)}%, duration=${(s.durationMs / 1000).toFixed(1)}s`,
			);
			console.info(`        report: ${s.reportPath}`);
		}

		const allValid = summaries.every((s) => s.statsValid);
		if (!allValid) {
			console.warn(
				"\n[summary] One or more strategies did not meet stats thresholds. Review reports and adjust parameters if needed.",
			);
		} else {
			console.info("\n[summary] All strategies passed stats validation.");
		}
	} catch (err) {
		console.error("\n[backtest] Fatal error:", err instanceof Error ? err.message : String(err));
		if (err instanceof Error && err.stack) {
			console.error(err.stack);
		}
		process.exit(1);
	}
}
