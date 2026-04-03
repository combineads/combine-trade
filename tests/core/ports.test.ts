import { describe, expect, it } from "bun:test";
import Decimal from "decimal.js";
import type {
  CommonCodeRepository,
  CreateOrderParams,
  EditOrderParams,
  ExchangeAdapter,
  ExchangeAdapterFactory,
  ExchangeConfig,
  ExchangePosition,
  ExchangeSymbolInfo,
  OHLCVCallback,
  OrderResult,
  SymbolRepository,
  Unsubscribe,
} from "@/core/ports";
import type { Candle, CommonCode, Exchange, SymbolEntity } from "@/core/types";

// ---------------------------------------------------------------------------
// Compile-time mock implementations
// ---------------------------------------------------------------------------

/**
 * A mock implementation of ExchangeAdapter to verify the type contract compiles.
 * All methods throw — they are never called at runtime in these tests.
 */
const mockAdapter: ExchangeAdapter = {
  fetchOHLCV(_symbol: string, _timeframe: string, _since?: number, _limit?: number): Promise<Candle[]> {
    throw new Error("not implemented");
  },
  fetchBalance(): Promise<{ total: Decimal; available: Decimal }> {
    throw new Error("not implemented");
  },
  fetchPositions(_symbol?: string): Promise<ExchangePosition[]> {
    throw new Error("not implemented");
  },
  createOrder(_params: CreateOrderParams): Promise<OrderResult> {
    throw new Error("not implemented");
  },
  cancelOrder(_orderId: string, _symbol: string): Promise<void> {
    throw new Error("not implemented");
  },
  editOrder(_orderId: string, _params: EditOrderParams): Promise<OrderResult> {
    throw new Error("not implemented");
  },
  fetchOrder(_orderId: string, _symbol: string): Promise<OrderResult> {
    throw new Error("not implemented");
  },
  watchOHLCV(_symbol: string, _timeframe: string, _callback: OHLCVCallback): Promise<Unsubscribe> {
    throw new Error("not implemented");
  },
  getExchangeInfo(_symbol: string): Promise<ExchangeSymbolInfo> {
    throw new Error("not implemented");
  },
};

// ---------------------------------------------------------------------------
// ExchangeAdapter structural tests
// ---------------------------------------------------------------------------

