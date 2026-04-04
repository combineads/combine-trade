import { beforeEach, describe, expect, it } from "bun:test";
import { d } from "../../src/core/decimal";
import type { Candle, Exchange } from "../../src/core/types";
import type { ExchangeSymbolInfo } from "../../src/core/ports";
import { MockExchangeAdapter } from "../../src/backtest/mock-adapter";
import type { MockAdapterConfig } from "../../src/backtest/mock-adapter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle(
  openTimeMs: number,
  close: string,
  high?: string,
  low?: string,
): Candle {
  return {
    id: `candle-${openTimeMs}`,
    symbol: "BTCUSDT",
    exchange: "binance" as Exchange,
    timeframe: "1H",
    open_time: new Date(openTimeMs),
    open: d(close),
    high: d(high ?? close),
    low: d(low ?? close),
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

function makeConfig(overrides: Partial<MockAdapterConfig> = {}): MockAdapterConfig {
  return {
    exchange: "binance" as Exchange,
    initialBalance: d("10000"),
    candles: [makeCandle(1_000_000, "40000", "41000", "39000")],
    symbolInfo: SYMBOL_INFO,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Slippage tests
// ---------------------------------------------------------------------------

describe("slippage simulation", () => {
  it("market BUY with slippagePct=0.1 fills at close * 1.001", async () => {
    const adapter = new MockExchangeAdapter(
      makeConfig({ slippagePct: 0.1 }),
    );
    adapter.advanceTime(1_000_000);

    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: d("0.1"),
      type: "market",
    });

    expect(result.status).toBe("FILLED");
    // 40000 * 1.001 = 40040
    expect(result.filledPrice?.toString()).toBe("40040");
  });

  it("market SELL with slippagePct=0.1 fills at close * 0.999", async () => {
    // Give enough balance for a BUY first; then SELL reduceOnly
    const adapter = new MockExchangeAdapter(
      makeConfig({
        slippagePct: 0.1,
        initialBalance: d("100000"),
      }),
    );
    adapter.advanceTime(1_000_000);

    // Open position first (BUY at slipped price 40040)
    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: d("0.1"),
      type: "market",
    });

    // Now close (SELL reduceOnly) — should fill at close * 0.999 = 39960
    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: d("0.1"),
      type: "market",
      reduceOnly: true,
    });

    expect(result.status).toBe("FILLED");
    // 40000 * 0.999 = 39960
    expect(result.filledPrice?.toString()).toBe("39960");
  });

  it("market BUY with slippagePct=0 (default) fills at exact close price", async () => {
    const adapter = new MockExchangeAdapter(makeConfig());
    adapter.advanceTime(1_000_000);

    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: d("0.1"),
      type: "market",
    });

    expect(result.filledPrice?.toString()).toBe("40000");
  });
});

// ---------------------------------------------------------------------------
// Pending orders (stop_market)
// ---------------------------------------------------------------------------

describe("pending orders — stop_market", () => {
  let adapter: MockExchangeAdapter;

  beforeEach(() => {
    adapter = new MockExchangeAdapter(makeConfig({ initialBalance: d("100000") }));
    adapter.advanceTime(1_000_000);
  });

  it("createOrder stop_market returns PENDING status", async () => {
    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: d("0.1"),
      type: "stop_market",
      price: d("38000"),
      reduceOnly: true,
    });

    expect(result.status).toBe("PENDING");
    expect(result.filledPrice).toBeNull();
    expect(result.filledSize).toBeNull();
  });

  it("checkPendingOrders triggers SL when candle low <= trigger (LONG SL)", async () => {
    // Create a LONG position first
    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: d("0.1"),
      type: "market",
    });

    // Register SL as stop_market
    const slOrder = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: d("0.1"),
      type: "stop_market",
      price: d("39000"),
      reduceOnly: true,
    });

    expect(slOrder.status).toBe("PENDING");

    // candle with low=38000, which is <= 39000 trigger → SL should fire
    const triggerCandle = makeCandle(2_000_000, "38500", "39500", "38000");
    adapter.advanceTime(2_000_000);
    const filled = adapter.checkPendingOrders(triggerCandle);

    expect(filled).toHaveLength(1);
    expect(filled[0]?.status).toBe("FILLED");
    // Filled at trigger price (no slippage configured)
    expect(filled[0]?.filledPrice?.toString()).toBe("39000");
  });

  it("checkPendingOrders does NOT trigger SL when candle low > trigger", async () => {
    // Create a LONG position first
    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: d("0.1"),
      type: "market",
    });

    // Register SL
    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: d("0.1"),
      type: "stop_market",
      price: d("38000"),
      reduceOnly: true,
    });

    // candle with low=39000, which is > 38000 trigger → SL should NOT fire
    const noTriggerCandle = makeCandle(2_000_000, "40000", "41000", "39000");
    adapter.advanceTime(2_000_000);
    const filled = adapter.checkPendingOrders(noTriggerCandle);

    expect(filled).toHaveLength(0);
  });

  it("checkPendingOrders triggers SHORT SL when candle high >= trigger", async () => {
    // Create a SHORT position first (SELL market)
    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: d("0.1"),
      type: "market",
    });

    // Register SL for SHORT (BUY stop_market)
    const slOrder = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: d("0.1"),
      type: "stop_market",
      price: d("41500"),
      reduceOnly: true,
    });

    expect(slOrder.status).toBe("PENDING");

    // candle with high=42000, which is >= 41500 trigger → SL should fire
    const triggerCandle = makeCandle(2_000_000, "41800", "42000", "41000");
    adapter.advanceTime(2_000_000);
    const filled = adapter.checkPendingOrders(triggerCandle);

    expect(filled).toHaveLength(1);
    expect(filled[0]?.status).toBe("FILLED");
    expect(filled[0]?.filledPrice?.toString()).toBe("41500");
  });
});

