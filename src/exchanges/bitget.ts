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
// BitgetAdapter — Bitget USDT-M Perpetual Futures
// ---------------------------------------------------------------------------

/**
 * Exchange adapter scaffold for Bitget USDT-M perpetual futures.
 *
 * Bitget-specific notes:
 * - Rate limit: 20 requests per second per IP across most REST endpoints.
 *   See: https://www.bitget.com/api-doc/common/rate-limiter
 * - productType setting is required for futures endpoints. Must be set to
 *   'USDT-FUTURES' (USDT-margined perpetuals) or 'COIN-FUTURES' before
 *   placing orders or fetching positions. Pass via CCXT options:
 *   { options: { defaultType: 'swap', defaultSubType: 'linear' } }
 * - Uses 'bitget' CCXT exchange type.
 *
 * All methods are stubs — Phase 3 will replace them with real implementations.
 */
export class BitgetAdapter extends BaseExchangeAdapter {
  protected readonly exchangeName: Exchange = "bitget";

  constructor(config: ExchangeConfig) {
    // Bitget rate limit: 20 req/s = 1 token per 50ms
    // bucketCapacity=20, refillRatePerMs=0.02 (20 req/s)
    super("bitget", config, 20, 0.02);
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

  transfer(
    _currency: string,
    _amount: Decimal,
    _fromAccount: string,
    _toAccount: string,
  ): Promise<{ id: string; status: string }> {
    throw new ExchangeNotImplementedError(this.exchangeName, "transfer");
  }
}
