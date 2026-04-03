import type { Decimal } from "@/core/decimal";
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
import type { Candle, Exchange } from "@/core/types";
import { BaseExchangeAdapter, ExchangeNotImplementedError } from "./base";

// ---------------------------------------------------------------------------
// MexcAdapter — MEXC USDT-M Perpetual Futures
// ---------------------------------------------------------------------------

/**
 * Exchange adapter scaffold for MEXC USDT-M perpetual futures.
 *
 * MEXC-specific notes:
 * - Rate limit: 20 requests per second across REST endpoints.
 *   See: https://mexcdevelop.github.io/apidocs/contract_v1_en/#rate-limit
 * - editOrder may not be supported on MEXC Futures. If editOrder is unavailable,
 *   modifying a stop-loss order (e.g., breakeven move after TP1 hit) requires a
 *   two-step flow: create new SL first, then cancel old SL. See ADR-005 for the
 *   full design rationale and recommended approach.
 * - Uses 'mexc' CCXT exchange type.
 *
 * All methods are stubs — Phase 3 will replace them with real implementations.
 * Phase 3 editOrder implementation must reference ADR-005 for the 2-step SL flow.
 */
export class MexcAdapter extends BaseExchangeAdapter {
  protected readonly exchangeName: Exchange = "mexc";

  constructor(config: ExchangeConfig) {
    // MEXC rate limit: 20 req/s = 1 token per 50ms
    // bucketCapacity=20, refillRatePerMs=0.02 (20 req/s)
    super("mexc", config, 20, 0.02);
  }

  // ---------------------------------------------------------------------------
  // All methods — Phase 3 stubs
  // ---------------------------------------------------------------------------

  fetchOHLCV(
    _symbol: string,
    _timeframe: string,
    _since?: number,
    _limit?: number,
  ): Promise<Candle[]> {
    throw new ExchangeNotImplementedError(this.exchangeName, "fetchOHLCV");
  }

  fetchBalance(): Promise<{ total: Decimal; available: Decimal }> {
    throw new ExchangeNotImplementedError(this.exchangeName, "fetchBalance");
  }

  fetchPositions(_symbol?: string): Promise<ExchangePosition[]> {
    throw new ExchangeNotImplementedError(this.exchangeName, "fetchPositions");
  }

  createOrder(_params: CreateOrderParams): Promise<OrderResult> {
    throw new ExchangeNotImplementedError(this.exchangeName, "createOrder");
  }

  cancelOrder(_orderId: string, _symbol: string): Promise<void> {
    throw new ExchangeNotImplementedError(this.exchangeName, "cancelOrder");
  }

  /**
   * NOTE (Phase 3): If MEXC does not support editOrder natively, this method
   * must implement the 2-step SL flow per ADR-005:
   *   1. createOrder — new SL order (reduceOnly)
   *   2. cancelOrder — old SL order
   *   3. If step 2 fails: cancelOrder new SL and rethrow
   * This ensures the position is never unprotected between the two steps.
   */
  editOrder(_orderId: string, _params: EditOrderParams): Promise<OrderResult> {
    throw new ExchangeNotImplementedError(this.exchangeName, "editOrder");
  }

  fetchOrder(_orderId: string, _symbol: string): Promise<OrderResult> {
    throw new ExchangeNotImplementedError(this.exchangeName, "fetchOrder");
  }

  watchOHLCV(_symbol: string, _timeframe: string, _callback: OHLCVCallback): Promise<Unsubscribe> {
    throw new ExchangeNotImplementedError(this.exchangeName, "watchOHLCV");
  }

  getExchangeInfo(_symbol: string): Promise<ExchangeSymbolInfo> {
    throw new ExchangeNotImplementedError(this.exchangeName, "getExchangeInfo");
  }

  setLeverage(_leverage: number, _symbol: string): Promise<void> {
    throw new ExchangeNotImplementedError(this.exchangeName, "setLeverage");
  }
}
