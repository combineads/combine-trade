import * as indicators from "../indicator/index.js";
import type { CandleData, StrategyAPIConfig } from "./api.js";
import type { SandboxResult } from "./sandbox.js";
import type { StrategySandbox } from "./sandbox.js";

export interface StrategyExecutorDeps {
	sandbox: StrategySandbox;
}

export interface ExecutionInput {
	code: string;
	symbol: string;
	timeframe: string;
	candles: CandleData;
	barIndex: number;
	additionalCandles?: Record<string, CandleData>;
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
 * Orchestrates strategy execution:
 * 1. Pre-compute indicators
 * 2. Inject API + data into sandbox
 * 3. Execute strategy code
 * 4. Collect results
 */
export class StrategyExecutor {
	constructor(private readonly deps: StrategyExecutorDeps) {}

	async execute(input: ExecutionInput): Promise<SandboxResult> {
		// Pre-compute common indicators
		const preComputed = await this.preComputeIndicators(input.candles);

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

		// Build globals including pre-computed indicators
		const globals: Record<string, unknown> = {
			__preComputed: preComputed,
		};

		// Wrap strategy code with indicator API that reads pre-computed data
		const wrappedCode = buildWrappedCode(input.code);

		// Execute with injected API
		return this.deps.sandbox.execute(wrappedCode, globals, apiConfig);
	}

	private async preComputeIndicators(candles: CandleData): Promise<PreComputedIndicators> {
		const { close, high, low, volume } = candles;

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

		return {
			sma: { "20": sma20, "50": sma50, "200": sma200 },
			ema: { "12": ema12, "20": ema20, "26": ema26, "50": ema50 },
			rsi: { "14": rsi14 },
			macd: { default: macdDefault },
			bb: { "20": bb20 },
			atr: { "14": atr14 },
			stochastic: { "14": stoch14 },
			cci: { "20": cci20 },
			adx: {}, // ADX needs more data, computed on demand
			obv: obvResult,
			vwap: vwapResult,
		};
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
