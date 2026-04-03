import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Decimal } from "decimal.js";
import { BinanceAdapter } from "../../src/exchanges/binance";
import {
  ExchangeInsufficientFundsError,
  ExchangeOrderNotFoundError,
} from "../../src/exchanges/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(): BinanceAdapter {
  return new BinanceAdapter({ apiKey: "test-key", apiSecret: "test-secret" });
}

// ---------------------------------------------------------------------------
// fetchBalance
// ---------------------------------------------------------------------------

describe("BinanceAdapter — fetchBalance", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it("returns total and available as Decimal from CCXT mock response", async () => {
    spyOn(adapter["ccxt"], "fetchBalance").mockResolvedValue({
      USDT: { total: 10000, free: 8500, used: 1500 },
      info: {},
      timestamp: undefined,
      datetime: undefined,
      free: { USDT: 8500 },
      used: { USDT: 1500 },
      total: { USDT: 10000 },
    });

    const result = await adapter.fetchBalance();

    expect(result.total).toBeInstanceOf(Decimal);
    expect(result.available).toBeInstanceOf(Decimal);
    expect(result.total.equals(new Decimal("10000"))).toBe(true);
    expect(result.available.equals(new Decimal("8500"))).toBe(true);
  });

  it("returns zero Decimals when USDT balance is absent", async () => {
    spyOn(adapter["ccxt"], "fetchBalance").mockResolvedValue({
      info: {},
      timestamp: undefined,
      datetime: undefined,
      free: {},
      used: {},
      total: {},
    });

    const result = await adapter.fetchBalance();

    expect(result.total.equals(new Decimal("0"))).toBe(true);
    expect(result.available.equals(new Decimal("0"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchPositions
// ---------------------------------------------------------------------------

describe("BinanceAdapter — fetchPositions", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  const mockPositions = [
    {
      symbol: "BTCUSDT",
      side: "long",
      contracts: 1.5,
      entryPrice: 60000,
      unrealizedPnl: 300,
      leverage: 10,
      liquidationPrice: 55000,
    },
    {
      symbol: "ETHUSDT",
      side: "short",
      contracts: 5,
      entryPrice: 3000,
      unrealizedPnl: -50,
      leverage: 5,
      liquidationPrice: null,
    },
  ];

  it("returns ExchangePosition[] with all fields as Decimal", async () => {
    spyOn(adapter["ccxt"], "fetchPositions").mockResolvedValue(mockPositions);

    const result = await adapter.fetchPositions();

    expect(result).toHaveLength(2);

    const btc = result[0]!;
    expect(btc.symbol).toBe("BTCUSDT");
    expect(btc.exchange).toBe("binance");
    expect(btc.side).toBe("LONG");
    expect(btc.size).toBeInstanceOf(Decimal);
    expect(btc.size.equals(new Decimal("1.5"))).toBe(true);
    expect(btc.entryPrice).toBeInstanceOf(Decimal);
    expect(btc.entryPrice.equals(new Decimal("60000"))).toBe(true);
    expect(btc.unrealizedPnl).toBeInstanceOf(Decimal);
    expect(btc.unrealizedPnl.equals(new Decimal("300"))).toBe(true);
    expect(btc.leverage).toBe(10);
    expect(btc.liquidationPrice).toBeInstanceOf(Decimal);
    expect(btc.liquidationPrice!.equals(new Decimal("55000"))).toBe(true);
  });

  it("maps short side correctly", async () => {
    spyOn(adapter["ccxt"], "fetchPositions").mockResolvedValue(mockPositions);

    const result = await adapter.fetchPositions();
    const eth = result[1]!;

    expect(eth.side).toBe("SHORT");
    expect(eth.liquidationPrice).toBeNull();
  });

  it("filters by symbol when symbol is provided", async () => {
    spyOn(adapter["ccxt"], "fetchPositions").mockResolvedValue(mockPositions);

    const result = await adapter.fetchPositions("BTCUSDT");

    expect(result).toHaveLength(1);
    expect(result[0]!.symbol).toBe("BTCUSDT");
  });

  it("returns empty array when no positions match the filter", async () => {
    spyOn(adapter["ccxt"], "fetchPositions").mockResolvedValue(mockPositions);

    const result = await adapter.fetchPositions("SOLUSDT");

    expect(result).toHaveLength(0);
  });

  it("returns empty array when CCXT returns no positions", async () => {
    spyOn(adapter["ccxt"], "fetchPositions").mockResolvedValue([]);

    const result = await adapter.fetchPositions();

    expect(result).toHaveLength(0);
  });

  it("excludes positions with zero contracts", async () => {
    const withZero = [
      ...mockPositions,
      {
        symbol: "SOLUSDT",
        side: "long",
        contracts: 0,
        entryPrice: 150,
        unrealizedPnl: 0,
        leverage: 1,
        liquidationPrice: null,
      },
    ];
    spyOn(adapter["ccxt"], "fetchPositions").mockResolvedValue(withZero);

    const result = await adapter.fetchPositions();

    expect(result.every((p) => !p.size.isZero())).toBe(true);
    expect(result.find((p) => p.symbol === "SOLUSDT")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// fetchOrder
// ---------------------------------------------------------------------------

describe("BinanceAdapter — fetchOrder", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it("returns OrderResult with Decimal filledPrice and filledSize for a filled order", async () => {
    const mockOrder = {
      id: "ccxt-order-999",
      status: "closed",
      average: 60100.5,
      filled: 1.5,
      timestamp: 1700000000000,
    };

    spyOn(adapter["ccxt"], "fetchOrder").mockResolvedValue(mockOrder);

    const result = await adapter.fetchOrder("order-123", "BTCUSDT");

    expect(result.orderId).toBe("order-123");
    expect(result.exchangeOrderId).toBe("ccxt-order-999");
    expect(result.status).toBe("FILLED");
    expect(result.filledPrice).toBeInstanceOf(Decimal);
    expect(result.filledPrice!.equals(new Decimal("60100.5"))).toBe(true);
    expect(result.filledSize).toBeInstanceOf(Decimal);
    expect(result.filledSize!.equals(new Decimal("1.5"))).toBe(true);
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.timestamp.getTime()).toBe(1700000000000);
  });

  it("returns PENDING status for open order", async () => {
    spyOn(adapter["ccxt"], "fetchOrder").mockResolvedValue({
      id: "order-abc",
      status: "open",
      average: null,
      filled: 0,
      timestamp: Date.now(),
    });

    const result = await adapter.fetchOrder("order-abc", "BTCUSDT");
    expect(result.status).toBe("PENDING");
  });

  it("returns CANCELLED status for cancelled order", async () => {
    spyOn(adapter["ccxt"], "fetchOrder").mockResolvedValue({
      id: "order-abc",
      status: "canceled",
      average: null,
      filled: 0,
      timestamp: Date.now(),
    });

    const result = await adapter.fetchOrder("order-abc", "BTCUSDT");
    expect(result.status).toBe("CANCELLED");
  });

  it("returns null filledPrice and filledSize for unfilled order", async () => {
    spyOn(adapter["ccxt"], "fetchOrder").mockResolvedValue({
      id: "order-abc",
      status: "open",
      average: null,
      filled: null,
      timestamp: Date.now(),
    });

    const result = await adapter.fetchOrder("order-abc", "BTCUSDT");
    expect(result.filledPrice).toBeNull();
    expect(result.filledSize).toBeNull();
  });

  it("throws ExchangeOrderNotFoundError when CCXT throws OrderNotFound", async () => {
    const { default: ccxt } = await import("ccxt");
    spyOn(adapter["ccxt"], "fetchOrder").mockRejectedValue(
      new ccxt.OrderNotFound("Order 999 not found"),
    );

    await expect(adapter.fetchOrder("999", "BTCUSDT")).rejects.toBeInstanceOf(
      ExchangeOrderNotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// fetchOHLCV
// ---------------------------------------------------------------------------

describe("BinanceAdapter — fetchOHLCV", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  const baseTimestamp = 1700000000000;

  const mockOHLCV = Array.from({ length: 5 }, (_, i) => [
    baseTimestamp + i * 5 * 60 * 1000, // 5-minute intervals
    60000 + i * 10, // open
    60050 + i * 10, // high
    59950 + i * 10, // low
    60020 + i * 10, // close
    1000 + i * 100, // volume
  ]);

  it("returns Candle[] with correct length", async () => {
    spyOn(adapter["ccxt"], "fetchOHLCV").mockResolvedValue(mockOHLCV);

    const result = await adapter.fetchOHLCV("BTCUSDT", "5m");

    expect(result).toHaveLength(5);
  });

  it("converts CCXT timestamp to Date for open_time", async () => {
    spyOn(adapter["ccxt"], "fetchOHLCV").mockResolvedValue(mockOHLCV);

    const result = await adapter.fetchOHLCV("BTCUSDT", "5m");

    expect(result[0]!.open_time).toBeInstanceOf(Date);
    expect(result[0]!.open_time.getTime()).toBe(baseTimestamp);
  });

  it("converts OHLCV numbers to Decimal", async () => {
    spyOn(adapter["ccxt"], "fetchOHLCV").mockResolvedValue(mockOHLCV);

    const result = await adapter.fetchOHLCV("BTCUSDT", "5m");
    const candle = result[0]!;

    expect(candle.open).toBeInstanceOf(Decimal);
    expect(candle.high).toBeInstanceOf(Decimal);
    expect(candle.low).toBeInstanceOf(Decimal);
    expect(candle.close).toBeInstanceOf(Decimal);
    expect(candle.volume).toBeInstanceOf(Decimal);
  });

  it("sets correct OHLCV values", async () => {
    spyOn(adapter["ccxt"], "fetchOHLCV").mockResolvedValue(mockOHLCV);

    const result = await adapter.fetchOHLCV("BTCUSDT", "5m");
    const candle = result[0]!;

    expect(candle.open.equals(new Decimal("60000"))).toBe(true);
    expect(candle.high.equals(new Decimal("60050"))).toBe(true);
    expect(candle.low.equals(new Decimal("59950"))).toBe(true);
    expect(candle.close.equals(new Decimal("60020"))).toBe(true);
    expect(candle.volume.equals(new Decimal("1000"))).toBe(true);
  });

  it("sets symbol and exchange on each candle", async () => {
    spyOn(adapter["ccxt"], "fetchOHLCV").mockResolvedValue(mockOHLCV);

    const result = await adapter.fetchOHLCV("BTCUSDT", "5m");

    for (const candle of result) {
      expect(candle.symbol).toBe("BTCUSDT");
      expect(candle.exchange).toBe("binance");
    }
  });

  it("maps 5m timeframe to 5M", async () => {
    spyOn(adapter["ccxt"], "fetchOHLCV").mockResolvedValue(mockOHLCV);

    const result = await adapter.fetchOHLCV("BTCUSDT", "5m");

    expect(result[0]!.timeframe).toBe("5M");
  });

  it("maps 1h timeframe to 1H", async () => {
    spyOn(adapter["ccxt"], "fetchOHLCV").mockResolvedValue([[baseTimestamp, 60000, 60100, 59900, 60050, 500]]);

    const result = await adapter.fetchOHLCV("BTCUSDT", "1h");

    expect(result[0]!.timeframe).toBe("1H");
  });

  it("maps 1d timeframe to 1D", async () => {
    spyOn(adapter["ccxt"], "fetchOHLCV").mockResolvedValue([[baseTimestamp, 60000, 62000, 58000, 61000, 50000]]);

    const result = await adapter.fetchOHLCV("BTCUSDT", "1d");

    expect(result[0]!.timeframe).toBe("1D");
  });

  it("returns empty array for empty CCXT response", async () => {
    spyOn(adapter["ccxt"], "fetchOHLCV").mockResolvedValue([]);

    const result = await adapter.fetchOHLCV("BTCUSDT", "5m");

    expect(result).toHaveLength(0);
  });

  it("preserves timestamp order across 100 candles", async () => {
    const bars = Array.from({ length: 100 }, (_, i) => [
      baseTimestamp + i * 5 * 60 * 1000,
      60000,
      60100,
      59900,
      60050,
      1000,
    ]);
    spyOn(adapter["ccxt"], "fetchOHLCV").mockResolvedValue(bars);

    const result = await adapter.fetchOHLCV("BTCUSDT", "5m", undefined, 100);

    expect(result).toHaveLength(100);
    expect(result[0]!.open_time.getTime()).toBe(baseTimestamp);
    expect(result[99]!.open_time.getTime()).toBe(baseTimestamp + 99 * 5 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// getExchangeInfo
// ---------------------------------------------------------------------------

describe("BinanceAdapter — getExchangeInfo", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it("returns ExchangeSymbolInfo with Decimal fields for a known symbol", async () => {
    spyOn(adapter["ccxt"], "loadMarkets").mockResolvedValue({
      BTCUSDT: {
        symbol: "BTCUSDT",
        precision: { price: 0.1, amount: 0.001 },
        limits: {
          amount: { min: 0.001 },
          leverage: { max: 125 },
        },
        contractSize: 1,
      },
    });

    const result = await adapter.getExchangeInfo("BTCUSDT");

    expect(result.symbol).toBe("BTCUSDT");
    expect(result.tickSize).toBeInstanceOf(Decimal);
    expect(result.tickSize.equals(new Decimal("0.1"))).toBe(true);
    expect(result.minOrderSize).toBeInstanceOf(Decimal);
    expect(result.minOrderSize.equals(new Decimal("0.001"))).toBe(true);
    expect(result.maxLeverage).toBe(125);
    expect(result.contractSize).toBeInstanceOf(Decimal);
    expect(result.contractSize.equals(new Decimal("1"))).toBe(true);
  });

  it("uses defaults when precision/limits are absent", async () => {
    spyOn(adapter["ccxt"], "loadMarkets").mockResolvedValue({
      BTCUSDT: {
        symbol: "BTCUSDT",
        precision: {},
        limits: {},
        contractSize: null,
      },
    });

    const result = await adapter.getExchangeInfo("BTCUSDT");

    expect(result.tickSize.equals(new Decimal("0.01"))).toBe(true);
    expect(result.minOrderSize.equals(new Decimal("0.001"))).toBe(true);
    expect(result.maxLeverage).toBe(125);
    expect(result.contractSize.equals(new Decimal("1"))).toBe(true);
  });

  it("throws an error for an unknown symbol", async () => {
    spyOn(adapter["ccxt"], "loadMarkets").mockResolvedValue({});

    await expect(adapter.getExchangeInfo("UNKNOWNSYM")).rejects.toThrow("UNKNOWNSYM");
  });
});

// ---------------------------------------------------------------------------
// createOrder
// ---------------------------------------------------------------------------

describe("BinanceAdapter — createOrder", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  const filledMarketResponse = {
    id: "ccxt-binance-001",
    status: "closed",
    average: 60000.5,
    filled: 1.0,
    timestamp: 1700000000000,
  };

  const openLimitResponse = {
    id: "ccxt-binance-002",
    status: "open",
    average: null,
    filled: 0,
    timestamp: 1700000001000,
  };

  it("market buy → OrderResult with status FILLED and filledPrice/filledSize as Decimal", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(filledMarketResponse);

    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("1"),
      type: "market",
    });

    expect(result.status).toBe("FILLED");
    expect(result.filledPrice).toBeInstanceOf(Decimal);
    expect(result.filledPrice!.equals(new Decimal("60000.5"))).toBe(true);
    expect(result.filledSize).toBeInstanceOf(Decimal);
    expect(result.filledSize!.equals(new Decimal("1"))).toBe(true);
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.timestamp.getTime()).toBe(1700000000000);
  });

  it("limit sell → OrderResult with status PENDING and null filledPrice", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(openLimitResponse);

    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: new Decimal("0.5"),
      price: new Decimal("62000"),
      type: "limit",
    });

    expect(result.status).toBe("PENDING");
    expect(result.filledPrice).toBeNull();
  });

  it("orderId is a UUID v7 string (time-sortable format)", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(filledMarketResponse);

    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("1"),
      type: "market",
    });

    // UUID v7 format: xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx
    expect(result.orderId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("exchangeOrderId equals the CCXT-returned order id", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(filledMarketResponse);

    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("1"),
      type: "market",
    });

    expect(result.exchangeOrderId).toBe("ccxt-binance-001");
  });

  it("orderId differs from exchangeOrderId", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(filledMarketResponse);

    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("1"),
      type: "market",
    });

    expect(result.orderId).not.toBe(result.exchangeOrderId);
  });

  it("passes idempotency_key as clientOrderId to CCXT", async () => {
    const mockCreateOrder = spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(
      filledMarketResponse,
    );

    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("1"),
      type: "market",
    });

    const callArgs = mockCreateOrder.mock.calls[0]!;
    // 5th argument (index 4) is the params object
    const ccxtParams = callArgs[5] as { clientOrderId?: string };
    expect(ccxtParams.clientOrderId).toBe(result.orderId);
  });

  it("converts Decimal size and price to number before calling CCXT", async () => {
    const mockCreateOrder = spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(
      openLimitResponse,
    );

    await adapter.createOrder({
      symbol: "ETHUSDT",
      side: "BUY",
      size: new Decimal("2.5"),
      price: new Decimal("3000.75"),
      type: "limit",
    });

    const callArgs = mockCreateOrder.mock.calls[0]!;
    // amount is the 4th argument (index 3), price is 5th (index 4)
    expect(typeof callArgs[3]).toBe("number");
    expect(callArgs[3]).toBe(2.5);
    expect(typeof callArgs[4]).toBe("number");
    expect(callArgs[4]).toBe(3000.75);
  });

  it("two consecutive createOrder calls generate distinct orderId values", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(filledMarketResponse);

    const [r1, r2] = await Promise.all([
      adapter.createOrder({ symbol: "BTCUSDT", side: "BUY", size: new Decimal("1"), type: "market" }),
      adapter.createOrder({ symbol: "BTCUSDT", side: "BUY", size: new Decimal("1"), type: "market" }),
    ]);

    expect(r1!.orderId).not.toBe(r2!.orderId);
  });

  it("throws ExchangeInsufficientFundsError when CCXT throws InsufficientFunds", async () => {
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

  it("retries on network error and returns result on subsequent success", async () => {
    const { default: ccxt } = await import("ccxt");
    const mockCreate = spyOn(adapter["ccxt"], "createOrder")
      .mockRejectedValueOnce(new ccxt.NetworkError("timeout"))
      .mockResolvedValueOnce(filledMarketResponse);

    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("1"),
      type: "market",
    });

    expect(mockCreate.mock.calls.length).toBe(2);
    expect(result.status).toBe("FILLED");
  });
});

