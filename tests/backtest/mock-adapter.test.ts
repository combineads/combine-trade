import { beforeEach, describe, expect, it } from "bun:test";
import { d } from "../../src/core/decimal";
import type { Candle, Exchange } from "../../src/core/types";
import type { ExchangeAdapter, ExchangeSymbolInfo } from "../../src/core/ports";
import { MockExchangeAdapter } from "../../src/backtest/mock-adapter";
import type { MockAdapterConfig } from "../../src/backtest/mock-adapter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle(openTimeMs: number, close: string): Candle {
  return {
    id: `candle-${openTimeMs}`,
    symbol: "BTCUSDT",
    exchange: "binance" as Exchange,
    timeframe: "1H",
    open_time: new Date(openTimeMs),
    open: d(close),
    high: d(close),
    low: d(close),
    close: d(close),
    volume: d("1"),
    is_closed: true,
    created_at: new Date(openTimeMs),
  };
}

const CANDLE_T1 = makeCandle(1_000_000, "40000");
const CANDLE_T2 = makeCandle(2_000_000, "41000");
const CANDLE_T3 = makeCandle(3_000_000, "42000");

const SYMBOL_INFO: ExchangeSymbolInfo = {
  symbol: "BTCUSDT",
  tickSize: d("0.1"),
  minOrderSize: d("0.001"),
  maxLeverage: 125,
  contractSize: d("1"),
};

