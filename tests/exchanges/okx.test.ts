import { describe, expect, it } from "bun:test";
import { Decimal } from "decimal.js";
import { OkxAdapter } from "../../src/exchanges/okx";
import { ExchangeNotImplementedError } from "../../src/exchanges/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(): OkxAdapter {
  return new OkxAdapter({ apiKey: "test-key", apiSecret: "test-secret" });
}

// ---------------------------------------------------------------------------
// Instantiation
// ---------------------------------------------------------------------------

describe("OkxAdapter — instantiation", () => {
  it("can be instantiated with valid config", () => {
    const adapter = makeAdapter();
    expect(adapter).toBeInstanceOf(OkxAdapter);
  });

  it("constructs without error in sandbox mode", () => {
    const adapter = new OkxAdapter({
      apiKey: "test-key",
      apiSecret: "test-secret",
      sandbox: true,
    });
    expect(adapter).toBeInstanceOf(OkxAdapter);
  });

  it("creates a CCXT okx instance", () => {
    const adapter = makeAdapter();
    // Access the protected ccxt property to verify the exchange type
    const ccxtInstance = (adapter as unknown as { ccxt: { id: string } }).ccxt;
    expect(ccxtInstance.id).toBe("okx");
  });
});

// ---------------------------------------------------------------------------
// Not-implemented stubs — every method must throw ExchangeNotImplementedError
// ---------------------------------------------------------------------------

describe("OkxAdapter — fetchBalance throws ExchangeNotImplementedError", () => {
  it("throws with exchange='okx' and method='fetchBalance'", () => {
    const adapter = makeAdapter();
    expect(() => adapter.fetchBalance()).toThrow(ExchangeNotImplementedError);
  });

  it("error message contains 'okx' and 'fetchBalance'", () => {
    const adapter = makeAdapter();
    try {
      adapter.fetchBalance();
      expect(true).toBe(false); // should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(ExchangeNotImplementedError);
      expect((err as ExchangeNotImplementedError).message).toContain("okx");
      expect((err as ExchangeNotImplementedError).message).toContain("fetchBalance");
    }
  });
});

describe("OkxAdapter — createOrder throws ExchangeNotImplementedError", () => {
  it("throws with exchange='okx' and method='createOrder'", () => {
    const adapter = makeAdapter();
    expect(() =>
      adapter.createOrder({
        symbol: "BTC-USDT-SWAP",
        side: "BUY",
        size: new Decimal("1"),
        type: "market",
      }),
    ).toThrow(ExchangeNotImplementedError);
  });

  it("error message contains 'okx' and 'createOrder'", () => {
    const adapter = makeAdapter();
    try {
      adapter.createOrder({
        symbol: "BTC-USDT-SWAP",
        side: "BUY",
        size: new Decimal("1"),
        type: "market",
      });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as ExchangeNotImplementedError).message).toContain("okx");
      expect((err as ExchangeNotImplementedError).message).toContain("createOrder");
    }
  });
});

describe("OkxAdapter — watchOHLCV throws ExchangeNotImplementedError", () => {
  it("throws with exchange='okx' and method='watchOHLCV'", () => {
    const adapter = makeAdapter();
    expect(() => adapter.watchOHLCV("BTC-USDT-SWAP", "5m", () => {})).toThrow(
      ExchangeNotImplementedError,
    );
  });

  it("error message contains 'okx' and 'watchOHLCV'", () => {
    const adapter = makeAdapter();
    try {
      adapter.watchOHLCV("BTC-USDT-SWAP", "5m", () => {});
      expect(true).toBe(false);
    } catch (err) {
      expect((err as ExchangeNotImplementedError).message).toContain("okx");
      expect((err as ExchangeNotImplementedError).message).toContain("watchOHLCV");
    }
  });
});

describe("OkxAdapter — setLeverage throws ExchangeNotImplementedError", () => {
  it("throws with exchange='okx' and method='setLeverage'", () => {
    const adapter = makeAdapter();
    expect(() => adapter.setLeverage(10, "BTC-USDT-SWAP")).toThrow(
      ExchangeNotImplementedError,
    );
  });

  it("error message contains 'okx' and 'setLeverage'", () => {
    const adapter = makeAdapter();
    try {
      adapter.setLeverage(10, "BTC-USDT-SWAP");
      expect(true).toBe(false);
    } catch (err) {
      expect((err as ExchangeNotImplementedError).message).toContain("okx");
      expect((err as ExchangeNotImplementedError).message).toContain("setLeverage");
    }
  });
});

describe("OkxAdapter — remaining stubs throw ExchangeNotImplementedError", () => {
  let adapter: OkxAdapter;

  it("fetchOHLCV throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.fetchOHLCV("BTC-USDT-SWAP", "5m")).toThrow(
      ExchangeNotImplementedError,
    );
  });

  it("fetchPositions throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.fetchPositions()).toThrow(ExchangeNotImplementedError);
  });

  it("cancelOrder throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.cancelOrder("order-1", "BTC-USDT-SWAP")).toThrow(
      ExchangeNotImplementedError,
    );
  });

  it("editOrder throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.editOrder("order-1", {})).toThrow(ExchangeNotImplementedError);
  });

  it("fetchOrder throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.fetchOrder("order-1", "BTC-USDT-SWAP")).toThrow(
      ExchangeNotImplementedError,
    );
  });

  it("getExchangeInfo throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.getExchangeInfo("BTC-USDT-SWAP")).toThrow(
      ExchangeNotImplementedError,
    );
  });
});

// ---------------------------------------------------------------------------
// Error properties
// ---------------------------------------------------------------------------

describe("OkxAdapter — ExchangeNotImplementedError properties", () => {
  it("error.exchange is 'okx'", () => {
    const adapter = makeAdapter();
    try {
      adapter.fetchBalance();
      expect(true).toBe(false);
    } catch (err) {
      expect((err as ExchangeNotImplementedError).exchange).toBe("okx");
    }
  });

  it("error.name is 'ExchangeNotImplementedError'", () => {
    const adapter = makeAdapter();
    try {
      adapter.createOrder({
        symbol: "BTC-USDT-SWAP",
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
