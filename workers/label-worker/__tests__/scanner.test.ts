import { describe, expect, test } from "bun:test";
import type { Channel, EventPublisher } from "@combine/shared/event-bus/types.js";
import { LabelScanner, type LabelScannerDeps } from "../src/scanner.js";

interface MockEvent {
	id: string;
	strategyId: string;
	strategyVersion: number;
	exchange: string;
	symbol: string;
	timeframe: string;
	openTime: Date;
	direction: "long" | "short";
	entryPrice: string;
}

interface MockStrategy {
	id: string;
	resultConfig: { tpPct: number; slPct: number; maxHoldBars: number };
}

function createMockDeps(
	overrides: Partial<LabelScannerDeps> = {},
): LabelScannerDeps & {
	savedLabels: Array<Record<string, unknown>>;
	publishedMessages: Array<{ channel: string; payload: unknown }>;
} {
	const savedLabels: Array<Record<string, unknown>> = [];
	const publishedMessages: Array<{ channel: string; payload: unknown }> = [];

	const mockEvent: MockEvent = {
		id: "evt-1",
		strategyId: "strat-1",
		strategyVersion: 1,
		exchange: "binance",
		symbol: "BTCUSDT",
		timeframe: "1m",
		openTime: new Date("2024-01-01T00:00:00Z"),
		direction: "long",
		entryPrice: "50000",
	};

	const mockStrategy: MockStrategy = {
		id: "strat-1",
		resultConfig: { tpPct: 2, slPct: 1, maxHoldBars: 5 },
	};

	// Candles that hit TP at bar 3 (high >= 51000)
	const mockCandles = [
		{ open: "50100", high: "50200", low: "49900", close: "50100" },
		{ open: "50100", high: "50500", low: "50000", close: "50300" },
		{ open: "50300", high: "51100", low: "50200", close: "50800" }, // TP hit
		{ open: "50800", high: "51000", low: "50500", close: "50700" },
		{ open: "50700", high: "50900", low: "50400", close: "50600" },
	];

	return {
		savedLabels,
		publishedMessages,
		findUnlabeledEvents: overrides.findUnlabeledEvents ?? (async () => [mockEvent as never]),
		loadStrategy: overrides.loadStrategy ?? (async () => mockStrategy as never),
		loadForwardCandles:
			overrides.loadForwardCandles ?? (async () => mockCandles as never),
		hasGap: overrides.hasGap ?? (async () => false),
		isAlreadyLabeled: overrides.isAlreadyLabeled ?? (async () => false),
		saveLabel:
			overrides.saveLabel ??
			(async (label) => {
				savedLabels.push(label as Record<string, unknown>);
				return "label-1";
			}),
		publisher:
			overrides.publisher ??
			({
				async publish<T>(channel: Channel<T>, payload: T): Promise<void> {
					publishedMessages.push({ channel: channel.name, payload });
				},
				async close() {},
			} satisfies EventPublisher),
	};
}

describe("LabelScanner", () => {
	test("scans and labels unlabeled event with sufficient candles", async () => {
		const deps = createMockDeps();
		const scanner = new LabelScanner(deps);

		const count = await scanner.scan();

		expect(count).toBe(1);
		expect(deps.savedLabels).toHaveLength(1);
		expect(deps.savedLabels[0]!.resultType).toBe("WIN");
	});

	test("already labeled event is skipped", async () => {
		const deps = createMockDeps({
			isAlreadyLabeled: async () => true,
		});
		const scanner = new LabelScanner(deps);

		const count = await scanner.scan();

		expect(count).toBe(0);
		expect(deps.savedLabels).toHaveLength(0);
	});

	test("insufficient forward candles → skipped", async () => {
		const deps = createMockDeps({
			loadForwardCandles: async () => [
				{ open: "50100", high: "50200", low: "49900", close: "50100" },
			],
		});
		const scanner = new LabelScanner(deps);

		// With maxHoldBars=5 but only 1 candle → skip
		const count = await scanner.scan();
		expect(count).toBe(0);
	});

	test("candle gap detected → skipped", async () => {
		const deps = createMockDeps({
			hasGap: async () => true,
		});
		const scanner = new LabelScanner(deps);

		const count = await scanner.scan();

		expect(count).toBe(0);
		expect(deps.savedLabels).toHaveLength(0);
	});

	test("publishes label_ready after labeling", async () => {
		const deps = createMockDeps();
		const scanner = new LabelScanner(deps);

		await scanner.scan();

		expect(deps.publishedMessages).toHaveLength(1);
		expect(deps.publishedMessages[0]!.channel).toBe("label_ready");
	});

	test("no unlabeled events → returns 0", async () => {
		const deps = createMockDeps({
			findUnlabeledEvents: async () => [],
		});
		const scanner = new LabelScanner(deps);

		const count = await scanner.scan();
		expect(count).toBe(0);
	});

	test("error in one event doesn't block others", async () => {
		let callCount = 0;
		const fullEvent = {
			id: "evt-2",
			strategyId: "strat-1",
			strategyVersion: 1,
			exchange: "binance",
			symbol: "BTCUSDT",
			timeframe: "1m",
			openTime: new Date("2024-01-01T00:00:00Z"),
			direction: "long" as const,
			entryPrice: "50000",
		};
		const deps = createMockDeps({
			findUnlabeledEvents: async () =>
				[
					{ ...fullEvent, id: "evt-1" },
					{ ...fullEvent, id: "evt-2" },
				] as never,
			loadStrategy: async () => {
				callCount++;
				if (callCount === 1) throw new Error("strategy load failed");
				return {
					id: "strat-1",
					resultConfig: { tpPct: 2, slPct: 1, maxHoldBars: 5 },
				} as never;
			},
		});
		const scanner = new LabelScanner(deps);

		const count = await scanner.scan();
		expect(count).toBe(1); // second event succeeds
	});
});
