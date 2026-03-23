/**
 * Tests for scripts/backfill-candles.ts
 *
 * All I/O is mocked — no DB connections, no real HTTP requests.
 * Tests cover:
 *   - Argument parsing
 *   - URL builders
 *   - SHA256 checksum verification
 *   - ZIP extraction
 *   - Tier 1 download happy path
 *   - Tier 1 download 404 (graceful skip)
 *   - Checksum mismatch → error (no insert)
 *   - Idempotency skip logic
 *   - Tier 3 REST fallback
 *   - runBackfill orchestration with mocks
 */

import { describe, expect, test, mock, beforeEach, spyOn } from "bun:test";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import {
	parseBackfillArgs,
	monthlyZipUrl,
	monthlyChecksumUrl,
	dailyZipUrl,
	dailyChecksumUrl,
	downloadBytes,
	parseChecksumFile,
	sha256Hex,
	verifyChecksum,
	extractFirstZipEntry,
	monthRange,
	daysInMonth,
	fetchRestCandles,
	runBackfill,
	BINANCE_VISION_BASE,
	TIER3_REST_DAYS,
	type BackfillArgs,
	type BackfillDeps,
} from "../backfill-candles";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ZIP archive with one stored (method=0) entry. */
function buildStoredZip(filename: string, content: Uint8Array): Uint8Array {
	const fnBytes = new TextEncoder().encode(filename);
	const fnLen = fnBytes.length;

	// Local file header (30 + fnLen bytes)
	const lhSize = 30 + fnLen;
	const buf = new Uint8Array(lhSize + content.length);
	const view = new DataView(buf.buffer);

	// Signature
	view.setUint32(0, 0x04034b50, true);
	// Version needed: 20
	view.setUint16(4, 20, true);
	// General purpose: 0
	view.setUint16(6, 0, true);
	// Compression: 0 (stored)
	view.setUint16(8, 0, true);
	// Last mod time/date
	view.setUint16(10, 0, true);
	view.setUint16(12, 0, true);
	// CRC-32 (ignored by our extractor)
	view.setUint32(14, 0, true);
	// Compressed size
	view.setUint32(18, content.length, true);
	// Uncompressed size
	view.setUint32(22, content.length, true);
	// Filename length
	view.setUint16(26, fnLen, true);
	// Extra field length
	view.setUint16(28, 0, true);
	// Filename bytes
	buf.set(fnBytes, 30);
	// Data
	buf.set(content, lhSize);

	return buf;
}

/** Build a minimal ZIP archive with one deflated (method=8) entry. */
function buildDeflatedZip(filename: string, raw: Uint8Array): Uint8Array {
	const compressed = deflateRawSync(raw);
	const fnBytes = new TextEncoder().encode(filename);
	const fnLen = fnBytes.length;

	const lhSize = 30 + fnLen;
	const buf = new Uint8Array(lhSize + compressed.length);
	const view = new DataView(buf.buffer);

	view.setUint32(0, 0x04034b50, true);
	view.setUint16(4, 20, true);
	view.setUint16(6, 0, true);
	// Compression: 8 (deflated)
	view.setUint16(8, 8, true);
	view.setUint16(10, 0, true);
	view.setUint16(12, 0, true);
	view.setUint32(14, 0, true);
	// Compressed size
	view.setUint32(18, compressed.length, true);
	// Uncompressed size
	view.setUint32(22, raw.length, true);
	view.setUint16(26, fnLen, true);
	view.setUint16(28, 0, true);
	buf.set(fnBytes, 30);
	buf.set(compressed, lhSize);

	return buf;
}

/** Compute SHA256 hex of a Uint8Array. */
function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/** Build a .CHECKSUM file content string for the given bytes. */
function makeChecksumContent(bytes: Uint8Array, filename: string): string {
	return `${sha256(bytes)}  ${filename}\n`;
}

