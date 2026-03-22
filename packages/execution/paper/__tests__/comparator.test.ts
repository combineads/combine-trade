import { describe, expect, test } from "bun:test";
import { expectancyDelta, maxDrawdown, sharpeRatio, zTestWinRate } from "../comparator.js";

describe("Paper vs Backtest Comparator", () => {
	describe("zTestWinRate", () => {
		test("similar rates → pass", () => {
			// paper=0.60, backtest=0.65, n=30
			// z = (0.60 - 0.65) / sqrt(0.65 * 0.35 / 30) = -0.05 / 0.0871 ≈ -0.574
			const result = zTestWinRate(0.6, 0.65, 30);
			expect(result.pass).toBe(true);
			expect(Number(result.z)).toBeGreaterThan(-1.645);
		});

		test("much worse paper rate → fail", () => {
			// paper=0.40, backtest=0.65, n=30
			// z = (0.40 - 0.65) / sqrt(0.65 * 0.35 / 30) ≈ -2.87
			const result = zTestWinRate(0.4, 0.65, 30);
			expect(result.pass).toBe(false);
			expect(Number(result.z)).toBeLessThan(-1.645);
		});

		test("identical rates → pass", () => {
			const result = zTestWinRate(0.65, 0.65, 30);
			expect(result.pass).toBe(true);
			expect(result.z).toBe("0");
		});

		test("small sample (n=5) → computes correctly", () => {
			const result = zTestWinRate(0.6, 0.65, 5);
			expect(result.pass).toBe(true); // larger standard error means harder to reject
		});

		test("paper better than backtest → pass", () => {
			const result = zTestWinRate(0.75, 0.65, 30);
			expect(result.pass).toBe(true);
			expect(Number(result.z)).toBeGreaterThan(0);
		});
	});

	describe("sharpeRatio", () => {
		test("positive daily returns → positive annualized Sharpe", () => {
			const returns = ["0.01", "0.02", "0.015", "0.005", "0.01"];
			const result = sharpeRatio(returns);
			expect(Number(result)).toBeGreaterThan(0);
		});

		test("all zero returns → 0", () => {
			const result = sharpeRatio(["0", "0", "0"]);
			expect(result).toBe("0");
		});

		test("negative mean returns → negative Sharpe", () => {
			const returns = ["-0.02", "-0.01", "-0.03", "-0.015"];
			const result = sharpeRatio(returns);
			expect(Number(result)).toBeLessThan(0);
		});

		test("single return → 0 (no std dev possible)", () => {
			const result = sharpeRatio(["0.01"]);
			expect(result).toBe("0");
		});

		test("empty returns → 0", () => {
			const result = sharpeRatio([]);
			expect(result).toBe("0");
		});
	});

	describe("maxDrawdown", () => {
		test("equity with drawdown", () => {
			// Peak at 12000, trough at 9000 → drawdown = (12000-9000)/12000 = 25%
			const equity = ["10000", "12000", "11000", "9000", "10000"];
			const dd = maxDrawdown(equity);
			expect(dd).toBe("25");
		});

		test("monotonically increasing → 0", () => {
			const equity = ["10000", "11000", "12000", "13000"];
			const dd = maxDrawdown(equity);
			expect(dd).toBe("0");
		});

		test("single value → 0", () => {
			expect(maxDrawdown(["10000"])).toBe("0");
		});

		test("empty → 0", () => {
			expect(maxDrawdown([])).toBe("0");
		});

		test("all same value → 0", () => {
			expect(maxDrawdown(["10000", "10000", "10000"])).toBe("0");
		});
	});

	describe("expectancyDelta", () => {
		test("paper better than backtest → positive delta", () => {
			const delta = expectancyDelta("1.5", "1.0");
			expect(delta).toBe("0.5");
		});

		test("paper worse than backtest → negative delta", () => {
			const delta = expectancyDelta("0.5", "1.0");
			expect(delta).toBe("-0.5");
		});

		test("equal → zero", () => {
			const delta = expectancyDelta("1.0", "1.0");
			expect(delta).toBe("0");
		});
	});
});
