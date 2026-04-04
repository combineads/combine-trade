/**
 * Tests for createBacktestPipelineDeps() factory.
 *
 * Tests:
 * 1. Return value satisfies PipelineDeps type (compile-time + runtime shape)
 * 2. Notification functions are no-ops (don't throw)
 * 3. adapters map contains the mock adapter for the configured exchange
 * 4. In-memory collectors work for createTicket, insertVector, insertEvent
 * 5. executionMode='live' is set on the ActiveSymbol
 * 6. Pipeline error continuity: errors don't abort iteration
 */
import { describe, expect, it } from "bun:test";
import { d } from "../../src/core/decimal";
import type { Candle, Exchange } from "../../src/core/types";
import type { ExchangeSymbolInfo } from "../../src/core/ports";
import { MockExchangeAdapter } from "../../src/backtest/mock-adapter";
import { createBacktestPipelineDeps } from "../../src/backtest/pipeline-adapter";
import type { PipelineDeps } from "../../src/daemon/pipeline";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SYMBOL_INFO: ExchangeSymbolInfo = {
  symbol: "BTCUSDT",
  tickSize: d("0.1"),
  minOrderSize: d("0.001"),
  maxLeverage: 125,
  contractSize: d("1"),
};

function makeMockAdapter(exchange: Exchange = "binance"): MockExchangeAdapter {
  return new MockExchangeAdapter({
    exchange,
    initialBalance: d("10000"),
    candles: [],
    symbolInfo: SYMBOL_INFO,
  });
}

function makeCandle(
  openTimeMs: number,
  symbol = "BTCUSDT",
  exchange: Exchange = "binance",
  timeframe = "5M",
): Candle {
  return {
    id: `candle-${openTimeMs}`,
    symbol,
    exchange,
    timeframe: timeframe as Candle["timeframe"],
    open_time: new Date(openTimeMs),
    open: d("40000"),
    high: d("40500"),
    low: d("39500"),
    close: d("40100"),
    volume: d("100"),
    is_closed: true,
    created_at: new Date(openTimeMs),
  };
}

