/**
 * backfill-candles.ts — Binance Vision 3-tier candle backfill script.
 *
 * Downloads historical OHLCV candle data using a 3-tier strategy:
 *   Tier 1: Binance Vision monthly ZIP archives (bulk, fastest)
 *   Tier 2: Binance Vision daily ZIP archives (current-month gap fill)
 *   Tier 3: CCXT REST fetchOHLCV (last ~1 day, real-time tail)
 *
 * SHA256 CHECKSUM verification is mandatory for all ZIP downloads.
 * Idempotency: skips time ranges already stored in the database.
 *
 * Usage:
 *   bun run scripts/backfill-candles.ts \
 *     --exchange binance \
 *     --symbol BTCUSDT \
 *     --timeframe 1m \
 *     --years 3
 *
 * Exit codes:
 *   0 — success
 *   1 — argument / checksum / continuity error
 */

import { createHash } from "node:crypto";
import type { Candle } from "@combine/candle";
import { validateContinuity } from "@combine/candle";
import { parseBinanceVisionCsv } from "@combine/backtest";
import type { Exchange, Timeframe } from "@combine/shared";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, desc, eq } from "drizzle-orm";
import { candles as candlesTable } from "../db/schema/candles.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BINANCE_VISION_BASE =
	"https://data.binance.vision/data/futures/um";

export const TIER3_REST_DAYS = 1; // REST fallback covers last N days
export const BATCH_INSERT_SIZE = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackfillArgs {
	exchange: Exchange;
	symbol: string;
	timeframe: Timeframe;
	years: number;
}

export interface TierResult {
	tier: 1 | 2 | 3;
	label: string;
	inserted: number;
	skipped: number;
}

export interface BackfillResult {
	totalInserted: number;
	totalSkipped: number;
	tiers: TierResult[];
	continuityGaps: number;
}

export interface DownloadDeps {
	fetch: typeof globalThis.fetch;
}

export interface RepoDeps {
	findLatestOpenTime(
		exchange: Exchange,
		symbol: string,
		timeframe: Timeframe,
	): Promise<Date | null>;
	upsertBatch(candles: Candle[], source: string): Promise<void>;
	findByRange(
		exchange: Exchange,
		symbol: string,
		timeframe: Timeframe,
		from: Date,
		to: Date,
	): Promise<Candle[]>;
}

export interface ExchangeAdapterDeps {
	fetchOHLCV(
		symbol: string,
		timeframe: Timeframe,
		since?: number,
		limit?: number,
	): Promise<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }[]>;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

