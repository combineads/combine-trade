import type { IndicatorConfig } from "../executor.js";
import { DOUBLE_BB_SCRIPT } from "./script.js";

export interface FeatureDefinition {
	name: string;
	normalization: { method: string; lookback?: number };
}

export interface SearchConfig {
	topK: number;
	threshold: number;
	minSamples: number;
}

export interface ResultConfig {
	tpMultiplier: number;
	slMultiplier: number;
	maxHoldBars: number;
}

export interface DecisionConfig {
	minWinrate: number;
	minExpectancy: number;
}

export interface DoubleBBStrategyConfig {
	name: string;
	description: string;
	code: string;
	symbols: string[];
	timeframes: string[];
	direction: "long" | "short";
	featuresDefinition: FeatureDefinition[];
	normalizationConfig: Record<string, unknown>;
	indicatorConfig: IndicatorConfig;
	searchConfig: SearchConfig;
	resultConfig: ResultConfig;
	decisionConfig: DecisionConfig;
	executionMode: string;
	status: string;
}

export const DOUBLE_BB_TIMEFRAMES = ["1m", "3m", "5m", "15m"];

export const DOUBLE_BB_FEATURES_DEFINITION: FeatureDefinition[] = [
	{ name: "double_bb_variant", normalization: { method: "none" } },
	{ name: "candle_pattern_score", normalization: { method: "none" } },
	{ name: "ma_slope_score", normalization: { method: "none" } },
	{ name: "ma_ordering_score", normalization: { method: "none" } },
	{ name: "ma_reaction_score", normalization: { method: "none" } },
	{ name: "separation_distance", normalization: { method: "none" } },
	{ name: "h1_bias_alignment", normalization: { method: "none" } },
	{ name: "price_in_bb20", normalization: { method: "none" } },
	{ name: "volume_ratio", normalization: { method: "none" } },
	{ name: "atr_range", normalization: { method: "none" } },
];

export const DOUBLE_BB_INDICATOR_CONFIG: IndicatorConfig = {
	bb: [
		{ source: "close", period: 20, stddev: 2 },
		{ source: "open", period: 4, stddev: 4 },
	],
	sma: [{ period: 20 }, { period: 50 }, { period: 100 }, { period: 200 }],
	atr: [{ period: 14 }],
};

// √10 × 0.3 ≈ 0.949
const SIMILARITY_THRESHOLD = Math.sqrt(10) * 0.3;

export function buildDoubleBBConfig(direction: "long" | "short"): DoubleBBStrategyConfig {
	const suffix = direction.toUpperCase();

	return {
		name: `Double-BB-${suffix}`,
		description: `Double-BB strategy for BTCUSDT ${suffix} direction. Uses BB20(close,20,2) + BB4(open,4,4) with 4-family evidence system.`,
		code: DOUBLE_BB_SCRIPT,
		symbols: ["BTCUSDT"],
		timeframes: DOUBLE_BB_TIMEFRAMES,
		direction,
		featuresDefinition: DOUBLE_BB_FEATURES_DEFINITION,
		normalizationConfig: { method: "pre-normalized" },
		indicatorConfig: DOUBLE_BB_INDICATOR_CONFIG,
		searchConfig: {
			topK: 50,
			threshold: SIMILARITY_THRESHOLD,
			minSamples: 30,
		},
		resultConfig: {
			tpMultiplier: 2.0,
			slMultiplier: 1.0,
			maxHoldBars: 60,
		},
		decisionConfig: {
			minWinrate: 0.55,
			minExpectancy: 0.001,
		},
		executionMode: "analysis",
		status: "draft",
	};
}