// ---------------------------------------------------------------------------
// cancelOrder
// ---------------------------------------------------------------------------

describe("BinanceAdapter — cancelOrder", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it("returns void on success", async () => {
    spyOn(adapter["ccxt"], "cancelOrder").mockResolvedValue({});

    const result = await adapter.cancelOrder("order-123", "BTCUSDT");

    expect(result).toBeUndefined();
  });

  it("throws ExchangeOrderNotFoundError when CCXT throws OrderNotFound", async () => {
    const { default: ccxt } = await import("ccxt");
    spyOn(adapter["ccxt"], "cancelOrder").mockRejectedValue(
      new ccxt.OrderNotFound("Order order-404 not found"),
    );

    await expect(adapter.cancelOrder("order-404", "BTCUSDT")).rejects.toBeInstanceOf(
      ExchangeOrderNotFoundError,
    );
  });

  it("passes orderId and symbol to CCXT cancelOrder", async () => {
    const mockCancel = spyOn(adapter["ccxt"], "cancelOrder").mockResolvedValue({});

    await adapter.cancelOrder("my-order-99", "ETHUSDT");

    const [calledId, calledSymbol] = mockCancel.mock.calls[0]!;
    expect(calledId).toBe("my-order-99");
    expect(calledSymbol).toBe("ETHUSDT");
  });
});

