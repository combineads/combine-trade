import { Decimal, d } from "@/core/decimal";
import type {
  CreateOrderParams,
  EditOrderParams,
  ExchangeAdapter,
  ExchangePosition,
  ExchangeSymbolInfo,
  OHLCVCallback,
  OrderResult,
  Unsubscribe,
} from "@/core/ports";
import type { Candle, Exchange, OrderStatus } from "@/core/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type MockAdapterConfig = {
  /** Exchange label used in returned positions */
  exchange: Exchange;
  /** Starting account balance (quote currency) */
  initialBalance: Decimal;
  /** Full history of candles in ascending open_time order */
  candles: Candle[];
  /** Symbol info returned by getExchangeInfo */
  symbolInfo: ExchangeSymbolInfo;
  /**
   * Slippage as a percentage (e.g. 0.1 = 0.1%).
   * Applied to market fills: BUY fills at close * (1 + pct/100),
   * SELL fills at close * (1 - pct/100).
   * Defaults to 0 (no slippage).
   */
  slippagePct?: number;
};

// ---------------------------------------------------------------------------
// Internal position tracking
// ---------------------------------------------------------------------------

type MockPosition = {
  symbol: string;
  side: "LONG" | "SHORT";
  size: Decimal;
  entryPrice: Decimal;
  /** Cost locked up in this position (entryPrice * size) */
  lockedCost: Decimal;
};

// ---------------------------------------------------------------------------
// Internal pending order tracking
// ---------------------------------------------------------------------------

type PendingOrder = {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  size: Decimal;
  /** Trigger/stop price */
  triggerPrice: Decimal;
  reduceOnly: boolean;
  timestamp: Date;
  /** CANCELLED if cancelOrder was called */
  status: OrderStatus;
};

// ---------------------------------------------------------------------------
// MockExchangeAdapter
// ---------------------------------------------------------------------------

/**
 * In-memory exchange adapter for backtesting.
 *
 * Key properties:
 *  - fetchOHLCV only returns candles whose open_time ≤ currentTimestamp
 *    (lookahead bias prevention).
 *  - createOrder (market) fills immediately at the current candle's close price,
 *    adjusted by slippagePct if configured.
 *  - createOrder (stop_market) stores the order as PENDING.
 *  - checkPendingOrders(currentCandle) triggers pending SL when candle
 *    high/low reaches the trigger price.
 *  - advanceTime(timestamp) is called by BacktestRunner to step the clock.
 */
export class MockExchangeAdapter implements ExchangeAdapter {
  private readonly config: MockAdapterConfig;
  private currentTimestamp: number = 0;
  /** Available + locked balance */
  private totalBalance: Decimal;
  private availableBalance: Decimal;
  private positions: Map<string, MockPosition> = new Map();
  private orderSeq: number = 0;
  /** Active and cancelled pending orders keyed by orderId */
  private pendingOrders: Map<string, PendingOrder> = new Map();

  constructor(config: MockAdapterConfig) {
    this.config = config;
    this.totalBalance = config.initialBalance;
    this.availableBalance = config.initialBalance;
  }

  // ── Clock control ────────────────────────────────────────────────────────

  /**
   * Advance the simulated clock.  Called by BacktestRunner once per candle.
   * Only candles whose open_time ≤ timestamp will be visible.
   */
  advanceTime(timestamp: number): void {
    this.currentTimestamp = timestamp;
  }

  // ── Current candle helpers ───────────────────────────────────────────────

  private getCurrentCandle(symbol: string): Candle | null {
    // Most recent candle whose open_time <= currentTimestamp for the given symbol
    const visible = this.config.candles.filter(
      (c) => c.symbol === symbol && c.open_time.getTime() <= this.currentTimestamp,
    );
    if (visible.length === 0) return null;
    return visible[visible.length - 1] ?? null;
  }

  // ── Slippage helpers ─────────────────────────────────────────────────────

  private applySlippage(price: Decimal, side: "BUY" | "SELL"): Decimal {
    const pct = this.config.slippagePct ?? 0;
    if (pct === 0) return price;
    const multiplier =
      side === "BUY"
        ? d("1").plus(d(String(pct)).dividedBy("100"))
        : d("1").minus(d(String(pct)).dividedBy("100"));
    return price.times(multiplier);
  }

  // ── Order ID generator ───────────────────────────────────────────────────

  private nextOrderId(): string {
    this.orderSeq += 1;
    return `mock-order-${this.orderSeq}`;
  }

  // ── ExchangeAdapter — data methods ───────────────────────────────────────

  async fetchOHLCV(
    symbol: string,
    _timeframe: string,
    since?: number,
    limit?: number,
  ): Promise<Candle[]> {
    let result = this.config.candles.filter((c) => {
      const t = c.open_time.getTime();
      const withinCurrent = t <= this.currentTimestamp;
      const afterSince = since === undefined ? true : t >= since;
      return withinCurrent && afterSince && c.symbol === symbol;
    });

    if (limit !== undefined) {
      result = result.slice(0, limit);
    }

    return result;
  }

