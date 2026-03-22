import { describe, expect, test } from "bun:test";
import {
	buildMarketContext,
	calculateVolatilityRatio,
	calculateVolumeRatio,
	classifyTrend,
} from "../market-context.js";

describe("MarketContext", () => {
	describe("classifyTrend", () => {
		test("price above SMA → up", () => {
			expect(classifyTrend(50000, 50200)).toBe("up");
		});

		test("price below SMA → down", () => {
			expect(classifyTrend(50000, 49800)).toBe("down");
		});

		test("price near SMA → neutral", () => {
			expect(classifyTrend(50000, 50000)).toBe("neutral");
			expect(classifyTrend(50000, 50040)).toBe("neutral");
		});
	});

	describe("calculateVolatilityRatio", () => {
		test("high volatility: current > average", () => {
			const ratio = calculateVolatilityRatio("200", "100");
			expect(ratio).toBe("2");
		});

		test("low volatility: current < average", () => {
			const ratio = calculateVolatilityRatio("50", "100");
			expect(ratio).toBe("0.5");
		});

		test("normal volatility: equal", () => {
			const ratio = calculateVolatilityRatio("100", "100");
			expect(ratio).toBe("1");
		});
	});

	describe("calculateVolumeRatio", () => {
		test("high volume: current > average", () => {
			expect(calculateVolumeRatio("5000", "2500")).toBe("2");
		});

		test("low volume: current < average", () => {
			expect(calculateVolumeRatio("1000", "2500")).toBe("0.4");
		});
	});

	describe("buildMarketContext", () => {
		test("full data → all fields populated", () => {
			const ctx = buildMarketContext({
				sma1h: { sma: 50000, price: 50200 },
				sma4h: { sma: 49000, price: 48500 },
				sma1d: { sma: 50000, price: 50000 },
				volatility: { currentAtr: "200", avgAtr: "100" },
				volume: { current: "5000", average: "2500" },
				fundingRate: "0.0001",
			});
			expect(ctx.trend1h).toBe("up");
			expect(ctx.trend4h).toBe("down");
			expect(ctx.trend1d).toBe("neutral");
			expect(ctx.volatilityRatio).toBe("2");
			expect(ctx.volumeRatio).toBe("2");
			expect(ctx.fundingRate).toBe("0.0001");
		});

		test("missing data → null fields", () => {
			const ctx = buildMarketContext({});
			expect(ctx.trend1h).toBeNull();
			expect(ctx.trend4h).toBeNull();
			expect(ctx.trend1d).toBeNull();
			expect(ctx.volatilityRatio).toBeNull();
			expect(ctx.volumeRatio).toBeNull();
			expect(ctx.fundingRate).toBeNull();
		});

		test("partial data → some fields null", () => {
			const ctx = buildMarketContext({
				sma1h: { sma: 50000, price: 50200 },
				fundingRate: "0.0002",
			});
			expect(ctx.trend1h).toBe("up");
			expect(ctx.trend4h).toBeNull();
			expect(ctx.volatilityRatio).toBeNull();
			expect(ctx.fundingRate).toBe("0.0002");
		});
	});
});