describe("core/ports — ExchangeAdapter", () => {
  it("mock adapter satisfies ExchangeAdapter contract", () => {
    expect(typeof mockAdapter.fetchOHLCV).toBe("function");
    expect(typeof mockAdapter.fetchBalance).toBe("function");
    expect(typeof mockAdapter.fetchPositions).toBe("function");
    expect(typeof mockAdapter.createOrder).toBe("function");
    expect(typeof mockAdapter.cancelOrder).toBe("function");
    expect(typeof mockAdapter.editOrder).toBe("function");
    expect(typeof mockAdapter.fetchOrder).toBe("function");
    expect(typeof mockAdapter.watchOHLCV).toBe("function");
    expect(typeof mockAdapter.getExchangeInfo).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// CreateOrderParams construction tests
// ---------------------------------------------------------------------------

describe("core/ports — CreateOrderParams", () => {
  it("market order requires symbol, side, size, and type", () => {
    const params: CreateOrderParams = {
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("0.1"),
      type: "market",
    };
    expect(params.symbol).toBe("BTCUSDT");
    expect(params.side).toBe("BUY");
    expect(params.size).toBeInstanceOf(Decimal);
    expect(params.type).toBe("market");
  });

  it("limit order accepts optional price field", () => {
    const params: CreateOrderParams = {
      symbol: "ETHUSDT",
      side: "SELL",
      size: new Decimal("1.5"),
      price: new Decimal("3500"),
      type: "limit",
    };
    expect(params.price).toBeInstanceOf(Decimal);
    expect(params.type).toBe("limit");
  });

  it("CreateOrderParams accepts optional stopLoss and reduceOnly", () => {
    const params: CreateOrderParams = {
      symbol: "BTCUSDT",
      side: "BUY",
      size: new Decimal("0.05"),
      stopLoss: new Decimal("60000"),
      type: "market",
      reduceOnly: false,
    };
    expect(params.stopLoss).toBeInstanceOf(Decimal);
    expect(params.reduceOnly).toBe(false);
  });

  it("invalid OrderSide is rejected at compile time", () => {
    // @ts-expect-error — 'LONG' is not a valid OrderSide
    const _bad: CreateOrderParams = {
      symbol: "BTCUSDT",
      side: "LONG",
      size: new Decimal("0.1"),
      type: "market",
    };
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ExchangePosition construction tests
// ---------------------------------------------------------------------------

describe("core/ports — ExchangePosition", () => {
  it("ExchangePosition has all required fields", () => {
    const pos: ExchangePosition = {
      symbol: "BTCUSDT",
      exchange: "binance",
      side: "LONG",
      size: new Decimal("0.1"),
      entryPrice: new Decimal("65000"),
      unrealizedPnl: new Decimal("50"),
      leverage: 10,
      liquidationPrice: new Decimal("58500"),
    };
    expect(pos.symbol).toBe("BTCUSDT");
    expect(pos.exchange).toBe("binance");
    expect(pos.side).toBe("LONG");
    expect(pos.size).toBeInstanceOf(Decimal);
    expect(pos.entryPrice).toBeInstanceOf(Decimal);
    expect(pos.unrealizedPnl).toBeInstanceOf(Decimal);
    expect(pos.leverage).toBe(10);
    expect(pos.liquidationPrice).toBeInstanceOf(Decimal);
  });

  it("ExchangePosition liquidationPrice can be null", () => {
    const pos: ExchangePosition = {
      symbol: "ETHUSDT",
      exchange: "okx",
      side: "SHORT",
      size: new Decimal("2"),
      entryPrice: new Decimal("3500"),
      unrealizedPnl: new Decimal("-20"),
      leverage: 5,
      liquidationPrice: null,
    };
    expect(pos.liquidationPrice).toBeNull();
  });

  it("invalid Direction value is rejected at compile time", () => {
    // @ts-expect-error — 'BUY' is not a valid Direction
    const _bad: ExchangePosition = {
      symbol: "BTCUSDT",
      exchange: "binance",
      side: "BUY",
      size: new Decimal("0.1"),
      entryPrice: new Decimal("65000"),
      unrealizedPnl: new Decimal("0"),
      leverage: 10,
      liquidationPrice: null,
    };
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// OrderResult construction tests
// ---------------------------------------------------------------------------

describe("core/ports — OrderResult", () => {
  it("OrderResult has orderId, status, filledPrice, filledSize", () => {
    const result: OrderResult = {
      orderId: "order-uuid-1",
      exchangeOrderId: "binance-123456",
      status: "FILLED",
      filledPrice: new Decimal("65010"),
      filledSize: new Decimal("0.1"),
      timestamp: new Date(),
    };
    expect(result.orderId).toBe("order-uuid-1");
    expect(result.exchangeOrderId).toBe("binance-123456");
    expect(result.status).toBe("FILLED");
    expect(result.filledPrice).toBeInstanceOf(Decimal);
    expect(result.filledSize).toBeInstanceOf(Decimal);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("OrderResult filledPrice and filledSize can be null for pending orders", () => {
    const result: OrderResult = {
      orderId: "order-uuid-2",
      exchangeOrderId: "binance-654321",
      status: "PENDING",
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    };
    expect(result.filledPrice).toBeNull();
    expect(result.filledSize).toBeNull();
    expect(result.status).toBe("PENDING");
  });
});

// ---------------------------------------------------------------------------
// ExchangeSymbolInfo construction tests
// ---------------------------------------------------------------------------

describe("core/ports — ExchangeSymbolInfo", () => {
  it("ExchangeSymbolInfo contains all required Decimal fields", () => {
    const info: ExchangeSymbolInfo = {
      symbol: "BTCUSDT",
      tickSize: new Decimal("0.1"),
      minOrderSize: new Decimal("0.001"),
      maxLeverage: 125,
      contractSize: new Decimal("1"),
    };
    expect(info.tickSize).toBeInstanceOf(Decimal);
    expect(info.minOrderSize).toBeInstanceOf(Decimal);
    expect(info.contractSize).toBeInstanceOf(Decimal);
    expect(info.maxLeverage).toBe(125);
  });
});

// ---------------------------------------------------------------------------
// ExchangeAdapterFactory tests
// ---------------------------------------------------------------------------

describe("core/ports — ExchangeAdapterFactory", () => {
  it("ExchangeAdapterFactory signature accepts Exchange and ExchangeConfig", () => {
    const config: ExchangeConfig = {
      apiKey: "test-key",
      apiSecret: "test-secret",
      sandbox: true,
    };

    const factory: ExchangeAdapterFactory = (_exchange: Exchange, _config: ExchangeConfig) => mockAdapter;

    const adapter = factory("binance", config);
    expect(typeof adapter.fetchOHLCV).toBe("function");
  });

  it("ExchangeConfig sandbox field is optional", () => {
    const config: ExchangeConfig = {
      apiKey: "key",
      apiSecret: "secret",
    };
    expect(config.sandbox).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Repository port structural tests
// ---------------------------------------------------------------------------

describe("core/ports — SymbolRepository", () => {
  it("mock SymbolRepository satisfies port contract", () => {
    const repo: SymbolRepository = {
      findAll(): Promise<SymbolEntity[]> {
        throw new Error("not implemented");
      },
      findByKey(_symbol: string, _exchange: Exchange): Promise<SymbolEntity | null> {
        throw new Error("not implemented");
      },
      upsert(_symbol: SymbolEntity): Promise<void> {
        throw new Error("not implemented");
      },
      deactivate(_symbol: string, _exchange: Exchange): Promise<void> {
        throw new Error("not implemented");
      },
    };
    expect(typeof repo.findAll).toBe("function");
    expect(typeof repo.findByKey).toBe("function");
    expect(typeof repo.upsert).toBe("function");
    expect(typeof repo.deactivate).toBe("function");
  });
});

describe("core/ports — CommonCodeRepository", () => {
  it("mock CommonCodeRepository satisfies port contract", () => {
    const repo: CommonCodeRepository = {
      findAll(): Promise<CommonCode[]> {
        throw new Error("not implemented");
      },
      findByGroup(_groupCode: string): Promise<CommonCode[]> {
        throw new Error("not implemented");
      },
      findByKey(_groupCode: string, _code: string): Promise<CommonCode | null> {
        throw new Error("not implemented");
      },
      upsert(_entry: CommonCode): Promise<void> {
        throw new Error("not implemented");
      },
    };
    expect(typeof repo.findAll).toBe("function");
    expect(typeof repo.findByGroup).toBe("function");
    expect(typeof repo.findByKey).toBe("function");
    expect(typeof repo.upsert).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// OHLCVCallback and Unsubscribe type tests
// ---------------------------------------------------------------------------

describe("core/ports — OHLCVCallback and Unsubscribe", () => {
  it("OHLCVCallback is a function accepting a Candle", () => {
    const received: Candle[] = [];
    const cb: OHLCVCallback = (candle: Candle) => {
      received.push(candle);
    };
    expect(typeof cb).toBe("function");
  });

  it("Unsubscribe is a zero-argument void function", () => {
    let called = false;
    const unsub: Unsubscribe = () => {
      called = true;
    };
    unsub();
    expect(called).toBe(true);
  });
});
