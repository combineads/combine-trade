/**
 * chart-data-api: Cursor-based pagination tests for GET /api/v1/candles/:symbol/:timeframe
 *
 * TDD: RED phase — all tests should fail before implementation.
 */

import { describe, expect, test } from "bun:test";
import type { Candle } from "@combine/candle/types.js";
import { Elysia } from "elysia";
import type { CandleCursorQueryOptions, CandleCursorRouteDeps } from "../candles.js";
import { candleCursorRoutes } from "../candles.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a synthetic Candle fixture. openTime is a Date object. */
function makeCandle(openTime: Date, symbol = "BTCUSDT", timeframe = "1m"): Candle {
	return {
		exchange: "binance",
		symbol,
		timeframe: timeframe as Candle["timeframe"],
		openTime,
		open: "50000.00",
		high: "51000.00",
		low: "49000.00",
		close: "50500.00",
		volume: "1234.56",
		isClosed: true,
	};
}

/** Generate N candles starting from a base Date, each 1 minute apart. */
function generateCandles(n: number, base: Date = new Date("2024-01-01T00:00:00.000Z")): Candle[] {
	return Array.from({ length: n }, (_, i) => {
		const t = new Date(base.getTime() + i * 60_000);
		return makeCandle(t);
	});
}

/**
 * Build a minimal Elysia app with a mock deps implementation.
 * The mock stores candles in-memory, sorted by openTime ASC.
 */
function buildApp(allCandles: Candle[]): Elysia {
	// Sort candles ascending for the mock query logic
	const sorted = [...allCandles].sort((a, b) => a.openTime.getTime() - b.openTime.getTime());

	const deps: CandleCursorRouteDeps = {
		findCandlesCursor: async (opts: CandleCursorQueryOptions) => {
			let filtered = sorted.filter(
				(c) => c.symbol === opts.symbol && c.timeframe === opts.timeframe,
			);

			if (opts.cursor) {
				const cursorTime = new Date(opts.cursor).getTime();
				filtered = filtered.filter((c) => c.openTime.getTime() > cursorTime);
			}

			// Fetch limit+1 to detect if there's a next page
			const fetchCount = opts.limit + 1;
			const slice = filtered.slice(0, fetchCount);

			return slice;
		},
	};

	return new Elysia().use(candleCursorRoutes(deps));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("chart-data-api: GET /api/v1/candles/:symbol/:timeframe", () => {
	test("default limit returns 500 candles ordered by openTime ASC", async () => {
		const candles = generateCandles(600);
		const app = buildApp(candles);

		const res = await app.handle(new Request("http://localhost/api/v1/candles/BTCUSDT/1m"));

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Candle[]; nextCursor: string | null };
		expect(body.data).toHaveLength(500);

		// Verify ascending order
		for (let i = 1; i < body.data.length; i++) {
			const prev = new Date(body.data[i - 1].openTime).getTime();
			const curr = new Date(body.data[i].openTime).getTime();
			expect(curr).toBeGreaterThan(prev);
		}
	});

	test("?limit=100 returns exactly 100 candles", async () => {
		const candles = generateCandles(200);
		const app = buildApp(candles);

		const res = await app.handle(
			new Request("http://localhost/api/v1/candles/BTCUSDT/1m?limit=100"),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Candle[]; nextCursor: string | null };
		expect(body.data).toHaveLength(100);
	});

	test("?limit=3000 is silently clamped to max 2000", async () => {
		const candles = generateCandles(2500);
		const app = buildApp(candles);

		const res = await app.handle(
			new Request("http://localhost/api/v1/candles/BTCUSDT/1m?limit=3000"),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Candle[]; nextCursor: string | null };
		expect(body.data.length).toBeLessThanOrEqual(2000);
	});

	test("?cursor=<timestamp> returns candles strictly after cursor (exclusive)", async () => {
		const candles = generateCandles(20);
		const app = buildApp(candles);

		// Use the 5th candle's openTime as cursor
		const cursorTime = candles[4].openTime.toISOString();

		const res = await app.handle(
			new Request(
				`http://localhost/api/v1/candles/BTCUSDT/1m?cursor=${encodeURIComponent(cursorTime)}`,
			),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Candle[]; nextCursor: string | null };

		// Should have candles 5..19 (15 candles, indices 5-19)
		expect(body.data).toHaveLength(15);

		// First result must be strictly after cursor
		const firstOpenTime = new Date(body.data[0].openTime).getTime();
		const cursorTimeMs = new Date(cursorTime).getTime();
		expect(firstOpenTime).toBeGreaterThan(cursorTimeMs);
	});

	test("last page returns nextCursor: null", async () => {
		const candles = generateCandles(10);
		const app = buildApp(candles);

		const res = await app.handle(
			new Request("http://localhost/api/v1/candles/BTCUSDT/1m?limit=500"),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Candle[]; nextCursor: string | null };
		expect(body.nextCursor).toBeNull();
	});

	test("intermediate page returns a valid nextCursor", async () => {
		const candles = generateCandles(150);
		const app = buildApp(candles);

		const res = await app.handle(
			new Request("http://localhost/api/v1/candles/BTCUSDT/1m?limit=100"),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Candle[]; nextCursor: string | null };
		expect(body.data).toHaveLength(100);
		expect(body.nextCursor).not.toBeNull();
		expect(typeof body.nextCursor).toBe("string");

		// nextCursor should be parseable as a date
		const cursorDate = new Date(body.nextCursor as string);
		expect(Number.isNaN(cursorDate.getTime())).toBe(false);
	});

	test("using nextCursor fetches contiguous next page without gaps or duplicates", async () => {
		const candles = generateCandles(250);
		const app = buildApp(candles);

		// Page 1
		const res1 = await app.handle(
			new Request("http://localhost/api/v1/candles/BTCUSDT/1m?limit=100"),
		);
		expect(res1.status).toBe(200);
		const page1 = (await res1.json()) as { data: Candle[]; nextCursor: string | null };
		expect(page1.data).toHaveLength(100);
		expect(page1.nextCursor).not.toBeNull();

		// Page 2 — using nextCursor from page 1
		const res2 = await app.handle(
			new Request(
				`http://localhost/api/v1/candles/BTCUSDT/1m?limit=100&cursor=${encodeURIComponent(page1.nextCursor as string)}`,
			),
		);
		expect(res2.status).toBe(200);
		const page2 = (await res2.json()) as { data: Candle[]; nextCursor: string | null };
		expect(page2.data).toHaveLength(100);

		// No duplicates: last openTime of page1 < first openTime of page2
		const lastPage1 = new Date(page1.data[page1.data.length - 1].openTime).getTime();
		const firstPage2 = new Date(page2.data[0].openTime).getTime();
		expect(firstPage2).toBeGreaterThan(lastPage1);

		// nextCursor of page1 equals openTime of last item on page1
		const cursorMs = new Date(page1.nextCursor as string).getTime();
		expect(cursorMs).toBe(lastPage1);
	});
});
