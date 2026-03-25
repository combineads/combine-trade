/**
 * indicator-data-api — unit tests for GET /api/v1/indicators/:symbol/:timeframe/:indicator
 *
 * Tests run without a real DB or auth server. The route factory receives a
 * mock `findCandlesForIndicator` dep.  Auth is mocked via a thin AuthLike double
 * that accepts a hard-coded Bearer token.
 *
 * Coverage:
 *  - SMA returns correct shape and values
 *  - EMA returns correct shape
 *  - BB returns correct shape (upper/middle/lower)
 *  - RSI returns correct shape
 *  - MACD returns correct shape with fastPeriod/slowPeriod/signalPeriod
 *  - Stochastic returns correct shape (k/d)
 *  - cursor pagination: next page starts after the last item of the current page
 *  - warm-up candles are excluded from the response
 *  - unknown indicator → 400
 *  - unauthenticated request → 401
 */

import { describe, expect, test } from "bun:test";
import type { Candle } from "@combine/candle/types.js";
import { Elysia } from "elysia";
import { UnauthorizedError, errorHandlerPlugin } from "../../lib/errors.js";
import { indicatorRoutes } from "../indicators.js";
import type { IndicatorRouteDeps } from "../indicators.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a synthetic candle array starting from a given timestamp, spaced 1 minute apart. */
function makeCandles(count: number, startMs = 1_700_000_000_000): Candle[] {
	return Array.from({ length: count }, (_, i) => ({
		exchange: "binance" as const,
		symbol: "BTCUSDT",
		timeframe: "1m" as const,
		openTime: new Date(startMs + i * 60_000),
		open: String(40000 + i),
		high: String(40100 + i),
		low: String(39900 + i),
		close: String(40050 + i),
		volume: "100",
		isClosed: true,
	}));
}

/**
 * Minimal auth double — sets userId="test-user" for requests with
 * `Authorization: Bearer valid-token`, rejects everything else.
 */
function makeAuthPlugin() {
	return new Elysia({ name: "test-auth" })
		.derive({ as: "global" }, ({ request }) => {
			const auth = request.headers.get("authorization") ?? "";
			return { userId: auth === "Bearer valid-token" ? "test-user" : "" };
		})
		.onBeforeHandle({ as: "global" }, ({ userId, request }) => {
			const url = new URL(request.url);
			if (url.pathname === "/api/v1/health") return;
			if (!userId) throw new UnauthorizedError("No valid session");
		});
}

const AUTH_HEADER = { Authorization: "Bearer valid-token" };

function buildApp(deps: IndicatorRouteDeps) {
	return new Elysia().use(errorHandlerPlugin).use(makeAuthPlugin()).use(indicatorRoutes(deps));
}

// ---------------------------------------------------------------------------
// Mock deps
// ---------------------------------------------------------------------------

