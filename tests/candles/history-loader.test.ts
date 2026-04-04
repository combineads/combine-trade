import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Decimal } from "../../src/core/decimal";
import type { Candle } from "../../src/core/types";
import type { ExchangeAdapter } from "../../src/core/ports";
import {
  buildDailyUrl,
  buildMonthlyUrl,
  downloadCandles,
  fetchCandlesViaREST,
  mapTimeframe,
  parseCSVRow,
} from "../../src/candles/history-loader";

// ---------------------------------------------------------------------------
// mapTimeframe
// ---------------------------------------------------------------------------

describe("history-loader", () => {
  describe("mapTimeframe", () => {
    it("maps 1D to 1d", () => {
      expect(mapTimeframe("1D")).toBe("1d");
    });

    it("maps 1H to 1h", () => {
      expect(mapTimeframe("1H")).toBe("1h");
    });

    it("maps 5M to 5m", () => {
      expect(mapTimeframe("5M")).toBe("5m");
    });

    it("maps 1M to 1m", () => {
      expect(mapTimeframe("1M")).toBe("1m");
    });
  });

  // ---------------------------------------------------------------------------
  // URL builders
  // ---------------------------------------------------------------------------

  describe("buildMonthlyUrl", () => {
    it("builds correct monthly URL", () => {
      const url = buildMonthlyUrl("BTCUSDT", "1h", 2024, 3);
      expect(url).toBe(
        "https://data.binance.vision/data/futures/um/monthly/klines/BTCUSDT/1h/BTCUSDT-1h-2024-03.zip",
      );
    });

    it("zero-pads single-digit month", () => {
      const url = buildMonthlyUrl("ETHUSDT", "5m", 2023, 1);
      expect(url).toBe(
        "https://data.binance.vision/data/futures/um/monthly/klines/ETHUSDT/5m/ETHUSDT-5m-2023-01.zip",
      );
    });

    it("handles double-digit month", () => {
      const url = buildMonthlyUrl("BTCUSDT", "1d", 2024, 12);
      expect(url).toBe(
        "https://data.binance.vision/data/futures/um/monthly/klines/BTCUSDT/1d/BTCUSDT-1d-2024-12.zip",
      );
    });
  });

  describe("buildDailyUrl", () => {
    it("builds correct daily URL", () => {
      const url = buildDailyUrl("BTCUSDT", "1h", 2024, 3, 15);
      expect(url).toBe(
        "https://data.binance.vision/data/futures/um/daily/klines/BTCUSDT/1h/BTCUSDT-1h-2024-03-15.zip",
      );
    });

    it("zero-pads single-digit month and day", () => {
      const url = buildDailyUrl("XAUTUSDT", "1m", 2023, 1, 5);
      expect(url).toBe(
        "https://data.binance.vision/data/futures/um/daily/klines/XAUTUSDT/1m/XAUTUSDT-1m-2023-01-05.zip",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // parseCSVRow
  // ---------------------------------------------------------------------------

  describe("parseCSVRow", () => {
    it("parses a valid CSV row into a NewCandle", () => {
      // Binance CSV: open_time,open,high,low,close,volume,close_time,quote_volume,count,taker_buy_volume,taker_buy_quote_volume,ignore
      const row =
        "1704067200000,42000.50,42500.00,41800.25,42200.75,1234.567,1704070799999,51876543.21,5000,617.283,25938271.60,0";
      const candle = parseCSVRow(row, "binance", "1H");
      expect(candle).not.toBeNull();

      const c = candle!;
      expect(c.symbol).toBe("");
      expect(c.exchange).toBe("binance");
      expect(c.timeframe).toBe("1H");
      expect(c.open_time).toEqual(new Date(1704067200000));
      expect(c.open).toBeInstanceOf(Decimal);
      expect(c.open.toString()).toBe("42000.5");
      expect(c.high.toString()).toBe("42500");
      expect(c.low.toString()).toBe("41800.25");
      expect(c.close.toString()).toBe("42200.75");
      expect(c.volume.toString()).toBe("1234.567");
      expect(c.is_closed).toBe(true);
    });

    it("returns null for empty row", () => {
      expect(parseCSVRow("", "binance", "5M")).toBeNull();
    });

    it("returns null for row with too few columns", () => {
      expect(parseCSVRow("1704067200000,42000.50,42500.00", "binance", "1D")).toBeNull();
    });

    it("returns null for row with non-numeric open_time", () => {
      expect(
        parseCSVRow(
          "abc,42000.50,42500.00,41800.25,42200.75,1234.567,1704070799999,51876543.21,5000,617.283,25938271.60,0",
          "binance",
          "1H",
        ),
      ).toBeNull();
    });

    it("returns null for row with non-numeric price", () => {
      expect(
        parseCSVRow(
          "1704067200000,abc,42500.00,41800.25,42200.75,1234.567,1704070799999,51876543.21,5000,617.283,25938271.60,0",
          "binance",
          "1H",
        ),
      ).toBeNull();
    });

    it("uses Decimal.js for all price and volume fields", () => {
      const row =
        "1704067200000,42000.123456789012345,42500.00,41800.25,42200.75,1234.567890123456789,1704070799999,51876543.21,5000,617.283,25938271.60,0";
      const c = parseCSVRow(row, "binance", "5M")!;
      expect(c.open).toBeInstanceOf(Decimal);
      expect(c.high).toBeInstanceOf(Decimal);
      expect(c.low).toBeInstanceOf(Decimal);
      expect(c.close).toBeInstanceOf(Decimal);
      expect(c.volume).toBeInstanceOf(Decimal);
      // Verify Decimal preserves precision
      expect(c.open.toString()).toBe("42000.123456789012345");
    });

    it("skips header rows starting with 'open_time'", () => {
      const row =
        "open_time,open,high,low,close,volume,close_time,quote_volume,count,taker_buy_volume,taker_buy_quote_volume,ignore";
      expect(parseCSVRow(row, "binance", "1H")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // fetchCandlesViaREST
  // ---------------------------------------------------------------------------

  describe("fetchCandlesViaREST", () => {
    it("calls adapter.fetchOHLCV and strips id and created_at", async () => {
      const mockCandles: Candle[] = [
        {
          id: "uuid-1",
          symbol: "BTCUSDT",
          exchange: "binance",
          timeframe: "1H",
          open_time: new Date("2024-01-01T00:00:00Z"),
          open: new Decimal("42000"),
          high: new Decimal("42500"),
          low: new Decimal("41800"),
          close: new Decimal("42200"),
          volume: new Decimal("1234"),
          is_closed: true,
          created_at: new Date("2024-01-01T01:00:00Z"),
        },
        {
          id: "uuid-2",
          symbol: "BTCUSDT",
          exchange: "binance",
          timeframe: "1H",
          open_time: new Date("2024-01-01T01:00:00Z"),
          open: new Decimal("42200"),
          high: new Decimal("42800"),
          low: new Decimal("42100"),
          close: new Decimal("42700"),
          volume: new Decimal("5678"),
          is_closed: true,
          created_at: new Date("2024-01-01T02:00:00Z"),
        },
      ];

      const mockAdapter: ExchangeAdapter = {
        fetchOHLCV: mock(() => Promise.resolve(mockCandles)),
        fetchBalance: mock(() => Promise.resolve({ total: new Decimal("0"), available: new Decimal("0") })),
        fetchPositions: mock(() => Promise.resolve([])),
        createOrder: mock(() => Promise.reject(new Error("not implemented"))),
        cancelOrder: mock(() => Promise.reject(new Error("not implemented"))),
        editOrder: mock(() => Promise.reject(new Error("not implemented"))),
        fetchOrder: mock(() => Promise.reject(new Error("not implemented"))),
        watchOHLCV: mock(() => Promise.reject(new Error("not implemented"))),
        getExchangeInfo: mock(() => Promise.reject(new Error("not implemented"))),
        setLeverage: mock(() => Promise.reject(new Error("not implemented"))),
        transfer: mock(() => Promise.resolve({ id: "mock-transfer-id", status: "ok" })),
      };

      const result = await fetchCandlesViaREST(mockAdapter, "BTCUSDT", "1H", 1704067200000, 500);

      expect(mockAdapter.fetchOHLCV).toHaveBeenCalledWith("BTCUSDT", "1H", 1704067200000, 500);
      expect(result).toHaveLength(2);

      // Verify id and created_at are stripped
      for (const candle of result) {
        expect(candle).not.toHaveProperty("id");
        expect(candle).not.toHaveProperty("created_at");
      }

      // Verify data is preserved
      expect(result[0]!.symbol).toBe("BTCUSDT");
      expect(result[0]!.exchange).toBe("binance");
      expect(result[0]!.open.toString()).toBe("42000");
      expect(result[0]!.is_closed).toBe(true);
    });

    it("uses default limit when not provided", async () => {
      const mockAdapter: ExchangeAdapter = {
        fetchOHLCV: mock(() => Promise.resolve([])),
        fetchBalance: mock(() => Promise.resolve({ total: new Decimal("0"), available: new Decimal("0") })),
        fetchPositions: mock(() => Promise.resolve([])),
        createOrder: mock(() => Promise.reject(new Error("not implemented"))),
        cancelOrder: mock(() => Promise.reject(new Error("not implemented"))),
        editOrder: mock(() => Promise.reject(new Error("not implemented"))),
        fetchOrder: mock(() => Promise.reject(new Error("not implemented"))),
        watchOHLCV: mock(() => Promise.reject(new Error("not implemented"))),
        getExchangeInfo: mock(() => Promise.reject(new Error("not implemented"))),
        setLeverage: mock(() => Promise.reject(new Error("not implemented"))),
        transfer: mock(() => Promise.resolve({ id: "mock-transfer-id", status: "ok" })),
      };

      await fetchCandlesViaREST(mockAdapter, "BTCUSDT", "5M", 1704067200000);
      expect(mockAdapter.fetchOHLCV).toHaveBeenCalledWith("BTCUSDT", "5M", 1704067200000, undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // downloadCandles — date range splitting and fetch mocking
  // ---------------------------------------------------------------------------

  describe("downloadCandles", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("splits date range into monthly and daily segments", async () => {
      const fetchedUrls: string[] = [];

      // Mock global fetch to track URLs and return 404 (we only care about URL construction)
      globalThis.fetch = mock(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        fetchedUrls.push(url);
        return new Response(null, { status: 404 });
      }) as unknown as typeof globalThis.fetch;

      // Range: 2024-01-15 to 2024-03-10
      // Expected:
      //   - Daily: Jan 15-31 (17 daily)
      //   - Monthly: Feb 2024 (1 monthly)
      //   - Daily: Mar 1-10 (10 daily)
      await downloadCandles(
        "BTCUSDT",
        "binance",
        "1H",
        new Date("2024-01-15T00:00:00Z"),
        new Date("2024-03-10T00:00:00Z"),
      );

      // Check that monthly URL for February was included
      const monthlyFeb = fetchedUrls.find((u) => u.includes("monthly") && u.includes("2024-02"));
      expect(monthlyFeb).toBeDefined();

      // Check that daily URLs for January were included
      const dailyJan15 = fetchedUrls.find((u) => u.includes("daily") && u.includes("2024-01-15"));
      expect(dailyJan15).toBeDefined();

      // Check that daily URLs for March were included
      const dailyMar01 = fetchedUrls.find((u) => u.includes("daily") && u.includes("2024-03-01"));
      expect(dailyMar01).toBeDefined();

      // No monthly URL for January (partial month) or March (partial month)
      const monthlyJan = fetchedUrls.find((u) => u.includes("monthly") && u.includes("2024-01"));
      expect(monthlyJan).toBeUndefined();
      const monthlyMar = fetchedUrls.find((u) => u.includes("monthly") && u.includes("2024-03"));
      expect(monthlyMar).toBeUndefined();
    });

    it("uses only monthly URLs for complete months", async () => {
      const fetchedUrls: string[] = [];

      globalThis.fetch = mock(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        fetchedUrls.push(url);
        return new Response(null, { status: 404 });
      }) as unknown as typeof globalThis.fetch;

      // Full months: Feb and Mar 2024
      await downloadCandles(
        "BTCUSDT",
        "binance",
        "1H",
        new Date("2024-02-01T00:00:00Z"),
        new Date("2024-03-31T23:59:59Z"),
      );

      const monthlyUrls = fetchedUrls.filter((u) => u.includes("monthly"));
      const dailyUrls = fetchedUrls.filter((u) => u.includes("daily"));

      // Feb and Mar should be monthly
      expect(monthlyUrls.length).toBe(2);
      expect(dailyUrls.length).toBe(0);
    });

    it("skips failed downloads (404) gracefully", async () => {
      globalThis.fetch = mock(async () => {
        return new Response(null, { status: 404 });
      }) as unknown as typeof globalThis.fetch;

      // Should not throw
      const result = await downloadCandles(
        "BTCUSDT",
        "binance",
        "1H",
        new Date("2024-01-01T00:00:00Z"),
        new Date("2024-01-02T00:00:00Z"),
      );

      expect(result).toEqual([]);
    });

    it("skips network errors gracefully", async () => {
      globalThis.fetch = mock(async () => {
        throw new Error("Network error");
      }) as unknown as typeof globalThis.fetch;

      const result = await downloadCandles(
        "BTCUSDT",
        "binance",
        "1H",
        new Date("2024-01-01T00:00:00Z"),
        new Date("2024-01-02T00:00:00Z"),
      );

      expect(result).toEqual([]);
    });

    it("parses downloaded CSV data into NewCandle objects", async () => {
      // Build a fake ZIP containing a CSV
      const { zipSync } = await import("fflate");
      const csvContent =
        "1704067200000,42000.50,42500.00,41800.25,42200.75,1234.567,1704070799999,51876543.21,5000,617.283,25938271.60,0\n" +
        "1704070800000,42200.75,42800.00,42100.50,42700.25,5678.901,1704074399999,242345678.90,8000,2839.450,121172839.45,0\n";

      const csvBytes = new TextEncoder().encode(csvContent);
      const zipped = zipSync({ "BTCUSDT-1h-2024-01-01.csv": csvBytes });

      globalThis.fetch = mock(async () => {
        return new Response(zipped.buffer as ArrayBuffer, {
          status: 200,
          headers: { "Content-Type": "application/zip" },
        });
      }) as unknown as typeof globalThis.fetch;

      const result = await downloadCandles(
        "BTCUSDT",
        "binance",
        "1H",
        new Date("2024-01-01T00:00:00Z"),
        new Date("2024-01-01T23:59:59Z"),
      );

      expect(result.length).toBe(2);
      expect(result[0]!.symbol).toBe("BTCUSDT");
      expect(result[0]!.exchange).toBe("binance");
      expect(result[0]!.timeframe).toBe("1H");
      expect(result[0]!.open).toBeInstanceOf(Decimal);
      expect(result[0]!.open.toString()).toBe("42000.5");
      expect(result[0]!.is_closed).toBe(true);
      expect(result[1]!.close.toString()).toBe("42700.25");
    });

    it("sets the symbol from the parameter", async () => {
      const { zipSync } = await import("fflate");
      const csvContent =
        "1704067200000,42000.50,42500.00,41800.25,42200.75,1234.567,1704070799999,51876543.21,5000,617.283,25938271.60,0\n";
      const csvBytes = new TextEncoder().encode(csvContent);
      const zipped = zipSync({ "data.csv": csvBytes });

      globalThis.fetch = mock(async () => {
        return new Response(zipped.buffer as ArrayBuffer, {
          status: 200,
          headers: { "Content-Type": "application/zip" },
        });
      }) as unknown as typeof globalThis.fetch;

      const result = await downloadCandles(
        "XAUTUSDT",
        "binance",
        "5M",
        new Date("2024-01-01T00:00:00Z"),
        new Date("2024-01-01T23:59:59Z"),
      );

      expect(result[0]!.symbol).toBe("XAUTUSDT");
      expect(result[0]!.exchange).toBe("binance");
      expect(result[0]!.timeframe).toBe("5M");
    });

    it("uses the correct timeframe mapping in URLs", async () => {
      const fetchedUrls: string[] = [];

      globalThis.fetch = mock(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        fetchedUrls.push(url);
        return new Response(null, { status: 404 });
      }) as unknown as typeof globalThis.fetch;

      await downloadCandles(
        "BTCUSDT",
        "binance",
        "5M",
        new Date("2024-01-01T00:00:00Z"),
        new Date("2024-01-01T23:59:59Z"),
      );

      // All URLs should use 5m (lowercase)
      for (const url of fetchedUrls) {
        expect(url).toContain("/5m/");
      }
    });

    it("handles single-day range with daily URLs only", async () => {
      const fetchedUrls: string[] = [];

      globalThis.fetch = mock(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        fetchedUrls.push(url);
        return new Response(null, { status: 404 });
      }) as unknown as typeof globalThis.fetch;

      await downloadCandles(
        "BTCUSDT",
        "binance",
        "1H",
        new Date("2024-06-15T00:00:00Z"),
        new Date("2024-06-15T23:59:59Z"),
      );

      expect(fetchedUrls.length).toBe(1);
      expect(fetchedUrls[0]).toContain("daily");
      expect(fetchedUrls[0]).toContain("2024-06-15");
    });

    it("returns empty array for empty date range (from > to)", async () => {
      const result = await downloadCandles(
        "BTCUSDT",
        "binance",
        "1H",
        new Date("2024-03-01T00:00:00Z"),
        new Date("2024-01-01T00:00:00Z"),
      );

      expect(result).toEqual([]);
    });

    it("filters candles by the requested date range", async () => {
      const { zipSync } = await import("fflate");
      // Create CSV with candles at different times
      const csvContent =
        // Jan 1, 00:00 UTC
        "1704067200000,42000.50,42500.00,41800.25,42200.75,1234.567,1704070799999,51876543.21,5000,617.283,25938271.60,0\n" +
        // Jan 1, 01:00 UTC
        "1704070800000,42200.75,42800.00,42100.50,42700.25,5678.901,1704074399999,242345678.90,8000,2839.450,121172839.45,0\n";

      const csvBytes = new TextEncoder().encode(csvContent);
      const zipped = zipSync({ "data.csv": csvBytes });

      globalThis.fetch = mock(async () => {
        return new Response(zipped.buffer as ArrayBuffer, {
          status: 200,
          headers: { "Content-Type": "application/zip" },
        });
      }) as unknown as typeof globalThis.fetch;

      const result = await downloadCandles(
        "BTCUSDT",
        "binance",
        "1H",
        new Date("2024-01-01T00:00:00Z"),
        new Date("2024-01-01T23:59:59Z"),
      );

      // Both candles within the range
      expect(result.length).toBe(2);
    });
  });
});
