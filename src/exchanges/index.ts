import type { ExchangeAdapter, ExchangeConfig } from "@/core/ports";
import type { Exchange } from "@/core/types";
import { BinanceAdapter } from "./binance";
import { BitgetAdapter } from "./bitget";
import { MexcAdapter } from "./mexc";
import { OkxAdapter } from "./okx";

export { BaseExchangeAdapter } from "./base";
export { BinanceAdapter } from "./binance";
export { BitgetAdapter } from "./bitget";
export * from "./errors";
export { MexcAdapter } from "./mexc";
export { OkxAdapter } from "./okx";

// ---------------------------------------------------------------------------
// Exchange adapter factory
// ---------------------------------------------------------------------------

/**
 * Creates and returns an ExchangeAdapter instance for the given exchange.
 *
 * Mapping:
 *   'binance' → BinanceAdapter
 *   'okx'     → OkxAdapter
 *   'bitget'  → BitgetAdapter
 *   'mexc'    → MexcAdapter
 *
 * Throws an Error for any unknown exchange value.
 */
export function createExchangeAdapter(exchange: Exchange, config: ExchangeConfig): ExchangeAdapter {
  switch (exchange) {
    case "binance":
      return new BinanceAdapter(config);
    case "okx":
      return new OkxAdapter(config);
    case "bitget":
      return new BitgetAdapter(config);
    case "mexc":
      return new MexcAdapter(config);
    default: {
      // exhaustive check — TypeScript will error if Exchange grows without updating this
      const _exhaustive: never = exchange;
      throw new Error(`Unknown exchange: ${String(_exhaustive)}`);
    }
  }
}
