import { describe, expect, it, mock } from "bun:test";
import { d } from "../../src/core/decimal";
import type { Candle, Exchange, Timeframe } from "../../src/core/types";
import type { BacktestConfig, BacktestTrade } from "../../src/backtest/engine";
import { BacktestRunner } from "../../src/backtest/engine";
import { MockExchangeAdapter } from "../../src/backtest/mock-adapter";
import type { ExchangeSymbolInfo } from "../../src/core/ports";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle(
  openTimeMs: number,
  timeframe: Timeframe,
  close = "40000",
  symbol = "BTCUSDT",
): Candle {
  return {
    id: `candle-${openTimeMs}-${timeframe}`,
    symbol,
    exchange: "binance" as Exchange,
    timeframe,
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

const SYMBOL_INFO: ExchangeSymbolInfo = {
  symbol: "BTCUSDT",
  tickSize: d("0.1"),
  minOrderSize: d("0.001"),
  maxLeverage: 125,
  contractSize: d("1"),
};

const BASE_CONFIG: BacktestConfig = {
  symbol: "BTCUSDT",
  exchange: "binance",
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-01-02T00:00:00Z"),
};

// ---------------------------------------------------------------------------
// BacktestRunner
// ---------------------------------------------------------------------------

describe("BacktestRunner", () => {
  // ── Constructor / validation ─────────────────────────────────────────────

  describe("constructor validation", () => {
    it("throws when startDate >= endDate", () => {
      const badConfig: BacktestConfig = {
        ...BASE_CONFIG,
        startDate: new Date("2024-01-02T00:00:00Z"),
        endDate: new Date("2024-01-01T00:00:00Z"),
      };
      expect(
        () => new BacktestRunner(badConfig, async () => []),
      ).toThrow();
    });

    it("throws when startDate === endDate", () => {
      const sameDate = new Date("2024-01-01T00:00:00Z");
      const badConfig: BacktestConfig = {
        ...BASE_CONFIG,
        startDate: sameDate,
        endDate: sameDate,
      };
      expect(
        () => new BacktestRunner(badConfig, async () => []),
      ).toThrow();
    });

    it("does not throw for valid date range", () => {
      expect(
        () => new BacktestRunner(BASE_CONFIG, async () => []),
      ).not.toThrow();
    });
  });

  // ── Empty candle set ─────────────────────────────────────────────────────

  describe("run() with no candles", () => {
    it("returns empty result without calling onCandleClose", async () => {
      const runner = new BacktestRunner(BASE_CONFIG, async () => []);
      const adapter = new MockExchangeAdapter({
        exchange: "binance",
        initialBalance: d("10000"),
        candles: [],
        symbolInfo: SYMBOL_INFO,
      });

      const onCandleClose = mock(async (_candle: Candle, _adapter: MockExchangeAdapter) => {});
      const result = await runner.run(onCandleClose, adapter);

      expect(onCandleClose).toHaveBeenCalledTimes(0);
      expect(result.trades).toHaveLength(0);
      expect(result.totalCandles).toBe(0);
      expect(result.config).toEqual(BASE_CONFIG);
    });
  });

  // ── Single candle ────────────────────────────────────────────────────────

  describe("run() with 3 candles", () => {
    it("calls onCandleClose exactly 3 times", async () => {
      const t1 = new Date("2024-01-01T01:00:00Z").getTime();
      const t2 = new Date("2024-01-01T02:00:00Z").getTime();
      const t3 = new Date("2024-01-01T03:00:00Z").getTime();

      const candles = [
        makeCandle(t1, "1H"),
        makeCandle(t2, "1H"),
        makeCandle(t3, "1H"),
      ];

      const runner = new BacktestRunner(BASE_CONFIG, async () => candles);
      const adapter = new MockExchangeAdapter({
        exchange: "binance",
        initialBalance: d("10000"),
        candles,
        symbolInfo: SYMBOL_INFO,
      });

      const onCandleClose = mock(async (_candle: Candle, _adapter: MockExchangeAdapter) => {});
      const result = await runner.run(onCandleClose, adapter);

      expect(onCandleClose).toHaveBeenCalledTimes(3);
      expect(result.totalCandles).toBe(3);
    });
  });

  // ── advanceTime called per candle ────────────────────────────────────────

  describe("advanceTime integration", () => {
    it("adapter.currentTimestamp equals last candle open_time after run()", async () => {
      const t1 = new Date("2024-01-01T01:00:00Z").getTime();
      const t2 = new Date("2024-01-01T02:00:00Z").getTime();
      const t3 = new Date("2024-01-01T03:00:00Z").getTime();

      const candles = [
        makeCandle(t1, "5M"),
        makeCandle(t2, "5M"),
        makeCandle(t3, "5M"),
      ];

      const runner = new BacktestRunner(BASE_CONFIG, async () => candles);
      const adapter = new MockExchangeAdapter({
        exchange: "binance",
        initialBalance: d("10000"),
        candles,
        symbolInfo: SYMBOL_INFO,
      });

      // Track the adapter's visible candles at each step to confirm time advanced
      const timestamps: number[] = [];
      await runner.run(async (candle, _adapter) => {
        timestamps.push(candle.open_time.getTime());
      }, adapter);

      // After run, fetchOHLCV should see all 3 candles (time advanced to t3)
      const visible = await adapter.fetchOHLCV("BTCUSDT", "5M");
      expect(visible).toHaveLength(3);

      // Candles were delivered in order
      expect(timestamps).toEqual([t1, t2, t3]);
    });
  });

  // ── Multi-timeframe sorting ──────────────────────────────────────────────

  describe("multi-timeframe sorting", () => {
    it("sorts same-timestamp candles: 1D first, then 1H, then 5M, then 1M", async () => {
      const sameTime = new Date("2024-01-01T00:00:00Z").getTime();

      const candle1M = makeCandle(sameTime, "1M");
      const candle5M = makeCandle(sameTime, "5M");
      const candle1H = makeCandle(sameTime, "1H");
      const candle1D = makeCandle(sameTime, "1D");

      // Provide them in reverse priority order
      const candles = [candle1M, candle5M, candle1H, candle1D];

      const runner = new BacktestRunner(BASE_CONFIG, async () => candles);
      const adapter = new MockExchangeAdapter({
        exchange: "binance",
        initialBalance: d("10000"),
        candles,
        symbolInfo: SYMBOL_INFO,
      });

      const seen: Timeframe[] = [];
      await runner.run(async (candle) => {
        seen.push(candle.timeframe);
      }, adapter);

      expect(seen).toEqual(["1D", "1H", "5M", "1M"]);
    });

    it("respects chronological order across timeframes", async () => {
      const t1 = new Date("2024-01-01T00:00:00Z").getTime();
      const t2 = new Date("2024-01-01T01:00:00Z").getTime();

      // t1: 1D and 1H at same time, t2: only 5M
      const candles = [
        makeCandle(t2, "5M"),
        makeCandle(t1, "1H"),
        makeCandle(t1, "1D"),
      ];

      const runner = new BacktestRunner(BASE_CONFIG, async () => candles);
      const adapter = new MockExchangeAdapter({
        exchange: "binance",
        initialBalance: d("10000"),
        candles,
        symbolInfo: SYMBOL_INFO,
      });

      const seen: Array<{ tf: Timeframe; ts: number }> = [];
      await runner.run(async (candle) => {
        seen.push({ tf: candle.timeframe, ts: candle.open_time.getTime() });
      }, adapter);

      // First 1D@t1, then 1H@t1, then 5M@t2
      expect(seen).toEqual([
        { tf: "1D", ts: t1 },
        { tf: "1H", ts: t1 },
        { tf: "5M", ts: t2 },
      ]);
    });
  });

  // ── BacktestTrade collection ─────────────────────────────────────────────

  describe("trade collection", () => {
    it("collects trades returned by onCandleClose via addTrade()", async () => {
      const t1 = new Date("2024-01-01T01:00:00Z").getTime();
      const candles = [makeCandle(t1, "1H")];

      const runner = new BacktestRunner(BASE_CONFIG, async () => candles);
      const adapter = new MockExchangeAdapter({
        exchange: "binance",
        initialBalance: d("10000"),
        candles,
        symbolInfo: SYMBOL_INFO,
      });

      const fakeTrade: BacktestTrade = {
        direction: "LONG",
        entryPrice: d("40000"),
        exitPrice: d("41000"),
        size: d("0.1"),
        pnl: d("100"),
        pnlPct: d("0.025"),
        holdDurationSec: 3600,
        result: "WIN",
        openedAt: new Date(t1),
        closedAt: new Date(t1 + 3600_000),
      };

      const result = await runner.run(async (_candle, _adapter, addTrade) => {
        addTrade(fakeTrade);
      }, adapter);

      expect(result.trades).toHaveLength(1);
      expect(result.trades[0]).toEqual(fakeTrade);
    });

    it("collects zero trades when callback never calls addTrade", async () => {
      const t1 = new Date("2024-01-01T01:00:00Z").getTime();
      const candles = [makeCandle(t1, "1H")];

      const runner = new BacktestRunner(BASE_CONFIG, async () => candles);
      const adapter = new MockExchangeAdapter({
        exchange: "binance",
        initialBalance: d("10000"),
        candles,
        symbolInfo: SYMBOL_INFO,
      });

      const result = await runner.run(async () => {}, adapter);
      expect(result.trades).toHaveLength(0);
    });
  });

  // ── Result metadata ──────────────────────────────────────────────────────

  describe("BacktestResult metadata", () => {
    it("result.config matches the input config", async () => {
      const runner = new BacktestRunner(BASE_CONFIG, async () => []);
      const adapter = new MockExchangeAdapter({
        exchange: "binance",
        initialBalance: d("10000"),
        candles: [],
        symbolInfo: SYMBOL_INFO,
      });

      const result = await runner.run(async () => {}, adapter);
      expect(result.config).toEqual(BASE_CONFIG);
      expect(result.startDate).toEqual(BASE_CONFIG.startDate);
      expect(result.endDate).toEqual(BASE_CONFIG.endDate);
    });

    it("result.totalCandles reflects actual candle count", async () => {
      const t1 = new Date("2024-01-01T01:00:00Z").getTime();
      const t2 = new Date("2024-01-01T02:00:00Z").getTime();
      const candles = [makeCandle(t1, "1H"), makeCandle(t2, "1H")];

      const runner = new BacktestRunner(BASE_CONFIG, async () => candles);
      const adapter = new MockExchangeAdapter({
        exchange: "binance",
        initialBalance: d("10000"),
        candles,
        symbolInfo: SYMBOL_INFO,
      });

      const result = await runner.run(async () => {}, adapter);
      expect(result.totalCandles).toBe(2);
    });
  });
});
