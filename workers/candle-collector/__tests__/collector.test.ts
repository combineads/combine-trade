import { describe, expect, test } from "bun:test";
import type { Candle } from "@combine/candle";
import type { ExchangeCandle } from "@combine/exchange";
import { MockExchangeAdapter } from "@combine/exchange/testing/mock-adapter";
import type { CandleClosedPayload } from "@combine/shared/event-bus/channels.js";
import type { Channel, EventPublisher } from "@combine/shared/event-bus/types.js";
import { CandleCollector } from "../src/collector.js";
import type { GapRepairService, RepairResult } from "../src/gap-repair.js";

function makeExchangeCandle(ts: number): ExchangeCandle {
	return { timestamp: ts, open: 50000, high: 50100, low: 49900, close: 50050, volume: 100 };
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

function createMockRepository() {
	const upserted: { candle: Candle; source: string }[] = [];
	let latestOpenTime: Date | null = null;

	return {
		upserted,
		setLatestOpenTime(d: Date | null) {
			latestOpenTime = d;
		},
		async insert(_candle: Candle): Promise<void> {},
		async upsert(candle: Candle, source = "ws"): Promise<void> {
			upserted.push({ candle, source });
		},
		async findByRange(): Promise<Candle[]> {
			return [];
		},
		async findLatest(): Promise<Candle[]> {
			return [];
		},
		async findLatestOpenTime(): Promise<Date | null> {
			return latestOpenTime;
		},
		async upsertBatch(): Promise<void> {},
	};
}

function createMockGapRepair(result?: Partial<RepairResult>) {
	const calls: string[] = [];
	return {
		calls,
		async detectGaps() {
			calls.push("detectGaps");
			return [];
		},
		async repairGap() {
			calls.push("repairGap");
			return 0;
		},
		async repairAll(): Promise<RepairResult> {
			calls.push("repairAll");
			return {
				gapsFound: 0,
				candlesRepaired: 0,
				remainingGaps: 0,
				durationMs: 0,
				...result,
			};
		},
	} as unknown as GapRepairService & { calls: string[] };
}

const BASE = Date.UTC(2024, 0, 1, 0, 0, 0);

describe("CandleCollector", () => {
	test("start calls gapRepair.repairAll before processing candles", async () => {
		const callOrder: string[] = [];
		const adapter = new MockExchangeAdapter({
			candles: [makeExchangeCandle(BASE)],
		});
		const repo = createMockRepository();
		repo.setLatestOpenTime(new Date(BASE - 60_000));
		const gapRepair = createMockGapRepair();

		// Track call order
		const origRepairAll = gapRepair.repairAll.bind(gapRepair);
		gapRepair.repairAll = async (...args: Parameters<typeof gapRepair.repairAll>) => {
			callOrder.push("repairAll");
			return origRepairAll(...args);
		};
		const publisher = createMockPublisher();

		const origFetchOHLCV = adapter.fetchOHLCV.bind(adapter);
		adapter.fetchOHLCV = async (...args: Parameters<typeof adapter.fetchOHLCV>) => {
			callOrder.push("fetchOHLCV");
			return origFetchOHLCV(...args);
		};

		const collector = new CandleCollector({ adapter, repository: repo, gapRepair, publisher });
		await collector.start("binance", "BTCUSDT", "1m");

		expect(callOrder.indexOf("repairAll")).toBeLessThan(callOrder.indexOf("fetchOHLCV"));
	});

	test("closed candle triggers publisher.publish", async () => {
		const adapter = new MockExchangeAdapter({
			candles: [makeExchangeCandle(BASE)],
		});
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();
		const publisher = createMockPublisher();

		const collector = new CandleCollector({ adapter, repository: repo, gapRepair, publisher });
		await collector.start("binance", "BTCUSDT", "1m");

		expect(publisher.published.length).toBe(1);
		expect(publisher.published[0]!.channel).toBe("candle_closed");
		const payload = publisher.published[0]!.payload as CandleClosedPayload;
		expect(payload.symbol).toBe("BTCUSDT");
	});

	test("candle prices are converted to strings", async () => {
		const adapter = new MockExchangeAdapter({
			candles: [makeExchangeCandle(BASE)],
		});
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();
		const publisher = createMockPublisher();

		const collector = new CandleCollector({ adapter, repository: repo, gapRepair, publisher });
		await collector.start("binance", "BTCUSDT", "1m");

		expect(repo.upserted.length).toBe(1);
		expect(typeof repo.upserted[0]!.candle.open).toBe("string");
		expect(repo.upserted[0]!.candle.open).toBe("50000");
	});

	test("stop halts the collector", async () => {
		const adapter = new MockExchangeAdapter({ candles: [] });
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();
		const publisher = createMockPublisher();

		const collector = new CandleCollector({ adapter, repository: repo, gapRepair, publisher });

		// Start in background, then stop immediately
		const startPromise = collector.start("binance", "BTCUSDT", "1m");
		await collector.stop();
		await startPromise;

		expect(publisher.published.length).toBe(0);
	});

	test("no existing data skips gap repair and logs", async () => {
		const adapter = new MockExchangeAdapter({
			candles: [makeExchangeCandle(BASE)],
		});
		const repo = createMockRepository();
		// latestOpenTime = null (no data)
		const gapRepair = createMockGapRepair();
		const publisher = createMockPublisher();

		const collector = new CandleCollector({ adapter, repository: repo, gapRepair, publisher });
		await collector.start("binance", "BTCUSDT", "1m");

		expect(gapRepair.calls.length).toBe(0);
		expect(collector.gapRepairStatus).toBe("complete");
	});

	test("lastCandleTime is updated after processing", async () => {
		const adapter = new MockExchangeAdapter({
			candles: [makeExchangeCandle(BASE)],
		});
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();
		const publisher = createMockPublisher();

		const collector = new CandleCollector({ adapter, repository: repo, gapRepair, publisher });
		expect(collector.lastCandleTime).toBeNull();

		await collector.start("binance", "BTCUSDT", "1m");
		expect(collector.lastCandleTime).not.toBeNull();
		expect(collector.lastCandleTime!.getTime()).toBe(BASE);
	});
});