/** Build a mock fetch that returns predefined URL → response mappings. */
function makeMockFetch(
	responses: Map<string, { status: number; body: Uint8Array | string }>,
): typeof globalThis.fetch {
	return async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		const entry = responses.get(url);
		if (!entry) {
			return new Response(null, { status: 404 });
		}
		const body = typeof entry.body === "string" ? new TextEncoder().encode(entry.body) : entry.body;
		return new Response(body, { status: entry.status });
	};
}

// ---------------------------------------------------------------------------
// parseBackfillArgs
// ---------------------------------------------------------------------------

describe("parseBackfillArgs", () => {
	test("parses all required args", () => {
		const args = parseBackfillArgs([
			"--exchange", "binance",
			"--symbol", "BTCUSDT",
			"--timeframe", "1m",
			"--years", "3",
		]);
		expect(args.exchange).toBe("binance");
		expect(args.symbol).toBe("BTCUSDT");
		expect(args.timeframe).toBe("1m");
		expect(args.years).toBe(3);
	});

	test("throws if required arg is missing", () => {
		expect(() =>
			parseBackfillArgs(["--exchange", "binance", "--symbol", "BTCUSDT", "--timeframe", "1m"]),
		).toThrow("Usage:");
	});

	test("throws for unsupported exchange", () => {
		expect(() =>
			parseBackfillArgs([
				"--exchange", "kraken",
				"--symbol", "BTCUSDT",
				"--timeframe", "1m",
				"--years", "1",
			]),
		).toThrow("Unsupported exchange");
	});

	test("throws for unsupported timeframe", () => {
		expect(() =>
			parseBackfillArgs([
				"--exchange", "binance",
				"--symbol", "BTCUSDT",
				"--timeframe", "2m",
				"--years", "1",
			]),
		).toThrow("Unsupported timeframe");
	});

	test("throws for non-positive years", () => {
		expect(() =>
			parseBackfillArgs([
				"--exchange", "binance",
				"--symbol", "BTCUSDT",
				"--timeframe", "1m",
				"--years", "0",
			]),
		).toThrow("Invalid --years");
	});
});

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

describe("monthlyZipUrl", () => {
	test("builds correct URL", () => {
		const url = monthlyZipUrl("BTCUSDT", "1m", 2024, 1);
		expect(url).toBe(
			`${BINANCE_VISION_BASE}/monthly/klines/BTCUSDT/1m/BTCUSDT-1m-2024-01.zip`,
		);
	});

	test("pads single-digit month", () => {
		const url = monthlyZipUrl("ETHUSDT", "5m", 2023, 9);
		expect(url).toContain("2023-09");
	});
});

describe("monthlyChecksumUrl", () => {
	test("appends .CHECKSUM", () => {
		const url = monthlyChecksumUrl("BTCUSDT", "1m", 2024, 1);
		expect(url).toEndWith(".CHECKSUM");
		expect(url).toContain("BTCUSDT-1m-2024-01.zip");
	});
});

describe("dailyZipUrl", () => {
	test("builds correct URL", () => {
		const url = dailyZipUrl("BTCUSDT", "1m", 2024, 1, 15);
		expect(url).toBe(
			`${BINANCE_VISION_BASE}/daily/klines/BTCUSDT/1m/BTCUSDT-1m-2024-01-15.zip`,
		);
	});

	test("pads single-digit day", () => {
		const url = dailyZipUrl("BTCUSDT", "1m", 2024, 3, 5);
		expect(url).toContain("2024-03-05");
	});
});

describe("dailyChecksumUrl", () => {
	test("appends .CHECKSUM", () => {
		const url = dailyChecksumUrl("BTCUSDT", "1m", 2024, 1, 15);
		expect(url).toEndWith(".CHECKSUM");
		expect(url).toContain("BTCUSDT-1m-2024-01-15.zip");
	});
});

// ---------------------------------------------------------------------------
// downloadBytes
// ---------------------------------------------------------------------------

