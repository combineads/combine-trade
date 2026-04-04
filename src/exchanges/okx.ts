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
// OkxAdapter — OKX Swap (Perpetual Futures)
// ---------------------------------------------------------------------------

/**
 * Exchange adapter scaffold for OKX Swap (perpetual futures).
 *
 * OKX-specific notes:
 * - Rate limit: 60 requests per 2 seconds (30 req/s) per endpoint category.
 *   See: https://www.okx.com/docs-v5/en/#overview-rate-limits
 * - Contract size (contractSize) differs per symbol and is NOT always 1 USDT.
 *   For example, BTC-USDT-SWAP has contractSize = 0.01 BTC per contract.
 *   Always call getExchangeInfo() to get the correct contractSize before
 *   calculating order quantities.
 * - Uses 'okx' CCXT exchange type (unified Swap market).
 *
 * All methods are stubs — Phase 2 will replace them with real implementations.
 */
export class OkxAdapter extends BaseExchangeAdapter {
  protected readonly exchangeName: Exchange = "okx";

  constructor(config: ExchangeConfig) {
    // OKX rate limit: 60 req/2s = 30 req/s = 1 token per ~33ms
    // bucketCapacity=30, refillRatePerMs=0.03 (30 req/s)
    super("okx", config, 30, 0.03);
  }

  // ---------------------------------------------------------------------------
  // All methods — Phase 2 stubs
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
