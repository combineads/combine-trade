import * as ccxt from "ccxt";
import { Decimal } from "@/core/decimal";
import type {
  CreateOrderParams,
  EditOrderParams,
  ExchangeAdapter,
  ExchangeConfig,
  ExchangePosition,
  ExchangeSymbolInfo,
  OHLCVCallback,
  OrderResult,
  Unsubscribe,
} from "@/core/ports";
import type { Candle, Exchange } from "@/core/types";
import {
  ExchangeAuthError,
  ExchangeError,
  ExchangeInsufficientFundsError,
  ExchangeNetworkError,
  ExchangeNotImplementedError,
  ExchangeOrderNotFoundError,
  ExchangeRateLimitError,
} from "./errors";

// ---------------------------------------------------------------------------
// Token bucket rate limiter
// ---------------------------------------------------------------------------

/**
 * Simple token bucket rate limiter.
 * Tokens refill continuously up to the bucket capacity.
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    /** Tokens added per millisecond */
    private readonly refillRatePerMs: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Attempt to consume one token. Returns the number of milliseconds to wait
   * before the token becomes available (0 means immediate).
   */
  tryConsume(): number {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRatePerMs);
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }

    // Time until the next token is available
    return Math.ceil((1 - this.tokens) / this.refillRatePerMs);
  }

  /**
   * Wait until a token is available, then consume it.
   */
  async acquire(): Promise<void> {
    const waitMs = this.tryConsume();
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

// ---------------------------------------------------------------------------
// Backoff helper
// ---------------------------------------------------------------------------

const MAX_BACKOFF_MS = 30_000;

function backoffMs(attempt: number): number {
  // 1s → 2s → 4s → ... capped at 30s
  return Math.min(1_000 * 2 ** attempt, MAX_BACKOFF_MS);
}

// ---------------------------------------------------------------------------
// BaseExchangeAdapter
// ---------------------------------------------------------------------------

/**
 * Abstract base class for all exchange adapters.
 *
 * Provides:
 * - CCXT instance initialisation from ExchangeConfig
 * - number → Decimal conversion helpers
 * - CCXT error → domain error mapping
 * - Exponential backoff retry (1s→2s→4s, max 30s, default 3 retries)
 * - Token bucket rate limiter (CCXT built-in + additional guard)
 *
 * Concrete adapters must:
 * - Declare `protected readonly exchangeName: Exchange` (human-readable name)
 * - Implement all abstract ExchangeAdapter methods
 */
export abstract class BaseExchangeAdapter implements ExchangeAdapter {
  /** CCXT exchange instance — available to subclasses */
  protected readonly ccxt: ccxt.Exchange;

  /** Additional token bucket guard on top of CCXT's built-in rate limiter */
  protected readonly rateLimiter: TokenBucket;

  /** Human-readable exchange name used in error messages and logging */
  protected abstract readonly exchangeName: Exchange;

  constructor(
    exchangeType: string,
    config: ExchangeConfig,
    /** Token bucket capacity (requests). Defaults to 10. */
    bucketCapacity = 10,
    /** Token refill rate (tokens per ms). Defaults to 1 token / 100ms = 10 req/s */
    bucketRefillRatePerMs = 0.01,
  ) {
    const exchangeMap = ccxt as unknown as Record<string, typeof ccxt.Exchange | undefined>;
    const ExchangeClass = exchangeMap[exchangeType];
    if (!ExchangeClass) {
      throw new Error(`Unknown CCXT exchange type: ${exchangeType}`);
    }

    this.ccxt = new ExchangeClass({
      apiKey: config.apiKey,
      secret: config.apiSecret,
      enableRateLimit: true, // CCXT built-in rate limiter
      ...(config.sandbox ? { sandbox: true } : {}),
    });

    this.rateLimiter = new TokenBucket(bucketCapacity, bucketRefillRatePerMs);
  }

  // ---------------------------------------------------------------------------
  // Conversion helpers
  // ---------------------------------------------------------------------------

  /**
   * Converts a number from CCXT responses to a Decimal.
   * Uses string serialization to avoid floating-point precision loss.
   */
  protected toDecimal(value: number): Decimal {
    return new Decimal(value.toString());
  }

  /**
   * Converts a nullable/undefined number to Decimal or null.
   * Note: 0 is a valid value and returns Decimal('0').
   */
  protected toDecimalOrNull(value: number | undefined | null): Decimal | null {
    if (value === null || value === undefined) {
      return null;
    }
    return new Decimal(value.toString());
  }

  // ---------------------------------------------------------------------------
  // Error mapping
  // ---------------------------------------------------------------------------

  /**
   * Maps a CCXT error (or any unknown error) to a typed domain ExchangeError.
   */
  protected mapError(error: unknown): ExchangeError {
    const exchange = this.exchangeName;

    if (error instanceof ccxt.RateLimitExceeded) {
      return new ExchangeRateLimitError(exchange, error);
    }

    if (error instanceof ccxt.NetworkError) {
      return new ExchangeNetworkError(exchange, error);
    }

    if (error instanceof ccxt.AuthenticationError) {
      return new ExchangeAuthError(exchange, error);
    }

    if (error instanceof ccxt.OrderNotFound) {
      const orderId = error.message.match(/order[:\s]+([^\s,]+)/i)?.[1] ?? "unknown";
      return new ExchangeOrderNotFoundError(exchange, orderId, error);
    }

    if (error instanceof ccxt.InsufficientFunds) {
      return new ExchangeInsufficientFundsError(exchange, error);
    }

    if (error instanceof ccxt.NotSupported) {
      return new ExchangeNotImplementedError(exchange, "unknown", error);
    }

    if (error instanceof Error) {
      return new ExchangeError(error.message, exchange, error);
    }

    return new ExchangeError(String(error), exchange, error);
  }

  // ---------------------------------------------------------------------------
  // Retry with exponential backoff
  // ---------------------------------------------------------------------------

  /**
   * Executes fn() with exponential backoff retry.
   *
   * Backoff schedule: 1s → 2s → 4s (max 30s per attempt).
   * On final failure, throws the last mapped domain error.
   *
   * @param fn         Async function to execute
   * @param maxRetries Maximum retry attempts (default: 3)
   */
  protected async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: ExchangeError | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.rateLimiter.acquire();
        return await fn();
      } catch (error) {
        lastError = this.mapError(error);

        if (attempt < maxRetries - 1) {
          const waitMs = backoffMs(attempt);
          await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
        }
      }
    }

    // All attempts exhausted
    throw lastError;
  }

  // ---------------------------------------------------------------------------
  // ExchangeAdapter abstract methods — subclasses implement these
  // ---------------------------------------------------------------------------

  abstract fetchOHLCV(
    symbol: string,
    timeframe: string,
    since?: number,
    limit?: number,
  ): Promise<Candle[]>;

  abstract fetchBalance(): Promise<{ total: Decimal; available: Decimal }>;

  abstract fetchPositions(symbol?: string): Promise<ExchangePosition[]>;

  abstract createOrder(params: CreateOrderParams): Promise<OrderResult>;

  abstract cancelOrder(orderId: string, symbol: string): Promise<void>;

  abstract editOrder(orderId: string, params: EditOrderParams): Promise<OrderResult>;

  abstract fetchOrder(orderId: string, symbol: string): Promise<OrderResult>;

  abstract watchOHLCV(
    symbol: string,
    timeframe: string,
    callback: OHLCVCallback,
  ): Promise<Unsubscribe>;

  abstract getExchangeInfo(symbol: string): Promise<ExchangeSymbolInfo>;

  abstract setLeverage(leverage: number, symbol: string): Promise<void>;
}

// Re-export errors for convenience
export {
  ExchangeAuthError,
  ExchangeError,
  ExchangeInsufficientFundsError,
  ExchangeNetworkError,
  ExchangeNotImplementedError,
  ExchangeOrderNotFoundError,
  ExchangeRateLimitError,
} from "./errors";
