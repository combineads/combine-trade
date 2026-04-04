import { Decimal } from "@/core/decimal";
import type {
  CreateOrderParams,
  EditOrderParams,
  ExchangeConfig,
  ExchangePosition,
  ExchangeSymbolInfo,
  OHLCVCallback,
  OrderResult,
  Unsubscribe,
} from "@/core/ports";
import type { Candle, Direction, Exchange, OrderStatus } from "@/core/types";
import { BaseExchangeAdapter, ExchangeOrderNotFoundError } from "./base";
import type { WebSocketFactory } from "./ws-manager";
import { WsManager } from "./ws-manager";

// ---------------------------------------------------------------------------
// UUID v7 generator (time-sortable, per RFC 9562)
// ---------------------------------------------------------------------------

/**
 * Generates a UUID v7 string.
 * UUID v7 encodes Unix epoch milliseconds in the high 48 bits, making it
 * time-sortable and suitable as a client order idempotency key.
 *
 * Layout (128 bits):
 *   bits  0-47 : unix_ts_ms (48-bit millisecond timestamp)
 *   bits 48-51 : version = 0b0111 (7)
 *   bits 52-63 : rand_a (12 random bits)
 *   bits 64-65 : variant = 0b10
 *   bits 66-127: rand_b (62 random bits)
 */
