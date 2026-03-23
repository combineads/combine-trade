import * as indicators from "../indicator/index.js";
import type { CandleData, StrategyAPIConfig } from "./api.js";
import type { SandboxResult } from "./sandbox.js";
import type { StrategySandbox } from "./sandbox.js";

export interface StrategyExecutorDeps {
	sandbox: StrategySandbox;
}

export interface BbConfig {
	source: "open" | "close";
	period: number;
	stddev: number;
}

export interface PeriodConfig {
	period: number;
}

export interface IndicatorConfig {
	bb?: BbConfig[];
	sma?: PeriodConfig[];
	ema?: PeriodConfig[];
	atr?: PeriodConfig[];
}

export interface ExecutionInput {
	code: string;
	symbol: string;
	timeframe: string;
	direction?: "long" | "short" | "both";
	candles: CandleData;
	barIndex: number;
	additionalCandles?: Record<string, CandleData>;
	indicatorConfig?: IndicatorConfig;
}

export interface PreComputedIndicators {
	sma: Record<string, number[]>;
	ema: Record<string, number[]>;
	rsi: Record<string, number[]>;
	macd: Record<string, { macd: number[]; signal: number[]; histogram: number[] }>;
	bb: Record<string, { upper: number[]; middle: number[]; lower: number[] }>;
	atr: Record<string, number[]>;
	stochastic: Record<string, { k: number[]; d: number[] }>;
	cci: Record<string, number[]>;
	adx: Record<string, { adx: number[]; plusDI: number[]; minusDI: number[] }>;
	obv: number[];
	vwap: number[];
}

/**
 * Left-pad an indicator array with NaN so its length matches the source array.
 * Indicator libraries often return shorter arrays (length = source.length - period + 1).
 * Padding ensures array[bar_index] always maps to the correct candle.
 */
function padArray(arr: number[], targetLength: number): number[] {
	if (arr.length >= targetLength) return arr;
	const padding = new Array(targetLength - arr.length).fill(Number.NaN);
	return [...padding, ...arr];
}

function padBBResult(
	bb: { upper: number[]; middle: number[]; lower: number[] },
	targetLength: number,
): { upper: number[]; middle: number[]; lower: number[] } {
	return {
		upper: padArray(bb.upper, targetLength),
		middle: padArray(bb.middle, targetLength),
		lower: padArray(bb.lower, targetLength),
	};
}

/**
 * Orchestrates strategy execution:
 * 1. Pre-compute indicators
 * 2. Inject API + data into sandbox
 * 3. Execute strategy code
 * 4. Collect results
 */
export class StrategyExecutor {
	constructor(private readonly deps: StrategyExecutorDeps) {}

	async execute(input: ExecutionInput): Promise<SandboxResult> {
		// Pre-compute common indicators + custom from indicatorConfig
		const preComputed = await this.preComputeIndicators(input.candles, input.indicatorConfig);

		// Build candle data map
		const candleMap: Record<string, CandleData> = {
			[`${input.symbol}:${input.timeframe}`]: input.candles,
		};
		if (input.additionalCandles) {
			Object.assign(candleMap, input.additionalCandles);
		}

		const apiConfig: StrategyAPIConfig = {
			candles: candleMap,
			symbol: input.symbol,
			timeframe: input.timeframe,
			barIndex: input.barIndex,
		};

		// Build globals including pre-computed indicators and strategy context
		const globals: Record<string, unknown> = {
			__preComputed: preComputed,
			context: {
				symbol: input.symbol,
				timeframe: input.timeframe,
				direction: input.direction ?? "both",
			},
		};

		// Wrap strategy code with indicator API that reads pre-computed data
		const wrappedCode = buildWrappedCode(input.code);

		// Execute with injected API
		return this.deps.sandbox.execute(wrappedCode, globals, apiConfig);
	}