  async fetchBalance(): Promise<{ total: Decimal; available: Decimal }> {
    return {
      total: this.totalBalance,
      available: this.availableBalance,
    };
  }

  async fetchPositions(symbol?: string): Promise<ExchangePosition[]> {
    const allPositions = Array.from(this.positions.values());
    const filtered = symbol ? allPositions.filter((p) => p.symbol === symbol) : allPositions;

    return filtered.map((p) => {
      const currentCandle = this.getCurrentCandle(p.symbol);
      const markPrice = currentCandle ? currentCandle.close : p.entryPrice;
      const priceDiff =
        p.side === "LONG"
          ? markPrice.minus(p.entryPrice)
          : p.entryPrice.minus(markPrice);
      const unrealizedPnl = priceDiff.times(p.size);

      return {
        symbol: p.symbol,
        exchange: this.config.exchange,
        side: p.side,
        size: p.size,
        entryPrice: p.entryPrice,
        unrealizedPnl,
        leverage: 1,
        liquidationPrice: null,
      } satisfies ExchangePosition;
    });
  }

  // ── Position-close helper ────────────────────────────────────────────────

  /**
   * Apply a reduceOnly fill against the tracked position for `symbol`.
   * Handles both full and partial closes, updating balances and position size.
   * Returns the actual closeSize used (capped to position.size).
   */
  private closePosition(symbol: string, fillPrice: Decimal, closeSize: Decimal): Decimal {
    const position = this.positions.get(symbol);
    if (!position) return d("0");

    const actualCloseSize = closeSize.greaterThan(position.size) ? position.size : closeSize;

    if (actualCloseSize.equals(position.size)) {
      // Full close — free locked cost + realise profit/loss
      const pnl =
        position.side === "LONG"
          ? fillPrice.minus(position.entryPrice).times(actualCloseSize)
          : position.entryPrice.minus(fillPrice).times(actualCloseSize);
      this.availableBalance = this.availableBalance.plus(position.lockedCost).plus(pnl);
      this.totalBalance = this.availableBalance;
      this.positions.delete(symbol);
    } else {
      // Partial close
      const fraction = actualCloseSize.dividedBy(position.size);
      const releasedCost = position.lockedCost.times(fraction);
      const pnl =
        position.side === "LONG"
          ? fillPrice.minus(position.entryPrice).times(actualCloseSize)
          : position.entryPrice.minus(fillPrice).times(actualCloseSize);
      this.availableBalance = this.availableBalance.plus(releasedCost).plus(pnl);
      this.totalBalance = this.availableBalance.plus(position.lockedCost.minus(releasedCost));
      position.size = position.size.minus(actualCloseSize);
      position.lockedCost = position.lockedCost.minus(releasedCost);
    }

    return actualCloseSize;
  }

  // ── ExchangeAdapter — order methods ──────────────────────────────────────

  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    const { symbol, side, size, type, reduceOnly } = params;
    const orderId = this.nextOrderId();
    const timestamp = new Date(this.currentTimestamp);

    if (type === "market") {
      const candle = this.getCurrentCandle(symbol);
      if (!candle) {
        throw new Error(
          `MockExchangeAdapter: no candle available for ${symbol} at timestamp ${this.currentTimestamp}`,
        );
      }
      const fillPrice = this.applySlippage(candle.close, side);

      if (reduceOnly) {
        // Close (reduce) an existing position
        const filledSize = this.closePosition(symbol, fillPrice, size);
        return {
          orderId,
          exchangeOrderId: orderId,
          status: "FILLED",
          filledPrice: fillPrice,
          filledSize,
          timestamp,
        };
      }

      // Regular entry order
      const cost = fillPrice.times(size);

      if (cost.greaterThan(this.availableBalance)) {
        throw new Error(
          `MockExchangeAdapter: insufficient balance. Required: ${cost.toString()}, Available: ${this.availableBalance.toString()}`,
        );
      }

      this.availableBalance = this.availableBalance.minus(cost);
      // totalBalance stays the same (cost moves from available → locked in position)

      const direction = side === "BUY" ? "LONG" : "SHORT";
      const existing = this.positions.get(symbol);

      if (existing && existing.side === direction) {
        // Average into existing position
        const totalSize = existing.size.plus(size);
        const totalCost = existing.entryPrice.times(existing.size).plus(fillPrice.times(size));
        existing.entryPrice = totalCost.dividedBy(totalSize);
        existing.size = totalSize;
        existing.lockedCost = existing.lockedCost.plus(cost);
      } else {
        // Open new position (opposing positions cancel for simplicity)
        if (existing) {
          // Release locked cost for the opposing position
          this.availableBalance = this.availableBalance.plus(existing.lockedCost);
        }
        this.positions.set(symbol, {
          symbol,
          side: direction,
          size,
          entryPrice: fillPrice,
          lockedCost: cost,
        });
      }

      return {
        orderId,
        exchangeOrderId: orderId,
        status: "FILLED",
        filledPrice: fillPrice,
        filledSize: size,
        timestamp,
      };
    }

