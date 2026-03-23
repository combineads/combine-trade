import { describe, expect, test } from "bun:test";
import {
	type FundingRateAdapter,
	FundingRateCollector,
	type FundingRateRecord,
} from "../funding-rate-collector.js";

function makeRecord(overrides: Partial<FundingRateRecord> = {}): FundingRateRecord {
	return {
		symbol: "BTCUSDT",
		timestamp: 1700000000000,
		rate: "0.0001",
		interval: 8,
		...overrides,
	};
}

function createMockAdapter(
	records: FundingRateRecord[] = [],
	currentRate = "0.0001",
): FundingRateAdapter {
	return {
		getFundingHistory: async () => records,
		getCurrentFundingRate: async (symbol) => ({
			symbol,
			timestamp: Date.now(),
			rate: currentRate,
			interval: 8,
		}),
	};
}

describe("FundingRateCollector", () => {
	test("collectRecent returns records from adapter", async () => {
		const records = [makeRecord(), makeRecord({ timestamp: 1700028800000 })];
		const collector = new FundingRateCollector(createMockAdapter(records));
		const result = await collector.collectRecent("BTCUSDT", 1700000000000);
		expect(result).toHaveLength(2);
	});

	test("calculateAccumulatedFunding sums payments correctly for multiple records", () => {
		const records = [
			makeRecord({ timestamp: 1700000000000, rate: "0.0001" }),
			makeRecord({ timestamp: 1700028800000, rate: "0.0002" }),
		];
		const collector = new FundingRateCollector(createMockAdapter());
		const result = collector.calculateAccumulatedFunding(
			"BTCUSDT",
			"10000", // position size
			1699999000000, // open before all records
			records,
		);
		// payment1 = 10000 * 0.0001 = 1
		// payment2 = 10000 * 0.0002 = 2
		// total = 3
		expect(result.totalFundingPaid).toBe("3");
		expect(result.fundingRecords).toHaveLength(2);
	});

	test("calculateAccumulatedFunding with no records returns totalFundingPaid 0", () => {
		const collector = new FundingRateCollector(createMockAdapter());
		const result = collector.calculateAccumulatedFunding("BTCUSDT", "10000", 1700000000000, []);
		expect(result.totalFundingPaid).toBe("0");
	});

	test("calculateAccumulatedFunding excludes records before open time", () => {
		const records = [
			makeRecord({ timestamp: 1699000000000, rate: "0.0005" }), // before open
			makeRecord({ timestamp: 1700028800000, rate: "0.0001" }), // after open
		];
		const collector = new FundingRateCollector(createMockAdapter());
		const result = collector.calculateAccumulatedFunding(
			"BTCUSDT",
			"10000",
			1700000000000,
			records,
		);
		// Only second record: 10000 * 0.0001 = 1
		expect(result.totalFundingPaid).toBe("1");
		expect(result.fundingRecords).toHaveLength(1);
	});

	test("checkFundingWarning returns isHigh true when rate >= 0.001", async () => {
		const collector = new FundingRateCollector(createMockAdapter([], "0.001"));
		const warning = await collector.checkFundingWarning("BTCUSDT");
		expect(warning.isHigh).toBe(true);
		expect(warning.currentRate).toBe("0.001");
	});

	test("checkFundingWarning returns isHigh false when rate < 0.001", async () => {
		const collector = new FundingRateCollector(createMockAdapter([], "0.0009"));
		const warning = await collector.checkFundingWarning("BTCUSDT");
		expect(warning.isHigh).toBe(false);
	});

	test("calculations use Decimal.js (no floating point error)", () => {
		const records = [makeRecord({ rate: "0.0001" })];
		const collector = new FundingRateCollector(createMockAdapter());
		const result = collector.calculateAccumulatedFunding("BTCUSDT", "1000", 0, records);
		// 1000 * 0.0001 = 0.1 exactly
		expect(result.totalFundingPaid).toBe("0.1");
	});
});
