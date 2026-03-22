import { describe, expect, test } from "bun:test";
import type { StrategyEventRepository } from "../event-repository.js";
import type { CreateStrategyEventInput, StrategyEvent } from "../event-types.js";

function createMockEventRepository(): StrategyEventRepository & { events: StrategyEvent[] } {
	const events: StrategyEvent[] = [];
	let counter = 0;

	return {
		events,
		async insert(input: CreateStrategyEventInput): Promise<StrategyEvent> {
			counter++;
			const event: StrategyEvent = {
				id: `event-${counter}`,
				...input,
				status: "active",
				createdAt: new Date(),
			};
			events.push(event);
			return event;
		},
		async findByStrategy(strategyId, strategyVersion, symbol, timeframe) {
			return events.filter(
				(e) =>
					e.strategyId === strategyId &&
					e.strategyVersion === strategyVersion &&
					e.symbol === symbol &&
					e.timeframe === timeframe,
			);
		},
		async findByRange(strategyId, from, to) {
			return events.filter(
				(e) => e.strategyId === strategyId && e.openTime >= from && e.openTime <= to,
			);
		},
	};
}

describe("StrategyEventRepository", () => {
	test("insert creates event with correct fields", async () => {
		const repo = createMockEventRepository();
		const input: CreateStrategyEventInput = {
			strategyId: "strat-1",
			strategyVersion: 1,
			exchange: "binance",
			symbol: "BTCUSDT",
			timeframe: "1m",
			openTime: new Date("2024-01-01T00:00:00Z"),
			direction: "long",
			features: [{ name: "sma_diff", value: 0.5, normalization: { method: "minmax" } }],
			entryPrice: "50000",
		};

		const event = await repo.insert(input);
		expect(event.id).toBeDefined();
		expect(event.strategyId).toBe("strat-1");
		expect(event.features.length).toBe(1);
		expect(event.status).toBe("active");
	});

	test("findByStrategy filters correctly", async () => {
		const repo = createMockEventRepository();

		await repo.insert({
			strategyId: "strat-1",
			strategyVersion: 1,
			exchange: "binance",
			symbol: "BTCUSDT",
			timeframe: "1m",
			openTime: new Date("2024-01-01T00:00:00Z"),
			direction: "long",
			features: [],
			entryPrice: "50000",
		});

		await repo.insert({
			strategyId: "strat-2",
			strategyVersion: 1,
			exchange: "binance",
			symbol: "BTCUSDT",
			timeframe: "1m",
			openTime: new Date("2024-01-01T00:01:00Z"),
			direction: "short",
			features: [],
			entryPrice: "50100",
		});

		const results = await repo.findByStrategy("strat-1", 1, "BTCUSDT", "1m");
		expect(results.length).toBe(1);
		expect(results[0]!.strategyId).toBe("strat-1");
	});

	test("findByRange filters by time window", async () => {
		const repo = createMockEventRepository();
		const base = new Date("2024-01-01T00:00:00Z");

		await repo.insert({
			strategyId: "strat-1",
			strategyVersion: 1,
			exchange: "binance",
			symbol: "BTCUSDT",
			timeframe: "1m",
			openTime: new Date(base.getTime()),
			direction: "long",
			features: [],
			entryPrice: "50000",
		});

		await repo.insert({
			strategyId: "strat-1",
			strategyVersion: 1,
			exchange: "binance",
			symbol: "BTCUSDT",
			timeframe: "1m",
			openTime: new Date(base.getTime() + 3_600_000),
			direction: "long",
			features: [],
			entryPrice: "50100",
		});

		const results = await repo.findByRange(
			"strat-1",
			new Date(base.getTime() - 60_000),
			new Date(base.getTime() + 60_000),
		);
		expect(results.length).toBe(1);
	});
});
