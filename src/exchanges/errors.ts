// ---------------------------------------------------------------------------
// Exchange domain error types
// ---------------------------------------------------------------------------

/**
 * Base error for all exchange-related failures.
 * Maps CCXT errors to domain-level typed exceptions.
 */
export class ExchangeError extends Error {
  readonly exchange: string;
  readonly originalError: unknown;

  constructor(message: string, exchange: string, originalError?: unknown) {
    super(message);
    this.name = "ExchangeError";
    this.exchange = exchange;
    this.originalError = originalError;
  }
}

/**
 * Thrown when the exchange rate limit is exceeded.
 * Triggers exponential backoff in withRetry().
 */
export class ExchangeRateLimitError extends ExchangeError {
  constructor(exchange: string, originalError?: unknown) {
    super(`Rate limit exceeded on ${exchange}`, exchange, originalError);
    this.name = "ExchangeRateLimitError";
  }
}

/**
 * Thrown on network-level failures (timeouts, connection refused, etc.).
 */
export class ExchangeNetworkError extends ExchangeError {
  constructor(exchange: string, originalError?: unknown) {
    super(`Network error on ${exchange}`, exchange, originalError);
    this.name = "ExchangeNetworkError";
  }
}

/**
 * Thrown when API key or secret is invalid or missing.
 */
export class ExchangeAuthError extends ExchangeError {
  constructor(exchange: string, originalError?: unknown) {
    super(`Authentication failed on ${exchange}`, exchange, originalError);
    this.name = "ExchangeAuthError";
  }
}

/**
 * Thrown when the requested order does not exist on the exchange.
 */
export class ExchangeOrderNotFoundError extends ExchangeError {
  readonly orderId: string;

  constructor(exchange: string, orderId: string, originalError?: unknown) {
    super(`Order ${orderId} not found on ${exchange}`, exchange, originalError);
    this.name = "ExchangeOrderNotFoundError";
    this.orderId = orderId;
  }
}

/**
 * Thrown when account balance is insufficient to place the order.
 */
export class ExchangeInsufficientFundsError extends ExchangeError {
  constructor(exchange: string, originalError?: unknown) {
    super(`Insufficient funds on ${exchange}`, exchange, originalError);
    this.name = "ExchangeInsufficientFundsError";
  }
}

/**
 * Thrown when a requested operation is not supported by the exchange adapter.
 */
export class ExchangeNotImplementedError extends ExchangeError {
  constructor(exchange: string, method: string, originalError?: unknown) {
    super(`Method ${method} not implemented for ${exchange}`, exchange, originalError);
    this.name = "ExchangeNotImplementedError";
  }
}
