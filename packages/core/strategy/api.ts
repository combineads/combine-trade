import type { QuickJSContext } from "quickjs-emscripten";
import * as indicators from "../indicator/index.js";

export interface CandleData {
	open: number[];
	high: number[];
	low: number[];
	close: number[];
	volume: number[];
}

export interface StrategyAPIConfig {
	candles: Record<string, CandleData>;
	symbol: string;
	timeframe: string;
	barIndex: number;
}

/**
 * Inject the Strategy API into a QuickJS sandbox context.
 * Provides: close, open, high, low, volume, bar_index, indicator.*, candle()
 */
export function injectStrategyAPI(context: QuickJSContext, config: StrategyAPIConfig): void {
	const primary = config.candles[`${config.symbol}:${config.timeframe}`];
	if (!primary) return;

	// Inject price shorthand arrays
	injectArray(context, "close", primary.close);
	injectArray(context, "open", primary.open);
	injectArray(context, "high", primary.high);
	injectArray(context, "low", primary.low);
	injectArray(context, "volume", primary.volume);

	// Inject bar_index
	const barIndexHandle = context.newNumber(config.barIndex);
	context.setProp(context.global, "bar_index", barIndexHandle);
	barIndexHandle.dispose();

	// Inject candle() function for multi-symbol/timeframe access
	injectCandleFunction(context, config);

	// Inject indicator namespace
	injectIndicatorNamespace(context, config);
}

function injectArray(context: QuickJSContext, name: string, data: number[]): void {
	const arr = context.newArray();
	for (let i = 0; i < data.length; i++) {
		const val = context.newNumber(data[i]!);
		context.setProp(arr, i, val);
		val.dispose();
	}
	// Set length
	const lenHandle = context.newNumber(data.length);
	context.setProp(arr, "length", lenHandle);
	lenHandle.dispose();

	context.setProp(context.global, name, arr);
	arr.dispose();
}

function injectCandleFunction(context: QuickJSContext, config: StrategyAPIConfig): void {
	const candleFn = context.newFunction("candle", (symbolHandle, tfHandle, offsetHandle) => {
		const symbol = context.dump(symbolHandle) as string;
		const tf = context.dump(tfHandle) as string;
		const offset = (context.dump(offsetHandle) as number) ?? 0;

		const key = `${symbol}:${tf}`;
		const data = config.candles[key];
		if (!data) return context.undefined;

		const idx = config.barIndex - offset;
		if (idx < 0 || idx >= data.close.length) return context.undefined;

		const obj = context.newObject();
		for (const [field, values] of Object.entries(data) as [string, number[]][]) {
			const val = context.newNumber(values[idx]!);
			context.setProp(obj, field, val);
			val.dispose();
		}
		return obj;
	});
	context.setProp(context.global, "candle", candleFn);
	candleFn.dispose();
}

function injectIndicatorNamespace(context: QuickJSContext, config: StrategyAPIConfig): void {
	const indicatorObj = context.newObject();
	const primary = config.candles[`${config.symbol}:${config.timeframe}`];
	if (!primary) {
		context.setProp(context.global, "indicator", indicatorObj);
		indicatorObj.dispose();
		return;
	}

	// Helper to create sync indicator wrapper from an async function
	// QuickJS doesn't support async, so we pre-compute results
	const indicatorFunctions: Array<{
		name: string;
		compute: (source: number[], period: number) => Promise<number[]>;
	}> = [
		{ name: "sma", compute: indicators.sma },
		{ name: "ema", compute: indicators.ema },
		{ name: "rsi", compute: indicators.rsi },
	];

	// For sync indicators, we store pre-computed results
	// In the real runtime, indicators are pre-computed before sandbox execution
	// Here we inject placeholder functions that work with pre-computed data

	// Note: Since QuickJS is synchronous and our indicators are async,
	// the actual pattern is: pre-compute all indicators BEFORE sandbox execution,
	// then inject the results as plain arrays.
	// The indicator.* functions in the sandbox simply access pre-computed data.

	for (const { name } of indicatorFunctions) {
		const fn = context.newFunction(name, () => {
			// Placeholder — in production, this returns pre-computed data
			// See StrategyExecutor for the pre-computation pattern
			return context.newArray();
		});
		context.setProp(indicatorObj, name, fn);
		fn.dispose();
	}

	context.setProp(context.global, "indicator", indicatorObj);
	indicatorObj.dispose();
}
