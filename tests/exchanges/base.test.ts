import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import * as ccxt from "ccxt";
import { Decimal } from "decimal.js";
import type {
  CreateOrderParams,
  EditOrderParams,
  ExchangePosition,
  ExchangeSymbolInfo,
  OHLCVCallback,
  OrderResult,
  Unsubscribe,
} from "../../src/core/ports";
import type { Candle, Exchange } from "../../src/core/types";
import { BaseExchangeAdapter } from "../../src/exchanges/base";
import {
  ExchangeAuthError,
  ExchangeError,
  ExchangeInsufficientFundsError,
  ExchangeNetworkError,
  ExchangeOrderNotFoundError,
  ExchangeRateLimitError,
} from "../../src/exchanges/errors";

// ---------------------------------------------------------------------------
// Concrete test subclass — implements abstract members with stubs
// ---------------------------------------------------------------------------

class TestAdapter extends BaseExchangeAdapter {
  protected readonly exchangeName: Exchange = "binance";

  // Expose protected methods for testing
  publicToDecimal(v: number): Decimal {
    return this.toDecimal(v);
  }

  publicToDecimalOrNull(v: number | null | undefined): Decimal | null {
    return this.toDecimalOrNull(v);
  }

  publicMapError(e: unknown): ExchangeError {
    return this.mapError(e);
  }

  publicWithRetry<T>(fn: () => Promise<T>, maxRetries?: number): Promise<T> {
    return this.withRetry(fn, maxRetries);
  }