// ---------------------------------------------------------------------------
// editOrder
// ---------------------------------------------------------------------------

describe("BinanceAdapter — editOrder", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  const editedOrderResponse = {
    id: "ccxt-binance-003",
    status: "open",
    average: null,
    filled: 0,
    timestamp: 1700000002000,
  };

  it("returns updated OrderResult with new price as Decimal", async () => {
    spyOn(adapter["ccxt"], "editOrder").mockResolvedValue(editedOrderResponse);

    const result = await adapter.editOrder("order-edit-1", {
      price: new Decimal("61000"),
    });

    expect(result.orderId).toBe("order-edit-1");
    expect(result.exchangeOrderId).toBe("ccxt-binance-003");
    expect(result.status).toBe("PENDING");
  });

  it("converts Decimal price to number before calling CCXT", async () => {
    const mockEdit = spyOn(adapter["ccxt"], "editOrder").mockResolvedValue(
      editedOrderResponse,
    );

    await adapter.editOrder("order-edit-2", {
      price: new Decimal("59500.25"),
      size: new Decimal("0.75"),
    });

    const callArgs = mockEdit.mock.calls[0]!;
    // amount is index 4, price is index 5 in CCXT editOrder(id, symbol, type, side, amount, price)
    const amount = callArgs[4];
    const price = callArgs[5];
    expect(typeof amount).toBe("number");
    expect(amount).toBe(0.75);
    expect(typeof price).toBe("number");
    expect(price).toBe(59500.25);
  });

  it("returns Decimal filledPrice and filledSize when order is filled after edit", async () => {
    spyOn(adapter["ccxt"], "editOrder").mockResolvedValue({
      id: "ccxt-binance-004",
      status: "closed",
      average: 59500.0,
      filled: 0.75,
      timestamp: 1700000003000,
    });

    const result = await adapter.editOrder("order-edit-3", {
      price: new Decimal("59500"),
    });

    expect(result.status).toBe("FILLED");
    expect(result.filledPrice).toBeInstanceOf(Decimal);
    expect(result.filledPrice!.equals(new Decimal("59500"))).toBe(true);
    expect(result.filledSize).toBeInstanceOf(Decimal);
    expect(result.filledSize!.equals(new Decimal("0.75"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// watchOHLCV — see tests/exchanges/binance-ws.test.ts for full coverage
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// setLeverage
// ---------------------------------------------------------------------------

describe("BinanceAdapter — setLeverage", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it("calls CCXT setLeverage with leverage and symbol, returns void", async () => {
    const mockSetLeverage = spyOn(adapter["ccxt"], "setLeverage").mockResolvedValue({});

    const result = await adapter.setLeverage(10, "BTCUSDT");

    expect(result).toBeUndefined();
    expect(mockSetLeverage.mock.calls.length).toBe(1);
    const [calledLeverage, calledSymbol] = mockSetLeverage.mock.calls[0]!;
    expect(calledLeverage).toBe(10);
    expect(calledSymbol).toBe("BTCUSDT");
  });

  it("retries on network error and returns void on subsequent success", async () => {
    const { default: ccxt } = await import("ccxt");
    const mockSetLeverage = spyOn(adapter["ccxt"], "setLeverage")
      .mockRejectedValueOnce(new ccxt.NetworkError("timeout"))
      .mockResolvedValueOnce({});

    const result = await adapter.setLeverage(10, "BTCUSDT");

    expect(result).toBeUndefined();
    expect(mockSetLeverage.mock.calls.length).toBe(2);
  });

  it("throws ExchangeNetworkError after 3 consecutive network failures", async () => {
    const { default: ccxt } = await import("ccxt");
    const { ExchangeNetworkError } = await import("../../src/exchanges/errors");

    spyOn(adapter["ccxt"], "setLeverage").mockRejectedValue(new ccxt.NetworkError("timeout"));

    await expect(adapter.setLeverage(10, "BTCUSDT")).rejects.toBeInstanceOf(ExchangeNetworkError);
  });

  it("passes leverage value through to CCXT without cap validation", async () => {
    const mockSetLeverage = spyOn(adapter["ccxt"], "setLeverage").mockResolvedValue({});

    await adapter.setLeverage(125, "BTCUSDT");

    const [calledLeverage] = mockSetLeverage.mock.calls[0]!;
    expect(calledLeverage).toBe(125);
  });
});

// ---------------------------------------------------------------------------
// createOrder — stop_market (SL orders)
// ---------------------------------------------------------------------------

describe("BinanceAdapter — createOrder stop_market", () => {
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  const slOrderResponse = {
    id: "ccxt-sl-001",
    status: "open",
    average: null,
    filled: 0,
    timestamp: 1700000005000,
  };

  it("creates a stop_market order and returns OrderResult", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(slOrderResponse);

    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: new Decimal("1"),
      price: new Decimal("58000"),
      type: "stop_market",
    });

    expect(result.status).toBe("PENDING");
    expect(result.exchangeOrderId).toBe("ccxt-sl-001");
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("passes STOP_MARKET as the CCXT order type", async () => {
    const mockCreate = spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(slOrderResponse);

    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: new Decimal("1"),
      price: new Decimal("58000"),
      type: "stop_market",
    });

    const callArgs = mockCreate.mock.calls[0]!;
    // CCXT createOrder(symbol, type, side, amount, price, params)
    expect(callArgs[1]).toBe("STOP_MARKET");
  });

  it("passes price as stopPrice in CCXT params", async () => {
    const mockCreate = spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(slOrderResponse);

    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: new Decimal("1"),
      price: new Decimal("58000"),
      type: "stop_market",
    });

    const callArgs = mockCreate.mock.calls[0]!;
    const ccxtParams = callArgs[5] as { stopPrice?: number; reduceOnly?: boolean };
    expect(ccxtParams.stopPrice).toBe(58000);
  });

  it("forces reduceOnly=true for stop_market orders regardless of params.reduceOnly", async () => {
    const mockCreate = spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(slOrderResponse);

    // Call without explicit reduceOnly
    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: new Decimal("1"),
      price: new Decimal("58000"),
      type: "stop_market",
    });

    const callArgs = mockCreate.mock.calls[0]!;
    const ccxtParams = callArgs[5] as { stopPrice?: number; reduceOnly?: boolean };
    expect(ccxtParams.reduceOnly).toBe(true);
  });

  it("passes undefined as CCXT price (4th positional arg) for stop_market", async () => {
    const mockCreate = spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(slOrderResponse);

    await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: new Decimal("0.5"),
      price: new Decimal("57000"),
      type: "stop_market",
    });

    const callArgs = mockCreate.mock.calls[0]!;
    // price (index 4) should be undefined for STOP_MARKET — stop price goes in params
    expect(callArgs[4]).toBeUndefined();
  });

  it("orderId is a UUID v7 string for stop_market orders", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(slOrderResponse);

    const result = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: new Decimal("1"),
      price: new Decimal("58000"),
      type: "stop_market",
    });

    expect(result.orderId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("stop_market order can be fetched by orderId after creation", async () => {
    spyOn(adapter["ccxt"], "createOrder").mockResolvedValue(slOrderResponse);
    spyOn(adapter["ccxt"], "fetchOrder").mockResolvedValue({
      id: "ccxt-sl-001",
      status: "open",
      average: null,
      filled: 0,
      timestamp: 1700000005000,
    });

    const created = await adapter.createOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      size: new Decimal("1"),
      price: new Decimal("58000"),
      type: "stop_market",
    });

    const fetched = await adapter.fetchOrder(created.orderId, "BTCUSDT");

    expect(fetched.exchangeOrderId).toBe("ccxt-sl-001");
    expect(fetched.status).toBe("PENDING");
  });
});

// ---------------------------------------------------------------------------
// sandbox mode
// ---------------------------------------------------------------------------

describe("BinanceAdapter — sandbox mode", () => {
  it("constructs without error in sandbox mode", () => {
    const adapter = new BinanceAdapter({
      apiKey: "test-key",
      apiSecret: "test-secret",
      sandbox: true,
    });
    expect(adapter).toBeInstanceOf(BinanceAdapter);
  });
});