// ---------------------------------------------------------------------------
// cancelOrder — pending orders
// ---------------------------------------------------------------------------

describe("cancelOrder — pending orders", () => {
  it("cancels a pending stop_market order", async () => {
    const adapter = new MockExchangeAdapter(makeConfig({ initialBalance: d("100000") }));
    adapter.advanceTime(1_000_000);

    // Open position
    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: d("0.1"),
      type: "market",
    });

    const slOrder = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: d("0.1"),
      type: "stop_market",
      price: d("38000"),
      reduceOnly: true,
    });

    expect(slOrder.status).toBe("PENDING");

    // Cancel the pending order
    await adapter.cancelOrder(slOrder.orderId, "BTCUSDT");

    // fetchOrder should return CANCELLED
    const fetched = await adapter.fetchOrder(slOrder.orderId, "BTCUSDT");
    expect(fetched.status).toBe("CANCELLED");

    // checkPendingOrders should not fill it
    const triggerCandle = makeCandle(2_000_000, "37000", "39000", "36000");
    adapter.advanceTime(2_000_000);
    const filled = adapter.checkPendingOrders(triggerCandle);
    expect(filled).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// editOrder — pending orders
// ---------------------------------------------------------------------------

describe("editOrder — pending orders", () => {
  it("updates the trigger price of a pending stop_market order", async () => {
    const adapter = new MockExchangeAdapter(makeConfig({ initialBalance: d("100000") }));
    adapter.advanceTime(1_000_000);

    // Open position
    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: d("0.1"),
      type: "market",
    });

    // Register SL at 38000
    const slOrder = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: d("0.1"),
      type: "stop_market",
      price: d("38000"),
      reduceOnly: true,
    });

    // Edit trigger price to 39500 (move SL up)
    const editResult = await adapter.editOrder(slOrder.orderId, { price: d("39500") });
    expect(editResult.status).toBe("PENDING");

    // candle with low=39200, which is <= 39500 → should fire at new trigger
    const triggerCandle = makeCandle(2_000_000, "39300", "40000", "39200");
    adapter.advanceTime(2_000_000);
    const filled = adapter.checkPendingOrders(triggerCandle);

    expect(filled).toHaveLength(1);
    expect(filled[0]?.filledPrice?.toString()).toBe("39500");
  });

  it("editOrder with old 38000 trigger does NOT fire at new low=39200 if not edited", async () => {
    const adapter = new MockExchangeAdapter(makeConfig({ initialBalance: d("100000") }));
    adapter.advanceTime(1_000_000);

    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: d("0.1"),
      type: "market",
    });

    // SL at 38000
    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: d("0.1"),
      type: "stop_market",
      price: d("38000"),
      reduceOnly: true,
    });

    // candle low=39200 > 38000 → should NOT fire
    const noTriggerCandle = makeCandle(2_000_000, "39300", "40000", "39200");
    adapter.advanceTime(2_000_000);
    const filled = adapter.checkPendingOrders(noTriggerCandle);

    expect(filled).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// slippage + pending: SL fills at trigger price ± slippage
// ---------------------------------------------------------------------------

describe("slippage on pending order fill", () => {
  it("LONG SL fills at trigger * (1 - slippagePct/100) when slippage configured", async () => {
    const adapter = new MockExchangeAdapter(
      makeConfig({ slippagePct: 0.1, initialBalance: d("100000") }),
    );
    adapter.advanceTime(1_000_000);

    // Open LONG position
    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: d("0.1"),
      type: "market",
    });

    // SL at 39000
    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: d("0.1"),
      type: "stop_market",
      price: d("39000"),
      reduceOnly: true,
    });

    // Trigger candle: low=38500 <= 39000 trigger
    const triggerCandle = makeCandle(2_000_000, "38700", "39500", "38500");
    adapter.advanceTime(2_000_000);
    const filled = adapter.checkPendingOrders(triggerCandle);

    expect(filled).toHaveLength(1);
    // SELL SL fills at trigger * (1 - 0.001) = 39000 * 0.999 = 38961
    expect(filled[0]?.filledPrice?.toString()).toBe("38961");
  });
});
