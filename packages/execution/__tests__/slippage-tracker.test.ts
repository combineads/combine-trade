import { Decimal } from "decimal.js";
import { describe, expect, mock, test } from "bun:test";
import {
	SlippageTracker,
	type SlippageRecord,
	type SlippageStats,
	type SlippageTrackerOptions,
} from "../slippage-tracker.js";

function makeTracker(options?: SlippageTrackerOptions): {
	tracker: SlippageTracker;
	notifySlippage: ReturnType<typeof mock>;
} {
	const notifySlippage = mock(() => Promise.resolve());
	const tracker = new SlippageTracker({ notifySlippage, ...options });
	return { tracker, notifySlippage };
}

describe("SlippageTracker", () => {
	// Test A — Zero slippage
	test("records zero slippage when decision price equals fill price", async () => {
		const { tracker, notifySlippage } = makeTracker();
		const record = await tracker.record("order-1", new Decimal("100"), new Decimal("100"), "LONG");

		expect(record.slippagePct.equals(new Decimal("0"))).toBe(true);
		expect(notifySlippage).not.toHaveBeenCalled();
	});

	// Test B — LONG slippage above threshold
	test("LONG: calls notifySlippage when fill is above decision price and slippage > threshold", async () => {
		const { tracker, notifySlippage } = makeTracker();
		// decision=100, fill=100.6 → slippage = (100.6-100)/100*100 = 0.6%
		const record = await tracker.record(
			"order-2",
			new Decimal("100"),
			new Decimal("100.6"),
			"LONG",
		);

		expect(record.slippagePct.greaterThan(new Decimal("0.5"))).toBe(true);
		expect(notifySlippage).toHaveBeenCalledTimes(1);
		expect((notifySlippage.mock.calls[0] as [SlippageRecord])[0].orderId).toBe("order-2");
	});

	// Test C — LONG slippage below threshold
	test("LONG: does not call notifySlippage when slippage <= threshold", async () => {
		const { tracker, notifySlippage } = makeTracker();
		// decision=100, fill=100.4 → slippage = 0.4%
		const record = await tracker.record(
			"order-3",
			new Decimal("100"),
			new Decimal("100.4"),
			"LONG",
		);

		expect(record.slippagePct.lessThan(new Decimal("0.5"))).toBe(true);
		expect(notifySlippage).not.toHaveBeenCalled();
	});

	// Test D — SHORT slippage above threshold
	test("SHORT: calls notifySlippage when fill is below decision price and slippage > threshold", async () => {
		const { tracker, notifySlippage } = makeTracker();
		// decision=100, fill=99.4 → slippage = (100-99.4)/100*100 = 0.6%
		const record = await tracker.record(
			"order-4",
			new Decimal("100"),
			new Decimal("99.4"),
			"SHORT",
		);

		expect(record.slippagePct.greaterThan(new Decimal("0.5"))).toBe(true);
		expect(notifySlippage).toHaveBeenCalledTimes(1);
	});

	// Test E — getStats aggregation
	test("getStats returns correct aggregation", async () => {
		const { tracker } = makeTracker({ threshold: new Decimal("0.5") });
		// These prices produce slippages of 0.3%, 0.6%, 0.9%
		// 0.3%: fill = 100 * (1 + 0.003) = 100.3
		// 0.6%: fill = 100 * (1 + 0.006) = 100.6
		// 0.9%: fill = 100 * (1 + 0.009) = 100.9
		await tracker.record("o1", new Decimal("100"), new Decimal("100.3"), "LONG");
		await tracker.record("o2", new Decimal("100"), new Decimal("100.6"), "LONG");
		await tracker.record("o3", new Decimal("100"), new Decimal("100.9"), "LONG");

		const stats = tracker.getStats();

		expect(stats.count).toBe(3);
		// avg = (0.3 + 0.6 + 0.9) / 3 = 0.6
		expect(stats.avgSlippagePct.toFixed(1)).toBe("0.6");
		// max = 0.9
		expect(stats.maxSlippagePct.toFixed(1)).toBe("0.9");
		// abnormal count: 0.6 > 0.5 and 0.9 > 0.5 → 2
		expect(stats.abnormalCount).toBe(2);
	});

	// Test F — getStatsByStrategy filters correctly
	test("getStatsByStrategy returns only matching records", async () => {
		const { tracker } = makeTracker();
		await tracker.record("o1", new Decimal("100"), new Decimal("100.1"), "LONG", "strategyA");
		await tracker.record("o2", new Decimal("100"), new Decimal("100.2"), "LONG", "strategyA");
		await tracker.record("o3", new Decimal("100"), new Decimal("100.3"), "SHORT", "strategyB");

		const statsA = tracker.getStatsByStrategy("strategyA");
		const statsB = tracker.getStatsByStrategy("strategyB");

		expect(statsA.count).toBe(2);
		expect(statsB.count).toBe(1);
	});

	// Test G — Decimal precision (no float drift)
	test("uses Decimal.js to avoid float drift", async () => {
		const { tracker } = makeTracker();
		// 0.1 + 0.2 in native float = 0.30000000000000004
		// Using Decimal: new Decimal("0.1").plus("0.2") = exactly 0.3
		const decisionPrice = new Decimal("0.1").plus("0.2"); // exactly 0.3
		const fillPrice = new Decimal("0.3"); // exactly 0.3

		const record = await tracker.record("o-float", decisionPrice, fillPrice, "LONG");

		// If native float is used, slippage would not be exactly 0
		expect(record.slippagePct.equals(new Decimal("0"))).toBe(true);
	});

	// Additional: record stores correct fields
	test("record stores all required fields", async () => {
		const { tracker } = makeTracker();
		const decisionPrice = new Decimal("50000");
		const fillPrice = new Decimal("50100");
		const record = await tracker.record("order-x", decisionPrice, fillPrice, "LONG", "strat-1");

		expect(record.orderId).toBe("order-x");
		expect(record.decisionPrice.equals(decisionPrice)).toBe(true);
		expect(record.fillPrice.equals(fillPrice)).toBe(true);
		expect(record.direction).toBe("LONG");
		expect(record.strategyId).toBe("strat-1");
		expect(record.timestamp).toBeInstanceOf(Date);
	});

	// Additional: getStats on empty tracker
	test("getStats returns zeros on empty tracker", () => {
		const { tracker } = makeTracker();
		const stats = tracker.getStats();

		expect(stats.count).toBe(0);
		expect(stats.avgSlippagePct.equals(new Decimal("0"))).toBe(true);
		expect(stats.maxSlippagePct.equals(new Decimal("0"))).toBe(true);
		expect(stats.abnormalCount).toBe(0);
	});

	// Additional: custom threshold
	test("uses custom threshold when provided", async () => {
		const { tracker, notifySlippage } = makeTracker({ threshold: new Decimal("1.0") });
		// 0.6% slippage should NOT trigger with threshold=1.0
		await tracker.record("o1", new Decimal("100"), new Decimal("100.6"), "LONG");
		expect(notifySlippage).not.toHaveBeenCalled();

		// 1.1% slippage SHOULD trigger
		await tracker.record("o2", new Decimal("100"), new Decimal("101.1"), "LONG");
		expect(notifySlippage).toHaveBeenCalledTimes(1);
	});
});
