import type { Candle } from "@combine/candle/types.js";
import { bb, ema, macd, rsi, sma, stochastic } from "@combine/core/indicator/index.js";
import { Elysia, t } from "elysia";
import { BadRequestError, UnauthorizedError } from "../lib/errors.js";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

const SUPPORTED_INDICATORS = ["sma", "ema", "bb", "rsi", "macd", "stochastic"] as const;
type SupportedIndicator = (typeof SUPPORTED_INDICATORS)[number];

function isSupportedIndicator(value: string): value is SupportedIndicator {
	return (SUPPORTED_INDICATORS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Dep interface
// ---------------------------------------------------------------------------

export interface FindCandlesForIndicatorOptions {
	symbol: string;
	timeframe: string;
	/** Exclusive upper bound: only return candles with openTime < before */
	before?: Date;
	/** Number of candles to return (most recent, ordered ASC) */
	limit: number;
}

export interface IndicatorRouteDeps {
	findCandlesForIndicator: (opts: FindCandlesForIndicatorOptions) => Promise<Candle[]>;
}

// ---------------------------------------------------------------------------
// Response point types (numeric values serialized as strings)
// ---------------------------------------------------------------------------

interface ScalarPoint {
	time: string;
	value: string;
}

interface BBPoint {
	time: string;
	upper: string;
	middle: string;
	lower: string;
}

interface MACDPoint {
	time: string;
	macd: string;
	signal: string;
	histogram: string;
}

interface StochasticPoint {
	time: string;
	k: string;
	d: string;
}

type IndicatorPoint = ScalarPoint | BBPoint | MACDPoint | StochasticPoint;

// ---------------------------------------------------------------------------
// Core computation utility
// ---------------------------------------------------------------------------

/**
 * Compute an indicator over a set of candles and return only the valid (non-NaN,
 * non-zero-length) result points aligned to candle openTimes.
 *
 * The library leaves leading elements as NaN / 0 for warm-up periods.
 * We filter those out so callers never see them.
 */
async function computeIndicatorPage(opts: {
	candles: Candle[];
	indicator: SupportedIndicator;
	period: number;
	fastPeriod: number;
	slowPeriod: number;
	signalPeriod: number;
}): Promise<{ points: IndicatorPoint[]; candles: Candle[] }> {
	const { candles, indicator, period, fastPeriod, slowPeriod, signalPeriod } = opts;

	if (candles.length === 0) {
		return { points: [], candles: [] };
	}

	const closes = candles.map((c) => Number(c.close));
	const highs = candles.map((c) => Number(c.high));
	const lows = candles.map((c) => Number(c.low));

	let points: IndicatorPoint[] = [];

	if (indicator === "sma") {
		const values = await sma(closes, period);
		points = zipScalar(candles, values);
	} else if (indicator === "ema") {
		const values = await ema(closes, period);
		points = zipScalar(candles, values);
	} else if (indicator === "rsi") {
		const values = await rsi(closes, period);
		points = zipScalar(candles, values);
	} else if (indicator === "bb") {
		const result = await bb(closes, period);
		points = zipBB(candles, result.upper, result.middle, result.lower);
	} else if (indicator === "macd") {
		const result = await macd(closes, fastPeriod, slowPeriod, signalPeriod);
		points = zipMACD(candles, result.macd, result.signal, result.histogram);
	} else if (indicator === "stochastic") {
		const result = await stochastic(highs, lows, closes, period);
		points = zipStochastic(candles, result.k, result.d);
	}

	return { points, candles };
}

// ---------------------------------------------------------------------------
// Alignment helpers — pair result arrays with candle openTimes, skip NaN/0-rows
// ---------------------------------------------------------------------------

function isValidValue(v: number): boolean {
	return Number.isFinite(v) && !Number.isNaN(v);
}

function zipScalar(candles: Candle[], values: number[]): ScalarPoint[] {
	const out: ScalarPoint[] = [];
	const len = Math.min(candles.length, values.length);
	for (let i = 0; i < len; i++) {
		const v = values[i];
		if (isValidValue(v)) {
			out.push({ time: candles[i].openTime.toISOString(), value: String(v) });
		}
	}
	return out;
}

function zipBB(candles: Candle[], upper: number[], middle: number[], lower: number[]): BBPoint[] {
	const out: BBPoint[] = [];
	const len = Math.min(candles.length, upper.length, middle.length, lower.length);
	for (let i = 0; i < len; i++) {
		const u = upper[i];
		const m = middle[i];
		const l = lower[i];
		if (isValidValue(u) && isValidValue(m) && isValidValue(l)) {
			out.push({
				time: candles[i].openTime.toISOString(),
				upper: String(u),
				middle: String(m),
				lower: String(l),
			});
		}
	}
	return out;
}

function zipMACD(
	candles: Candle[],
	macdArr: number[],
	signalArr: number[],
	histArr: number[],
): MACDPoint[] {
	const out: MACDPoint[] = [];
	const len = Math.min(candles.length, macdArr.length, signalArr.length, histArr.length);
	for (let i = 0; i < len; i++) {
		const m = macdArr[i];
		const s = signalArr[i];
		const h = histArr[i];
		if (isValidValue(m) && isValidValue(s) && isValidValue(h)) {
			out.push({
				time: candles[i].openTime.toISOString(),
				macd: String(m),
				signal: String(s),
				histogram: String(h),
			});
		}
	}
	return out;
}

function zipStochastic(candles: Candle[], kArr: number[], dArr: number[]): StochasticPoint[] {
	const out: StochasticPoint[] = [];
	const len = Math.min(candles.length, kArr.length, dArr.length);
	for (let i = 0; i < len; i++) {
		const k = kArr[i];
		const d = dArr[i];
		if (isValidValue(k) && isValidValue(d)) {
			out.push({
				time: candles[i].openTime.toISOString(),
				k: String(k),
				d: String(d),
			});
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Extract userId helper (matches pattern used in other routes)
// ---------------------------------------------------------------------------

function extractUserId(ctx: Record<string, unknown>): string {
	return typeof ctx.userId === "string" ? ctx.userId : "";
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function indicatorRoutes(deps: IndicatorRouteDeps) {
	return new Elysia({ prefix: "/api/v1/indicators" }).get(
		"/:symbol/:timeframe/:indicator",
		async (ctx) => {
			const userId = extractUserId(ctx as unknown as Record<string, unknown>);
			if (!userId) throw new UnauthorizedError();

			const { symbol, timeframe, indicator: indicatorParam } = ctx.params;

			if (!isSupportedIndicator(indicatorParam)) {
				throw new BadRequestError(
					`Unknown indicator '${indicatorParam}'. Supported: ${SUPPORTED_INDICATORS.join(", ")}`,
				);
			}

			const indicator = indicatorParam;

			// Parse query params
			const limit = Math.min(ctx.query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
			const period = ctx.query.period ?? 14;
			const fastPeriod = ctx.query.fastPeriod ?? 12;
			const slowPeriod = ctx.query.slowPeriod ?? 26;
			const signalPeriod = ctx.query.signalPeriod ?? 9;

			const cursor = ctx.query.cursor ? new Date(ctx.query.cursor) : undefined;

			// Warm-up window: fetch extra candles before the requested window to seed the indicator.
			// MACD needs the longest warm-up: slowPeriod + signalPeriod.
			const maxPeriod = Math.max(period, slowPeriod + signalPeriod, 1);
			const warmupCount = maxPeriod * 2;
			const fetchLimit = limit + warmupCount;

			// Cursor for DB query: we fetch candles with openTime < cursor (exclusive upper bound)
			const candles = await deps.findCandlesForIndicator({
				symbol,
				timeframe,
				before: cursor,
				limit: fetchLimit,
			});

			if (candles.length === 0) {
				return { data: [], nextCursor: null };
			}

			// Sort ascending (library expects chronological order)
			candles.sort((a, b) => a.openTime.getTime() - b.openTime.getTime());

			// Compute indicator over all fetched candles (warm-up + requested window)
			const { points } = await computeIndicatorPage({
				candles,
				indicator,
				period,
				fastPeriod,
				slowPeriod,
				signalPeriod,
			});

			// The library produces NaN/0 for warm-up slots which we already filter in zip helpers.
			// We still need to slice to at most `limit` points (from the end = most recent).
			const page = points.slice(-limit);

			// Cursor pagination: nextCursor = openTime of the earliest candle in the page.
			// The client passes this as `cursor` to receive the page before this one.
			// Convention (matching T-12-010 contract): cursor is exclusive, so next call
			// returns items with openTime < nextCursor.
			const nextCursor = page.length >= limit && page.length > 0 ? page[0].time : null;

			return { data: page, nextCursor };
		},
		{
			params: t.Object({
				symbol: t.String(),
				timeframe: t.String(),
				indicator: t.String(),
			}),
			query: t.Object({
				cursor: t.Optional(t.String()),
				limit: t.Optional(t.Numeric()),
				period: t.Optional(t.Numeric()),
				fastPeriod: t.Optional(t.Numeric()),
				slowPeriod: t.Optional(t.Numeric()),
				signalPeriod: t.Optional(t.Numeric()),
			}),
		},
	);
}
