import { describe, expect, mock, test } from "bun:test";
import {
	type FundingCollectorDeps,
	FundingRateCollector,
	type FundingRateRecord,
} from "../funding-collector.js";

const NOW = new Date("2026-03-22T08:00:00Z");

function makeDeps(overrides: Partial<FundingCollectorDeps> = {}): FundingCollectorDeps {
	return {
		fetchFundingRates: mock(() =>
			Promise.resolve([
				{
					symbol: "BTCUSDT",
					fundingRate: "0.0001",
					nextFundingTime: NOW.getTime() + 8 * 3600 * 1000,
				},
				{
					symbol: "ETHUSDT",
					fundingRate: "0.00005",
					nextFundingTime: NOW.getTime() + 8 * 3600 * 1000,
				},
			]),
		),
		isAlreadyStored: mock(() => Promise.resolve(false)),
		saveRate: mock(() => Promise.resolve()),
		onHighFundingWarning: mock(() => {}),
		exchange: "binance",
		highFundingThreshold: "0.001",
		...overrides,
	};
}

describe("FundingRateCollector", () => {
	test("collects and saves rates for all symbols", async () => {
		const deps = makeDeps();
		const collector = new FundingRateCollector(deps);

		const result = await collector.collectOnce();
		expect(result.collected).toBe(2);
		expect(result.skipped).toBe(0);
		expect(deps.saveRate).toHaveBeenCalledTimes(2);
	});

	test("skips already-stored rates", async () => {
		const deps = makeDeps({
			isAlreadyStored: mock(() => Promise.resolve(true)),
		});
		const collector = new FundingRateCollector(deps);

		const result = await collector.collectOnce();
		expect(result.collected).toBe(0);
		expect(result.skipped).toBe(2);
		expect(deps.saveRate).not.toHaveBeenCalled();
	});

	test("saves correct record fields", async () => {
		const deps = makeDeps({
			fetchFundingRates: mock(() =>
				Promise.resolve([
					{ symbol: "BTCUSDT", fundingRate: "0.0003", nextFundingTime: 1711094400000 },
				]),
			),
		});
		const collector = new FundingRateCollector(deps);

		await collector.collectOnce();
		const call = (deps.saveRate as ReturnType<typeof mock>).mock.calls[0];
		const record = call[0] as FundingRateRecord;
		expect(record.exchange).toBe("binance");
		expect(record.symbol).toBe("BTCUSDT");
		expect(record.fundingRate).toBe("0.0003");
		expect(record.fundingTime).toBeInstanceOf(Date);
	});

	test("triggers warning when funding rate exceeds threshold", async () => {
		const deps = makeDeps({
			fetchFundingRates: mock(() =>
				Promise.resolve([
					{ symbol: "BTCUSDT", fundingRate: "0.002", nextFundingTime: NOW.getTime() },
				]),
			),
		});
		const collector = new FundingRateCollector(deps);

		await collector.collectOnce();
		expect(deps.onHighFundingWarning).toHaveBeenCalledTimes(1);
		const call = (deps.onHighFundingWarning as ReturnType<typeof mock>).mock.calls[0];
		expect(call[0]).toBe("BTCUSDT");
		expect(call[1]).toBe("0.002");
	});

	test("does not trigger warning for normal rates", async () => {
		const deps = makeDeps({
			fetchFundingRates: mock(() =>
				Promise.resolve([
					{ symbol: "BTCUSDT", fundingRate: "0.0001", nextFundingTime: NOW.getTime() },
				]),
			),
		});
		const collector = new FundingRateCollector(deps);

		await collector.collectOnce();
		expect(deps.onHighFundingWarning).not.toHaveBeenCalled();
	});

	test("handles empty fetch result", async () => {
		const deps = makeDeps({
			fetchFundingRates: mock(() => Promise.resolve([])),
		});
		const collector = new FundingRateCollector(deps);

		const result = await collector.collectOnce();
		expect(result.collected).toBe(0);
		expect(result.skipped).toBe(0);
	});

	test("handles mixed stored and new rates", async () => {
		let callCount = 0;
		const deps = makeDeps({
			isAlreadyStored: mock(() => {
				callCount++;
				return Promise.resolve(callCount === 1); // first is stored, second is new
			}),
		});
		const collector = new FundingRateCollector(deps);

		const result = await collector.collectOnce();
		expect(result.collected).toBe(1);
		expect(result.skipped).toBe(1);
	});
});
