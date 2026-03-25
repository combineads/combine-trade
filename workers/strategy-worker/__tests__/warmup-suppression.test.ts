import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Candle, CandleRepository } from "@combine/candle";
import type {
	CreateStrategyEventInput,
	Strategy,
	StrategyEvent,
	StrategyEventRepository,
} from "@combine/core/strategy";
import { StrategyExecutor, StrategySandbox } from "@combine/core/strategy";
import { WarmupTracker } from "@combine/core/strategy/warmup.js";
import type { Channel, EventPublisher } from "@combine/shared/event-bus/types.js";
import { StrategyEvaluator } from "../src/evaluator.js";

function makeCandle(i: number, symbol = "BTCUSDT"): Candle {
	const price = 50000 + Math.sin(i / 5) * 200;
	return {
		exchange: "binance",
		symbol,
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
		name: "Test EMA Strategy",
		description: null,
		// EMA(5) → warmup period = 5
		code: `
			var ema = indicator.ema(close, 5);
			defineFeature("ema_5", ema[ema.length - 1], { method: "minmax" });
		`,
		symbols: ["BTCUSDT"],
		timeframe: "1m",
		direction: "long",
		featuresDefinition: [
			{ name: "ema_5", expression: "ema 5", normalization: { method: "minmax" } },
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

describe("Warmup period event suppression", () => {
	test("suppresses events during warmup period (EMA 5 → first 5 bars suppressed)", async () => {
		const candles = Array.from({ length: 50 }, (_, i) => makeCandle(i));
		const candleRepo = createMockCandleRepo(candles);
		const eventRepo = createMockEventRepo();
		const publisher = createMockPublisher();
		const warmupTracker = new WarmupTracker();
		const strategy = makeStrategy();

		const evaluator = new StrategyEvaluator({
			executor,
			strategyEventRepo: eventRepo,
			candleRepo,
			publisher,
			findActiveStrategies: async () => [strategy],
			warmupTracker,
		});

		// Evaluate 5 times (warmup period = 5)
		for (let i = 0; i < 5; i++) {
			const result = await evaluator.evaluate(
				"binance",
				"BTCUSDT",
				"1m",
				new Date(Date.UTC(2024, 0, 1) + i * 60_000),
			);
			expect(result[0]!.success).toBe(true);
			// During warmup: no events created, suppressed = true
			expect(result[0]!.eventsCreated).toBe(0);
			expect(result[0]!.suppressed).toBe(true);
		}

		// No events should have been emitted during warmup
		expect(eventRepo.events.length).toBe(0);
		expect(publisher.published.length).toBe(0);
	});

	test("emits events after warmup period is complete", async () => {
		const candles = Array.from({ length: 50 }, (_, i) => makeCandle(i));
		const candleRepo = createMockCandleRepo(candles);
		const eventRepo = createMockEventRepo();
		const publisher = createMockPublisher();
		const warmupTracker = new WarmupTracker();
		const strategy = makeStrategy();

		const evaluator = new StrategyEvaluator({
			executor,
			strategyEventRepo: eventRepo,
			candleRepo,
			publisher,
			findActiveStrategies: async () => [strategy],
			warmupTracker,
		});

		// Evaluate warmup period + 1 more bar
		for (let i = 0; i < 6; i++) {
			await evaluator.evaluate(
				"binance",
				"BTCUSDT",
				"1m",
				new Date(Date.UTC(2024, 0, 1) + i * 60_000),
			);
		}

		// After warmup (5 bars), the 6th bar should produce an event
		expect(eventRepo.events.length).toBe(1);
		expect(publisher.published.length).toBe(1);
	});

	test("strategies with no indicators (warmup=0) never suppress", async () => {
		const candles = Array.from({ length: 50 }, (_, i) => makeCandle(i));
		const candleRepo = createMockCandleRepo(candles);
		const eventRepo = createMockEventRepo();
		const publisher = createMockPublisher();
		const warmupTracker = new WarmupTracker();

		const strategy = makeStrategy({
			code: `
				defineFeature("price", close[close.length - 1], { method: "none" });
			`,
		});

		const evaluator = new StrategyEvaluator({
			executor,
			strategyEventRepo: eventRepo,
			candleRepo,
			publisher,
			findActiveStrategies: async () => [strategy],
			warmupTracker,
		});

		// First evaluation should immediately produce events (warmup=0)
		const result = await evaluator.evaluate(
			"binance",
			"BTCUSDT",
			"1m",
			new Date("2024-01-01T00:00:00Z"),
		);
		expect(result[0]!.suppressed).toBe(false);
		expect(result[0]!.eventsCreated).toBe(1);
	});

	test("warmup is tracked per strategy+symbol+timeframe key", async () => {
		const candles = Array.from({ length: 50 }, (_, i) => makeCandle(i));
		const candleRepo = createMockCandleRepo(candles);
		const eventRepo = createMockEventRepo();
		const publisher = createMockPublisher();
		const warmupTracker = new WarmupTracker();

		// Two strategies with EMA(5) warmup
		const strategy1 = makeStrategy({ id: "strat-1" });
		const strategy2 = makeStrategy({ id: "strat-2", name: "Strategy 2" });

		const evaluator = new StrategyEvaluator({
			executor,
			strategyEventRepo: eventRepo,
			candleRepo,
			publisher,
			findActiveStrategies: async () => [strategy1, strategy2],
			warmupTracker,
		});

		// Evaluate 5 times — both strategies in warmup
		for (let i = 0; i < 5; i++) {
			await evaluator.evaluate(
				"binance",
				"BTCUSDT",
				"1m",
				new Date(Date.UTC(2024, 0, 1) + i * 60_000),
			);
		}

		// Still in warmup after 5 bars, no events
		expect(eventRepo.events.length).toBe(0);

		// 6th bar → both strategies emit
		await evaluator.evaluate(
			"binance",
			"BTCUSDT",
			"1m",
			new Date(Date.UTC(2024, 0, 1) + 5 * 60_000),
		);
		expect(eventRepo.events.length).toBe(2);
	});

	test("warmup state persists across evaluate() calls (real-time simulation)", async () => {
		// Simulates the real-time scenario: evaluator is long-lived, called once per candle close
		const warmupTracker = new WarmupTracker();
		const strategy = makeStrategy();

		let callCount = 0;
		const evaluatorFactory = () => {
			const candles = Array.from({ length: 50 }, (_, i) => makeCandle(i));
			const candleRepo = createMockCandleRepo(candles);
			const eventRepo = createMockEventRepo();
			const publisher = createMockPublisher();

			return {
				evaluator: new StrategyEvaluator({
					executor,
					strategyEventRepo: eventRepo,
					candleRepo,
					publisher,
					findActiveStrategies: async () => [strategy],
					warmupTracker, // shared tracker
				}),
				eventRepo,
				publisher,
			};
		};

		// Shared evaluator to simulate long-lived worker
		const { evaluator, eventRepo, publisher } = evaluatorFactory();

		const results: Array<{ suppressed: boolean; eventsCreated: number }> = [];
		for (let i = 0; i < 8; i++) {
			const result = await evaluator.evaluate(
				"binance",
				"BTCUSDT",
				"1m",
				new Date(Date.UTC(2024, 0, 1) + i * 60_000),
			);
			callCount++;
			results.push({
				suppressed: result[0]!.suppressed ?? false,
				eventsCreated: result[0]!.eventsCreated,
			});
		}

		// First 5 calls suppressed (warmup = EMA(5) = 5)
		for (let i = 0; i < 5; i++) {
			expect(results[i]!.suppressed).toBe(true);
			expect(results[i]!.eventsCreated).toBe(0);
		}
		// Calls 6-8 should emit
		for (let i = 5; i < 8; i++) {
			expect(results[i]!.suppressed).toBe(false);
			expect(results[i]!.eventsCreated).toBe(1);
		}
		expect(eventRepo.events.length).toBe(3);
		expect(publisher.published.length).toBe(3);
		expect(callCount).toBe(8);
	});
});
