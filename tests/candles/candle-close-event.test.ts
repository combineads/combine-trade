import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import Decimal from "decimal.js";
import { CandleCollector } from "../../src/candles/collector";
import type { OHLCVCallback, Unsubscribe } from "../../src/core/ports";
import type { Candle, Timeframe } from "../../src/core/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    id: "test-id-001",
    symbol: "BTCUSDT",
    exchange: "binance",
    timeframe: "5M",
    open_time: new Date("2024-01-01T00:00:00Z"),
    open: new Decimal("50000"),
    high: new Decimal("50100"),
    low: new Decimal("49900"),
    close: new Decimal("50050"),
    volume: new Decimal("100.5"),
    is_closed: true,
    created_at: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

type StoredCallback = {
  symbol: string;
  timeframe: string;
  callback: OHLCVCallback;
};

function createMockAdapter(): {
  adapter: Parameters<CandleCollector["start"]>[2];
  callbacks: StoredCallback[];
} {
  const callbacks: StoredCallback[] = [];

  const adapter = {
    watchOHLCV: mock(async (symbol: string, timeframe: string, callback: OHLCVCallback) => {
      callbacks.push({ symbol, timeframe, callback });
      const unsub = mock(() => {});
      return unsub as unknown as Unsubscribe;
    }),
    fetchOHLCV: mock(async () => []),
    fetchBalance: mock(async () => ({
      total: new Decimal("0"),
      available: new Decimal("0"),
    })),
    fetchPositions: mock(async () => []),
    createOrder: mock(async () => ({
      orderId: "",
      exchangeOrderId: "",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    })),
    cancelOrder: mock(async () => {}),
    editOrder: mock(async () => ({
      orderId: "",
      exchangeOrderId: "",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    })),
    fetchOrder: mock(async () => ({
      orderId: "",
      exchangeOrderId: "",
      status: "FILLED" as const,
      filledPrice: null,
      filledSize: null,
      timestamp: new Date(),
    })),
    getExchangeInfo: mock(async () => ({
      symbol: "",
      tickSize: new Decimal("0.01"),
      minOrderSize: new Decimal("0.001"),
      maxLeverage: 125,
      contractSize: new Decimal("1"),
    })),
    setLeverage: mock(async () => {}),
  } as unknown as Parameters<CandleCollector["start"]>[2];

  return { adapter, callbacks };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("candle-close-event", () => {
  let collector: CandleCollector;

  beforeEach(() => {
    collector = new CandleCollector();
  });

  afterEach(async () => {
    await collector.stop();
  });

  it("is_closed=true candle triggers registered callback with (candle, timeframe)", async () => {
    const { adapter, callbacks } = createMockAdapter();
    const closeCb = mock(() => {});

    collector.onCandleClose(closeCb);
    await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);

    const candle = makeCandle({ is_closed: true });
    callbacks[0]!.callback(candle);

    expect(closeCb).toHaveBeenCalledTimes(1);
    expect(closeCb).toHaveBeenCalledWith(candle, "5M");
  });

  it("is_closed=false candle does NOT trigger callback", async () => {
    const { adapter, callbacks } = createMockAdapter();
    const closeCb = mock(() => {});

    collector.onCandleClose(closeCb);
    await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);

    const candle = makeCandle({ is_closed: false });
    callbacks[0]!.callback(candle);

    expect(closeCb).toHaveBeenCalledTimes(0);
  });

  it("same closed candle received twice triggers callback only once (dedup)", async () => {
    const { adapter, callbacks } = createMockAdapter();
    const closeCb = mock(() => {});

    collector.onCandleClose(closeCb);
    await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);

    const candle = makeCandle({ is_closed: true });
    callbacks[0]!.callback(candle);
    callbacks[0]!.callback(candle);

    expect(closeCb).toHaveBeenCalledTimes(1);
  });

  it("callback that throws does not stop collector or other callbacks", async () => {
    const { adapter, callbacks } = createMockAdapter();
    const errorCb = mock(() => {
      throw new Error("boom");
    });
    const safeCb = mock(() => {});

    collector.onCandleClose(errorCb);
    collector.onCandleClose(safeCb);
    await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);

    const candle = makeCandle({ is_closed: true });
    callbacks[0]!.callback(candle);

    expect(errorCb).toHaveBeenCalledTimes(1);
    expect(safeCb).toHaveBeenCalledTimes(1);

    // Collector still alive — send another candle with different open_time
    const candle2 = makeCandle({
      is_closed: true,
      open_time: new Date("2024-01-01T00:05:00Z"),
    });
    callbacks[0]!.callback(candle2);

    expect(safeCb).toHaveBeenCalledTimes(2);
  });

  it("2 callbacks registered — both called on close", async () => {
    const { adapter, callbacks } = createMockAdapter();
    const cb1 = mock(() => {});
    const cb2 = mock(() => {});

    collector.onCandleClose(cb1);
    collector.onCandleClose(cb2);
    await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);

    const candle = makeCandle({ is_closed: true });
    callbacks[0]!.callback(candle);

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it("unsubscribed callback is NOT called after unsubscribe", async () => {
    const { adapter, callbacks } = createMockAdapter();
    const closeCb = mock(() => {});

    const unsub = collector.onCandleClose(closeCb);
    await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);

    // Unsubscribe before any candle
    unsub();

    const candle = makeCandle({ is_closed: true });
    callbacks[0]!.callback(candle);

    expect(closeCb).toHaveBeenCalledTimes(0);
  });

  it("4 different timeframes close — each triggers independent callback", async () => {
    const { adapter, callbacks } = createMockAdapter();
    const closeCb = mock(() => {});

    collector.onCandleClose(closeCb);

    const timeframes: Timeframe[] = ["1D", "1H", "5M", "1M"];
    await collector.start(["BTCUSDT"], timeframes, adapter);

    expect(callbacks).toHaveLength(4);

    // Fire a closed candle on each timeframe subscription
    for (let i = 0; i < 4; i++) {
      const candle = makeCandle({
        is_closed: true,
        timeframe: timeframes[i]!,
        open_time: new Date(`2024-01-01T0${i}:00:00Z`),
      });
      callbacks[i]!.callback(candle);
    }

    expect(closeCb).toHaveBeenCalledTimes(4);

    // Verify each call received the correct timeframe
    expect((closeCb.mock.calls[0]! as unknown[])[1]).toBe("1D");
    expect((closeCb.mock.calls[1]! as unknown[])[1]).toBe("1H");
    expect((closeCb.mock.calls[2]! as unknown[])[1]).toBe("5M");
    expect((closeCb.mock.calls[3]! as unknown[])[1]).toBe("1M");
  });

  it("onCandleClose returns working unsubscribe function", async () => {
    const { adapter, callbacks } = createMockAdapter();
    const closeCb = mock(() => {});

    const unsub = collector.onCandleClose(closeCb);
    await collector.start(["BTCUSDT"], ["5M" as Timeframe], adapter);

    // First candle — callback fires
    const candle1 = makeCandle({
      is_closed: true,
      open_time: new Date("2024-01-01T00:00:00Z"),
    });
    callbacks[0]!.callback(candle1);
    expect(closeCb).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsub();

    // Second candle — callback should NOT fire
    const candle2 = makeCandle({
      is_closed: true,
      open_time: new Date("2024-01-01T00:05:00Z"),
    });
    callbacks[0]!.callback(candle2);
    expect(closeCb).toHaveBeenCalledTimes(1);
  });
});
