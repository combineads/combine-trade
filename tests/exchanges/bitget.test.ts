import { describe, expect, it } from "bun:test";
import { Decimal } from "decimal.js";
import { BitgetAdapter } from "../../src/exchanges/bitget";
import { ExchangeNotImplementedError } from "../../src/exchanges/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(): BitgetAdapter {
  return new BitgetAdapter({ apiKey: "test-key", apiSecret: "test-secret" });
}

// ---------------------------------------------------------------------------
// Instantiation
// ---------------------------------------------------------------------------

describe("BitgetAdapter — instantiation", () => {
  it("can be instantiated with valid config", () => {
    const adapter = makeAdapter();
    expect(adapter).toBeInstanceOf(BitgetAdapter);
  });

  it("constructs without error in sandbox mode", () => {
    const adapter = new BitgetAdapter({
      apiKey: "test-key",
      apiSecret: "test-secret",
      sandbox: true,
    });
    expect(adapter).toBeInstanceOf(BitgetAdapter);
  });

  it("creates a CCXT bitget instance", () => {
    const adapter = makeAdapter();
    // Access the protected ccxt property to verify the exchange type
    const ccxtInstance = (adapter as unknown as { ccxt: { id: string } }).ccxt;
    expect(ccxtInstance.id).toBe("bitget");
  });
});

// ---------------------------------------------------------------------------
// Not-implemented stubs — every method must throw ExchangeNotImplementedError
// ---------------------------------------------------------------------------

describe("BitgetAdapter — fetchBalance throws ExchangeNotImplementedError", () => {
  it("throws with exchange='bitget' and method='fetchBalance'", () => {
    const adapter = makeAdapter();
    expect(() => adapter.fetchBalance()).toThrow(ExchangeNotImplementedError);
  });

  it("error message contains 'bitget' and 'fetchBalance'", () => {
    const adapter = makeAdapter();
    try {
      adapter.fetchBalance();
      expect(true).toBe(false); // should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(ExchangeNotImplementedError);
      expect((err as ExchangeNotImplementedError).message).toContain("bitget");
      expect((err as ExchangeNotImplementedError).message).toContain("fetchBalance");
    }
  });
});

describe("BitgetAdapter — createOrder throws ExchangeNotImplementedError", () => {
  it("throws with exchange='bitget' and method='createOrder'", () => {
    const adapter = makeAdapter();
    expect(() =>
      adapter.createOrder({
        symbol: "BTCUSDT",
        side: "BUY",
        size: new Decimal("1"),
        type: "market",
      }),
    ).toThrow(ExchangeNotImplementedError);
  });

  it("error message contains 'bitget' and 'createOrder'", () => {
    const adapter = makeAdapter();
    try {
      adapter.createOrder({
        symbol: "BTCUSDT",
        side: "BUY",
        size: new Decimal("1"),
        type: "market",
      });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as ExchangeNotImplementedError).message).toContain("bitget");
      expect((err as ExchangeNotImplementedError).message).toContain("createOrder");
    }
  });
});

describe("BitgetAdapter — watchOHLCV throws ExchangeNotImplementedError", () => {
  it("throws with exchange='bitget' and method='watchOHLCV'", () => {
    const adapter = makeAdapter();
    expect(() => adapter.watchOHLCV("BTCUSDT", "5m", () => {})).toThrow(
      ExchangeNotImplementedError,
    );
  });

  it("error message contains 'bitget' and 'watchOHLCV'", () => {
    const adapter = makeAdapter();
    try {
      adapter.watchOHLCV("BTCUSDT", "5m", () => {});
      expect(true).toBe(false);
    } catch (err) {
      expect((err as ExchangeNotImplementedError).message).toContain("bitget");
      expect((err as ExchangeNotImplementedError).message).toContain("watchOHLCV");
    }
  });
});

describe("BitgetAdapter — setLeverage throws ExchangeNotImplementedError", () => {
  it("throws with exchange='bitget' and method='setLeverage'", () => {
    const adapter = makeAdapter();
    expect(() => adapter.setLeverage(10, "BTCUSDT")).toThrow(ExchangeNotImplementedError);
  });

  it("error message contains 'bitget' and 'setLeverage'", () => {
    const adapter = makeAdapter();
    try {
      adapter.setLeverage(10, "BTCUSDT");
      expect(true).toBe(false);
    } catch (err) {
      expect((err as ExchangeNotImplementedError).message).toContain("bitget");
      expect((err as ExchangeNotImplementedError).message).toContain("setLeverage");
    }
  });
});

describe("BitgetAdapter — remaining stubs throw ExchangeNotImplementedError", () => {
  let adapter: BitgetAdapter;

  it("fetchOHLCV throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.fetchOHLCV("BTCUSDT", "5m")).toThrow(ExchangeNotImplementedError);
  });

  it("fetchPositions throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.fetchPositions()).toThrow(ExchangeNotImplementedError);
  });

  it("cancelOrder throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.cancelOrder("order-1", "BTCUSDT")).toThrow(ExchangeNotImplementedError);
  });

  it("editOrder throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.editOrder("order-1", {})).toThrow(ExchangeNotImplementedError);
  });

  it("fetchOrder throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.fetchOrder("order-1", "BTCUSDT")).toThrow(ExchangeNotImplementedError);
  });

  it("getExchangeInfo throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.getExchangeInfo("BTCUSDT")).toThrow(ExchangeNotImplementedError);
  });
});

// ---------------------------------------------------------------------------
// Error properties
// ---------------------------------------------------------------------------

describe("BitgetAdapter — ExchangeNotImplementedError properties", () => {
  it("error.exchange is 'bitget'", () => {
    const adapter = makeAdapter();
    try {
      adapter.fetchBalance();
      expect(true).toBe(false);
    } catch (err) {
      expect((err as ExchangeNotImplementedError).exchange).toBe("bitget");
    }
  });

  it("error.name is 'ExchangeNotImplementedError'", () => {
    const adapter = makeAdapter();
    try {
      adapter.createOrder({
        symbol: "BTCUSDT",
        side: "BUY",
        size: new Decimal("1"),
        type: "market",
      });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).name).toBe("ExchangeNotImplementedError");
    }
  });
});
