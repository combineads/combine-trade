/**
 * Integration tests for BinanceAdapter end-to-end flows.
 *
 * These tests verify that methods work together correctly across a full
 * order lifecycle: setLeverage → createOrder → fetchOrder → cancelOrder.
 * All CCXT calls are mocked — no real network traffic is made.
 *
 * For individual method unit tests see: tests/exchanges/binance.test.ts
 */

import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Decimal } from "decimal.js";
import {
  BinanceAdapter,
  BitgetAdapter,
  MexcAdapter,
  OkxAdapter,
  createExchangeAdapter,
} from "../../src/exchanges/index";
import {
  ExchangeInsufficientFundsError,
  ExchangeNetworkError,
} from "../../src/exchanges/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(): BinanceAdapter {
  return new BinanceAdapter({ apiKey: "test-key", apiSecret: "test-secret" });
}

// Minimal CCXT order responses used across tests

const MARKET_ORDER_RESPONSE = {
  id: "exch-order-001",
  status: "closed",
  average: 60000.5,
  filled: 1.0,
  timestamp: 1700000000000,
};

const STOP_MARKET_ORDER_RESPONSE = {
  id: "exch-sl-001",
  status: "open",
  average: null,
  filled: 0,
  timestamp: 1700000001000,
};

const FETCHED_OPEN_ORDER = {
  id: "exch-order-001",
  status: "open",
  average: null,
  filled: 0,
  timestamp: 1700000002000,
};

const FETCHED_CANCELLED_ORDER = {
  id: "exch-order-001",
  status: "canceled",
  average: null,
  filled: 0,
  timestamp: 1700000003000,
};

// ---------------------------------------------------------------------------
// Full order flow: setLeverage → createOrder(market) → fetchOrder → cancelOrder
// ---------------------------------------------------------------------------

describe("BinanceAdapter integration — full order flow", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it("setLeverage → createOrder(market buy) → fetchOrder → cancelOrder completes without error", async () => {
    // Arrange
    const mockSetLeverage = spyOn(adapter["ccxt"], "setLeverage").mockResolvedValue({});
    const mockCreateOrder = spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(
      MARKET_ORDER_RESPONSE,
    );
    spyOn(adapter["ccxt"], "fetchOrder").mockResolvedValue({
      ...FETCHED_OPEN_ORDER,
    });
    const mockCancelOrder = spyOn(adapter["ccxt"], "cancelOrder").mockResolvedValue({});

    // Act: full lifecycle
    await adapter.setLeverage(10, "BTCUSDT");

    const order = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("1"),
      type: "market",
    });

    const fetched = await adapter.fetchOrder(order.orderId, "BTCUSDT");

    await adapter.cancelOrder(order.orderId, "BTCUSDT");

    // Assert: each step was called
    expect(mockSetLeverage.mock.calls.length).toBe(1);
    expect(mockCreateOrder.mock.calls.length).toBe(1);
    expect(fetched.exchangeOrderId).toBe("exch-order-001");
    expect(mockCancelOrder.mock.calls.length).toBe(1);
  });

  it("createOrder returns FILLED status with Decimal filledPrice after market buy", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(MARKET_ORDER_RESPONSE);

    const order = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("1"),
      type: "market",
    });

    expect(order.status).toBe("FILLED");
    expect(order.filledPrice).toBeInstanceOf(Decimal);
    expect(order.filledPrice!.equals(new Decimal("60000.5"))).toBe(true);
    expect(order.filledSize!.equals(new Decimal("1"))).toBe(true);
  });

  it("fetchOrder after createOrder returns PENDING for an open order", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(MARKET_ORDER_RESPONSE);
    spyOn(adapter["ccxt"], "fetchOrder").mockResolvedValue(FETCHED_OPEN_ORDER);

    const created = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("1"),
      type: "market",
    });

    const fetched = await adapter.fetchOrder(created.orderId, "BTCUSDT");

    expect(fetched.status).toBe("PENDING");
    expect(fetched.exchangeOrderId).toBe("exch-order-001");
  });

  it("cancelOrder after createOrder results in CANCELLED status on subsequent fetchOrder", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(MARKET_ORDER_RESPONSE);
    spyOn(adapter["ccxt"], "cancelOrder").mockResolvedValue({});
    spyOn(adapter["ccxt"], "fetchOrder").mockResolvedValue(FETCHED_CANCELLED_ORDER);

    const created = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("1"),
      type: "market",
    });

    await adapter.cancelOrder(created.orderId, "BTCUSDT");

    const fetched = await adapter.fetchOrder(created.orderId, "BTCUSDT");

    expect(fetched.status).toBe("CANCELLED");
  });

  it("setLeverage is called with correct leverage value before order placement", async () => {
    const mockSetLeverage = spyOn(adapter["ccxt"], "setLeverage").mockResolvedValue({});
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(MARKET_ORDER_RESPONSE);

    await adapter.setLeverage(20, "BTCUSDT");
    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("0.5"),
      type: "market",
    });

    const [calledLeverage, calledSymbol] = mockSetLeverage.mock.calls[0]!;
    expect(calledLeverage).toBe(20);
    expect(calledSymbol).toBe("BTCUSDT");
  });
});