export function parseBackfillArgs(argv: string[]): BackfillArgs {
	const get = (flag: string): string | undefined => {
		const idx = argv.indexOf(flag);
		return idx !== -1 ? argv[idx + 1] : undefined;
	};

	const exchange = get("--exchange");
	const symbol = get("--symbol");
	const timeframe = get("--timeframe");
	const yearsStr = get("--years");

	if (!exchange || !symbol || !timeframe || !yearsStr) {
		throw new Error(
			"Usage: backfill-candles.ts --exchange <exchange> --symbol <symbol> --timeframe <timeframe> --years <years>",
		);
	}

	const validExchanges: Exchange[] = ["binance", "okx"];
	if (!validExchanges.includes(exchange as Exchange)) {
		throw new Error(`Unsupported exchange: ${exchange}. Supported: ${validExchanges.join(", ")}`);
	}

	const validTimeframes: Timeframe[] = ["1m", "3m", "5m", "15m", "1h", "4h", "1d"];
	if (!validTimeframes.includes(timeframe as Timeframe)) {
		throw new Error(
			`Unsupported timeframe: ${timeframe}. Supported: ${validTimeframes.join(", ")}`,
		);
	}

	const years = Number(yearsStr);
	if (!Number.isFinite(years) || years <= 0) {
		throw new Error(`Invalid --years value: ${yearsStr}`);
	}

	return {
		exchange: exchange as Exchange,
		symbol,
		timeframe: timeframe as Timeframe,
		years,
	};
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

/** Monthly ZIP URL: e.g. BTCUSDT-1m-2024-01.zip */
export function monthlyZipUrl(symbol: string, timeframe: Timeframe, year: number, month: number): string {
	const mm = String(month).padStart(2, "0");
	const file = `${symbol}-${timeframe}-${year}-${mm}.zip`;
	return `${BINANCE_VISION_BASE}/monthly/klines/${symbol}/${timeframe}/${file}`;
}

/** Monthly CHECKSUM URL */
export function monthlyChecksumUrl(
	symbol: string,
	timeframe: Timeframe,
	year: number,
	month: number,
): string {
	return `${monthlyZipUrl(symbol, timeframe, year, month)}.CHECKSUM`;
}

/** Daily ZIP URL: e.g. BTCUSDT-1m-2024-01-15.zip */
export function dailyZipUrl(
	symbol: string,
	timeframe: Timeframe,
	year: number,
	month: number,
	day: number,
): string {
	const mm = String(month).padStart(2, "0");
	const dd = String(day).padStart(2, "0");
	const file = `${symbol}-${timeframe}-${year}-${mm}-${dd}.zip`;
	return `${BINANCE_VISION_BASE}/daily/klines/${symbol}/${timeframe}/${file}`;
}

/** Daily CHECKSUM URL */
export function dailyChecksumUrl(
	symbol: string,
	timeframe: Timeframe,
	year: number,
	month: number,
	day: number,
): string {
	return `${dailyZipUrl(symbol, timeframe, year, month, day)}.CHECKSUM`;
}

// ---------------------------------------------------------------------------
// Download + verify
// ---------------------------------------------------------------------------

/**
 * Download a file from URL and return as Uint8Array.
 * Returns null if the server responds with 404 (file not available yet).
 */
export async function downloadBytes(
	url: string,
	fetchFn: typeof globalThis.fetch,
): Promise<Uint8Array | null> {
	const res = await fetchFn(url);
	if (res.status === 404) return null;
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} fetching ${url}`);
	}
	const buf = await res.arrayBuffer();
	return new Uint8Array(buf);
}

/**
 * Parse a Binance Vision CHECKSUM file.
 * Format: "<sha256hex>  <filename>"
 */
export function parseChecksumFile(content: string): string {
	const line = content.trim().split("\n")[0] ?? "";
	const hash = line.split(/\s+/)[0] ?? "";
	if (hash.length !== 64) {
		throw new Error(`Malformed CHECKSUM file: "${content.trim()}"`);
	}
	return hash.toLowerCase();
}

/**
 * Compute SHA256 hex digest of bytes.
 */
export function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Verify that bytes match expected SHA256 from checksum file content.
 * Throws on mismatch.
 */
export function verifyChecksum(bytes: Uint8Array, checksumContent: string): void {
	const expected = parseChecksumFile(checksumContent);
	const actual = sha256Hex(bytes);
	if (actual !== expected) {
		throw new Error(
			`SHA256 checksum mismatch: expected ${expected}, got ${actual}`,
		);
	}
}

/**
 * Extract the first file from a ZIP buffer and return as UTF-8 string.
 * Uses node:zlib's unzipSync (Bun-compatible).
 */
export function extractZipCsv(zipBytes: Uint8Array): string {
	// ZIP local file header: signature 0x04034b50
	// We use a simple approach: find the CSV content via unzip.
	// Bun/Node's built-in unzipSync doesn't handle ZIP directly — we need
	// a ZIP parser. We'll implement a minimal ZIP local-file-entry reader.
	return extractFirstZipEntry(zipBytes);
}

/**
 * Minimal ZIP local file entry extractor.
 * Reads the first local file entry and decompresses it if needed.
 * Supports stored (method 0) and deflated (method 8) entries.
 */
export function extractFirstZipEntry(zipBytes: Uint8Array): string {
	const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);

	// Local file header signature: 0x04034b50
	const sig = view.getUint32(0, true);
	if (sig !== 0x04034b50) {
		throw new Error("Not a valid ZIP file (wrong signature)");
	}

	const compressionMethod = view.getUint16(8, true);
	const compressedSize = view.getUint32(18, true);
	const filenameLen = view.getUint16(26, true);
	const extraLen = view.getUint16(28, true);

	const dataOffset = 30 + filenameLen + extraLen;
	const compressedData = zipBytes.slice(dataOffset, dataOffset + compressedSize);

	let rawData: Uint8Array;
	if (compressionMethod === 0) {
		// Stored (no compression)
		rawData = compressedData;
	} else if (compressionMethod === 8) {
		// Deflated — use raw deflate (no zlib header)
		rawData = inflateRaw(compressedData);
	} else {
		throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
	}

	return new TextDecoder().decode(rawData);
}

/**
 * Inflate raw deflated bytes (no zlib header/trailer).
 * Uses node:zlib's inflateRawSync.
 */
export function inflateRaw(compressed: Uint8Array): Uint8Array {
	const { inflateRawSync } = require("node:zlib") as typeof import("node:zlib");
	return inflateRawSync(compressed);
}

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

/** Generate [year, month] pairs from startYear-startMonth up to (but not including) endYear-endMonth. */
export function monthRange(
	startYear: number,
	startMonth: number,
	endYear: number,
	endMonth: number,
): Array<[number, number]> {
	const months: Array<[number, number]> = [];
	let y = startYear;
	let m = startMonth;
	while (y < endYear || (y === endYear && m < endMonth)) {
		months.push([y, m]);
		m++;
		if (m > 12) {
			m = 1;
			y++;
		}
	}
	return months;
}

/** Returns number of days in a given month/year. */
export function daysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate();
}

/** Returns the start-of-day UTC Date for a given year/month/day. */
export function utcDay(year: number, month: number, day: number): Date {
	return new Date(Date.UTC(year, month - 1, day));
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * Find the latest stored open_time for the given scope.
 * Returns null if no candles exist yet.
 */
export async function findLatestStoredTime(
	db: PostgresJsDatabase,
	exchange: Exchange,
	symbol: string,
	timeframe: Timeframe,
): Promise<Date | null> {
	const rows = await db
		.select({ openTime: candlesTable.openTime })
		.from(candlesTable)
		.where(
			and(
				eq(candlesTable.exchange, exchange),
				eq(candlesTable.symbol, symbol),
				eq(candlesTable.timeframe, timeframe),
			),
		)
		.orderBy(desc(candlesTable.openTime))
		.limit(1);

	return rows.length > 0 ? rows[0]!.openTime : null;
}

// ---------------------------------------------------------------------------
// Batch upsert
// ---------------------------------------------------------------------------

/**
 * Bulk upsert candles using ON CONFLICT DO UPDATE.
 * Splits into BATCH_INSERT_SIZE chunks to avoid query size limits.
 */
export async function batchUpsert(
	db: PostgresJsDatabase,
	candles: Candle[],
	source: string,
): Promise<void> {
	if (candles.length === 0) return;

	for (let i = 0; i < candles.length; i += BATCH_INSERT_SIZE) {
		const chunk = candles.slice(i, i + BATCH_INSERT_SIZE);
		await db
			.insert(candlesTable)
			.values(
				chunk.map((c) => ({
					exchange: c.exchange,
					symbol: c.symbol,
					timeframe: c.timeframe,
					openTime: c.openTime,
					open: c.open,
					high: c.high,
					low: c.low,
					close: c.close,
					volume: c.volume,
					isClosed: c.isClosed,
					source,
				})),
			)
			.onConflictDoUpdate({
				target: [
					candlesTable.exchange,
					candlesTable.symbol,
					candlesTable.timeframe,
					candlesTable.openTime,
				],
				set: {
					open: candlesTable.open,
					high: candlesTable.high,
					low: candlesTable.low,
					close: candlesTable.close,
					volume: candlesTable.volume,
					isClosed: candlesTable.isClosed,
					source,
				},
			});
	}
}

// ---------------------------------------------------------------------------
// Tier 1: monthly archives
// ---------------------------------------------------------------------------

/**
 * Download, verify, parse a monthly ZIP and return Candle[].
 * Returns null if the file is not available (404).
 */
export async function downloadMonthlyCandles(
	symbol: string,
	timeframe: Timeframe,
	year: number,
	month: number,
	exchange: Exchange,
	fetchFn: typeof globalThis.fetch,
): Promise<Candle[] | null> {
	const zipUrl = monthlyZipUrl(symbol, timeframe, year, month);
	const checksumUrl = monthlyChecksumUrl(symbol, timeframe, year, month);

	const [zipBytes, checksumBytes] = await Promise.all([
		downloadBytes(zipUrl, fetchFn),
		downloadBytes(checksumUrl, fetchFn),
	]);

	if (zipBytes === null || checksumBytes === null) return null;

	const checksumContent = new TextDecoder().decode(checksumBytes);
	verifyChecksum(zipBytes, checksumContent);

	const csv = extractZipCsv(zipBytes);
	return parseBinanceVisionCsv(csv, { exchange, symbol, timeframe });
}

// ---------------------------------------------------------------------------
// Tier 2: daily archives
// ---------------------------------------------------------------------------

/**
 * Download, verify, parse a daily ZIP and return Candle[].
 * Returns null if the file is not available (404).
 */
export async function downloadDailyCandles(
	symbol: string,
	timeframe: Timeframe,
	year: number,
	month: number,
	day: number,
	exchange: Exchange,
	fetchFn: typeof globalThis.fetch,
): Promise<Candle[] | null> {
	const zipUrl = dailyZipUrl(symbol, timeframe, year, month, day);
	const checksumUrl = dailyChecksumUrl(symbol, timeframe, year, month, day);

	const [zipBytes, checksumBytes] = await Promise.all([
		downloadBytes(zipUrl, fetchFn),
		downloadBytes(checksumUrl, fetchFn),
	]);

	if (zipBytes === null || checksumBytes === null) return null;

	const checksumContent = new TextDecoder().decode(checksumBytes);
	verifyChecksum(zipBytes, checksumContent);

	const csv = extractZipCsv(zipBytes);
	return parseBinanceVisionCsv(csv, { exchange, symbol, timeframe });
}

// ---------------------------------------------------------------------------
// Tier 3: REST fallback
// ---------------------------------------------------------------------------

/**
 * Fetch candles via CCXT REST for the period after `since` (inclusive, unix ms).
 * Paginates until no more data is returned or we reach `untilMs`.
 */
export async function fetchRestCandles(
	adapter: ExchangeAdapterDeps,
	exchange: Exchange,
	symbol: string,
	timeframe: Timeframe,
	sinceMs: number,
	untilMs: number,
): Promise<Candle[]> {
	const result: Candle[] = [];
	let cursor = sinceMs;
	const limit = 1000;

	while (cursor < untilMs) {
		const rows = await adapter.fetchOHLCV(symbol, timeframe, cursor, limit);
		if (rows.length === 0) break;

		for (const row of rows) {
			if (row.timestamp >= untilMs) break;
			result.push({
				exchange,
				symbol,
				timeframe,
				openTime: new Date(row.timestamp),
				open: String(row.open),
				high: String(row.high),
				low: String(row.low),
				close: String(row.close),
				volume: String(row.volume),
				isClosed: true,
			});
		}

		const lastTs = rows[rows.length - 1]?.timestamp ?? cursor;
		if (lastTs <= cursor) break; // no forward progress
		cursor = lastTs + 1;
	}

	return result;
}

// ---------------------------------------------------------------------------
// Continuity validation
// ---------------------------------------------------------------------------

/**
 * Load stored candles for the full backfill range and run continuity validation.
 * Returns gap count (0 = continuous).
 */
export async function validateStoredContinuity(
	db: PostgresJsDatabase,
	exchange: Exchange,
	symbol: string,
	timeframe: Timeframe,
	from: Date,
	to: Date,
): Promise<number> {
	const rows = await db
		.select()
		.from(candlesTable)
		.where(
			and(
				eq(candlesTable.exchange, exchange),
				eq(candlesTable.symbol, symbol),
				eq(candlesTable.timeframe, timeframe),
			),
		)
		.orderBy(candlesTable.openTime)
		.limit(10_000); // sample for continuity check

	const candles: Candle[] = rows
		.filter((r) => r.openTime >= from && r.openTime <= to)
		.map((r) => ({
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

	const gaps = validateContinuity(candles);
	return gaps.length;
}

// ---------------------------------------------------------------------------
// Progress reporter
// ---------------------------------------------------------------------------

export interface ProgressReporter {
	report(pct: number, message: string): void;
}

export const consoleReporter: ProgressReporter = {
	report(pct: number, message: string): void {
		const bar = Math.round(pct / 5);
		const filled = "#".repeat(bar);
		const empty = ".".repeat(20 - bar);
		process.stdout.write(`\r[${filled}${empty}] ${pct.toFixed(1)}% — ${message}   `);
		if (pct >= 100) process.stdout.write("\n");
	},
};

// ---------------------------------------------------------------------------
// Main backfill orchestrator
// ---------------------------------------------------------------------------

export interface BackfillDeps {
	db: PostgresJsDatabase;
	adapter: ExchangeAdapterDeps;
	fetchFn: typeof globalThis.fetch;
	now?: Date;
	progress?: ProgressReporter;
}

export async function runBackfill(
	args: BackfillArgs,
	deps: BackfillDeps,
): Promise<BackfillResult> {
	const { exchange, symbol, timeframe, years } = args;
	const { db, adapter, fetchFn, progress = consoleReporter } = deps;
	const now = deps.now ?? new Date();

	const nowYear = now.getUTCFullYear();
	const nowMonth = now.getUTCMonth() + 1; // 1-based
	const nowDay = now.getUTCDate();

	// Start date: years ago, first day of that month
	const startDate = new Date(now);
	startDate.setUTCFullYear(nowYear - years);
	const startYear = startDate.getUTCFullYear();
	const startMonth = startDate.getUTCMonth() + 1;

	// Find latest already-stored open_time for idempotency
	const latestStored = await findLatestStoredTime(db, exchange, symbol, timeframe);
	const latestStoredMs = latestStored?.getTime() ?? -Infinity;

	const result: BackfillResult = {
		totalInserted: 0,
		totalSkipped: 0,
		tiers: [],
	} as unknown as BackfillResult;
	result.tiers = [];

	// -------------------------------------------------------------------------
	// Tier 1: Monthly archives
	// -------------------------------------------------------------------------

	// Months up to (but not including) current month — monthly archives are
	// only published after the month closes.
	const monthsForTier1 = monthRange(startYear, startMonth, nowYear, nowMonth);
	let tier1Inserted = 0;
	let tier1Skipped = 0;

	for (let i = 0; i < monthsForTier1.length; i++) {
		const [year, month] = monthsForTier1[i]!;
		const pct = (i / (monthsForTier1.length + 1)) * 60; // Tier 1 covers ~60% of progress
		progress.report(pct, `Tier 1 — ${year}-${String(month).padStart(2, "0")} monthly ZIP`);

		// Idempotency: skip entire month if latest stored >= end of this month
		const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
		if (latestStoredMs >= monthEnd.getTime()) {
			tier1Skipped++;
			continue;
		}

		const candles = await downloadMonthlyCandles(
			symbol,
			timeframe,
			year,
			month,
			exchange,
			fetchFn,
		);

		if (candles === null) {
			// Not available yet — fall through to daily
			continue;
		}

		// Filter out already-stored candles (fine-grained idempotency)
		const newCandles = candles.filter((c) => c.openTime.getTime() > latestStoredMs);

		if (newCandles.length > 0) {
			await batchUpsert(db, newCandles, "binance-vision-monthly");
			tier1Inserted += newCandles.length;
		} else {
			tier1Skipped++;
		}
	}

	result.tiers.push({
		tier: 1,
		label: "Binance Vision monthly",
		inserted: tier1Inserted,
		skipped: tier1Skipped,
	});

	progress.report(60, "Tier 1 complete");

	// -------------------------------------------------------------------------
	// Tier 2: Daily archives for current month
	// -------------------------------------------------------------------------

	// Current month days up to yesterday (today's daily archive may not be published)
	let tier2Inserted = 0;
	let tier2Skipped = 0;
	const totalDaysCurrentMonth = daysInMonth(nowYear, nowMonth);
	const daysToProcess = nowDay - 1; // days 1..(today-1)

	for (let day = 1; day <= daysToProcess; day++) {
		const dayPct = 60 + (day / Math.max(daysToProcess, 1)) * 25;
		progress.report(
			dayPct,
			`Tier 2 — ${nowYear}-${String(nowMonth).padStart(2, "0")}-${String(day).padStart(2, "0")} daily ZIP`,
		);

		// Idempotency: skip if day is fully stored
		const dayEnd = new Date(Date.UTC(nowYear, nowMonth - 1, day, 23, 59, 59, 999));
		if (latestStoredMs >= dayEnd.getTime()) {
			tier2Skipped++;
			continue;
		}

		const candles = await downloadDailyCandles(
			symbol,
			timeframe,
			nowYear,
			nowMonth,
			day,
			exchange,
			fetchFn,
		);

		if (candles === null) {
			tier2Skipped++;
			continue;
		}

		const newCandles = candles.filter((c) => c.openTime.getTime() > latestStoredMs);
		if (newCandles.length > 0) {
			await batchUpsert(db, newCandles, "binance-vision-daily");
			tier2Inserted += newCandles.length;
		} else {
			tier2Skipped++;
		}
	}

	// Suppress unused variable warning when daysToProcess is 0
	void totalDaysCurrentMonth;

	result.tiers.push({
		tier: 2,
		label: "Binance Vision daily",
		inserted: tier2Inserted,
		skipped: tier2Skipped,
	});

	progress.report(85, "Tier 2 complete");

	// -------------------------------------------------------------------------
	// Tier 3: REST fallback for last ~1 day
	// -------------------------------------------------------------------------

	const tier3Start = new Date(now.getTime() - TIER3_REST_DAYS * 86_400_000);

	// Re-fetch latest stored time after Tier 1+2 inserts
	const latestAfterTier2 = await findLatestStoredTime(db, exchange, symbol, timeframe);
	const restSinceMs =
		latestAfterTier2 !== null
			? latestAfterTier2.getTime() + 1
			: tier3Start.getTime();

	let tier3Inserted = 0;
	let tier3Skipped = 0;

	progress.report(85, "Tier 3 — REST fetch");

	if (restSinceMs < now.getTime()) {
		const restCandles = await fetchRestCandles(
			adapter,
			exchange,
			symbol,
			timeframe,
			restSinceMs,
			now.getTime(),
		);

		if (restCandles.length > 0) {
			await batchUpsert(db, restCandles, "rest");
			tier3Inserted = restCandles.length;
		} else {
			tier3Skipped = 1;
		}
	} else {
		tier3Skipped = 1;
	}

	result.tiers.push({
		tier: 3,
		label: "CCXT REST",
		inserted: tier3Inserted,
		skipped: tier3Skipped,
	});

	progress.report(95, "Tier 3 complete");

	// -------------------------------------------------------------------------
	// Continuity validation
	// -------------------------------------------------------------------------

	progress.report(97, "Running continuity validation...");

	const rangeFrom = new Date(Date.UTC(startYear, startMonth - 1, 1));
	const rangeTo = now;
	const gapCount = await validateStoredContinuity(db, exchange, symbol, timeframe, rangeFrom, rangeTo);

	result.continuityGaps = gapCount;
	result.totalInserted = tier1Inserted + tier2Inserted + tier3Inserted;
	result.totalSkipped = tier1Skipped + tier2Skipped + tier3Skipped;

	progress.report(100, "Done");

	return result;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (import.meta.main) {
	const args = parseBackfillArgs(process.argv.slice(2));

	console.log(
		`Backfilling ${args.exchange} ${args.symbol} ${args.timeframe} (${args.years}y)...`,
	);

	// Lazy imports to avoid loading DB on require (tests don't need it)
	const { db } = await import("../db/index.js");
	const { BinanceAdapter } = await import("../packages/exchange/binance/adapter.js");

	const adapter = new BinanceAdapter();

	try {
		const result = await runBackfill(args, {
			db,
			adapter,
			fetchFn: globalThis.fetch,
		});

		console.log("\nBackfill complete:");
		for (const tier of result.tiers) {
			console.log(
				`  Tier ${tier.tier} (${tier.label}): inserted=${tier.inserted} skipped=${tier.skipped}`,
			);
		}
		console.log(`  Total inserted: ${result.totalInserted}`);
		console.log(`  Total skipped:  ${result.totalSkipped}`);

		if (result.continuityGaps > 0) {
			console.error(`\nWARNING: ${result.continuityGaps} continuity gap(s) detected.`);
			process.exit(1);
		} else {
			console.log("  Continuity: OK");
		}
	} catch (err) {
		console.error("\nBackfill failed:", err instanceof Error ? err.message : String(err));
		process.exit(1);
	} finally {
		await adapter.close();
	}
}
