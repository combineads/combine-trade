import { describe, expect, test } from "bun:test";
import {
	buildDoubleBBConfig,
	DOUBLE_BB_FEATURES_DEFINITION,
	DOUBLE_BB_INDICATOR_CONFIG,
	DOUBLE_BB_TIMEFRAMES,
} from "../config.js";

describe("Double-BB strategy configuration", () => {
	test("builds LONG strategy config", () => {
		const config = buildDoubleBBConfig("long");

		expect(config.name).toBe("Double-BB-LONG");
		expect(config.direction).toBe("long");
		expect(config.symbols).toEqual(["BTCUSDT"]);
		expect(config.executionMode).toBe("analysis");
		expect(config.status).toBe("draft");
	});

	test("builds SHORT strategy config", () => {
		const config = buildDoubleBBConfig("short");

		expect(config.name).toBe("Double-BB-SHORT");
		expect(config.direction).toBe("short");
		expect(config.symbols).toEqual(["BTCUSDT"]);
	});

	test("features definition has exactly 10 features", () => {
		expect(DOUBLE_BB_FEATURES_DEFINITION).toHaveLength(10);
	});

	test("each feature has name and normalization", () => {
		for (const feature of DOUBLE_BB_FEATURES_DEFINITION) {
			expect(feature.name).toBeDefined();
			expect(typeof feature.name).toBe("string");
			expect(feature.normalization).toBeDefined();
			expect(feature.normalization.method).toBeDefined();
		}
	});

	test("indicator config includes BB20, BB4, MAs, ATR", () => {
		expect(DOUBLE_BB_INDICATOR_CONFIG.bb).toBeDefined();
		expect(DOUBLE_BB_INDICATOR_CONFIG.sma).toBeDefined();

		const bbConfigs = DOUBLE_BB_INDICATOR_CONFIG.bb;
		expect(bbConfigs).toHaveLength(2);

		// BB20(close, 20, 2) and BB4(open, 4, 4)
		const bb20 = bbConfigs?.find((b) => b.period === 20);
		expect(bb20).toBeDefined();
		expect(bb20?.source).toBe("close");
		expect(bb20?.stddev).toBe(2);

		const bb4 = bbConfigs?.find((b) => b.period === 4);
		expect(bb4).toBeDefined();
		expect(bb4?.source).toBe("open");
		expect(bb4?.stddev).toBe(4);
	});

	test("timeframes includes 1m, 3m, 5m, 15m", () => {
		expect(DOUBLE_BB_TIMEFRAMES).toEqual(["1m", "3m", "5m", "15m"]);
	});

	test("search config has correct defaults", () => {
		const config = buildDoubleBBConfig("long");

		expect(config.searchConfig.topK).toBe(50);
		expect(config.searchConfig.minSamples).toBe(30);
		expect(config.searchConfig.threshold).toBeCloseTo(0.949, 2);
	});

	test("result config has ATR-based TP/SL", () => {
		const config = buildDoubleBBConfig("long");

		expect(config.resultConfig.tpMultiplier).toBe(2.0);
		expect(config.resultConfig.slMultiplier).toBe(1.0);
		expect(config.resultConfig.maxHoldBars).toBe(60);
	});

	test("decision config has min winrate and expectancy", () => {
		const config = buildDoubleBBConfig("long");

		expect(config.decisionConfig.minWinrate).toBe(0.55);
		expect(config.decisionConfig.minExpectancy).toBeGreaterThan(0);
	});

	test("code field contains the Double-BB script", () => {
		const config = buildDoubleBBConfig("long");
		expect(config.code).toContain("indicator.bb");
		expect(config.code).toContain("defineFeature");
		expect(config.code).toContain("double_bb_variant");
	});
});
