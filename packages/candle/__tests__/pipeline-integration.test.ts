/**
 * Integration tests for the candle pipeline:
 * mock WS message → parse candle → validate continuity → upsert → NOTIFY
 */
import { describe, expect, mock, test } from "bun:test";
import { processCandleMessage } from "../pipeline.js";
import type { Candle } from "../types.js";
import type { CandleRepository } from "../repository.js";

// ---- helpers ----------------------------------------------------------------

const MINUTE = 60_000;
const BASE = Date.UTC(2024, 0, 1, 0, 0, 0);

function makeWsMessage(overrides: Partial<Candle> & { openTime: Date }): string {
	const candle: Candle = {
		exchange: "binance",
		symbol: "BTCUSDT",
		timeframe: "1m",
		open: "50000",
		high: "50100",
		low: "49900",
		close: "50050",
		volume: "100",
		isClosed: true,
		...overrides,
	};
	return JSON.stringify(candle);
}

function createMockRepo(): CandleRepository & {
	upserted: Candle[];
	inserted: Candle[];
} {
	const upserted: Candle[] = [];
	const inserted: Candle[] = [];
	return {
		upserted,
		inserted,
		async insert(candle) {
			inserted.push(candle);
		},
		async upsert(candle) {
			upserted.push(candle);
		},
		async findByRange() {
			return [];
		},
		async findLatest() {
			return [];
		},
	};
}

// ---- tests ------------------------------------------------------------------

describe("Candle pipeline integration", () => {
	test("closed candle is upserted and NOTIFY is triggered", async () => {
		const repo = createMockRepo();
		const notifications: Candle[] = [];

		await processCandleMessage(
			makeWsMessage({ openTime: new Date(BASE), isClosed: true }),
			repo,
			(candle) => { notifications.push(candle); },
		);

		expect(repo.upserted).toHaveLength(1);
		expect(repo.upserted[0]!.openTime.getTime()).toBe(BASE);
		expect(notifications).toHaveLength(1);
		expect(notifications[0]!.isClosed).toBe(true);
	});

	test("open (live) candle is upserted but no NOTIFY triggered", async () => {
		const repo = createMockRepo();
		const notifications: Candle[] = [];

		await processCandleMessage(
			makeWsMessage({ openTime: new Date(BASE), isClosed: false }),
			repo,
			(candle) => { notifications.push(candle); },
		);

		expect(repo.upserted).toHaveLength(1);
		expect(notifications).toHaveLength(0);
	});

	test("continuity validated against previous candle — gap is detected and reported", async () => {
		const repo = createMockRepo();
		const gapErrors: string[] = [];

		// First candle at BASE
		await processCandleMessage(
			makeWsMessage({ openTime: new Date(BASE), isClosed: true }),
			repo,
			() => {},
			(gapInfo) => { gapErrors.push(gapInfo); },
		);

		// Skip one minute — candle at BASE+2m (gap at BASE+1m)
		await processCandleMessage(
			makeWsMessage({ openTime: new Date(BASE + 2 * MINUTE), isClosed: true }),
			repo,
			() => {},
			(gapInfo) => { gapErrors.push(gapInfo); },
		);

		expect(gapErrors).toHaveLength(1);
		expect(gapErrors[0]).toContain("gap");
	});

	test("continuous candles produce no gap errors", async () => {
		const repo = createMockRepo();
		const gapErrors: string[] = [];

		for (let i = 0; i < 5; i++) {
			await processCandleMessage(
				makeWsMessage({ openTime: new Date(BASE + i * MINUTE), isClosed: true }),
				repo,
				() => {},
				(gapInfo) => { gapErrors.push(gapInfo); },
			);
		}

		expect(gapErrors).toHaveLength(0);
		expect(repo.upserted).toHaveLength(5);
	});

	test("malformed WS message is rejected with error, does not upsert", async () => {
		const repo = createMockRepo();
		const errors: string[] = [];

		await processCandleMessage(
			"not-valid-json{{{",
			repo,
			() => {},
			() => {},
			(err) => { errors.push(err); },
		);

		expect(repo.upserted).toHaveLength(0);
		expect(errors).toHaveLength(1);
	});

	test("candle with missing required field is rejected", async () => {
		const repo = createMockRepo();
		const errors: string[] = [];

		// Omit 'symbol' field
		const badMessage = JSON.stringify({
			exchange: "binance",
			timeframe: "1m",
			openTime: new Date(BASE).toISOString(),
			open: "100",
			high: "101",
			low: "99",
			close: "100",
			volume: "10",
			isClosed: true,
		});

		await processCandleMessage(
			badMessage,
			repo,
			() => {},
			() => {},
			(err) => { errors.push(err); },
		);

		expect(repo.upserted).toHaveLength(0);
		expect(errors).toHaveLength(1);
	});

	test("multiple closed candles each trigger separate notifications", async () => {
		const repo = createMockRepo();
		const notifications: Candle[] = [];

		for (let i = 0; i < 3; i++) {
			await processCandleMessage(
				makeWsMessage({ openTime: new Date(BASE + i * MINUTE), isClosed: true }),
				repo,
				(candle) => { notifications.push(candle); },
			);
		}

		expect(notifications).toHaveLength(3);
		expect(repo.upserted).toHaveLength(3);
	});
});