function makeConfig(overrides: Partial<MockAdapterConfig> = {}): MockAdapterConfig {
  return {
    exchange: "binance" as Exchange,
    initialBalance: d("10000"),
    candles: [CANDLE_T1, CANDLE_T2, CANDLE_T3],
    symbolInfo: SYMBOL_INFO,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MockExchangeAdapter", () => {
  let adapter: MockExchangeAdapter;

  beforeEach(() => {
    adapter = new MockExchangeAdapter(makeConfig());
    // Start at T1 so at least one candle is visible
    adapter.advanceTime(1_000_000);
  });

  // ── Lookahead prevention ─────────────────────────────────────────────────

  describe("fetchOHLCV — lookahead prevention", () => {
    it("returns only candles at or before currentTimestamp", async () => {
      const candles = await adapter.fetchOHLCV("BTCUSDT", "1H");
      // T1 is visible (open_time === currentTimestamp), T2 and T3 are not
      expect(candles).toHaveLength(1);
      expect(candles[0]?.open_time.getTime()).toBe(1_000_000);
    });

    it("returns more candles after advanceTime", async () => {
      adapter.advanceTime(2_000_000);
      const candles = await adapter.fetchOHLCV("BTCUSDT", "1H");
      expect(candles).toHaveLength(2);
    });

    it("returns all candles when time is at the last candle", async () => {
      adapter.advanceTime(3_000_000);
      const candles = await adapter.fetchOHLCV("BTCUSDT", "1H");
      expect(candles).toHaveLength(3);
    });

    it("respects the since parameter (filters out older candles)", async () => {
      adapter.advanceTime(3_000_000);
      const candles = await adapter.fetchOHLCV("BTCUSDT", "1H", 2_000_000);
      // since=T2, so only T2 and T3 should be returned
      expect(candles).toHaveLength(2);
      expect(candles[0]?.open_time.getTime()).toBe(2_000_000);
    });

    it("respects the limit parameter", async () => {
      adapter.advanceTime(3_000_000);
      const candles = await adapter.fetchOHLCV("BTCUSDT", "1H", undefined, 1);
      expect(candles).toHaveLength(1);
    });
  });

  // ── advanceTime ──────────────────────────────────────────────────────────

  describe("advanceTime", () => {
    it("sets the current timestamp used for filtering", async () => {
      adapter.advanceTime(2_000_000);
      const candles = await adapter.fetchOHLCV("BTCUSDT", "1H");
      expect(candles).toHaveLength(2);
    });
  });

  // ── fetchBalance ─────────────────────────────────────────────────────────

  describe("fetchBalance", () => {
    it("returns initialBalance before any orders", async () => {
      const balance = await adapter.fetchBalance();
      expect(balance.total.toString()).toBe("10000");
      expect(balance.available.toString()).toBe("10000");
    });
  });

  // ── createOrder — market BUY ─────────────────────────────────────────────

  describe("createOrder — market BUY", () => {
    it("fills at current close price and returns FILLED status", async () => {
      const result = await adapter.createOrder({
        symbol: "BTCUSDT",
        side: "BUY",
        size: d("0.1"),
        type: "market",
      });
      expect(result.status).toBe("FILLED");
      // Current close at T1 = 40000
      expect(result.filledPrice?.toString()).toBe("40000");
      expect(result.filledSize?.toString()).toBe("0.1");
    });

    it("deducts cost from balance", async () => {
      await adapter.createOrder({
        symbol: "BTCUSDT",
        side: "BUY",
        size: d("0.1"),
        type: "market",
      });
      const balance = await adapter.fetchBalance();
      // cost = 40000 * 0.1 = 4000; remaining = 10000 - 4000 = 6000
      expect(balance.available.toString()).toBe("6000");
    });
  });

  // ── fetchPositions after BUY ──────────────────────────────────────────────

  describe("fetchPositions", () => {
    it("returns the open position after a BUY order", async () => {
      await adapter.createOrder({
        symbol: "BTCUSDT",
        side: "BUY",
        size: d("0.1"),
        type: "market",
      });
      const positions = await adapter.fetchPositions("BTCUSDT");
      expect(positions).toHaveLength(1);
      expect(positions[0]?.side).toBe("LONG");
      expect(positions[0]?.size.toString()).toBe("0.1");
      expect(positions[0]?.entryPrice.toString()).toBe("40000");
    });

    it("returns empty array when no open positions", async () => {
      const positions = await adapter.fetchPositions("BTCUSDT");
      expect(positions).toHaveLength(0);
    });
  });

  // ── createOrder — SELL reduceOnly ────────────────────────────────────────

  describe("createOrder — SELL reduceOnly", () => {
    it("reduces position size and adds proceeds to balance", async () => {
      // Buy 0.1 BTC at 40000 → position LONG 0.1
      await adapter.createOrder({
        symbol: "BTCUSDT",
        side: "BUY",
        size: d("0.1"),
        type: "market",
      });

      // Advance to T2 so close is 41000
      adapter.advanceTime(2_000_000);

      // Sell 0.1 reduceOnly → close position at 41000
      const result = await adapter.createOrder({
        symbol: "BTCUSDT",
        side: "SELL",
        size: d("0.1"),
        type: "market",
        reduceOnly: true,
      });

      expect(result.status).toBe("FILLED");
      expect(result.filledPrice?.toString()).toBe("41000");

      const positions = await adapter.fetchPositions("BTCUSDT");
      expect(positions).toHaveLength(0);

      const balance = await adapter.fetchBalance();
      // Started 10000, bought 0.1@40000 (cost 4000 → 6000 remaining)
      // Sold 0.1@41000 (proceeds 4100 → 6000 + 4100 = 10100)
      expect(balance.available.toString()).toBe("10100");
    });
  });

  // ── ExchangeAdapter interface satisfied ──────────────────────────────────

  describe("interface compliance", () => {
    it("satisfies ExchangeAdapter type structurally", () => {
      // TypeScript enforces this at compile time; at runtime just check required methods exist
      const a: ExchangeAdapter = adapter;
      expect(typeof a.fetchOHLCV).toBe("function");
      expect(typeof a.fetchBalance).toBe("function");
      expect(typeof a.fetchPositions).toBe("function");
      expect(typeof a.createOrder).toBe("function");
      expect(typeof a.cancelOrder).toBe("function");
      expect(typeof a.editOrder).toBe("function");
      expect(typeof a.fetchOrder).toBe("function");
      expect(typeof a.watchOHLCV).toBe("function");
      expect(typeof a.getExchangeInfo).toBe("function");
      expect(typeof a.setLeverage).toBe("function");
    });

    it("getExchangeInfo returns symbol info", async () => {
      const info = await adapter.getExchangeInfo("BTCUSDT");
      expect(info.symbol).toBe("BTCUSDT");
    });

    it("setLeverage is a no-op that resolves", async () => {
      await expect(adapter.setLeverage(10, "BTCUSDT")).resolves.toBeUndefined();
    });

    it("watchOHLCV is a no-op that returns unsubscribe function", async () => {
      const unsub = await adapter.watchOHLCV("BTCUSDT", "1H", () => {});
      expect(typeof unsub).toBe("function");
    });

    it("cancelOrder resolves without error (no-op for non-existent order)", async () => {
      await expect(adapter.cancelOrder("fake-id", "BTCUSDT")).resolves.toBeUndefined();
    });
  });
});