    if (type === "stop_market") {
      // Register as pending order; triggers when candle reaches price
      const triggerPrice = params.price;
      if (!triggerPrice) {
        throw new Error(
          `MockExchangeAdapter: stop_market order requires a price (trigger price) for ${symbol}`,
        );
      }

      const pending: PendingOrder = {
        orderId,
        symbol,
        side,
        size,
        triggerPrice,
        reduceOnly: reduceOnly ?? false,
        timestamp,
        status: "PENDING",
      };
      this.pendingOrders.set(orderId, pending);

      return {
        orderId,
        exchangeOrderId: orderId,
        status: "PENDING",
        filledPrice: null,
        filledSize: null,
        timestamp,
      };
    }

    // Limit: record as PENDING (fill logic not yet implemented)
    return {
      orderId,
      exchangeOrderId: orderId,
      status: "PENDING",
      filledPrice: null,
      filledSize: null,
      timestamp,
    };
  }

  /**
   * Check all active pending stop_market orders against the given candle.
   * Returns the OrderResult for each order that was triggered and filled.
   *
   * Trigger conditions:
   *  - SELL stop_market (LONG SL): candle.low <= triggerPrice
   *  - BUY  stop_market (SHORT SL): candle.high >= triggerPrice
   *
   * This is NOT part of ExchangeAdapter; it is called by BacktestRunner.
   */
  checkPendingOrders(candle: Candle): OrderResult[] {
    const results: OrderResult[] = [];

    for (const [orderId, pending] of this.pendingOrders) {
      if (pending.status !== "PENDING") continue;
      if (pending.symbol !== candle.symbol) continue;

      const triggered =
        pending.side === "SELL"
          ? candle.low.lessThanOrEqualTo(pending.triggerPrice)
          : candle.high.greaterThanOrEqualTo(pending.triggerPrice);

      if (!triggered) continue;

      // Fill at trigger price ± slippage
      const fillPrice = this.applySlippage(pending.triggerPrice, pending.side);
      const timestamp = candle.open_time;

      // Apply position changes for reduceOnly fills
      if (pending.reduceOnly) {
        this.closePosition(pending.symbol, fillPrice, pending.size);
      }

      // Mark as filled
      pending.status = "FILLED";

      const result: OrderResult = {
        orderId,
        exchangeOrderId: orderId,
        status: "FILLED",
        filledPrice: fillPrice,
        filledSize: pending.size,
        timestamp,
      };
      results.push(result);
    }

    return results;
  }

  async cancelOrder(orderId: string, _symbol: string): Promise<void> {
    const pending = this.pendingOrders.get(orderId);
    if (pending) {
      pending.status = "CANCELLED";
    }
    // Non-existent or already non-pending orders: silent no-op
  }

  async editOrder(orderId: string, params: EditOrderParams): Promise<OrderResult> {
    const pending = this.pendingOrders.get(orderId);
    if (!pending || pending.status !== "PENDING") {
      throw new Error(
        `MockExchangeAdapter: editOrder — no active pending order with id=${orderId}`,
      );
    }

    if (params.price) {
      pending.triggerPrice = params.price;
    }
    if (params.size) {
      pending.size = params.size;
    }

    return {
      orderId,
      exchangeOrderId: orderId,
      status: "PENDING",
      filledPrice: null,
      filledSize: null,
      timestamp: pending.timestamp,
    };
  }

  async fetchOrder(orderId: string, _symbol: string): Promise<OrderResult> {
    const pending = this.pendingOrders.get(orderId);
    if (pending) {
      return {
        orderId,
        exchangeOrderId: orderId,
        status: pending.status,
        filledPrice: null,
        filledSize: null,
        timestamp: pending.timestamp,
      };
    }
    throw new Error(`MockExchangeAdapter: fetchOrder not implemented (orderId=${orderId})`);
  }

  // ── ExchangeAdapter — no-op / stub methods ───────────────────────────────

  async watchOHLCV(
    _symbol: string,
    _timeframe: string,
    _callback: OHLCVCallback,
  ): Promise<Unsubscribe> {
    // Backtest uses candle iteration, not streaming
    return () => {};
  }

  async getExchangeInfo(symbol: string): Promise<ExchangeSymbolInfo> {
    // Return the configured symbol info if the symbol matches; otherwise substitute
    if (this.config.symbolInfo.symbol === symbol) {
      return this.config.symbolInfo;
    }
    return {
      ...this.config.symbolInfo,
      symbol,
    };
  }

  async setLeverage(_leverage: number, _symbol: string): Promise<void> {
    // No-op: leverage is not simulated in this adapter
  }
}