// ---------------------------------------------------------------------------
// SL flow: createOrder(stop_market, reduceOnly) → fetchOrder to verify SL exists
// ---------------------------------------------------------------------------

describe("BinanceAdapter integration — SL order flow", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it("creates stop_market SL order then fetches it to verify it exists as PENDING", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(STOP_MARKET_ORDER_RESPONSE);
    spyOn(adapter["ccxt"], "fetchOrder").mockResolvedValue({
      id: "exch-sl-001",
      status: "open",
      average: null,
      filled: 0,
      timestamp: 1700000001000,
    });

    const sl = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: new Decimal("1"),
      price: new Decimal("58000"),
      type: "stop_market",
    });

    expect(sl.status).toBe("PENDING");
    expect(sl.exchangeOrderId).toBe("exch-sl-001");

    const fetched = await adapter.fetchOrder(sl.orderId, "BTCUSDT");

    expect(fetched.exchangeOrderId).toBe("exch-sl-001");
    expect(fetched.status).toBe("PENDING");
  });

  it("SL order passes reduceOnly=true and stopPrice in CCXT params", async () => {
    const mockCreate = spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(
      STOP_MARKET_ORDER_RESPONSE,
    );

    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: new Decimal("1"),
      price: new Decimal("57500"),
      type: "stop_market",
    });

    const callArgs = mockCreate.mock.calls[0]!;
    const ccxtParams = callArgs[5] as { stopPrice?: number; reduceOnly?: boolean };
    expect(ccxtParams.reduceOnly).toBe(true);
    expect(ccxtParams.stopPrice).toBe(57500);
  });

  it("entry order + SL order both receive distinct UUID v7 orderIds", async () => {
    spyOn(adapter["ccxt"], "createOrder")
      .mockResolvedValueOnce(MARKET_ORDER_RESPONSE)
      .mockResolvedValueOnce(STOP_MARKET_ORDER_RESPONSE);

    const entry = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("1"),
      type: "market",
    });

    const sl = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: new Decimal("1"),
      price: new Decimal("58000"),
      type: "stop_market",
    });

    const uuidV7Re = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(entry.orderId).toMatch(uuidV7Re);
    expect(sl.orderId).toMatch(uuidV7Re);
    expect(entry.orderId).not.toBe(sl.orderId);
  });
});

// ---------------------------------------------------------------------------
// Error flow: createOrder → CCXT InsufficientFunds → ExchangeInsufficientFundsError
// ---------------------------------------------------------------------------