	private async preComputeIndicators(
		candles: CandleData,
		config?: IndicatorConfig,
	): Promise<PreComputedIndicators> {
		const { close, open: _open, high, low, volume } = candles;

		// Pre-compute standard periods
		const [sma20, sma50, sma200] = await Promise.all([
			indicators.sma(close, 20),
			indicators.sma(close, 50),
			indicators.sma(close, 200),
		]);

		const [ema12, ema26, ema20, ema50] = await Promise.all([
			indicators.ema(close, 12),
			indicators.ema(close, 26),
			indicators.ema(close, 20),
			indicators.ema(close, 50),
		]);

		const [rsi14, macdDefault, bb20] = await Promise.all([
			indicators.rsi(close, 14),
			indicators.macd(close),
			indicators.bb(close, 20),
		]);

		const [atr14, stoch14, cci20] = await Promise.all([
			indicators.atr(high, low, close, 14),
			indicators.stochastic(high, low, close),
			indicators.cci(high, low, close, 20),
		]);

		const [obvResult, vwapResult] = await Promise.all([
			indicators.obv(close, volume),
			indicators.vwap(high, low, close, volume),
		]);

		const len = close.length;

		const result: PreComputedIndicators = {
			sma: { "20": padArray(sma20, len), "50": padArray(sma50, len), "200": padArray(sma200, len) },
			ema: {
				"12": padArray(ema12, len),
				"20": padArray(ema20, len),
				"26": padArray(ema26, len),
				"50": padArray(ema50, len),
			},
			rsi: { "14": padArray(rsi14, len) },
			macd: {
				default: {
					macd: padArray(macdDefault.macd, len),
					signal: padArray(macdDefault.signal, len),
					histogram: padArray(macdDefault.histogram, len),
				},
			},
			bb: { "20": padBBResult(bb20, len) },
			atr: { "14": padArray(atr14, len) },
			stochastic: { "14": { k: padArray(stoch14.k, len), d: padArray(stoch14.d, len) } },
			cci: { "20": padArray(cci20, len) },
			adx: {}, // ADX needs more data, computed on demand
			obv: padArray(obvResult, len),
			vwap: padArray(vwapResult, len),
		};

		// Apply custom indicator config
		if (config) {
			await this.applyCustomConfig(result, candles, config);
		}

		return result;
	}

	private async applyCustomConfig(
		result: PreComputedIndicators,
		candles: CandleData,
		config: IndicatorConfig,
	): Promise<void> {
		const promises: Promise<void>[] = [];

		const len = candles.close.length;

		// Custom BB entries
		if (config.bb) {
			for (const bbCfg of config.bb) {
				const source = bbCfg.source === "open" ? candles.open : candles.close;
				const key = String(bbCfg.period);
				if (!result.bb[key]) {
					promises.push(
						indicators.bb(source, bbCfg.period, bbCfg.stddev).then((bb) => {
							result.bb[key] = padBBResult(bb, len);
						}),
					);
				}
			}
		}

		// Custom SMA periods
		if (config.sma) {
			for (const smaCfg of config.sma) {
				const key = String(smaCfg.period);
				if (!result.sma[key]) {
					promises.push(
						indicators.sma(candles.close, smaCfg.period).then((sma) => {
							result.sma[key] = padArray(sma, len);
						}),
					);
				}
			}
		}

		// Custom EMA periods
		if (config.ema) {
			for (const emaCfg of config.ema) {
				const key = String(emaCfg.period);
				if (!result.ema[key]) {
					promises.push(
						indicators.ema(candles.close, emaCfg.period).then((ema) => {
							result.ema[key] = padArray(ema, len);
						}),
					);
				}
			}
		}

		// Custom ATR periods
		if (config.atr) {
			for (const atrCfg of config.atr) {
				const key = String(atrCfg.period);
				if (!result.atr[key]) {
					promises.push(
						indicators.atr(candles.high, candles.low, candles.close, atrCfg.period).then((atr) => {
							result.atr[key] = padArray(atr, len);
						}),
					);
				}
			}
		}

		await Promise.all(promises);
	}
}

function buildWrappedCode(userCode: string): string {
	// Wrap user code with indicator API helpers that read from pre-computed data
	return `
		var indicator = {
			sma: function(source, period) {
				var key = String(period || 20);
				return (__preComputed && __preComputed.sma && __preComputed.sma[key]) || [];
			},
			ema: function(source, period) {
				var key = String(period || 20);
				return (__preComputed && __preComputed.ema && __preComputed.ema[key]) || [];
			},
			rsi: function(source, period) {
				var key = String(period || 14);
				return (__preComputed && __preComputed.rsi && __preComputed.rsi[key]) || [];
			},
			macd: function(source, short, long, signal) {
				return (__preComputed && __preComputed.macd && __preComputed.macd["default"]) || { macd: [], signal: [], histogram: [] };
			},
			bb: function(source, period, stddev) {
				var key = String(period || 20);
				return (__preComputed && __preComputed.bb && __preComputed.bb[key]) || { upper: [], middle: [], lower: [] };
			},
			atr: function(period) {
				var key = String(period || 14);
				return (__preComputed && __preComputed.atr && __preComputed.atr[key]) || [];
			},
			stochastic: function(kPeriod) {
				var key = String(kPeriod || 14);
				return (__preComputed && __preComputed.stochastic && __preComputed.stochastic[key]) || { k: [], d: [] };
			},
			cci: function(period) {
				var key = String(period || 20);
				return (__preComputed && __preComputed.cci && __preComputed.cci[key]) || [];
			},
			obv: function() { return (__preComputed && __preComputed.obv) || []; },
			vwap: function() { return (__preComputed && __preComputed.vwap) || []; }
		};
		${userCode}
	`;
}
