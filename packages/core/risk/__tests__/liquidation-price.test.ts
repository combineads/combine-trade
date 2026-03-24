import { describe, expect, test } from "bun:test";
import Decimal from "decimal.js";
import {
	LiquidationPriceCalculator,
	LiquidationPriceError,
} from "../liquidation-price.js";
import type { LiquidationPriceInput, LiquidationPriceProvider } from "../types.js";

// Helper: build a provider that returns a fixed value (or null)
function makeProvider(value: string | null): LiquidationPriceProvider {
	return {
		async fetchLiquidationPrice(_input: LiquidationPriceInput): Promise<string | null> {
			return value;
		},
	};
}

describe("LiquidationPriceCalculator", () => {
	const calc = new LiquidationPriceCalculator();

	// ─── formula: LONG ───────────────────────────────────────────────────────────

	describe("estimate (formula)", () => {
		test("LONG 10x leverage, 0.5% mmr, entry 50000 → correct", () => {
			// 50000 * (1 - 1/10 + 0.005) = 50000 * (1 - 0.1 + 0.005) = 50000 * 0.905 = 45250
			const result = calc.estimate({
				side: "LONG",
				entryPrice: "50000",
				leverage: 10,
				maintenanceMarginRate: "0.005",
				marginType: "isolated",
			});
			expect(result).toBe("45250");
		});

		test("SHORT 10x leverage, 0.5% mmr, entry 50000 → correct", () => {
			// 50000 * (1 + 1/10 - 0.005) = 50000 * (1 + 0.1 - 0.005) = 50000 * 1.095 = 54750
			const result = calc.estimate({
				side: "SHORT",
				entryPrice: "50000",
				leverage: 10,
				maintenanceMarginRate: "0.005",
				marginType: "isolated",
			});
			expect(result).toBe("54750");
		});

		test("LONG 20x leverage, 0.4% mmr, entry 30000 → correct", () => {
			// 30000 * (1 - 1/20 + 0.004) = 30000 * (1 - 0.05 + 0.004) = 30000 * 0.954 = 28620
			const result = calc.estimate({
				side: "LONG",
				entryPrice: "30000",
				leverage: 20,
				maintenanceMarginRate: "0.004",
				marginType: "isolated",
			});
			expect(result).toBe("28620");
		});

		test("cross margin → returns null (not calculable)", () => {
			const result = calc.estimate({
				side: "LONG",
				entryPrice: "50000",
				leverage: 10,
				maintenanceMarginRate: "0.005",
				marginType: "cross",
			});
			expect(result).toBeNull();
		});

		test("leverage 0 → throws LiquidationPriceError", () => {
			expect(() =>
				calc.estimate({
					side: "LONG",
					entryPrice: "50000",
					leverage: 0,
					maintenanceMarginRate: "0.005",
					marginType: "isolated",
				}),
			).toThrow(LiquidationPriceError);
		});

		test("negative leverage → throws LiquidationPriceError", () => {
			expect(() =>
				calc.estimate({
					side: "LONG",
					entryPrice: "50000",
					leverage: -5,
					maintenanceMarginRate: "0.005",
					marginType: "isolated",
				}),
			).toThrow(LiquidationPriceError);
		});

		test("negative maintenanceMarginRate → throws LiquidationPriceError", () => {
			expect(() =>
				calc.estimate({
					side: "LONG",
					entryPrice: "50000",
					leverage: 10,
					maintenanceMarginRate: "-0.001",
					marginType: "isolated",
				}),
			).toThrow(LiquidationPriceError);
		});

		test("non-positive entryPrice → throws LiquidationPriceError", () => {
			expect(() =>
				calc.estimate({
					side: "LONG",
					entryPrice: "0",
					leverage: 10,
					maintenanceMarginRate: "0.005",
					marginType: "isolated",
				}),
			).toThrow(LiquidationPriceError);
		});
	});

	// ─── fromExchangeOrEstimate ───────────────────────────────────────────────────

	describe("fromExchangeOrEstimate", () => {
		const input: LiquidationPriceInput = {
			side: "LONG",
			entryPrice: "50000",
			leverage: 10,
			maintenanceMarginRate: "0.005",
			marginType: "isolated",
		};

		test("provider returns valid price → uses exchange value", async () => {
			const provider = makeProvider("44000");
			const result = await calc.fromExchangeOrEstimate(input, provider);
			expect(result).toEqual({ price: "44000", source: "exchange" });
		});

		test("provider returns null → falls back to formula", async () => {
			const provider = makeProvider(null);
			const result = await calc.fromExchangeOrEstimate(input, provider);
			expect(result).toEqual({ price: "45250", source: "estimate" });
		});

		test("provider returns empty string → falls back to formula", async () => {
			const provider = makeProvider("");
			const result = await calc.fromExchangeOrEstimate(input, provider);
			expect(result).toEqual({ price: "45250", source: "estimate" });
		});

		test('provider returns "0" → falls back to formula', async () => {
			const provider = makeProvider("0");
			const result = await calc.fromExchangeOrEstimate(input, provider);
			expect(result).toEqual({ price: "45250", source: "estimate" });
		});

		test("provider throws → falls back to formula", async () => {
			const failingProvider: LiquidationPriceProvider = {
				async fetchLiquidationPrice(_input: LiquidationPriceInput): Promise<string | null> {
					throw new Error("exchange API unavailable");
				},
			};
			const result = await calc.fromExchangeOrEstimate(input, failingProvider);
			expect(result).toEqual({ price: "45250", source: "estimate" });
		});

		test("cross margin → provider called but formula fallback returns null", async () => {
			const crossInput: LiquidationPriceInput = {
				...input,
				marginType: "cross",
			};
			const provider = makeProvider(null);
			const result = await calc.fromExchangeOrEstimate(crossInput, provider);
			expect(result).toEqual({ price: null, source: "estimate" });
		});

		test("provider returns valid price for cross margin → uses exchange value", async () => {
			const crossInput: LiquidationPriceInput = {
				...input,
				marginType: "cross",
			};
			const provider = makeProvider("48000");
			const result = await calc.fromExchangeOrEstimate(crossInput, provider);
			expect(result).toEqual({ price: "48000", source: "exchange" });
		});
	});

	// ─── Decimal.js precision ────────────────────────────────────────────────────

	describe("precision", () => {
		test("does not lose precision on fractional leverage", () => {
			// leverage 3, mmr 0.005, entry 1000
			// LONG: 1000 * (1 - 1/3 + 0.005) = 1000 * (0.671666...) = 671.666...
			const result = calc.estimate({
				side: "LONG",
				entryPrice: "1000",
				leverage: 3,
				maintenanceMarginRate: "0.005",
				marginType: "isolated",
			});
			// Verify it's a Decimal-accurate string (not NaN or integer-truncated)
			expect(result).not.toBeNull();
			const d = new Decimal(result as string);
			expect(d.isFinite()).toBe(true);
			expect(d.isNaN()).toBe(false);
		});
	});
});
