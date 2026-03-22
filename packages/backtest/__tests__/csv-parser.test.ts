import { describe, expect, test } from "bun:test";
import { parseBinanceVisionCsv, parseBinanceVisionCsvRows } from "../csv-parser.js";

// Real Binance Vision CSV format: open_time,open,high,low,close,volume,close_time,quote_volume,trades,taker_buy_base_vol,taker_buy_quote_vol,ignore
const FIXTURE_CSV = [
	"1704067200000,42000.00,42150.50,41980.00,42100.00,123.456,1704067259999,5189155.20,1500,61.728,2594577.60,0",
	"1704067260000,42100.00,42200.00,42050.00,42180.00,98.765,1704067319999,4161523.70,1200,49.382,2080761.85,0",
	"1704067320000,42180.00,42250.00,42100.00,42230.00,87.654,1704067379999,3698756.42,1100,43.827,1849378.21,0",
].join("\n");

describe("parseBinanceVisionCsvRows", () => {
	test("parses 3 rows into RawKlineRow array", () => {
		const rows = parseBinanceVisionCsvRows(FIXTURE_CSV);
		expect(rows).toHaveLength(3);
		expect(rows[0]!.openTime).toBe(1704067200000);
		expect(rows[0]!.open).toBe("42000.00");
		expect(rows[0]!.high).toBe("42150.50");
		expect(rows[0]!.low).toBe("41980.00");
		expect(rows[0]!.close).toBe("42100.00");
		expect(rows[0]!.volume).toBe("123.456");
	});

	test("skips header row when first column is non-numeric", () => {
		const csv = `open_time,open,high,low,close,volume,close_time,quote_volume,trades,taker_buy_base_vol,taker_buy_quote_vol,ignore\n${FIXTURE_CSV}`;
		const rows = parseBinanceVisionCsvRows(csv);
		expect(rows).toHaveLength(3);
	});

	test("skips trailing empty lines", () => {
		const csv = `${FIXTURE_CSV}\n\n\n`;
		const rows = parseBinanceVisionCsvRows(csv);
		expect(rows).toHaveLength(3);
	});

	test("throws on malformed row with < 11 columns", () => {
		const csv = "1704067200000,42000.00,42150.50";
		expect(() => parseBinanceVisionCsvRows(csv)).toThrow("3");
	});
});

describe("parseBinanceVisionCsv", () => {
	const ctx = { exchange: "binance" as const, symbol: "BTCUSDT", timeframe: "1m" as const };

	test("parses CSV into Candle objects with context", () => {
		const candles = parseBinanceVisionCsv(FIXTURE_CSV, ctx);
		expect(candles).toHaveLength(3);

		const first = candles[0]!;
		expect(first.exchange).toBe("binance");
		expect(first.symbol).toBe("BTCUSDT");
		expect(first.timeframe).toBe("1m");
		expect(first.open).toBe("42000.00");
		expect(first.high).toBe("42150.50");
		expect(first.low).toBe("41980.00");
		expect(first.close).toBe("42100.00");
		expect(first.volume).toBe("123.456");
		expect(first.isClosed).toBe(true);
	});

	test("openTime is a valid Date from ms timestamp", () => {
		const candles = parseBinanceVisionCsv(FIXTURE_CSV, ctx);
		expect(candles[0]!.openTime).toEqual(new Date(1704067200000));
		expect(candles[1]!.openTime).toEqual(new Date(1704067260000));
		expect(candles[2]!.openTime).toEqual(new Date(1704067320000));
	});

	test("isClosed is always true for historical candles", () => {
		const candles = parseBinanceVisionCsv(FIXTURE_CSV, ctx);
		for (const candle of candles) {
			expect(candle.isClosed).toBe(true);
		}
	});

	test("preserves price strings without alteration", () => {
		const candles = parseBinanceVisionCsv(FIXTURE_CSV, ctx);
		// Ensure strings are preserved exactly, not converted via parseFloat
		expect(candles[0]!.open).toBe("42000.00");
		expect(typeof candles[0]!.open).toBe("string");
	});

	test("handles header + trailing newlines together", () => {
		const csv = `open_time,open,high,low,close,volume,close_time,quote_volume,trades,taker_buy_base_vol,taker_buy_quote_vol,ignore\n${FIXTURE_CSV}\n\n`;
		const candles = parseBinanceVisionCsv(csv, ctx);
		expect(candles).toHaveLength(3);
	});
});
