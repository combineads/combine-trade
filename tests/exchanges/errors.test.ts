import { describe, expect, it } from "bun:test";
import {
  ExchangeAuthError,
  ExchangeError,
  ExchangeInsufficientFundsError,
  ExchangeNetworkError,
  ExchangeNotImplementedError,
  ExchangeOrderNotFoundError,
  ExchangeRateLimitError,
} from "../../src/exchanges/errors";

// ---------------------------------------------------------------------------
// ExchangeError (base)
// ---------------------------------------------------------------------------

describe("ExchangeError", () => {
  it("sets name, message, exchange, and originalError", () => {
    const original = new Error("original");
    const err = new ExchangeError("something went wrong", "binance", original);

    expect(err.name).toBe("ExchangeError");
    expect(err.message).toBe("something went wrong");
    expect(err.exchange).toBe("binance");
    expect(err.originalError).toBe(original);
  });

  it("accepts undefined originalError", () => {
    const err = new ExchangeError("msg", "okx");
    expect(err.originalError).toBeUndefined();
  });

  it("is an instance of Error", () => {
    const err = new ExchangeError("msg", "binance");
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// ExchangeRateLimitError
// ---------------------------------------------------------------------------

describe("ExchangeRateLimitError", () => {
  it("has correct name and exchange", () => {
    const err = new ExchangeRateLimitError("binance");
    expect(err.name).toBe("ExchangeRateLimitError");
    expect(err.exchange).toBe("binance");
  });

  it("is an instance of ExchangeError", () => {
    expect(new ExchangeRateLimitError("binance")).toBeInstanceOf(ExchangeError);
  });

  it("stores originalError", () => {
    const original = new Error("rate limit");
    const err = new ExchangeRateLimitError("binance", original);
    expect(err.originalError).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// ExchangeNetworkError
// ---------------------------------------------------------------------------

describe("ExchangeNetworkError", () => {
  it("has correct name and exchange", () => {
    const err = new ExchangeNetworkError("okx");
    expect(err.name).toBe("ExchangeNetworkError");
    expect(err.exchange).toBe("okx");
  });

  it("is an instance of ExchangeError", () => {
    expect(new ExchangeNetworkError("okx")).toBeInstanceOf(ExchangeError);
  });
});

// ---------------------------------------------------------------------------
// ExchangeAuthError
// ---------------------------------------------------------------------------

describe("ExchangeAuthError", () => {
  it("has correct name and exchange", () => {
    const err = new ExchangeAuthError("bitget");
    expect(err.name).toBe("ExchangeAuthError");
    expect(err.exchange).toBe("bitget");
  });

  it("is an instance of ExchangeError", () => {
    expect(new ExchangeAuthError("bitget")).toBeInstanceOf(ExchangeError);
  });
});

// ---------------------------------------------------------------------------
// ExchangeOrderNotFoundError
// ---------------------------------------------------------------------------

describe("ExchangeOrderNotFoundError", () => {
  it("has correct name, exchange, and orderId", () => {
    const err = new ExchangeOrderNotFoundError("binance", "order-123");
    expect(err.name).toBe("ExchangeOrderNotFoundError");
    expect(err.exchange).toBe("binance");
    expect(err.orderId).toBe("order-123");
    expect(err.message).toContain("order-123");
    expect(err.message).toContain("binance");
  });

  it("is an instance of ExchangeError", () => {
    expect(new ExchangeOrderNotFoundError("binance", "x")).toBeInstanceOf(ExchangeError);
  });
});

// ---------------------------------------------------------------------------
// ExchangeInsufficientFundsError
// ---------------------------------------------------------------------------

describe("ExchangeInsufficientFundsError", () => {
  it("has correct name and exchange", () => {
    const err = new ExchangeInsufficientFundsError("mexc");
    expect(err.name).toBe("ExchangeInsufficientFundsError");
    expect(err.exchange).toBe("mexc");
  });

  it("is an instance of ExchangeError", () => {
    expect(new ExchangeInsufficientFundsError("mexc")).toBeInstanceOf(ExchangeError);
  });
});

// ---------------------------------------------------------------------------
// ExchangeNotImplementedError
// ---------------------------------------------------------------------------

describe("ExchangeNotImplementedError", () => {
  it("has correct name, exchange, and includes method name in message", () => {
    const err = new ExchangeNotImplementedError("binance", "editOrder");
    expect(err.name).toBe("ExchangeNotImplementedError");
    expect(err.exchange).toBe("binance");
    expect(err.message).toContain("editOrder");
    expect(err.message).toContain("binance");
  });

  it("is an instance of ExchangeError", () => {
    expect(new ExchangeNotImplementedError("binance", "method")).toBeInstanceOf(ExchangeError);
  });
});