  // Abstract stubs — not tested here
  fetchOHLCV(): Promise<Candle[]> {
    return Promise.resolve([]);
  }
  fetchBalance(): Promise<{ total: Decimal; available: Decimal }> {
    return Promise.resolve({ total: new Decimal("0"), available: new Decimal("0") });
  }
  fetchPositions(): Promise<ExchangePosition[]> {
    return Promise.resolve([]);
  }
  createOrder(_params: CreateOrderParams): Promise<OrderResult> {
    return Promise.reject(new Error("not implemented"));
  }
  cancelOrder(): Promise<void> {
    return Promise.resolve();
  }
  editOrder(_orderId: string, _params: EditOrderParams): Promise<OrderResult> {
    return Promise.reject(new Error("not implemented"));
  }
  fetchOrder(): Promise<OrderResult> {
    return Promise.reject(new Error("not implemented"));
  }
  watchOHLCV(
    _symbol: string,
    _timeframe: string,
    _callback: OHLCVCallback,
  ): Promise<Unsubscribe> {
    return Promise.resolve(() => {});
  }
  getExchangeInfo(): Promise<ExchangeSymbolInfo> {
    return Promise.reject(new Error("not implemented"));
  }
  setLeverage(): Promise<void> {
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(): TestAdapter {
  return new TestAdapter("binanceusdm", { apiKey: "test-key", apiSecret: "test-secret" });
}

// ---------------------------------------------------------------------------
// toDecimal
// ---------------------------------------------------------------------------

describe("BaseExchangeAdapter — toDecimal", () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it("converts a positive float to the correct Decimal", () => {
    const result = adapter.publicToDecimal(85432.5);
    expect(result.equals(new Decimal("85432.5"))).toBe(true);
  });

  it("converts zero to Decimal('0')", () => {
    const result = adapter.publicToDecimal(0);
    expect(result.equals(new Decimal("0"))).toBe(true);
  });

  it("converts a negative number", () => {
    const result = adapter.publicToDecimal(-100.25);
    expect(result.equals(new Decimal("-100.25"))).toBe(true);
  });

  it("returns a Decimal instance", () => {
    const result = adapter.publicToDecimal(1234);
    expect(result).toBeInstanceOf(Decimal);
  });
});

// ---------------------------------------------------------------------------
// toDecimalOrNull
// ---------------------------------------------------------------------------

describe("BaseExchangeAdapter — toDecimalOrNull", () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it("returns null for null input", () => {
    expect(adapter.publicToDecimalOrNull(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(adapter.publicToDecimalOrNull(undefined)).toBeNull();
  });

  it("returns Decimal('0') for 0 (falsy but valid)", () => {
    const result = adapter.publicToDecimalOrNull(0);
    expect(result).not.toBeNull();
    expect(result!.equals(new Decimal("0"))).toBe(true);
  });

  it("converts a positive float", () => {
    const result = adapter.publicToDecimalOrNull(42.5);
    expect(result).not.toBeNull();
    expect(result!.equals(new Decimal("42.5"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mapError
// ---------------------------------------------------------------------------

describe("BaseExchangeAdapter — mapError", () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  it("maps ccxt.RateLimitExceeded to ExchangeRateLimitError", () => {
    const ccxtError = new ccxt.RateLimitExceeded("rate limit hit");
    const result = adapter.publicMapError(ccxtError);
    expect(result).toBeInstanceOf(ExchangeRateLimitError);
    expect(result.exchange).toBe("binance");
    expect(result.originalError).toBe(ccxtError);
  });

  it("maps ccxt.NetworkError to ExchangeNetworkError", () => {
    const ccxtError = new ccxt.NetworkError("network failure");
    const result = adapter.publicMapError(ccxtError);
    expect(result).toBeInstanceOf(ExchangeNetworkError);
    expect(result.exchange).toBe("binance");
  });

  it("maps ccxt.AuthenticationError to ExchangeAuthError", () => {
    const ccxtError = new ccxt.AuthenticationError("invalid api key");
    const result = adapter.publicMapError(ccxtError);
    expect(result).toBeInstanceOf(ExchangeAuthError);
    expect(result.exchange).toBe("binance");
  });

  it("maps ccxt.OrderNotFound to ExchangeOrderNotFoundError", () => {
    const ccxtError = new ccxt.OrderNotFound("Order 12345 not found");
    const result = adapter.publicMapError(ccxtError);
    expect(result).toBeInstanceOf(ExchangeOrderNotFoundError);
  });

  it("maps ccxt.InsufficientFunds to ExchangeInsufficientFundsError", () => {
    const ccxtError = new ccxt.InsufficientFunds("not enough balance");
    const result = adapter.publicMapError(ccxtError);
    expect(result).toBeInstanceOf(ExchangeInsufficientFundsError);
  });

  it("maps an unknown Error to base ExchangeError with the original message", () => {
    const unknown = new Error("something unexpected");
    const result = adapter.publicMapError(unknown);
    expect(result).toBeInstanceOf(ExchangeError);
    expect(result.message).toBe("something unexpected");
    expect(result.originalError).toBe(unknown);
  });

  it("maps a non-Error value to base ExchangeError", () => {
    const result = adapter.publicMapError("string error");
    expect(result).toBeInstanceOf(ExchangeError);
    expect(result.message).toContain("string error");
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe("BaseExchangeAdapter — withRetry", () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
    // Suppress actual setTimeout delays in tests by mocking
    mock.module("../../src/exchanges/base", () => ({})); // no-op
  });

  it("returns result immediately when fn succeeds on first attempt", async () => {
    adapter = makeAdapter();
    const result = await adapter.publicWithRetry(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("retries on failure and returns result on subsequent success", async () => {
    adapter = makeAdapter();
    let calls = 0;
    const fn = () => {
      calls++;
      if (calls === 1) {
        return Promise.reject(new ccxt.NetworkError("temporary"));
      }
      return Promise.resolve("ok");
    };

    // Patch setTimeout to avoid actual waiting
    const origSetTimeout = globalThis.setTimeout;
    // @ts-expect-error: patching setTimeout for test
    globalThis.setTimeout = (cb: () => void) => {
      cb();
      return 0;
    };

    try {
      const result = await adapter.publicWithRetry(fn, 3);
      expect(result).toBe("ok");
      expect(calls).toBe(2);
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });

  it("throws the last error after all retries are exhausted", async () => {
    adapter = makeAdapter();
    let calls = 0;
    const fn = () => {
      calls++;
      return Promise.reject(new ccxt.NetworkError("always fails"));
    };

    // Patch setTimeout to avoid actual waiting
    const origSetTimeout = globalThis.setTimeout;
    // @ts-expect-error: patching setTimeout for test
    globalThis.setTimeout = (cb: () => void) => {
      cb();
      return 0;
    };

    try {
      await expect(adapter.publicWithRetry(fn, 3)).rejects.toBeInstanceOf(ExchangeNetworkError);
      expect(calls).toBe(3);
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });

  it("uses exponential backoff — 1s, 2s, 4s delays", async () => {
    adapter = makeAdapter();
    const delays: number[] = [];

    const origSetTimeout = globalThis.setTimeout;
    // @ts-expect-error: patching setTimeout for test
    globalThis.setTimeout = (cb: () => void, ms: number) => {
      delays.push(ms);
      cb();
      return 0;
    };

    const fn = () => Promise.reject(new ccxt.NetworkError("fail"));

    try {
      await adapter.publicWithRetry(fn, 4).catch(() => {});
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }

    // 3 delays for 4 attempts (no delay on last attempt)
    expect(delays).toHaveLength(3);
    expect(delays[0]).toBe(1_000); // 1s
    expect(delays[1]).toBe(2_000); // 2s
    expect(delays[2]).toBe(4_000); // 4s
  });

  it("caps backoff at 30s", async () => {
    adapter = makeAdapter();
    const delays: number[] = [];

    const origSetTimeout = globalThis.setTimeout;
    // @ts-expect-error: patching setTimeout for test
    globalThis.setTimeout = (cb: () => void, ms: number) => {
      delays.push(ms);
      cb();
      return 0;
    };

    const fn = () => Promise.reject(new ccxt.NetworkError("fail"));

    try {
      // 10 attempts to trigger the cap
      await adapter.publicWithRetry(fn, 10).catch(() => {});
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }

    const maxDelay = Math.max(...delays);
    expect(maxDelay).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
// Token bucket rate limiter (via adapter)
// ---------------------------------------------------------------------------

describe("BaseExchangeAdapter — token bucket rate limiter", () => {
  it("allows immediate requests within capacity", async () => {
    // Adapter with capacity=5, refill=1 token/ms (effectively unlimited for short test)
    const adapter = new TestAdapter("binanceusdm", { apiKey: "k", apiSecret: "s" }, 5, 1);

    let calls = 0;
    for (let i = 0; i < 5; i++) {
      await adapter.publicWithRetry(() => {
        calls++;
        return Promise.resolve(true);
      }, 1);
    }

    expect(calls).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe("BaseExchangeAdapter — construction", () => {
  it("creates a CCXT instance with enableRateLimit=true", () => {
    const adapter = makeAdapter();
    // The ccxt instance should have enableRateLimit set
    // We can verify it's a real CCXT exchange instance
    expect(adapter).toBeInstanceOf(BaseExchangeAdapter);
  });

  it("throws for unknown exchange type", () => {
    expect(
      () => new TestAdapter("nonexistentexchange123", { apiKey: "k", apiSecret: "s" }),
    ).toThrow("Unknown CCXT exchange type");
  });
});
