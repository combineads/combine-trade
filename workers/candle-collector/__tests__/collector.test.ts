import { describe, expect, test } from "bun:test";
import type { Candle } from "@combine/candle";
import type { ExchangeCandle } from "@combine/exchange";
import { MockExchangeAdapter } from "@combine/exchange/testing/mock-adapter";
import type { CandleClosedPayload } from "@combine/shared/event-bus/channels.js";
import type { Channel, EventPublisher } from "@combine/shared/event-bus/types.js";
import { CandleCollector } from "../src/collector.js";
import type { GapRepairService, RepairResult } from "../src/gap-repair.js";
import { SymbolSlot } from "../src/symbol-slot.js";
import type { SymbolSlotDeps } from "../src/symbol-slot.js";

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
		expect(publisher.published[0]?.channel).toBe("candle_closed");
		const payload = publisher.published[0]?.payload as CandleClosedPayload;
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
		expect(typeof repo.upserted[0]?.candle.open).toBe("string");
		expect(repo.upserted[0]?.candle.open).toBe("50000");
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
		expect(collector.lastCandleTime?.getTime()).toBe(BASE);
	});
});

describe("CandleCollector multi-symbol", () => {
	test("start with two symbols spawns two independent slots", async () => {
		const slotsStarted: string[] = [];

		const adapter = new MockExchangeAdapter({
			candles: [makeExchangeCandle(BASE)],
		});
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();
		const publisher = createMockPublisher();

		// Spy factory: track which symbols were started
		const collector = new CandleCollector(
			{ adapter, repository: repo, gapRepair, publisher },
			{
				createSlot: (deps: SymbolSlotDeps) => {
					const slot = new SymbolSlot(deps);
					const origStart = slot.start.bind(slot);
					slot.start = async (exchange: string, symbol: string, timeframe: string) => {
						slotsStarted.push(symbol);
						return origStart(exchange, symbol, timeframe);
					};
					return slot;
				},
			},
		);

		await collector.startMulti("binance", ["BTCUSDT", "ETHUSDT"], "1m");

		expect(slotsStarted).toContain("BTCUSDT");
		expect(slotsStarted).toContain("ETHUSDT");
		expect(slotsStarted.length).toBe(2);
	});

	test("slot A error does not stop slot B from publishing", async () => {
		const publisher = createMockPublisher();
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();

		// Adapter A always throws; Adapter B returns one candle then slot B auto-stops
		const adapterA = new MockExchangeAdapter({ candles: [] });
		const adapterB = new MockExchangeAdapter({ candles: [makeExchangeCandle(BASE)] });

		adapterA.fetchOHLCV = async () => {
			throw new Error("WS connection failed for BTCUSDT");
		};

		const slotA = new SymbolSlot({ adapter: adapterA, repository: repo, gapRepair, publisher });
		const slotB = new SymbolSlot({ adapter: adapterB, repository: repo, gapRepair, publisher });

		// slotB finishes after one cycle; stop slotA immediately after slotB completes
		const slotBPromise = slotB.start("binance", "ETHUSDT", "1m");
		const slotAPromise = slotA.start("binance", "BTCUSDT", "1m");

		// Wait for slotB to complete on its own, then stop slotA
		await slotBPromise;
		await slotA.stop();
		await slotAPromise;

		// slotB should have published regardless of slotA's error
		const ethPublished = publisher.published.filter((p) => {
			const payload = p.payload as CandleClosedPayload;
			return payload.symbol === "ETHUSDT";
		});
		expect(ethPublished.length).toBeGreaterThan(0);
	});

	test("each slot publishes candle_closed with its own symbol", async () => {
		const publisher = createMockPublisher();
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();

		const adapterBTC = new MockExchangeAdapter({ candles: [makeExchangeCandle(BASE)] });
		const adapterETH = new MockExchangeAdapter({ candles: [makeExchangeCandle(BASE + 1000)] });

		const slotBTC = new SymbolSlot({ adapter: adapterBTC, repository: repo, gapRepair, publisher });
		const slotETH = new SymbolSlot({ adapter: adapterETH, repository: repo, gapRepair, publisher });

		await Promise.allSettled([
			slotBTC.start("binance", "BTCUSDT", "1m"),
			slotETH.start("binance", "ETHUSDT", "1m"),
		]);

		const btcPublished = publisher.published.filter(
			(p) => (p.payload as CandleClosedPayload).symbol === "BTCUSDT",
		);
		const ethPublished = publisher.published.filter(
			(p) => (p.payload as CandleClosedPayload).symbol === "ETHUSDT",
		);

		expect(btcPublished.length).toBe(1);
		expect(ethPublished.length).toBe(1);
	});

	test("stopMulti shuts down all slots cleanly", async () => {
		const publisher = createMockPublisher();
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();
		const adapter = new MockExchangeAdapter({ candles: [] });

		const collector = new CandleCollector({ adapter, repository: repo, gapRepair, publisher });

		const startPromise = collector.startMulti("binance", ["BTCUSDT", "ETHUSDT"], "1m");
		await collector.stop();
		await startPromise;

		expect(publisher.published.length).toBe(0);
	});

	test("health returns per-symbol status object", async () => {
		const publisher = createMockPublisher();
		const repo = createMockRepository();
		const gapRepair = createMockGapRepair();
		const adapter = new MockExchangeAdapter({ candles: [makeExchangeCandle(BASE)] });

		const collector = new CandleCollector({ adapter, repository: repo, gapRepair, publisher });
		await collector.startMulti("binance", ["BTCUSDT", "ETHUSDT"], "1m");

		const health = collector.symbolsHealth;
		expect(health.BTCUSDT).toBeDefined();
		expect(health.ETHUSDT).toBeDefined();
		expect(health.BTCUSDT?.lastCandleTime).not.toBeNull();
		expect(health.ETHUSDT?.lastCandleTime).not.toBeNull();
		expect(typeof health.BTCUSDT?.backoffMs).toBe("number");
		expect(typeof health.BTCUSDT?.connected).toBe("boolean");
	});
});
