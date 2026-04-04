import type { Decimal } from "@/core/decimal";
import type {
  Candle,
  CommonCode,
  Direction,
  Exchange,
  OrderSide,
  OrderStatus,
  SymbolEntity,
} from "@/core/types";

// ---------------------------------------------------------------------------
// Callback / unsubscribe helpers
// ---------------------------------------------------------------------------

export type OHLCVCallback = (candle: Candle) => void;
export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// Exchange supporting types
// ---------------------------------------------------------------------------

export type ExchangePosition = {
  symbol: string;
  exchange: Exchange;
  side: Direction;
  size: Decimal;
  entryPrice: Decimal;
  unrealizedPnl: Decimal;
  leverage: number;
  liquidationPrice: Decimal | null;
};

export type CreateOrderParams = {
  symbol: string;
  side: OrderSide;
  size: Decimal;
  /** Limit price for limit orders; trigger/stop price for stop_market orders */
  price?: Decimal;
  stopLoss?: Decimal;
  type: "market" | "limit" | "stop_market";
  reduceOnly?: boolean;
};

export type EditOrderParams = {
  price?: Decimal;
  size?: Decimal;
  stopLoss?: Decimal;
};

export type OrderResult = {
  orderId: string;
  exchangeOrderId: string;
  status: OrderStatus;
  filledPrice: Decimal | null;
  filledSize: Decimal | null;
  timestamp: Date;
};

export type ExchangeSymbolInfo = {
  symbol: string;
  tickSize: Decimal;
  minOrderSize: Decimal;
  maxLeverage: number;
  contractSize: Decimal;
};

// ---------------------------------------------------------------------------
// Primary exchange adapter port
// ---------------------------------------------------------------------------

export type ExchangeAdapter = {
  fetchOHLCV(symbol: string, timeframe: string, since?: number, limit?: number): Promise<Candle[]>;
  fetchBalance(): Promise<{ total: Decimal; available: Decimal }>;
  fetchPositions(symbol?: string): Promise<ExchangePosition[]>;
  createOrder(params: CreateOrderParams): Promise<OrderResult>;
  cancelOrder(orderId: string, symbol: string): Promise<void>;
  editOrder(orderId: string, params: EditOrderParams): Promise<OrderResult>;
  fetchOrder(orderId: string, symbol: string): Promise<OrderResult>;
  watchOHLCV(symbol: string, timeframe: string, callback: OHLCVCallback): Promise<Unsubscribe>;
  getExchangeInfo(symbol: string): Promise<ExchangeSymbolInfo>;
  setLeverage(leverage: number, symbol: string): Promise<void>;
  transfer(
    currency: string,
    amount: Decimal,
    fromAccount: string,
    toAccount: string,
  ): Promise<{ id: string; status: string }>;
};

// ---------------------------------------------------------------------------
// Exchange adapter factory
// ---------------------------------------------------------------------------

export type ExchangeConfig = {
  apiKey: string;
  apiSecret: string;
  sandbox?: boolean;
};

export type ExchangeAdapterFactory = (
  exchange: Exchange,
  config: ExchangeConfig,
) => ExchangeAdapter;

// ---------------------------------------------------------------------------
// Repository ports
// ---------------------------------------------------------------------------

export type SymbolRepository = {
  findAll(): Promise<SymbolEntity[]>;
  findByKey(symbol: string, exchange: Exchange): Promise<SymbolEntity | null>;
  upsert(symbol: SymbolEntity): Promise<void>;
  deactivate(symbol: string, exchange: Exchange): Promise<void>;
};

export type CommonCodeRepository = {
  findAll(): Promise<CommonCode[]>;
  findByGroup(groupCode: string): Promise<CommonCode[]>;
  findByKey(groupCode: string, code: string): Promise<CommonCode | null>;
  upsert(entry: CommonCode): Promise<void>;
};