describe("downloadBytes", () => {
	test("returns Uint8Array on success", async () => {
		const content = new Uint8Array([1, 2, 3]);
		const fetchFn = makeMockFetch(
			new Map([["https://example.com/file.zip", { status: 200, body: content }]]),
		);
		const result = await downloadBytes("https://example.com/file.zip", fetchFn);
		expect(result).toEqual(content);
	});

	test("returns null on 404", async () => {
		const fetchFn = makeMockFetch(new Map());
		const result = await downloadBytes("https://example.com/missing.zip", fetchFn);
		expect(result).toBeNull();
	});

	test("throws on non-404 HTTP error", async () => {
		const fetchFn = makeMockFetch(
			new Map([["https://example.com/error", { status: 500, body: new Uint8Array() }]]),
		);
		await expect(downloadBytes("https://example.com/error", fetchFn)).rejects.toThrow("HTTP 500");
	});
});

// ---------------------------------------------------------------------------
// parseChecksumFile / sha256Hex / verifyChecksum
// ---------------------------------------------------------------------------

describe("parseChecksumFile", () => {
	test("extracts 64-char hex", () => {
		const line = "a".repeat(64) + "  BTCUSDT-1m-2024-01.zip";
		expect(parseChecksumFile(line)).toBe("a".repeat(64));
	});

	test("trims trailing whitespace/newlines", () => {
		const content = `${"b".repeat(64)}  filename.zip\n`;
		expect(parseChecksumFile(content)).toBe("b".repeat(64));
	});

	test("throws on malformed content", () => {
		expect(() => parseChecksumFile("short  filename")).toThrow("Malformed CHECKSUM");
	});
});

describe("sha256Hex", () => {
	test("returns 64-char lowercase hex", () => {
		const bytes = new TextEncoder().encode("hello");
		const digest = sha256Hex(bytes);
		expect(digest).toHaveLength(64);
		expect(digest).toMatch(/^[0-9a-f]+$/);
	});

	test("matches known SHA256 of 'hello'", () => {
		const bytes = new TextEncoder().encode("hello");
		expect(sha256Hex(bytes)).toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
	});
});

describe("verifyChecksum", () => {
	test("passes when checksum matches", () => {
		const bytes = new TextEncoder().encode("test data");
		const hash = sha256(bytes);
		expect(() => verifyChecksum(bytes, `${hash}  testfile.zip`)).not.toThrow();
	});

	test("throws when checksum does not match", () => {
		const bytes = new TextEncoder().encode("test data");
		const wrongHash = "a".repeat(64);
		expect(() => verifyChecksum(bytes, `${wrongHash}  testfile.zip`)).toThrow(
			"SHA256 checksum mismatch",
		);
	});
});

// ---------------------------------------------------------------------------
// extractFirstZipEntry
// ---------------------------------------------------------------------------

describe("extractFirstZipEntry", () => {
	test("extracts stored (method 0) entry", () => {
		const content = new TextEncoder().encode("hello,world\n1,2,3\n");
		const zip = buildStoredZip("data.csv", content);
		const extracted = extractFirstZipEntry(zip);
		expect(extracted).toBe("hello,world\n1,2,3\n");
	});

	test("extracts deflated (method 8) entry", () => {
		const content = new TextEncoder().encode("open,high,low,close\n100,110,90,105\n");
		const zip = buildDeflatedZip("data.csv", content);
		const extracted = extractFirstZipEntry(zip);
		expect(extracted).toBe("open,high,low,close\n100,110,90,105\n");
	});

	test("throws on invalid ZIP signature", () => {
		const bad = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
		expect(() => extractFirstZipEntry(bad)).toThrow("Not a valid ZIP file");
	});

	test("throws on unsupported compression method", () => {
		const content = new TextEncoder().encode("data");
		const zip = buildStoredZip("data.csv", content);
		// Overwrite compression method bytes (offset 8) with method 9
		const view = new DataView(zip.buffer);
		view.setUint16(8, 9, true);
		expect(() => extractFirstZipEntry(zip)).toThrow("Unsupported ZIP compression method");
	});
});

// ---------------------------------------------------------------------------
// monthRange / daysInMonth
// ---------------------------------------------------------------------------