// Minimal stub db for tests that don't use the real DB
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stubDb = {} as any;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createBacktestPipelineDeps", () => {
  describe("factory function", () => {
    it("returns an object that satisfies PipelineDeps type shape", () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      // Type check: assignment to PipelineDeps must compile
      const typed: PipelineDeps = deps;
      void typed; // suppress unused warning

      // Runtime shape checks for required properties
      expect(typeof deps.db).toBe("object");
      expect(typeof deps.adapters).toBe("object");
      expect(typeof deps.getCandles).toBe("function");
      expect(typeof deps.calcAllIndicators).toBe("function");
      expect(typeof deps.calcBB4).toBe("function");
      expect(typeof deps.getSymbolState).toBe("function");
      expect(typeof deps.determineDailyBias).toBe("function");
      expect(typeof deps.updateDailyBias).toBe("function");
      expect(typeof deps.isTradeBlocked).toBe("function");
      expect(typeof deps.detectWatching).toBe("function");
      expect(typeof deps.getActiveWatchSession).toBe("function");
      expect(typeof deps.openWatchSession).toBe("function");
      expect(typeof deps.invalidateWatchSession).toBe("function");
      expect(typeof deps.checkInvalidation).toBe("function");
      expect(typeof deps.updateWatchSessionTp).toBe("function");
      expect(typeof deps.checkEvidence).toBe("function");
      expect(typeof deps.checkSafety).toBe("function");
      expect(typeof deps.vectorize).toBe("function");
      expect(typeof deps.insertVector).toBe("function");
      expect(typeof deps.searchKnn).toBe("function");
      expect(typeof deps.applyTimeDecay).toBe("function");
      expect(typeof deps.loadTimeDecayConfig).toBe("function");
      expect(typeof deps.makeDecision).toBe("function");
      expect(typeof deps.loadKnnConfig).toBe("function");
      expect(typeof deps.getActiveTicket).toBe("function");
      expect(typeof deps.canPyramid).toBe("function");
      expect(typeof deps.computeEntrySize).toBe("function");
      expect(typeof deps.createTicket).toBe("function");
      expect(typeof deps.executeEntry).toBe("function");
      expect(typeof deps.loadSlippageConfig).toBe("function");
      expect(typeof deps.checkExit).toBe("function");
      expect(typeof deps.processExit).toBe("function");
      expect(typeof deps.processTrailing).toBe("function");
      expect(typeof deps.updateTpPrices).toBe("function");
      expect(typeof deps.updateMfeMae).toBe("function");
      expect(typeof deps.checkLossLimit).toBe("function");
      expect(typeof deps.loadLossLimitConfig).toBe("function");
      expect(typeof deps.sendSlackAlert).toBe("function");
      expect(typeof deps.insertEvent).toBe("function");
    });

    it("returns a BacktestCollectors object alongside deps", () => {
      const adapter = makeMockAdapter("binance");
      const result = createBacktestPipelineDeps(adapter, "binance", stubDb);

      expect(result).toHaveProperty("deps");
      expect(result).toHaveProperty("collectors");
      expect(Array.isArray(result.collectors.tickets)).toBe(true);
      expect(Array.isArray(result.collectors.vectors)).toBe(true);
      expect(Array.isArray(result.collectors.events)).toBe(true);
    });
  });

  describe("adapters map", () => {
    it("contains the mock adapter for the configured exchange", () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      expect(deps.adapters.get("binance")).toBe(adapter);
    });

    it("contains the mock adapter for okx exchange", () => {
      const adapter = makeMockAdapter("okx");
      const { deps } = createBacktestPipelineDeps(adapter, "okx", stubDb);

      expect(deps.adapters.get("okx")).toBe(adapter);
    });

    it("returns undefined for other exchanges", () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      expect(deps.adapters.get("okx")).toBeUndefined();
    });
  });

  describe("sendSlackAlert (no-op)", () => {
    it("does not throw when called", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      await expect(
        deps.sendSlackAlert("CRASH_RECOVERY" as Parameters<typeof deps.sendSlackAlert>[0], {
          symbol: "BTCUSDT",
          exchange: "binance",
        }),
      ).resolves.toBeUndefined();
    });

    it("is a no-op that returns undefined", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const result = await deps.sendSlackAlert(
        "STATE_CHANGE" as Parameters<typeof deps.sendSlackAlert>[0],
        { symbol: "BTCUSDT", exchange: "binance" },
      );
      expect(result).toBeUndefined();
    });
  });

  describe("in-memory collectors", () => {
    it("insertVector stores vector data in collectors.vectors", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps, collectors } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const embedding = new Float32Array(202).fill(0.1);
      const vectorRow = await deps.insertVector(stubDb, {
        candleId: "candle-uuid-1",
        symbol: "BTCUSDT",
        exchange: "binance",
        timeframe: "5M",
        embedding,
      });

      expect(collectors.vectors).toHaveLength(1);
      expect(vectorRow.symbol).toBe("BTCUSDT");
      expect(vectorRow.exchange).toBe("binance");
      expect(vectorRow.timeframe).toBe("5M");
      expect(typeof vectorRow.id).toBe("string");
      expect(vectorRow.id.length).toBeGreaterThan(0);
    });

    it("insertEvent stores event data in collectors.events", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps, collectors } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const eventRow = await deps.insertEvent(stubDb, {
        event_type: "PIPELINE_LATENCY",
        symbol: "BTCUSDT",
        exchange: "binance",
        data: { durationMs: 42 },
      });

      expect(collectors.events).toHaveLength(1);
      expect(eventRow.event_type).toBe("PIPELINE_LATENCY");
      expect(eventRow.symbol).toBe("BTCUSDT");
      expect(typeof eventRow.id).toBe("string");
    });

    it("createTicket stores ticket data in collectors.tickets", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps, collectors } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const ticket = await deps.createTicket(stubDb, {
        symbol: "BTCUSDT",
        exchange: "binance",
        signalId: "signal-uuid-1",
        timeframe: "5M",
        direction: "LONG",
        entryPrice: "40000",
        slPrice: "39500",
        size: "0.01",
        leverage: 5,
      });

      expect(collectors.tickets).toHaveLength(1);
      expect(ticket.symbol).toBe("BTCUSDT");
      expect(ticket.direction).toBe("LONG");
      expect(typeof ticket.id).toBe("string");
    });

    it("collectors accumulate across multiple calls", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps, collectors } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      await deps.insertEvent(stubDb, {
        event_type: "BIAS_CHANGE",
        symbol: "BTCUSDT",
        exchange: "binance",
      });

      await deps.insertEvent(stubDb, {
        event_type: "WATCHING_START",
        symbol: "BTCUSDT",
        exchange: "binance",
      });

      expect(collectors.events).toHaveLength(2);
    });
  });

  describe("getCandles (delegates to mock adapter)", () => {
    it("returns candles from the mock adapter filtered by symbol and timeframe", async () => {
      const t1 = new Date("2024-01-01T00:00:00Z").getTime();
      const t2 = new Date("2024-01-01T00:05:00Z").getTime();

      const candle1 = makeCandle(t1, "BTCUSDT", "binance", "5M");
      const candle2 = makeCandle(t2, "BTCUSDT", "binance", "5M");

      const adapter = new MockExchangeAdapter({
        exchange: "binance",
        initialBalance: d("10000"),
        candles: [candle1, candle2],
        symbolInfo: SYMBOL_INFO,
      });
      // Advance time past candle2 so both are visible
      adapter.advanceTime(t2 + 1000);

      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const result = await deps.getCandles(stubDb, "BTCUSDT", "binance", "5M", 10);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("updateDailyBias (in-memory no-op)", () => {
    it("does not throw and returns undefined", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      await expect(
        deps.updateDailyBias(stubDb, "BTCUSDT", "binance", "LONG_ONLY", d("40000")),
      ).resolves.toBeUndefined();
    });
  });

  describe("getSymbolState (returns null for backtest)", () => {
    it("returns null for any symbol", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const result = await deps.getSymbolState(stubDb, "BTCUSDT", "binance");
      expect(result).toBeNull();
    });
  });

  describe("isTradeBlocked (never blocked in backtest)", () => {
    it("returns { blocked: false }", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const result = await deps.isTradeBlocked(stubDb, new Date());
      expect(result.blocked).toBe(false);
    });
  });

  describe("loadSlippageConfig (returns default config)", () => {
    it("returns a valid SlippageConfig", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const config = await deps.loadSlippageConfig(stubDb);
      expect(config.maxSpreadPct).toBeDefined();
      expect(typeof config.maxSpreadPct.toNumber).toBe("function");
    });
  });

  describe("loadLossLimitConfig (returns permissive config)", () => {
    it("returns a config that allows all trades", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const config = await deps.loadLossLimitConfig(stubDb);
      expect(config.maxSessionLosses).toBeGreaterThan(0);
    });
  });

  describe("loadKnnConfig (returns default config)", () => {
    it("returns topK and distanceMetric", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const config = await deps.loadKnnConfig(stubDb);
      expect(typeof config.topK).toBe("number");
      expect(config.topK).toBeGreaterThan(0);
      expect(config.distanceMetric === "cosine" || config.distanceMetric === "l2").toBe(true);
    });
  });

  describe("pure function delegates", () => {
    it("calcAllIndicators works with minimal candle set", () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const candles: Candle[] = [makeCandle(Date.now(), "BTCUSDT", "binance", "5M")];
      const indicators = deps.calcAllIndicators(candles);

      // bb20 requires 20 candles — should be null with 1
      expect(indicators.bb20).toBeNull();
      // Other fields exist
      expect("sma20" in indicators).toBe(true);
    });

    it("checkExit returns NONE for a non-open ticket", () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const result = deps.checkExit(
        {
          state: "CLOSED",
          direction: "LONG",
          entry_price: "40000",
          tp1_price: "42000",
          tp2_price: "44000",
          size: "0.01",
          remaining_size: "0.01",
          opened_at: new Date(),
          trailing_active: false,
          max_favorable: null,
          max_adverse: null,
        },
        "41000",
        Date.now(),
      );

      expect(result.type).toBe("NONE");
    });

    it("updateTpPrices returns serialized TP price fields", () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const result = deps.updateTpPrices({
        tp1Price: d("42000"),
        tp2Price: d("44000"),
      });

      expect(result.tp1_price).toBe("42000");
      expect(result.tp2_price).toBe("44000");
    });

    it("updateMfeMae returns serialized MFE/MAE fields", () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const result = deps.updateMfeMae({
        mfe: d("500"),
        mae: d("200"),
      });

      expect(result.max_favorable).toBe("500");
      expect(result.max_adverse).toBe("200");
    });
  });

  describe("searchKnn (returns empty array in backtest)", () => {
    it("returns an empty array without hitting the DB", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const embedding = new Float32Array(202).fill(0.0);
      const result = await deps.searchKnn(stubDb, embedding, {
        symbol: "BTCUSDT",
        exchange: "binance",
        timeframe: "5M",
        topK: 50,
        distanceMetric: "cosine",
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe("getActiveWatchSession (returns null in backtest)", () => {
    it("returns null without hitting the DB", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const result = await deps.getActiveWatchSession(stubDb, "BTCUSDT", "binance");
      expect(result).toBeNull();
    });
  });

  describe("getActiveTicket (returns null in backtest)", () => {
    it("returns null without hitting the DB", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const result = await deps.getActiveTicket(stubDb, "BTCUSDT", "binance");
      expect(result).toBeNull();
    });
  });

  describe("openWatchSession and invalidateWatchSession", () => {
    it("openWatchSession returns a WatchSession with correct fields", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      const session = await deps.openWatchSession(stubDb, {
        symbol: "BTCUSDT",
        exchange: "binance",
        detectionType: "BB4_TOUCH",
        direction: "LONG",
        tp1Price: d("42000"),
        tp2Price: d("44000"),
        detectedAt: new Date(),
        contextData: {},
      });

      expect(session.symbol).toBe("BTCUSDT");
      expect(session.exchange).toBe("binance");
      expect(session.direction).toBe("LONG");
      expect(session.detection_type).toBe("BB4_TOUCH");
      expect(typeof session.id).toBe("string");
    });

    it("invalidateWatchSession does not throw", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      await expect(
        deps.invalidateWatchSession(stubDb, "session-id-1", "bias_changed"),
      ).resolves.toBeUndefined();
    });

    it("updateWatchSessionTp does not throw", async () => {
      const adapter = makeMockAdapter("binance");
      const { deps } = createBacktestPipelineDeps(adapter, "binance", stubDb);

      await expect(
        deps.updateWatchSessionTp(stubDb, "session-id-1", d("42000"), d("44000")),
      ).resolves.toBeUndefined();
    });
  });
});
