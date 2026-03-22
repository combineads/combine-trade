import { describe, expect, test } from "bun:test";
import {
	type FeeSchedule,
	calculateFee,
	calculateGrossPnlLong,
	calculateGrossPnlShort,
	calculateNetPnl,
	calculateRoundTripFee,
} from "@combine/core/fee/calculator.js";
import { type FundingPayment, accumulateFunding } from "@combine/core/fee/funding.js";
import { add, mul, round, sub } from "@combine/shared/decimal/arithmetic.js";
import {
	roundPrice,
	roundQuantity,
	validateMinNotional,
} from "@combine/shared/decimal/precision.js";

const BINANCE_BTC: FeeSchedule = { makerRate: "0.0002", takerRate: "0.0004" };

describe("Financial arithmetic integration", () => {
	test("precision pipeline: round price and quantity, validate notional", () => {
		const rawPrice = "50123.456";
		const rawQty = "0.12345";

		const price = roundPrice(rawPrice, "0.10");
		const qty = roundQuantity(rawQty, "0.001");

		expect(price).toBe("50123.4");
		expect(qty).toBe("0.123");

		// Notional = 0.123 * 50123.4 = 6165.1782
		const notional = mul(qty, price);
		expect(notional).toBe("6165.1782");

		// Validate min notional (5 USDT)
		expect(() => validateMinNotional(qty, price, "5")).not.toThrow();
	});

	test("full long trade with fees: entry → exit → net PnL", () => {
		const qty = "0.1";
		const entryPrice = "50000";
		const exitPrice = "51000";

		// Gross PnL: (51000 - 50000) * 0.1 = 100
		const grossPnl = calculateGrossPnlLong(qty, entryPrice, exitPrice);
		expect(grossPnl).toBe("100");

		// Round-trip fees (taker/taker): 0.1*50000*0.0004 + 0.1*51000*0.0004 = 2 + 2.04 = 4.04
		const fees = calculateRoundTripFee(qty, entryPrice, exitPrice, BINANCE_BTC);
		expect(fees).toBe("4.04");

		// Net PnL: 100 - 4.04 = 95.96
		const netPnl = calculateNetPnl(grossPnl, fees);
		expect(netPnl).toBe("95.96");
	});

	test("full short trade with fees and funding", () => {
		const qty = "0.2";
		const entryPrice = "50000";
		const exitPrice = "49000";

		// Gross PnL: (50000 - 49000) * 0.2 = 200
		const grossPnl = calculateGrossPnlShort(qty, entryPrice, exitPrice);
		expect(grossPnl).toBe("200");

		// Fees: 0.2*50000*0.0004 + 0.2*49000*0.0004 = 4 + 3.92 = 7.92
		const fees = calculateRoundTripFee(qty, entryPrice, exitPrice, BINANCE_BTC);
		expect(fees).toBe("7.92");

		// Funding: 3 intervals, short position receives positive funding
		const notional = mul(qty, entryPrice); // 10000
		const fundingPayments: FundingPayment[] = [
			{ positionNotional: notional, fundingRate: "0.0001", side: "short" },
			{ positionNotional: notional, fundingRate: "0.00005", side: "short" },
			{ positionNotional: notional, fundingRate: "0.0002", side: "short" },
		];
		const fundingCost = accumulateFunding(fundingPayments);
		// -1 + -0.5 + -2 = -3.5 (income for short)
		expect(fundingCost).toBe("-3.5");

		// Net PnL: gross - fees + funding income
		// 200 - 7.92 - (-3.5) = 200 - 7.92 + 3.5 = 195.58
		const netPnl = sub(sub(grossPnl, fees), fundingCost);
		expect(netPnl).toBe("195.58");
	});

	test("losing trade: fees deepen the loss", () => {
		const qty = "0.1";
		const entryPrice = "50000";
		const exitPrice = "49500";

		// Gross PnL: (49500 - 50000) * 0.1 = -50
		const grossPnl = calculateGrossPnlLong(qty, entryPrice, exitPrice);
		expect(grossPnl).toBe("-50");

		// Fees: 0.1*50000*0.0004 + 0.1*49500*0.0004 = 2 + 1.98 = 3.98
		const fees = calculateRoundTripFee(qty, entryPrice, exitPrice, BINANCE_BTC);
		expect(fees).toBe("3.98");

		// Net PnL: -50 - 3.98 = -53.98
		const netPnl = calculateNetPnl(grossPnl, fees);
		expect(netPnl).toBe("-53.98");
	});

	test("breakeven analysis: minimum move to cover fees", () => {
		const qty = "0.1";
		const entryPrice = "50000";

		// Entry fee: 0.1 * 50000 * 0.0004 = 2
		const entryFee = calculateFee(qty, entryPrice, BINANCE_BTC.takerRate);
		expect(entryFee).toBe("2");

		// Round-trip fees ≈ 2 * entryFee = 4 (when exit ≈ entry)
		const totalFees = add(entryFee, entryFee);
		// Minimum price move to cover fees: totalFees / qty = 4 / 0.1 = 40
		const moveNeeded = round(mul(totalFees, "10"), 2, "ROUND_HALF_UP");
		expect(moveNeeded).toBe("40");
	});

	test("display rounding: ROUND_HALF_UP for reporting", () => {
		const netPnl = "95.965";
		const displayPnl = round(netPnl, 2, "ROUND_HALF_UP");
		expect(displayPnl).toBe("95.97");

		const orderQty = "0.12345";
		const truncatedQty = round(orderQty, 3, "ROUND_DOWN");
		expect(truncatedQty).toBe("0.123");
	});
});