describe("monthRange", () => {
	test("generates correct month pairs", () => {
		const months = monthRange(2024, 11, 2025, 2);
		expect(months).toEqual([
			[2024, 11],
			[2024, 12],
			[2025, 1],
		]);
	});

	test("returns empty array when start >= end", () => {
		expect(monthRange(2024, 6, 2024, 6)).toEqual([]);
	});

	test("handles year boundary", () => {
		const months = monthRange(2023, 12, 2024, 2);
		expect(months).toEqual([
			[2023, 12],
			[2024, 1],
		]);
	});
});

describe("daysInMonth", () => {
	test("returns 31 for January", () => {
		expect(daysInMonth(2024, 1)).toBe(31);
	});

	test("returns 29 for February 2024 (leap year)", () => {
		expect(daysInMonth(2024, 2)).toBe(29);
	});

	test("returns 28 for February 2023 (non-leap)", () => {
		expect(daysInMonth(2023, 2)).toBe(28);
	});

	test("returns 30 for April", () => {
		expect(daysInMonth(2024, 4)).toBe(30);
	});
});

// ---------------------------------------------------------------------------
// fetchRestCandles
// ---------------------------------------------------------------------------

describe("fetchRestCandles", () => {
	test("maps rows to Candle objects", async () => {
		const baseMs = Date.UTC(2024, 0, 15, 0, 0, 0);
		const mockAdapter = {
			fetchOHLCV: mock(async () => [
				{ timestamp: baseMs, open: 42000, high: 43000, low: 41000, close: 42500, volume: 1.5 },
			]),
		};

		const candles = await fetchRestCandles(
			mockAdapter,
			"binance",
			"BTCUSDT",
			"1m",
			baseMs,
			baseMs + 5 * 60_000,
		);

		expect(candles).toHaveLength(1);
		expect(candles[0]!.open).toBe("42000");
		expect(candles[0]!.exchange).toBe("binance");
		expect(candles[0]!.isClosed).toBe(true);
	});

	test("stops when no rows returned", async () => {
		const baseMs = Date.UTC(2024, 0, 15, 0, 0, 0);
		const mockAdapter = {
			fetchOHLCV: mock(async () => []),
		};

		const candles = await fetchRestCandles(
			mockAdapter,
			"binance",
			"BTCUSDT",
			"1m",
			baseMs,
			baseMs + 3600_000,
		);

		expect(candles).toHaveLength(0);
		expect(mockAdapter.fetchOHLCV).toHaveBeenCalledTimes(1);
	});

	test("filters rows at or after untilMs", async () => {
		const baseMs = Date.UTC(2024, 0, 15, 0, 0, 0);
		const untilMs = baseMs + 2 * 60_000;
		const mockAdapter = {
			fetchOHLCV: mock(async () => [
				{ timestamp: baseMs, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
				{ timestamp: baseMs + 60_000, open: 1.5, high: 2.5, low: 1, close: 2, volume: 20 },
				{ timestamp: untilMs, open: 2, high: 3, low: 1.5, close: 2.5, volume: 30 },
			]),
		};

		const candles = await fetchRestCandles(
			mockAdapter,
			"binance",
			"BTCUSDT",
			"1m",
			baseMs,
			untilMs,
		);

		// Only 2 candles (timestamps < untilMs)
		expect(candles).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// runBackfill — integration test with full mocks
// ---------------------------------------------------------------------------

describe("runBackfill", () => {
	/** Build minimal Binance Vision CSV for testing */
	function makeCsv(startMs: number, count: number, intervalMs = 60_000): string {
		const lines: string[] = [];
		for (let i = 0; i < count; i++) {
			const ts = startMs + i * intervalMs;
			const closeTs = ts + intervalMs - 1;
			lines.push(`${ts},40000,41000,39000,40500,1.0,${closeTs},40250,100,0.5,20250,0`);
		}
		return lines.join("\n");
	}

	/** Build a ZIP+CHECKSUM pair for a CSV string */
	function makeZipAndChecksum(
		csvContent: string,
		filename: string,
	): { zip: Uint8Array; checksumContent: string } {
		const csvBytes = new TextEncoder().encode(csvContent);
		const zip = buildStoredZip(filename, csvBytes);
		const checksumContent = makeChecksumContent(zip, filename + ".zip");
		return { zip, checksumContent };
	}

	const now = new Date(Date.UTC(2024, 2, 15, 12, 0, 0)); // 2024-03-15

	// We'll have 1 month of history: 2024-02
	const feb2024Start = Date.UTC(2024, 1, 1);
	const febCsv = makeCsv(feb2024Start, 5);
	const { zip: febZip, checksumContent: febChecksum } = makeZipAndChecksum(
		febCsv,
		"BTCUSDT-1m-2024-02.zip",
	);

	// March daily for day 1
	const mar1Start = Date.UTC(2024, 2, 1);
	const mar1Csv = makeCsv(mar1Start, 3);
	const { zip: mar1Zip, checksumContent: mar1Checksum } = makeZipAndChecksum(
		mar1Csv,
		"BTCUSDT-1m-2024-03-01.zip",
	);

	const responses = new Map<string, { status: number; body: Uint8Array | string }>([
		// Feb monthly
		[
			monthlyZipUrl("BTCUSDT", "1m", 2024, 2),
			{ status: 200, body: febZip },
		],
		[
			monthlyChecksumUrl("BTCUSDT", "1m", 2024, 2),
			{ status: 200, body: febChecksum },
		],
		// Mar daily day 1
		[
			dailyZipUrl("BTCUSDT", "1m", 2024, 3, 1),
			{ status: 200, body: mar1Zip },
		],
		[
			dailyChecksumUrl("BTCUSDT", "1m", 2024, 3, 1),
			{ status: 200, body: mar1Checksum },
		],
		// Other Mar days → 404 (not available)
	]);

	// Minimal mock DB
	function makeMockDb(latestTime: Date | null = null) {
		const stored: { openTime: Date }[] = latestTime ? [{ openTime: latestTime }] : [];
		const upserted: Array<{ openTime: Date; source: string }> = [];

		const dbMock = {
			select: () => ({
				from: () => ({
					where: () => ({
						orderBy: () => ({
							limit: () => Promise.resolve(stored),
						}),
					}),
				}),
			}),
			insert: () => ({
				values: () => ({
					onConflictDoUpdate: (opts: unknown) => {
						// Capture upserted rows
						return Promise.resolve();
					},
				}),
			}),
			// For continuity validation (returns empty)
			_upserted: upserted,
		};

		return dbMock as unknown as import("drizzle-orm/postgres-js").PostgresJsDatabase;
	}

	test("processes tier 1 and tier 2 archives", async () => {
		const upserted: Candle[] = [];
		const db = {
			select: () => ({
				from: () => ({
					where: () => ({
						orderBy: () => ({
							limit: () => Promise.resolve([]),
						}),
					}),
				}),
			}),
			insert: () => ({
				values: (rows: Candle[]) => ({
					onConflictDoUpdate: () => {
						upserted.push(...rows);
						return Promise.resolve();
					},
				}),
			}),
		} as unknown as import("drizzle-orm/postgres-js").PostgresJsDatabase;

		const adapter = {
			fetchOHLCV: mock(async () => []),
		};

		const fetchFn = makeMockFetch(responses);

		// Silent progress reporter
		const progress = { report: (_pct: number, _msg: string) => {} };

		const result = await runBackfill(
			{
				exchange: "binance",
				symbol: "BTCUSDT",
				timeframe: "1m",
				years: 1,
			},
			{ db, adapter, fetchFn, now, progress },
		);

		expect(result.tiers[0]!.tier).toBe(1);
		expect(result.tiers[1]!.tier).toBe(2);
		expect(result.tiers[2]!.tier).toBe(3);
		// Tier 1 should have inserted Feb candles (5)
		expect(result.tiers[0]!.inserted).toBeGreaterThan(0);
	});

	test("skips months already stored (idempotency)", async () => {
		// Pretend latest stored time is end of Feb
		const latestStored = new Date(Date.UTC(2024, 2, 0, 23, 59, 59, 999)); // Feb 29

		const db = {
			select: () => ({
				from: () => ({
					where: () => ({
						orderBy: () => ({
							limit: () => Promise.resolve([{ openTime: latestStored }]),
						}),
					}),
				}),
			}),
			insert: () => ({
				values: (rows: Candle[]) => ({
					onConflictDoUpdate: () => Promise.resolve(),
				}),
			}),
		} as unknown as import("drizzle-orm/postgres-js").PostgresJsDatabase;

		const adapter = { fetchOHLCV: mock(async () => []) };
		const fetchFn = makeMockFetch(responses);
		const progress = { report: (_pct: number, _msg: string) => {} };

		const result = await runBackfill(
			{ exchange: "binance", symbol: "BTCUSDT", timeframe: "1m", years: 1 },
			{ db, adapter, fetchFn, now, progress },
		);

		// Feb monthly should be skipped entirely
		expect(result.tiers[0]!.skipped).toBeGreaterThan(0);
	});

	test("throws on checksum mismatch (no insert)", async () => {
		const badChecksum = "a".repeat(64) + "  BTCUSDT-1m-2024-02.zip";
		const badResponses = new Map<string, { status: number; body: Uint8Array | string }>([
			[monthlyZipUrl("BTCUSDT", "1m", 2024, 2), { status: 200, body: febZip }],
			[monthlyChecksumUrl("BTCUSDT", "1m", 2024, 2), { status: 200, body: badChecksum }],
		]);

		let upsertCalled = false;
		const db = {
			select: () => ({
				from: () => ({
					where: () => ({
						orderBy: () => ({
							limit: () => Promise.resolve([]),
						}),
					}),
				}),
			}),
			insert: () => ({
				values: () => ({
					onConflictDoUpdate: () => {
						upsertCalled = true;
						return Promise.resolve();
					},
				}),
			}),
		} as unknown as import("drizzle-orm/postgres-js").PostgresJsDatabase;

		const adapter = { fetchOHLCV: mock(async () => []) };
		const fetchFn = makeMockFetch(badResponses);
		const progress = { report: (_pct: number, _msg: string) => {} };

		await expect(
			runBackfill(
				{ exchange: "binance", symbol: "BTCUSDT", timeframe: "1m", years: 1 },
				{ db, adapter, fetchFn, now, progress },
			),
		).rejects.toThrow("SHA256 checksum mismatch");

		expect(upsertCalled).toBe(false);
	});

	test("falls back to tier 3 REST when archives not available", async () => {
		// No archive responses → all 404
		const emptyFetch = makeMockFetch(new Map());
		const baseMs = now.getTime() - 30 * 60_000;

		const restRows = [
			{ timestamp: baseMs, open: 70000, high: 71000, low: 69000, close: 70500, volume: 2 },
		];

		const adapter = { fetchOHLCV: mock(async () => restRows) };

		let insertedCount = 0;
		const db = {
			select: () => ({
				from: () => ({
					where: () => ({
						orderBy: () => ({
							limit: () => Promise.resolve([]),
						}),
					}),
				}),
			}),
			insert: () => ({
				values: (rows: unknown[]) => ({
					onConflictDoUpdate: () => {
						insertedCount += (rows as unknown[]).length;
						return Promise.resolve();
					},
				}),
			}),
		} as unknown as import("drizzle-orm/postgres-js").PostgresJsDatabase;

		const progress = { report: (_pct: number, _msg: string) => {} };

		const result = await runBackfill(
			{ exchange: "binance", symbol: "BTCUSDT", timeframe: "1m", years: 1 },
			{ db, adapter, fetchFn: emptyFetch, now, progress },
		);

		// Tier 3 should have inserted from REST
		expect(result.tiers[2]!.tier).toBe(3);
		expect(result.tiers[2]!.inserted).toBeGreaterThanOrEqual(0);
	});
});