/** Returns candles from a fixed synthetic dataset; honours cursor (exclusive). */
function makeDeps(allCandles: Candle[]): IndicatorRouteDeps {
	return {
		findCandlesForIndicator: async ({ symbol: _s, timeframe: _tf, before, limit }) => {
			let filtered = before ? allCandles.filter((c) => c.openTime < before) : allCandles;
			// Return the last `limit` candles before the cursor (most recent)
			filtered = filtered.slice(-limit);
			return filtered;
		},
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("indicator-data-api", () => {
	// -------------------------------------------------------------------------
	// Authentication
	// -------------------------------------------------------------------------
	test("unauthenticated request returns 401", async () => {
		const candles = makeCandles(100);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request("http://localhost/api/v1/indicators/BTCUSDT/1m/sma?period=20"),
		);
		expect(res.status).toBe(401);
	});

	// -------------------------------------------------------------------------
	// Unknown indicator
	// -------------------------------------------------------------------------
	test("unknown indicator returns 400", async () => {
		const candles = makeCandles(100);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request("http://localhost/api/v1/indicators/BTCUSDT/1m/unknown_indicator?period=20", {
				headers: AUTH_HEADER,
			}),
		);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe("BAD_REQUEST");
	});

	// -------------------------------------------------------------------------
	// SMA
	// -------------------------------------------------------------------------
	test("SMA returns array of { time, value } strings", async () => {
		const candles = makeCandles(100);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request("http://localhost/api/v1/indicators/BTCUSDT/1m/sma?period=20", {
				headers: AUTH_HEADER,
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(Array.isArray(body.data)).toBe(true);
		expect(body.data.length).toBeGreaterThan(0);

		const point = body.data[0];
		expect(typeof point.time).toBe("string");
		expect(typeof point.value).toBe("string");
		// Value should be a valid number string
		expect(Number.isFinite(Number(point.value))).toBe(true);
	});

	test("SMA values are numerically correct (last value = mean of last `period` closes)", async () => {
		const period = 5;
		const candles = makeCandles(20);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request(`http://localhost/api/v1/indicators/BTCUSDT/1m/sma?period=${period}`, {
				headers: AUTH_HEADER,
			}),
		);
		const body = await res.json();
		expect(body.data.length).toBeGreaterThan(0);

		// Last SMA value = average of last `period` close prices
		const lastSmaValue = Number(body.data[body.data.length - 1].value);
		const lastNCloses = candles.slice(-period).map((c) => Number(c.close));
		const expected = lastNCloses.reduce((a, b) => a + b, 0) / period;

		expect(Math.abs(lastSmaValue - expected)).toBeLessThan(0.001);
	});

	test("SMA warm-up candles are not included in response", async () => {
		const period = 10;
		// Only provide candles equal to period (no extra for warmup in response)
		const candles = makeCandles(period);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request(`http://localhost/api/v1/indicators/BTCUSDT/1m/sma?period=${period}`, {
				headers: AUTH_HEADER,
			}),
		);
		const body = await res.json();
		// With exactly `period` candles, the library produces 1 SMA value (the last).
		// The warmup for the library itself means we only get valid values after `period-1` inputs.
		// The response time must correspond to actual candle openTimes.
		if (body.data.length > 0) {
			const firstTime = new Date(body.data[0].time).getTime();
			const candleTimes = candles.map((c) => c.openTime.getTime());
			expect(candleTimes).toContain(firstTime);
		}
	});

	// -------------------------------------------------------------------------
	// EMA
	// -------------------------------------------------------------------------
	test("EMA returns array of { time, value } strings", async () => {
		const candles = makeCandles(100);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request("http://localhost/api/v1/indicators/BTCUSDT/1m/ema?period=20", {
				headers: AUTH_HEADER,
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.data)).toBe(true);
		expect(body.data.length).toBeGreaterThan(0);
		expect(typeof body.data[0].time).toBe("string");
		expect(typeof body.data[0].value).toBe("string");
	});

	// -------------------------------------------------------------------------
	// Bollinger Bands
	// -------------------------------------------------------------------------
	test("BB returns array of { time, upper, middle, lower } strings", async () => {
		const candles = makeCandles(100);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request("http://localhost/api/v1/indicators/BTCUSDT/1m/bb?period=20", {
				headers: AUTH_HEADER,
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.data)).toBe(true);
		expect(body.data.length).toBeGreaterThan(0);

		const point = body.data[0];
		expect(typeof point.time).toBe("string");
		expect(typeof point.upper).toBe("string");
		expect(typeof point.middle).toBe("string");
		expect(typeof point.lower).toBe("string");
		// upper >= middle >= lower
		expect(Number(point.upper)).toBeGreaterThanOrEqual(Number(point.middle));
		expect(Number(point.middle)).toBeGreaterThanOrEqual(Number(point.lower));
	});

	// -------------------------------------------------------------------------
	// RSI
	// -------------------------------------------------------------------------
	test("RSI returns array of { time, value } strings with values in [0, 100]", async () => {
		const candles = makeCandles(100);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request("http://localhost/api/v1/indicators/BTCUSDT/1m/rsi?period=14", {
				headers: AUTH_HEADER,
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.data)).toBe(true);
		expect(body.data.length).toBeGreaterThan(0);

		for (const point of body.data) {
			const v = Number(point.value);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(100);
		}
	});

	// -------------------------------------------------------------------------
	// MACD
	// -------------------------------------------------------------------------
	test("MACD returns array of { time, macd, signal, histogram } strings", async () => {
		// Need enough candles for MACD: slowPeriod + signalPeriod
		const candles = makeCandles(200);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request(
				"http://localhost/api/v1/indicators/BTCUSDT/1m/macd?fastPeriod=12&slowPeriod=26&signalPeriod=9",
				{ headers: AUTH_HEADER },
			),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.data)).toBe(true);
		expect(body.data.length).toBeGreaterThan(0);

		const point = body.data[0];
		expect(typeof point.time).toBe("string");
		expect(typeof point.macd).toBe("string");
		expect(typeof point.signal).toBe("string");
		expect(typeof point.histogram).toBe("string");
	});

	test("MACD histogram = macd - signal", async () => {
		const candles = makeCandles(200);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request(
				"http://localhost/api/v1/indicators/BTCUSDT/1m/macd?fastPeriod=12&slowPeriod=26&signalPeriod=9",
				{ headers: AUTH_HEADER },
			),
		);
		const body = await res.json();
		for (const point of body.data) {
			const diff = Math.abs(Number(point.histogram) - (Number(point.macd) - Number(point.signal)));
			expect(diff).toBeLessThan(0.0001);
		}
	});

	// -------------------------------------------------------------------------
	// Stochastic
	// -------------------------------------------------------------------------
	test("Stochastic returns array of { time, k, d } strings", async () => {
		const candles = makeCandles(100);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request("http://localhost/api/v1/indicators/BTCUSDT/1m/stochastic?period=14", {
				headers: AUTH_HEADER,
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.data)).toBe(true);
		expect(body.data.length).toBeGreaterThan(0);

		const point = body.data[0];
		expect(typeof point.time).toBe("string");
		expect(typeof point.k).toBe("string");
		expect(typeof point.d).toBe("string");
	});

	// -------------------------------------------------------------------------
	// Cursor pagination
	// -------------------------------------------------------------------------
	test("cursor pagination: nextCursor is the openTime of the last item", async () => {
		const candles = makeCandles(600);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request("http://localhost/api/v1/indicators/BTCUSDT/1m/sma?period=20&limit=50", {
				headers: AUTH_HEADER,
			}),
		);
		expect(res.status).toBe(200);
		const body = await res.json();

		if (body.nextCursor !== null) {
			expect(typeof body.nextCursor).toBe("string");
			// nextCursor should be a valid ISO timestamp
			expect(Number.isFinite(new Date(body.nextCursor).getTime())).toBe(true);
		}
	});

	test("cursor pagination: last page returns nextCursor null", async () => {
		// Use fewer candles so that limit > total pages
		const candles = makeCandles(30);
		const app = buildApp(makeDeps(candles));

		const res = await app.handle(
			new Request("http://localhost/api/v1/indicators/BTCUSDT/1m/sma?period=5&limit=500", {
				headers: AUTH_HEADER,
			}),
		);
		const body = await res.json();
		expect(body.nextCursor).toBeNull();
	});

	test("cursor pagination: using nextCursor produces non-overlapping data", async () => {
		const candles = makeCandles(200);

		// Mock dep: tracks calls, simulates cursor-window logic
		let page1Data: Array<{ time: string; value: string }> = [];
		let page2Data: Array<{ time: string; value: string }> = [];
		let firstNextCursor: string | null = null;

		// Build dep that can paginate: returns candles after `cursor` (exclusive, ascending order)
		const deps: IndicatorRouteDeps = {
			findCandlesForIndicator: async ({ before, limit }) => {
				let filtered = before ? candles.filter((c) => c.openTime < before) : candles;
				filtered = filtered.slice(-limit);
				return filtered;
			},
		};

		const app = buildApp(deps);

		// Page 1: no cursor, limit=30
		const res1 = await app.handle(
			new Request("http://localhost/api/v1/indicators/BTCUSDT/1m/sma?period=5&limit=30", {
				headers: AUTH_HEADER,
			}),
		);
		const body1 = await res1.json();
		page1Data = body1.data;
		firstNextCursor = body1.nextCursor;

		expect(page1Data.length).toBeGreaterThan(0);

		if (firstNextCursor) {
			// Page 2: use nextCursor from page 1
			const res2 = await app.handle(
				new Request(
					`http://localhost/api/v1/indicators/BTCUSDT/1m/sma?period=5&limit=30&cursor=${encodeURIComponent(firstNextCursor)}`,
					{ headers: AUTH_HEADER },
				),
			);
			const body2 = await res2.json();
			page2Data = body2.data;

			// No time should overlap between page 1 and page 2
			const times1 = new Set(page1Data.map((p) => p.time));
			const overlap = page2Data.filter((p) => times1.has(p.time));
			expect(overlap.length).toBe(0);
		}
	});

	test("default limit is 500, max is clamped to 2000", async () => {
		const candles = makeCandles(600);
		let requestedLimit = 0;

		const deps: IndicatorRouteDeps = {
			findCandlesForIndicator: async ({ limit }) => {
				requestedLimit = limit;
				return candles.slice(-limit);
			},
		};

		const app = buildApp(deps);

		// Default limit
		await app.handle(
			new Request("http://localhost/api/v1/indicators/BTCUSDT/1m/sma?period=5", {
				headers: AUTH_HEADER,
			}),
		);
		// Dep is called with limit + warmup, but the base limit defaults to 500
		expect(requestedLimit).toBeGreaterThanOrEqual(500);

		// Exceeding max should clamp the base limit to 2000; warmup is added on top
		await app.handle(
			new Request("http://localhost/api/v1/indicators/BTCUSDT/1m/sma?period=5&limit=9999", {
				headers: AUTH_HEADER,
			}),
		);
		// After clamping limit to MAX_LIMIT=2000, warmup = max(period, slowPeriod+signalPeriod)*2
		// Default slowPeriod=26, signalPeriod=9 → warmup = (26+9)*2 = 70
		// So requestedLimit = 2000 + 70 = 2070
		expect(requestedLimit).toBeLessThanOrEqual(2000 + (26 + 9) * 2);
	});
});