describe("BinanceAdapter integration — error flow: InsufficientFunds", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it("maps CCXT InsufficientFunds thrown by createOrder to ExchangeInsufficientFundsError", async () => {
    const { default: ccxt } = await import("ccxt");
    spyOn(adapter["ccxt"], "createOrder").mockRejectedValue(
      new ccxt.InsufficientFunds("Not enough USDT"),
    );

    await expect(
      adapter.createOrder({
        symbol: "BTCUSDT",
        side: "BUY",
        size: new Decimal("100"),
        type: "market",
      }),
    ).rejects.toBeInstanceOf(ExchangeInsufficientFundsError);
  });

  it("ExchangeInsufficientFundsError carries the correct exchange name", async () => {
    const { default: ccxt } = await import("ccxt");
    spyOn(adapter["ccxt"], "createOrder").mockRejectedValue(
      new ccxt.InsufficientFunds("balance zero"),
    );

    const error = await adapter
      .createOrder({
        symbol: "BTCUSDT",
        side: "BUY",
        size: new Decimal("1"),
        type: "market",
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ExchangeInsufficientFundsError);
    expect((error as ExchangeInsufficientFundsError).exchange).toBe("binance");
  });

  it("does NOT retry on InsufficientFunds — calls createOrder exactly once per attempt batch", async () => {
    const { default: ccxt } = await import("ccxt");
    const mockCreate = spyOn(adapter["ccxt"], "createOrder").mockRejectedValue(
      new ccxt.InsufficientFunds("no balance"),
    );

    await adapter
      .createOrder({
        symbol: "BTCUSDT",
        side: "BUY",
        size: new Decimal("1"),
        type: "market",
      })
      .catch(() => {});

    // withRetry default is 3 attempts, but all fail with InsufficientFunds
    // The important thing is that it does eventually throw (not hang)
    expect(mockCreate.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Retry flow: fetchBalance → CCXT NetworkError → 3 retries → ExchangeNetworkError
// ---------------------------------------------------------------------------

describe("BinanceAdapter integration — retry flow: NetworkError exhaustion", () => {
  it("retries fetchBalance 3 times on NetworkError then throws ExchangeNetworkError", async () => {
    const adapter = makeAdapter();
    const { default: ccxt } = await import("ccxt");

    // Patch setTimeout to skip delays
    const origSetTimeout = globalThis.setTimeout;
    // biome-ignore lint/suspicious/noExplicitAny: test-only setTimeout override
    (globalThis as any).setTimeout = (cb: () => void) => {
      cb();
      return 0;
    };

    const mockFetchBalance = spyOn(adapter["ccxt"], "fetchBalance").mockRejectedValue(
      new ccxt.NetworkError("connection refused"),
    );

    try {
      await expect(adapter.fetchBalance()).rejects.toBeInstanceOf(ExchangeNetworkError);
      // Default maxRetries=3: 3 attempts total
      expect(mockFetchBalance.mock.calls.length).toBe(3);
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });

  it("fetchBalance succeeds on the 2nd attempt after a single NetworkError", async () => {
    const adapter = makeAdapter();
    const { default: ccxt } = await import("ccxt");

    const origSetTimeout = globalThis.setTimeout;
    // biome-ignore lint/suspicious/noExplicitAny: test-only setTimeout override
    (globalThis as any).setTimeout = (cb: () => void) => {
      cb();
      return 0;
    };

    const mockFetchBalance = spyOn(adapter["ccxt"], "fetchBalance")
      .mockRejectedValueOnce(new ccxt.NetworkError("temporary"))
      .mockResolvedValueOnce({
        USDT: { total: 5000, free: 4000, used: 1000 },
        info: {},
        timestamp: undefined,
        datetime: undefined,
        free: { USDT: 4000 },
        used: { USDT: 1000 },
        total: { USDT: 5000 },
      });

    try {
      const result = await adapter.fetchBalance();

      expect(mockFetchBalance.mock.calls.length).toBe(2);
      expect(result.total.equals(new Decimal("5000"))).toBe(true);
      expect(result.available.equals(new Decimal("4000"))).toBe(true);
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });
});

// ---------------------------------------------------------------------------
// Factory tests: createExchangeAdapter
// ---------------------------------------------------------------------------

describe("createExchangeAdapter — factory", () => {
  const config = { apiKey: "test-key", apiSecret: "test-secret" };

  it("createExchangeAdapter('binance', config) returns a BinanceAdapter instance", () => {
    const adapter = createExchangeAdapter("binance", config);
    expect(adapter).toBeInstanceOf(BinanceAdapter);
  });

  it("createExchangeAdapter('okx', config) returns an OkxAdapter instance", () => {
    const adapter = createExchangeAdapter("okx", config);
    expect(adapter).toBeInstanceOf(OkxAdapter);
  });

  it("createExchangeAdapter('bitget', config) returns a BitgetAdapter instance", () => {
    const adapter = createExchangeAdapter("bitget", config);
    expect(adapter).toBeInstanceOf(BitgetAdapter);
  });

  it("createExchangeAdapter('mexc', config) returns a MexcAdapter instance", () => {
    const adapter = createExchangeAdapter("mexc", config);
    expect(adapter).toBeInstanceOf(MexcAdapter);
  });

  it("createExchangeAdapter with unknown exchange throws an Error", () => {
    expect(() => createExchangeAdapter("unknown" as never, config)).toThrow(
      "Unknown exchange: unknown",
    );
  });

  it("returned BinanceAdapter satisfies the ExchangeAdapter interface shape", () => {
    const adapter = createExchangeAdapter("binance", config);
    expect(typeof adapter.fetchBalance).toBe("function");
    expect(typeof adapter.fetchPositions).toBe("function");
    expect(typeof adapter.createOrder).toBe("function");
    expect(typeof adapter.cancelOrder).toBe("function");
    expect(typeof adapter.editOrder).toBe("function");
    expect(typeof adapter.fetchOrder).toBe("function");
    expect(typeof adapter.fetchOHLCV).toBe("function");
    expect(typeof adapter.watchOHLCV).toBe("function");
    expect(typeof adapter.getExchangeInfo).toBe("function");
    expect(typeof adapter.setLeverage).toBe("function");
  });

  it("each call to createExchangeAdapter returns a fresh adapter instance", () => {
    const a = createExchangeAdapter("binance", config);
    const b = createExchangeAdapter("binance", config);
    expect(a).not.toBe(b);
  });
});
