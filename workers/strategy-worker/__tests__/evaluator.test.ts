import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Candle, CandleRepository } from "@combine/candle";
import type {
	CreateStrategyEventInput,
	Strategy,
	StrategyEvent,
	StrategyEventRepository,
} from "@combine/core/strategy";
import { StrategyExecutor, StrategySandbox } from "@combine/core/strategy";
import type { Channel, EventPublisher } from "@combine/shared/event-bus/types.js";
import { StrategyEvaluator } from "../src/evaluator.js";

function makeCandle(i: number): Candle {
	const price = 50000 + Math.sin(i / 5) * 200;
	return {
		exchange: "binance",
		symbol: "BTCUSDT",
		timeframe: "1m",
		openTime: new Date(Date.UTC(2024, 0, 1) + i * 60_000),
		open: (price - 50).toString(),
		high: (price + 100).toString(),
		low: (price - 100).toString(),
		close: price.toString(),
		volume: "1000",
		isClosed: true,
	};
}

function createMockCandleRepo(candles: Candle[]): CandleRepository {
	return {
		async insert() {},
		async upsert() {},
		async findByRange() {
			return candles;
		},
		async findLatest(_e, _s, _t, limit = 300) {
			return candles.slice(-limit);
		},
	};
}

function createMockEventRepo(): StrategyEventRepository & { events: StrategyEvent[] } {
	const events: StrategyEvent[] = [];
	let counter = 0;
	return {
		events,
		async insert(input: CreateStrategyEventInput) {
			counter++;
			const event: StrategyEvent = {
				id: `evt-${counter}`,
				...input,
				status: "active",
				createdAt: new Date(),
			};
			events.push(event);
			return event;
		},
		async findByStrategy() {
			return events;
		},
		async findByRange() {
			return events;
		},
	};
}

function createMockPublisher() {
	const published: { channel: string; payload: unknown }[] = [];
	return {
		published,
		async publish<T>(channel: Channel<T>, payload: T): Promise<void> {
			published.push({ channel: channel.name, payload });
		},
		async close(): Promise<void> {},
	} satisfies EventPublisher & { published: typeof published };
}

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
	return {
		id: "strat-1",
		version: 1,
		name: "Test SMA Cross",
		description: null,
		code: `
			defineFeature("sma_diff", close[close.length - 1] - close[close.length - 2], { method: "minmax" });
		`,
		symbols: ["BTCUSDT"],
		timeframe: "1m",
		direction: "long",
		featuresDefinition: [
			{ name: "sma_diff", expression: "close diff", normalization: { method: "minmax" } },
		],
		normalizationConfig: {},
		searchConfig: {},
		resultConfig: {},
		decisionConfig: {},
		executionMode: "analysis",
		apiVersion: null,
		status: "active",
		createdAt: new Date(),
		updatedAt: new Date(),
		deletedAt: null,
		...overrides,
	};
}

let sandbox: StrategySandbox;
let executor: StrategyExecutor;

beforeAll(async () => {
	sandbox = new StrategySandbox({ timeoutMs: 2000 });
	await sandbox.initialize();
	executor = new StrategyExecutor({ sandbox });
});

afterAll(() => {
	sandbox.dispose();
});

describe("StrategyEvaluator", () => {
	test("evaluates active strategies and creates events", async () => {
		const candles = Array.from({ length: 50 }, (_, i) => makeCandle(i));
		const candleRepo = createMockCandleRepo(candles);
		const eventRepo = createMockEventRepo();
		const publisher = createMockPublisher();
		const strategies = [makeStrategy()];

		const evaluator = new StrategyEvaluator({
			executor,
			strategyEventRepo: eventRepo,
			candleRepo,
			publisher,
			findActiveStrategies: async () => strategies,
		});

		const results = await evaluator.evaluate(
			"binance",
			"BTCUSDT",
			"1m",
			new Date("2024-01-01T00:49:00Z"),
		);

		expect(results.length).toBe(1);
		expect(results[0]!.success).toBe(true);
		expect(results[0]!.eventsCreated).toBe(1);
		expect(eventRepo.events.length).toBe(1);
		expect(publisher.published.length).toBe(1);
		expect(publisher.published[0]!.channel).toBe("strategy_event_created");
	});

	test("no active strategies returns empty results", async () => {
		const candles = Array.from({ length: 50 }, (_, i) => makeCandle(i));
		const candleRepo = createMockCandleRepo(candles);
		const eventRepo = createMockEventRepo();
		const publisher = createMockPublisher();

		const evaluator = new StrategyEvaluator({
			executor,
			strategyEventRepo: eventRepo,
			candleRepo,
			publisher,
			findActiveStrategies: async () => [],
		});

		const results = await evaluator.evaluate("binance", "BTCUSDT", "1m", new Date());
		expect(results.length).toBe(0);
	});

	test("one strategy failure doesn't block others", async () => {
		const candles = Array.from({ length: 50 }, (_, i) => makeCandle(i));
		const candleRepo = createMockCandleRepo(candles);
		const eventRepo = createMockEventRepo();
		const publisher = createMockPublisher();

		const strategies = [
			makeStrategy({ id: "strat-bad", name: "Bad Strategy", code: "throw new Error('bug');" }),
			makeStrategy({
				id: "strat-good",
				name: "Good Strategy",
				code: 'defineFeature("x", 1, { method: "none" });',
			}),
		];

		const evaluator = new StrategyEvaluator({
			executor,
			strategyEventRepo: eventRepo,
			candleRepo,
			publisher,
			findActiveStrategies: async () => strategies,
		});

		const results = await evaluator.evaluate("binance", "BTCUSDT", "1m", new Date());
		expect(results.length).toBe(2);

		const bad = results.find((r) => r.strategyId === "strat-bad");
		const good = results.find((r) => r.strategyId === "strat-good");

		expect(bad!.success).toBe(false);
		expect(bad!.error).toBeDefined();
		expect(good!.success).toBe(true);
		expect(good!.eventsCreated).toBe(1);
	});

	test("lastEvaluationTime is updated after evaluation", async () => {
		const candles = Array.from({ length: 50 }, (_, i) => makeCandle(i));
		const candleRepo = createMockCandleRepo(candles);
		const eventRepo = createMockEventRepo();
		const publisher = createMockPublisher();

		const evaluator = new StrategyEvaluator({
			executor,
			strategyEventRepo: eventRepo,
			candleRepo,
			publisher,
			findActiveStrategies: async () => [makeStrategy()],
		});

		expect(evaluator.lastEvaluationTime).toBeNull();
		await evaluator.evaluate("binance", "BTCUSDT", "1m", new Date());
		expect(evaluator.lastEvaluationTime).not.toBeNull();
	});

	test("strategy with no features creates no event", async () => {
		const candles = Array.from({ length: 50 }, (_, i) => makeCandle(i));
		const candleRepo = createMockCandleRepo(candles);
		const eventRepo = createMockEventRepo();
		const publisher = createMockPublisher();

		const strategies = [
			makeStrategy({
				code: "var x = 1 + 1;", // No defineFeature call
			}),
		];

		const evaluator = new StrategyEvaluator({
			executor,
			strategyEventRepo: eventRepo,
			candleRepo,
			publisher,
			findActiveStrategies: async () => strategies,
		});

		const results = await evaluator.evaluate("binance", "BTCUSDT", "1m", new Date());
		expect(results[0]!.success).toBe(true);
		expect(results[0]!.eventsCreated).toBe(0);
		expect(eventRepo.events.length).toBe(0);
	});
});
