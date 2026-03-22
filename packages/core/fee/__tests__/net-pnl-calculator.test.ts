import { describe, expect, test } from "bun:test";
import { calculateNetPnl, type NetPnlResult } from "../net-pnl-calculator.js";

describe("calculateNetPnl", () => {
	test("correct net PnL = grossPnl - totalFee - fundingCost", () => {
		const result = calculateNetPnl({
			grossPnl: "100",
			entryFee: "3",
			exitFee: "3",
			fundingCost: "2",
			entryNotional: "1000",
		});
		expect(result.netPnl).toBe("92");
		expect(result.fees.totalFee).toBe("6");
		expect(result.netPnlPercent).toBe("9.2");
	});

	test("zero fees and funding returns netPnl == grossPnl", () => {
		const result = calculateNetPnl({
			grossPnl: "500",
			entryFee: "0",
			exitFee: "0",
			fundingCost: "0",
			entryNotional: "10000",
		});
		expect(result.netPnl).toBe("500");
		expect(result.netPnlPercent).toBe("5");
	});

	test("netPnl can be negative", () => {
		const result = calculateNetPnl({
			grossPnl: "10",
			entryFee: "5",
			exitFee: "5",
			fundingCost: "3",
			entryNotional: "1000",
		});
		expect(result.netPnl).toBe("-3");
	});

	test("percent calculation is accurate with Decimal.js", () => {
		const result = calculateNetPnl({
			grossPnl: "33.33",
			entryFee: "1.11",
			exitFee: "1.11",
			fundingCost: "0.55",
			entryNotional: "10000",
		});
		// net = 33.33 - 2.22 - 0.55 = 30.56
		expect(result.netPnl).toBe("30.56");
		// percent = 30.56 / 10000 * 100 = 0.3056
		expect(result.netPnlPercent).toBe("0.3056");
	});

	test("negative funding (credit) increases netPnl", () => {
		const result = calculateNetPnl({
			grossPnl: "100",
			entryFee: "3",
			exitFee: "3",
			fundingCost: "-5",
			entryNotional: "1000",
		});
		// net = 100 - 6 - (-5) = 99
		expect(result.netPnl).toBe("99");
	});
});
