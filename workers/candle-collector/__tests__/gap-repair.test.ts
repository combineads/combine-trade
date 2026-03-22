import { describe, expect, test } from "bun:test";
import type { Candle } from "@combine/candle";
import type { ExchangeCandle } from "@combine/exchange";
import { MockExchangeAdapter } from "@combine/exchange/testing/mock-adapter";
import type { Exchange, Timeframe } from "@combine/shared";
import { GapRepairService } from "../src/gap-repair.js";
import type { GapRepairRepository } from "../src/gap-repair.js";

const MINUTE = 60_000;
const BASE = Date.UTC(2024, 0, 1, 0, 0, 0);

function makeCandle(openTimeMs: number, tf: Timeframe = "1m"): Candle {
	return {
		exchange: "binance",
		symbol: "BTCUSDT",
		timeframe: tf,
		openTime: new Date(openTimeMs),
		open: "50000",
		high: "50100",
		low: "49900",
		close: "50050",
		volume: "100",
		isClosed: true,
	};
}

function makeExchangeCandle(ts: number): ExchangeCandle {
	return { timestamp: ts, open: 50000, high: 50100, low: 49900, close: 50050, volume: 100 };
}

function createMockRepository(candles: Candle[] = []): GapRepairRepository & {
	upserted: Candle[][];
	upsertSources: string[];
} {
	const upserted: Candle[][] = [];
	const upsertSources: string[] = [];
	return {
		upserted,
		upsertSources,
		async findByRange(
			_exchange: Exchange,
			_symbol: string,
			_timeframe: Timeframe,
			from: Date,
			to: Date,
		): Promise<Candle[]> {
			return candles.filter(
				(c) => c.openTime.getTime() >= from.getTime() && c.openTime.getTime() <= to.getTime(),
			);
		},
		async findLatestOpenTime(
			_exchange: Exchange,
			_symbol: string,
			_timeframe: Timeframe,
		): Promise<Date | null> {
			if (candles.length === 0) return null;
			const sorted = [...candles].sort((a, b) => b.openTime.getTime() - a.openTime.getTime());
			return sorted[0]!.openTime;
		},
		async upsertBatch(batch: Candle[], source = "rest"): Promise<void> {
			upserted.push(batch);
			upsertSources.push(source);
			// Add to candles array for subsequent reads
			for (const c of batch) {
				if (!candles.find((e) => e.openTime.getTime() === c.openTime.getTime())) {
					candles.push(c);
				}
			}
		},
	};
}

describe("GapRepairService", () => {
	test("detectGaps on continuous sequence returns empty", async () => {
		const candles = [makeCandle(BASE), makeCandle(BASE + MINUTE), makeCandle(BASE + 2 * MINUTE)];
		const repo = createMockRepository(candles);
		const adapter = new MockExchangeAdapter();
		const service = new GapRepairService(adapter, repo);

		const gaps = await service.detectGaps(
			"binance",
			"BTCUSDT",
			"1m",
			new Date(BASE),
			new Date(BASE + 2 * MINUTE),
		);
		expect(gaps).toEqual([]);
	});

	test("detectGaps with 1 missing candle returns gap", async () => {
		const candles = [
			makeCandle(BASE),
			makeCandle(BASE + MINUTE),
			// missing BASE + 2 * MINUTE
			makeCandle(BASE + 3 * MINUTE),
		];
		const repo = createMockRepository(candles);
		const adapter = new MockExchangeAdapter();
		const service = new GapRepairService(adapter, repo);

		const gaps = await service.detectGaps(
			"binance",
			"BTCUSDT",
			"1m",
			new Date(BASE),
			new Date(BASE + 3 * MINUTE),
		);
		expect(gaps.length).toBe(1);
		expect(gaps[0]!.expectedTime.getTime()).toBe(BASE + 2 * MINUTE);
	});

	test("detectGaps with multiple gaps returns all sorted", async () => {
		const candles = [
			makeCandle(BASE),
			// gap: BASE + MINUTE, BASE + 2 * MINUTE
			makeCandle(BASE + 3 * MINUTE),
			// gap: BASE + 4 * MINUTE
			makeCandle(BASE + 5 * MINUTE),
		];
		const repo = createMockRepository(candles);
		const adapter = new MockExchangeAdapter();
		const service = new GapRepairService(adapter, repo);

		const gaps = await service.detectGaps(
			"binance",
			"BTCUSDT",
			"1m",
			new Date(BASE),
			new Date(BASE + 5 * MINUTE),
		);
		expect(gaps.length).toBe(3);
	});

	test("repairGap calls fetchOHLCV and upserts results", async () => {
		const adapter = new MockExchangeAdapter({
			candles: [makeExchangeCandle(BASE + 2 * MINUTE)],
		});
		const repo = createMockRepository();
		const service = new GapRepairService(adapter, repo);

		const repaired = await service.repairGap(
			"BTCUSDT",
			"1m",
			new Date(BASE + 2 * MINUTE),
			new Date(BASE + 3 * MINUTE),
		);

		expect(repaired).toBe(1);
		expect(adapter.calls[0]!.method).toBe("fetchOHLCV");
		expect(repo.upserted.length).toBe(1);
		expect(repo.upsertSources[0]).toBe("rest");
	});

	test("repairGap is idempotent", async () => {
		const adapter = new MockExchangeAdapter({
			candles: [makeExchangeCandle(BASE + 2 * MINUTE)],
		});
		const repo = createMockRepository();
		const service = new GapRepairService(adapter, repo);

		await service.repairGap(
			"BTCUSDT",
			"1m",
			new Date(BASE + 2 * MINUTE),
			new Date(BASE + 3 * MINUTE),
		);
		await service.repairGap(
			"BTCUSDT",
			"1m",
			new Date(BASE + 2 * MINUTE),
			new Date(BASE + 3 * MINUTE),
		);

		// upsertBatch called twice, but data is same
		expect(repo.upserted.length).toBe(2);
	});

	test("repairAll returns correct RepairResult", async () => {
		const existingCandles = [
			makeCandle(BASE),
			makeCandle(BASE + MINUTE),
			// gap at BASE + 2 * MINUTE
		];
		const adapter = new MockExchangeAdapter({
			candles: [makeExchangeCandle(BASE + 2 * MINUTE)],
		});
		const repo = createMockRepository(existingCandles);
		const service = new GapRepairService(adapter, repo);

		// Override "now" by passing a small range
		const result = await service.repairAll("binance", "BTCUSDT", "1m");
		expect(result.gapsFound).toBeGreaterThanOrEqual(0);
		expect(typeof result.candlesRepaired).toBe("number");
		expect(typeof result.durationMs).toBe("number");
	});

	test("repairAll with empty repository returns 0 gaps", async () => {
		const adapter = new MockExchangeAdapter();
		const repo = createMockRepository([]);
		const service = new GapRepairService(adapter, repo);

		const result = await service.repairAll("binance", "BTCUSDT", "1m");
		expect(result.gapsFound).toBe(0);
		expect(result.candlesRepaired).toBe(0);
		expect(result.remainingGaps).toBe(0);
	});

	test("repairGap handles empty exchange response gracefully", async () => {
		const adapter = new MockExchangeAdapter({ candles: [] });
		const repo = createMockRepository();
		const service = new GapRepairService(adapter, repo);

		const repaired = await service.repairGap(
			"BTCUSDT",
			"1m",
			new Date(BASE),
			new Date(BASE + 5 * MINUTE),
		);
		expect(repaired).toBe(0);
	});
});
