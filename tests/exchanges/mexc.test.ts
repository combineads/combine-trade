import { describe, expect, it } from "bun:test";
import { Decimal } from "decimal.js";
import { MexcAdapter } from "../../src/exchanges/mexc";
import { ExchangeNotImplementedError } from "../../src/exchanges/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(): MexcAdapter {
  return new MexcAdapter({ apiKey: "test-key", apiSecret: "test-secret" });
}

// ---------------------------------------------------------------------------
// Instantiation
// ---------------------------------------------------------------------------

describe("MexcAdapter — instantiation", () => {
  it("can be instantiated with valid config", () => {
    const adapter = makeAdapter();
    expect(adapter).toBeInstanceOf(MexcAdapter);
  });

  it("throws when sandbox mode is requested (MEXC has no sandbox URL)", () => {
    // MEXC does not provide a sandbox/testnet URL via CCXT.
    // Attempting to construct in sandbox mode throws ccxt.NotSupported.
    expect(
      () =>
        new MexcAdapter({
          apiKey: "test-key",
          apiSecret: "test-secret",
          sandbox: true,
        }),
    ).toThrow();
  });

  it("creates a CCXT mexc instance", () => {
    const adapter = makeAdapter();
    // Access the protected ccxt property to verify the exchange type
    const ccxtInstance = (adapter as unknown as { ccxt: { id: string } }).ccxt;
    expect(ccxtInstance.id).toBe("mexc");
  });
});

// ---------------------------------------------------------------------------
// Not-implemented stubs — every method must throw ExchangeNotImplementedError
// ---------------------------------------------------------------------------

describe("MexcAdapter — fetchBalance throws ExchangeNotImplementedError", () => {
  it("throws with exchange='mexc' and method='fetchBalance'", () => {
    const adapter = makeAdapter();
    expect(() => adapter.fetchBalance()).toThrow(ExchangeNotImplementedError);
  });

  it("error message contains 'mexc' and 'fetchBalance'", () => {
    const adapter = makeAdapter();
    try {
      adapter.fetchBalance();
      expect(true).toBe(false); // should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(ExchangeNotImplementedError);
      expect((err as ExchangeNotImplementedError).message).toContain("mexc");
      expect((err as ExchangeNotImplementedError).message).toContain("fetchBalance");
    }
  });
});

describe("MexcAdapter — createOrder throws ExchangeNotImplementedError", () => {
  it("throws with exchange='mexc' and method='createOrder'", () => {
    const adapter = makeAdapter();
    expect(() =>
      adapter.createOrder({
        symbol: "BTC_USDT",
        side: "BUY",
        size: new Decimal("1"),
        type: "market",
      }),
    ).toThrow(ExchangeNotImplementedError);
  });

  it("error message contains 'mexc' and 'createOrder'", () => {
    const adapter = makeAdapter();
    try {
      adapter.createOrder({
        symbol: "BTC_USDT",
        side: "BUY",
        size: new Decimal("1"),
        type: "market",
      });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as ExchangeNotImplementedError).message).toContain("mexc");
      expect((err as ExchangeNotImplementedError).message).toContain("createOrder");
    }
  });
});

// editOrder is the critical method for MEXC — it requires the 2-step SL flow
// per ADR-005 when native editOrder is not supported by MEXC Futures.
describe("MexcAdapter — editOrder throws ExchangeNotImplementedError", () => {
  it("throws with exchange='mexc' and method='editOrder'", () => {
    const adapter = makeAdapter();
    expect(() => adapter.editOrder("order-1", {})).toThrow(ExchangeNotImplementedError);
  });

  it("error message contains 'mexc' and 'editOrder'", () => {
    const adapter = makeAdapter();
    try {
      adapter.editOrder("order-1", {});
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(ExchangeNotImplementedError);
      expect((err as ExchangeNotImplementedError).message).toContain("mexc");
      expect((err as ExchangeNotImplementedError).message).toContain("editOrder");
    }
  });
});

describe("MexcAdapter — watchOHLCV throws ExchangeNotImplementedError", () => {
  it("throws with exchange='mexc' and method='watchOHLCV'", () => {
    const adapter = makeAdapter();
    expect(() => adapter.watchOHLCV("BTC_USDT", "5m", () => {})).toThrow(
      ExchangeNotImplementedError,
    );
  });

  it("error message contains 'mexc' and 'watchOHLCV'", () => {
    const adapter = makeAdapter();
    try {
      adapter.watchOHLCV("BTC_USDT", "5m", () => {});
      expect(true).toBe(false);
    } catch (err) {
      expect((err as ExchangeNotImplementedError).message).toContain("mexc");
      expect((err as ExchangeNotImplementedError).message).toContain("watchOHLCV");
    }
  });
});

describe("MexcAdapter — setLeverage throws ExchangeNotImplementedError", () => {
  it("throws with exchange='mexc' and method='setLeverage'", () => {
    const adapter = makeAdapter();
    expect(() => adapter.setLeverage(10, "BTC_USDT")).toThrow(ExchangeNotImplementedError);
  });

  it("error message contains 'mexc' and 'setLeverage'", () => {
    const adapter = makeAdapter();
    try {
      adapter.setLeverage(10, "BTC_USDT");
      expect(true).toBe(false);
    } catch (err) {
      expect((err as ExchangeNotImplementedError).message).toContain("mexc");
      expect((err as ExchangeNotImplementedError).message).toContain("setLeverage");
    }
  });
});

describe("MexcAdapter — remaining stubs throw ExchangeNotImplementedError", () => {
  let adapter: MexcAdapter;

  it("fetchOHLCV throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.fetchOHLCV("BTC_USDT", "5m")).toThrow(ExchangeNotImplementedError);
  });

  it("fetchPositions throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.fetchPositions()).toThrow(ExchangeNotImplementedError);
  });

  it("cancelOrder throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.cancelOrder("order-1", "BTC_USDT")).toThrow(ExchangeNotImplementedError);
  });

  it("fetchOrder throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.fetchOrder("order-1", "BTC_USDT")).toThrow(ExchangeNotImplementedError);
  });

  it("getExchangeInfo throws ExchangeNotImplementedError", () => {
    adapter = makeAdapter();
    expect(() => adapter.getExchangeInfo("BTC_USDT")).toThrow(ExchangeNotImplementedError);
  });
});

// ---------------------------------------------------------------------------
// Error properties
// ---------------------------------------------------------------------------

describe("MexcAdapter — ExchangeNotImplementedError properties", () => {
  it("error.exchange is 'mexc'", () => {
    const adapter = makeAdapter();
    try {
      adapter.fetchBalance();
      expect(true).toBe(false);
    } catch (err) {
      expect((err as ExchangeNotImplementedError).exchange).toBe("mexc");
    }
  });

  it("error.name is 'ExchangeNotImplementedError'", () => {
    const adapter = makeAdapter();
    try {
      adapter.createOrder({
        symbol: "BTC_USDT",
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