function generateUUIDv7(): string {
  const ms = BigInt(Date.now());

  // 16 bytes for the UUID
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  // Overwrite bytes 0-5 with the 48-bit timestamp
  bytes[0] = Number((ms >> 40n) & 0xffn);
  bytes[1] = Number((ms >> 32n) & 0xffn);
  bytes[2] = Number((ms >> 24n) & 0xffn);
  bytes[3] = Number((ms >> 16n) & 0xffn);
  bytes[4] = Number((ms >> 8n) & 0xffn);
  bytes[5] = Number(ms & 0xffn);

  // Set version = 7 (high nibble of byte 6)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;

  // Set variant = 0b10 (high 2 bits of byte 8)
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// BinanceAdapter — Binance USD-M Futures
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Binance kline payload shape (partial — only the fields we use)
// ---------------------------------------------------------------------------

type BinanceKlineMessage = {
  e: string; // event type
  k: {
    t: number; // open time (ms)
    o: string; // open
    h: string; // high
    l: string; // low
    c: string; // close
    v: string; // volume
    x: boolean; // is closed
  };
};

/**
 * Exchange adapter for Binance USD-M Futures (binanceusdm).
 *
 * Implements read-only ExchangeAdapter methods. Write methods (createOrder,
 * cancelOrder, editOrder), watchOHLCV, and setLeverage are stubs implemented
 * in T-03-003, T-03-004, and T-03-006 respectively.
 */
export class BinanceAdapter extends BaseExchangeAdapter {
  protected readonly exchangeName: Exchange = "binance";

  /** Lazy-initialised WsManager shared across all watchOHLCV subscriptions. */
  private _wsManager: WsManager | null = null;

  /** Optional factory injected during construction (used in tests). */
  private readonly _wsFactory: WebSocketFactory | undefined;

  /** Whether to use sandbox (testnet) WebSocket URLs. */
  private readonly _sandbox: boolean;

  constructor(config: ExchangeConfig, wsFactory?: WebSocketFactory) {
    super("binanceusdm", config);
    this._wsFactory = wsFactory;
    this._sandbox = config.sandbox === true;
  }

  private get wsManager(): WsManager {
    if (this._wsManager === null) {
      this._wsManager = new WsManager(this._wsFactory);
    }
    return this._wsManager;
  }

  // ---------------------------------------------------------------------------
  // READ — fetchBalance
  // ---------------------------------------------------------------------------

  /**
   * Fetches USDT wallet balance from Binance USD-M Futures.
   * Returns { total, available } as Decimal values.
   */
  async fetchBalance(): Promise<{ total: Decimal; available: Decimal }> {
    return this.withRetry(async () => {
      const balance = await this.ccxt.fetchBalance();

      const usdt = balance.USDT;
      const total = this.toDecimal(usdt?.total ?? 0);
      const available = this.toDecimal(usdt?.free ?? 0);

      return { total, available };
    });
  }

  // ---------------------------------------------------------------------------
  // READ — fetchPositions
  // ---------------------------------------------------------------------------

  /**
   * Fetches open positions from Binance USD-M Futures.
   * Optionally filters to a single symbol.
   */
  async fetchPositions(symbol?: string): Promise<ExchangePosition[]> {
    return this.withRetry(async () => {
      const raw = await this.ccxt.fetchPositions(symbol ? [symbol] : undefined);

      return raw
        .filter((pos) => {
          // Only include positions with non-zero size
          const contracts = pos.contracts ?? pos.contractSize ?? 0;
          return Number(contracts) !== 0;
        })
        .filter((pos) => {
          if (!symbol) return true;
          return pos.symbol === symbol;
        })
        .map((pos): ExchangePosition => {
          const side: Direction = pos.side === "short" ? "SHORT" : "LONG";

          return {
            symbol: pos.symbol as string,
            exchange: this.exchangeName,
            side,
            size: this.toDecimal((pos.contracts as number | undefined) ?? 0),
            entryPrice: this.toDecimal((pos.entryPrice as number | undefined) ?? 0),
            unrealizedPnl: this.toDecimal((pos.unrealizedPnl as number | undefined) ?? 0),
            leverage: (pos.leverage as number | undefined) ?? 1,
            liquidationPrice: this.toDecimalOrNull(
              pos.liquidationPrice as number | null | undefined,
            ),
          };
        });
    });
  }

  // ---------------------------------------------------------------------------
  // READ — fetchOrder
  // ---------------------------------------------------------------------------

  /**
   * Fetches a single order by ID and symbol.
   * Throws ExchangeOrderNotFoundError when the order does not exist.
   */
  async fetchOrder(orderId: string, symbol: string): Promise<OrderResult> {
    return this.withRetry(async () => {
      const order = await this.ccxt.fetchOrder(orderId, symbol);

      if (!order) {
        throw new ExchangeOrderNotFoundError(this.exchangeName, orderId);
      }

      const status = this.mapOrderStatus(order.status as string | undefined);

      return {
        orderId,
        exchangeOrderId: String(order.id),
        status,
        filledPrice: this.toDecimalOrNull(order.average as number | null | undefined),
        filledSize: this.toDecimalOrNull(order.filled as number | null | undefined),
        timestamp: new Date((order.timestamp as number | undefined) ?? Date.now()),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // READ — fetchOHLCV
  // ---------------------------------------------------------------------------

  /**
   * Fetches OHLCV candles from Binance USD-M Futures.
   * Converts CCXT number timestamps to Date and all price/volume fields to Decimal.
   */
  async fetchOHLCV(
    symbol: string,
    timeframe: string,
    since?: number,
    limit?: number,
  ): Promise<Candle[]> {
    return this.withRetry(async () => {
      const ohlcv = await this.ccxt.fetchOHLCV(symbol, timeframe, since, limit);

      return ohlcv.map((bar): Candle => {
        // CCXT OHLCV format: [timestamp, open, high, low, close, volume]
        const [ts, open, high, low, close, volume] = bar as [
          number,
          number,
          number,
          number,
          number,
          number,
        ];

        return {
          id: crypto.randomUUID(),
          symbol,
          exchange: this.exchangeName,
          timeframe: this.mapTimeframe(timeframe),
          open_time: new Date(ts),
          open: this.toDecimal(open),
          high: this.toDecimal(high),
          low: this.toDecimal(low),
          close: this.toDecimal(close),
          volume: this.toDecimal(volume),
          is_closed: true,
          created_at: new Date(),
        };
      });
    });
  }

  // ---------------------------------------------------------------------------
  // READ — getExchangeInfo
  // ---------------------------------------------------------------------------

  /**
   * Fetches symbol-level market info (tick size, min order size, max leverage,
   * contract size) from Binance USD-M Futures.
   */
  async getExchangeInfo(symbol: string): Promise<ExchangeSymbolInfo> {
    return this.withRetry(async () => {
      const markets = await this.ccxt.loadMarkets();
      const market = markets[symbol];

      if (!market) {
        throw new Error(`Symbol ${symbol} not found on ${this.exchangeName}`);
      }

      const limits = market.limits as
        | {
            amount?: { min?: number };
            leverage?: { max?: number };
          }
        | undefined;

      const precision = market.precision as
        | {
            price?: number;
            amount?: number;
          }
        | undefined;

      const tickSize =
        precision?.price != null ? this.toDecimal(precision.price) : this.toDecimal(0.01);

      const minOrderSize =
        limits?.amount?.min != null ? this.toDecimal(limits.amount.min) : this.toDecimal(0.001);

      const maxLeverage = limits?.leverage?.max ?? 125;

      const contractSize =
        market.contractSize != null
          ? this.toDecimal(market.contractSize as number)
          : this.toDecimal(1);

      return {
        symbol,
        tickSize,
        minOrderSize,
        maxLeverage,
        contractSize,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // WRITE — createOrder
  // ---------------------------------------------------------------------------

  /**
   * Creates an order on Binance USD-M Futures.
   *
   * Generates a UUID v7 idempotency_key and passes it as clientOrderId via
   * CCXT params to prevent duplicate orders on network retry.
   *
   * - market orders: expects immediate fill → returns FILLED status with
   *   filledPrice and filledSize from the exchange response.
   * - limit orders: returns PENDING status with null filledPrice/filledSize.
   * - stop_market orders: SL orders using STOP_MARKET type with stopPrice.
   *   reduceOnly is always forced to true (SL must only reduce positions).
   *   price field is used as the trigger/stop price.
   *
   * orderId = generated idempotency_key
   * exchangeOrderId = CCXT-returned exchange order ID
   */
  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    const idempotencyKey = generateUUIDv7();

    return this.withRetry(async () => {
      const amount = params.size.toNumber();
      const side = params.side.toLowerCase() as "buy" | "sell";

      let order: Awaited<ReturnType<typeof this.ccxt.createOrder>>;

      if (params.type === "stop_market") {
        const stopPrice = params.price != null ? params.price.toNumber() : undefined;
        order = await this.ccxt.createOrder(params.symbol, "STOP_MARKET", side, amount, undefined, {
          stopPrice,
          reduceOnly: true,
          clientOrderId: idempotencyKey,
        });
      } else {
        const price = params.price != null ? params.price.toNumber() : undefined;
        order = await this.ccxt.createOrder(params.symbol, params.type, side, amount, price, {
          clientOrderId: idempotencyKey,
          ...(params.reduceOnly ? { reduceOnly: true } : {}),
        });
      }

      const status = this.mapOrderStatus(order.status as string | undefined);

      return {
        orderId: idempotencyKey,
        exchangeOrderId: String(order.id),
        status,
        filledPrice: this.toDecimalOrNull(order.average as number | null | undefined),
        filledSize: this.toDecimalOrNull(order.filled as number | null | undefined),
        timestamp: new Date((order.timestamp as number | undefined) ?? Date.now()),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // WRITE — cancelOrder
  // ---------------------------------------------------------------------------

  /**
   * Cancels an existing order on Binance USD-M Futures.
   * Throws ExchangeOrderNotFoundError when the order does not exist.
   */
  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    return this.withRetry(async () => {
      await this.ccxt.cancelOrder(orderId, symbol);
    });
  }

  // ---------------------------------------------------------------------------
  // WRITE — editOrder
  // ---------------------------------------------------------------------------

  /**
   * Modifies an existing order on Binance USD-M Futures.
   * Converts Decimal price/size to number before calling CCXT.
   * Returns an updated OrderResult with Decimal fields.
   */
  async editOrder(orderId: string, params: EditOrderParams): Promise<OrderResult> {
    return this.withRetry(async () => {
      const price = params.price != null ? params.price.toNumber() : undefined;
      const amount = params.size != null ? params.size.toNumber() : undefined;

      const order = await this.ccxt.editOrder(
        orderId,
        // symbol is not in EditOrderParams — CCXT editOrder signature varies;
        // pass undefined and let CCXT use the stored order symbol
        undefined as unknown as string,
        undefined as unknown as string,
        undefined as unknown as string,
        amount,
        price,
      );

      const status = this.mapOrderStatus(order.status as string | undefined);

      return {
        orderId,
        exchangeOrderId: String(order.id),
        status,
        filledPrice: this.toDecimalOrNull(order.average as number | null | undefined),
        filledSize: this.toDecimalOrNull(order.filled as number | null | undefined),
        timestamp: new Date((order.timestamp as number | undefined) ?? Date.now()),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // WS — watchOHLCV (T-03-006)
  // ---------------------------------------------------------------------------

  /**
   * Subscribes to a Binance Futures WebSocket kline stream for the given
   * symbol and timeframe.
   *
   * URL patterns:
   *   - production: wss://fstream.binance.com/ws/{symbol_lower}@kline_{interval}
   *   - sandbox:    wss://stream.binancefuture.com/ws/{symbol_lower}@kline_{interval}
   *
   * Each call creates an independent WS connection through the shared
   * WsManager.  Calling the returned Unsubscribe function closes only that
   * connection; other active subscriptions are unaffected.
   *
   * WsManager handles reconnection automatically; there is no need to
   * re-subscribe in onReconnect — the same URL is reconnected.
   */
  watchOHLCV(symbol: string, timeframe: string, callback: OHLCVCallback): Promise<Unsubscribe> {
    const url = this.buildKlineUrl(symbol, timeframe, this._sandbox);

    const connection = this.wsManager.connect(url, {
      onMessage: (data: string) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          // Ignore non-JSON frames (ping/pong, etc.)
          return;
        }

        const candle = this.parseKlineMessage(parsed, symbol, timeframe);
        if (candle !== null) {
          callback(candle);
        }
      },
    });

    const unsubscribe: Unsubscribe = () => {
      connection.close();
    };

    return Promise.resolve(unsubscribe);
  }

  // ---------------------------------------------------------------------------
  // WRITE — setLeverage
  // ---------------------------------------------------------------------------

  /**
   * Sets the leverage for a symbol on Binance USD-M Futures.
   *
   * No cap validation is performed here — that is the positions module's
   * responsibility (EP-06). The value is passed through to the exchange as-is.
   */
  async setLeverage(leverage: number, symbol: string): Promise<void> {
    return this.withRetry(async () => {
      await this.ccxt.setLeverage(leverage, symbol);
    });
  }

  // ---------------------------------------------------------------------------
  // WRITE — transfer
  // ---------------------------------------------------------------------------

  /**
   * Transfers funds between Binance accounts (e.g. future → spot) via CCXT.
   *
   * CCXT signature: exchange.transfer(currency, amount, fromAccount, toAccount)
   * Returns { id, status } from the exchange response.
   */
  async transfer(
    currency: string,
    amount: Decimal,
    fromAccount: string,
    toAccount: string,
  ): Promise<{ id: string; status: string }> {
    return this.withRetry(async () => {
      const result = await this.ccxt.transfer(
        currency,
        amount.toNumber(),
        fromAccount,
        toAccount,
      );

      return {
        id: String((result as Record<string, unknown>).id ?? ""),
        status: String((result as Record<string, unknown>).status ?? "ok"),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private mapOrderStatus(ccxtStatus: string | undefined): OrderStatus {
    switch (ccxtStatus) {
      case "open":
        return "PENDING";
      case "closed":
        return "FILLED";
      case "canceled":
      case "cancelled":
        return "CANCELLED";
      case "partially_filled":
        return "PARTIALLY_FILLED";
      default:
        return "FAILED";
    }
  }

  private mapTimeframe(ccxtTimeframe: string): Candle["timeframe"] {
    switch (ccxtTimeframe) {
      case "1d":
      case "1D":
        return "1D";
      case "1h":
      case "1H":
        return "1H";
      case "5m":
      case "5M":
        return "5M";
      case "1m":
      case "1M":
        return "1M";
      default:
        return "5M";
    }
  }

  /**
   * Maps a timeframe string to the Binance kline interval notation.
   * e.g. "5m" → "5m", "1h" → "1h", "1d" → "1d"
   * Binance interval strings are already lowercase, so we lower-case and
   * map the upper-case variants that the codebase uses.
   */
  private toBinanceInterval(timeframe: string): string {
    const map: Record<string, string> = {
      "1M": "1m",
      "5M": "5m",
      "1H": "1h",
      "1D": "1d",
    };
    return map[timeframe] ?? timeframe.toLowerCase();
  }

  /**
   * Builds the Binance Futures WebSocket kline stream URL.
   *
   * Production: wss://fstream.binance.com/ws/{symbol_lower}@kline_{interval}
   * Sandbox:    wss://stream.binancefuture.com/ws/{symbol_lower}@kline_{interval}
   */
  private buildKlineUrl(symbol: string, timeframe: string, sandbox: boolean): string {
    const symbolLower = symbol.toLowerCase();
    const interval = this.toBinanceInterval(timeframe);
    const host = sandbox ? "stream.binancefuture.com" : "fstream.binance.com";
    return `wss://${host}/ws/${symbolLower}@kline_${interval}`;
  }

  /**
   * Parses a raw Binance kline WebSocket message and converts it to a Candle.
   * Returns null when the message is not a valid kline event.
   */
  private parseKlineMessage(raw: unknown, symbol: string, timeframe: string): Candle | null {
    if (typeof raw !== "object" || raw === null) return null;

    const msg = raw as Record<string, unknown>;
    if (msg.e !== "kline") return null;

    const k = msg.k;
    if (typeof k !== "object" || k === null) return null;

    const kline = k as BinanceKlineMessage["k"];

    return {
      id: crypto.randomUUID(),
      symbol,
      exchange: this.exchangeName,
      timeframe: this.mapTimeframe(timeframe),
      open_time: new Date(kline.t),
      open: new Decimal(kline.o),
      high: new Decimal(kline.h),
      low: new Decimal(kline.l),
      close: new Decimal(kline.c),
      volume: new Decimal(kline.v),
      is_closed: kline.x,
      created_at: new Date(),
    };
  }
}
