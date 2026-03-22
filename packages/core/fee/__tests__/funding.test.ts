import { describe, expect, test } from "bun:test";
import { type FundingPayment, accumulateFunding, calculateFundingPayment } from "../funding.js";

describe("Funding rate calculator", () => {
	describe("calculateFundingPayment", () => {
		test("long pays positive funding rate", () => {
			// 50000 * 0.0001 = 5 (cost)
			const result = calculateFundingPayment({
				positionNotional: "50000",
				fundingRate: "0.0001",
				side: "long",
			});
			expect(result).toBe("5");
		});

		test("long receives negative funding rate", () => {
			// 50000 * -0.0001 = -5 (income)
			const result = calculateFundingPayment({
				positionNotional: "50000",
				fundingRate: "-0.0001",
				side: "long",
			});
			expect(result).toBe("-5");
		});

		test("short receives positive funding rate", () => {
			// 50000 * 0.0001 = 5, negate = -5 (income)
			const result = calculateFundingPayment({
				positionNotional: "50000",
				fundingRate: "0.0001",
				side: "short",
			});
			expect(result).toBe("-5");
		});

		test("short pays negative funding rate", () => {
			// 50000 * -0.0001 = -5, negate = 5 (cost)
			const result = calculateFundingPayment({
				positionNotional: "50000",
				fundingRate: "-0.0001",
				side: "short",
			});
			expect(result).toBe("5");
		});

		test("zero funding rate → zero payment", () => {
			const result = calculateFundingPayment({
				positionNotional: "50000",
				fundingRate: "0",
				side: "long",
			});
			expect(result).toBe("0");
		});

		test("extreme funding rate: 0.1% (high)", () => {
			// 100000 * 0.001 = 100
			const result = calculateFundingPayment({
				positionNotional: "100000",
				fundingRate: "0.001",
				side: "long",
			});
			expect(result).toBe("100");
		});
	});

	describe("accumulateFunding", () => {
		test("multiple intervals accumulate correctly", () => {
			const payments: FundingPayment[] = [
				{ positionNotional: "50000", fundingRate: "0.0001", side: "long" },
				{ positionNotional: "50000", fundingRate: "0.0002", side: "long" },
				{ positionNotional: "50000", fundingRate: "-0.00005", side: "long" },
			];
			// 5 + 10 + (-2.5) = 12.5
			expect(accumulateFunding(payments)).toBe("12.5");
		});

		test("empty payments → zero", () => {
			expect(accumulateFunding([])).toBe("0");
		});

		test("mixed long/short positions", () => {
			const payments: FundingPayment[] = [
				{ positionNotional: "50000", fundingRate: "0.0001", side: "long" },
				{ positionNotional: "30000", fundingRate: "0.0001", side: "short" },
			];
			// long: 5, short: -3 → total: 2
			expect(accumulateFunding(payments)).toBe("2");
		});
	});
});
