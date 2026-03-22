import { describe, expect, test } from "bun:test";
import {
	type FeeSchedule,
	calculateFee,
	calculateGrossPnlLong,
	calculateGrossPnlShort,
	calculateNetPnl,
	calculateRoundTripFee,
} from "../calculator.js";

const BINANCE_SCHEDULE: FeeSchedule = {
	makerRate: "0.0002",
	takerRate: "0.0004",
};

describe("Fee calculator", () => {
	describe("calculateFee", () => {
		test("BTC taker fee: 0.1 BTC * 50000 * 0.04% = 2", () => {
			expect(calculateFee("0.1", "50000", "0.0004")).toBe("2");
		});

		test("BTC maker fee: 0.1 BTC * 50000 * 0.02% = 1", () => {
			expect(calculateFee("0.1", "50000", "0.0002")).toBe("1");
		});

		test("small order fee", () => {
			// 0.001 * 50000 * 0.0004 = 0.02
			expect(calculateFee("0.001", "50000", "0.0004")).toBe("0.02");
		});
	});

	describe("calculateRoundTripFee", () => {
		test("taker entry + taker exit", () => {
			// entry: 0.1 * 50000 * 0.0004 = 2
			// exit: 0.1 * 51000 * 0.0004 = 2.04
			// total: 4.04
			const fee = calculateRoundTripFee("0.1", "50000", "51000", BINANCE_SCHEDULE);
			expect(fee).toBe("4.04");
		});

		test("maker entry + taker exit", () => {
			// entry: 0.1 * 50000 * 0.0002 = 1
			// exit: 0.1 * 51000 * 0.0004 = 2.04
			// total: 3.04
			const fee = calculateRoundTripFee(
				"0.1",
				"50000",
				"51000",
				BINANCE_SCHEDULE,
				"maker",
				"taker",
			);
			expect(fee).toBe("3.04");
		});

		test("maker entry + maker exit", () => {
			// entry: 0.1 * 50000 * 0.0002 = 1
			// exit: 0.1 * 51000 * 0.0002 = 1.02
			// total: 2.02
			const fee = calculateRoundTripFee(
				"0.1",
				"50000",
				"51000",
				BINANCE_SCHEDULE,
				"maker",
				"maker",
			);
			expect(fee).toBe("2.02");
		});
	});

	describe("calculateNetPnl", () => {
		test("profitable trade minus fees", () => {
			// gross PnL = 100, fees = 4.04 → net = 95.96
			expect(calculateNetPnl("100", "4.04")).toBe("95.96");
		});

		test("losing trade minus fees deepens loss", () => {
			// gross PnL = -50, fees = 4 → net = -54
			expect(calculateNetPnl("-50", "4")).toBe("-54");
		});
	});

	describe("calculateGrossPnlLong", () => {
		test("winning long trade", () => {
			// (51000 - 50000) * 0.1 = 100
			expect(calculateGrossPnlLong("0.1", "50000", "51000")).toBe("100");
		});

		test("losing long trade", () => {
			// (49000 - 50000) * 0.1 = -100
			expect(calculateGrossPnlLong("0.1", "50000", "49000")).toBe("-100");
		});
	});

	describe("calculateGrossPnlShort", () => {
		test("winning short trade", () => {
			// (50000 - 49000) * 0.1 = 100
			expect(calculateGrossPnlShort("0.1", "50000", "49000")).toBe("100");
		});

		test("losing short trade", () => {
			// (50000 - 51000) * 0.1 = -100
			expect(calculateGrossPnlShort("0.1", "50000", "51000")).toBe("-100");
		});
	});
});
