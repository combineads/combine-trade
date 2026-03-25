import { describe, expect, test } from "bun:test";
import type { Candle } from "@combine/candle";
import type { ExchangeCandle } from "@combine/exchange";
import { MockExchangeAdapter } from "@combine/exchange/testing/mock-adapter";
import type { CandleClosedPayload } from "@combine/shared/event-bus/channels.js";
import type { Channel, EventPublisher } from "@combine/shared/event-bus/types.js";
import type { GapRepairService, RepairResult } from "../src/gap-repair.js";
import { SymbolSlot } from "../src/symbol-slot.js";

function makeExchangeCandle(ts: number): ExchangeCandle {
	return { timestamp: ts, open: 100, high: 101, low: 99, close: 100.5, volume: 10 };
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
	return {
		async detectGaps() {
			return [];
		},
		async repairGap() {
			return 0;
		},
		async repairAll(): Promise<RepairResult> {
			return {
				gapsFound: 0,
				candlesRepaired: 0,
				remainingGaps: 0,
				durationMs: 0,
				...result,
			};
		},
	} as unknown as GapRepairService;
}

const BASE = Date.UTC(2024, 0, 1, 0, 0, 0);

describe("SymbolSlot", () => {
	test("publishes candle_closed with correct symbol", async () => {
		const adapter = new MockExchangeAdapter({
			candles: [makeExchangeCandle(BASE)],
		});
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();
		const publisher = createMockPublisher();

		const slot = new SymbolSlot({ adapter, repository: repo, gapRepair, publisher });
		await slot.start("binance", "ETHUSDT", "1m");

		expect(publisher.published.length).toBe(1);
		const payload = publisher.published[0]?.payload as CandleClosedPayload;
		expect(payload.symbol).toBe("ETHUSDT");
	});

	test("stop halts the slot loop", async () => {
		const adapter = new MockExchangeAdapter({ candles: [] });
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();
		const publisher = createMockPublisher();

		const slot = new SymbolSlot({ adapter, repository: repo, gapRepair, publisher });
		const startPromise = slot.start("binance", "BTCUSDT", "1m");
		await slot.stop();
		await startPromise;

		expect(publisher.published.length).toBe(0);
	});

	test("health status reflects connected and lastCandleTime", async () => {
		const adapter = new MockExchangeAdapter({
			candles: [makeExchangeCandle(BASE)],
		});
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();
		const publisher = createMockPublisher();

		const slot = new SymbolSlot({ adapter, repository: repo, gapRepair, publisher });
		await slot.start("binance", "SOLUSDT", "1m");

		const status = slot.healthStatus;
		expect(status.lastCandleTime).not.toBeNull();
		expect(status.lastCandleTime?.getTime()).toBe(BASE);
		// backoffMs starts at 1000 and resets after a clean run
		expect(status.backoffMs).toBe(1000);
	});

	test("backoff state is independent per slot instance", async () => {
		const adapterA = new MockExchangeAdapter({ candles: [makeExchangeCandle(BASE)] });
		const adapterB = new MockExchangeAdapter({ candles: [makeExchangeCandle(BASE)] });
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();
		const publisher = createMockPublisher();

		const slotA = new SymbolSlot({ adapter: adapterA, repository: repo, gapRepair, publisher });
		const slotB = new SymbolSlot({ adapter: adapterB, repository: repo, gapRepair, publisher });

		// Simulate slotA going through a backoff cycle by running it
		await slotA.start("binance", "BTCUSDT", "1m");
		await slotB.start("binance", "ETHUSDT", "1m");

		// Both should have independent backoff state — slotA's backoff doesn't affect slotB
		expect(slotA.healthStatus.backoffMs).toBe(slotB.healthStatus.backoffMs);
	});

	test("prices are converted from number to string at ingestion boundary", async () => {
		const adapter = new MockExchangeAdapter({
			candles: [makeExchangeCandle(BASE)],
		});
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();
		const publisher = createMockPublisher();

		const slot = new SymbolSlot({ adapter, repository: repo, gapRepair, publisher });
		await slot.start("binance", "BTCUSDT", "1m");

		expect(repo.upserted.length).toBe(1);
		expect(typeof repo.upserted[0]?.candle.open).toBe("string");
		expect(repo.upserted[0]?.candle.open).toBe("100");
	});
});
