import type Decimal from "decimal.js";

// ---------------------------------------------------------------------------
// Enum string unions (matching DATA_MODEL.md CHECK constraints exactly)
// ---------------------------------------------------------------------------

export type FsmState = "IDLE" | "WATCHING" | "HAS_POSITION";

export type ExecutionMode = "analysis" | "alert" | "live";

export type DailyBias = "LONG_ONLY" | "SHORT_ONLY" | "NEUTRAL";

export type Timeframe = "1D" | "1H" | "5M" | "1M";

export type VectorTimeframe = "5M" | "1M";

export type Direction = "LONG" | "SHORT";

export type Exchange = "binance" | "okx" | "bitget" | "mexc";

export type DetectionType = "SQUEEZE_BREAKOUT" | "SR_CONFLUENCE" | "BB4_TOUCH";

export type SignalType = "DOUBLE_B" | "ONE_B";

export type KnnDecision = "PASS" | "FAIL" | "SKIP";

export type TicketState = "INITIAL" | "TP1_HIT" | "TP2_HIT" | "CLOSED";

export type CloseReason =
  | "SL"
  | "TP1"
  | "TP2"
  | "TRAILING"
  | "TIME_EXIT"
  | "PANIC_CLOSE"
  | "MANUAL";

export type TradeResult = "WIN" | "LOSS" | "TIME_EXIT";

export type VectorGrade = "A" | "B" | "C";

export type OrderType =
  | "ENTRY"
  | "SL"
  | "TP1"
  | "TP2"
  | "TRAILING"
  | "PYRAMID"
  | "PANIC_CLOSE"
  | "TIME_EXIT";

export type OrderStatus = "PENDING" | "FILLED" | "PARTIALLY_FILLED" | "CANCELLED" | "FAILED";

export type OrderSide = "BUY" | "SELL";

export type BlockType = "ECONOMIC" | "FUNDING" | "MANUAL" | "MARKET_OPEN";

export type BacktestRunType = "BACKTEST" | "WFO";

/** Free-text event type. Conventions defined in DATA_MODEL.md event_type table. */
export type EventType = string;

export type CommonCodeGroup =
  | "EXCHANGE"
  | "TIMEFRAME"
  | "SYMBOL_CONFIG"
  | "KNN"
  | "POSITION"
  | "LOSS_LIMIT"
  | "SLIPPAGE"
  | "FEATURE_WEIGHT"
  | "TIME_DECAY"
  | "WFO"
  | "ANCHOR"
  | "NOTIFICATION";

// ---------------------------------------------------------------------------
// Composite key types
// ---------------------------------------------------------------------------

export type SymbolKey = {
  symbol: string;
  exchange: Exchange;
};

// ---------------------------------------------------------------------------
// Master entities
// ---------------------------------------------------------------------------

export type SymbolEntity = {
  symbol: string;
  exchange: Exchange;
  name: string;
  base_asset: string;
  quote_asset: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type SymbolState = {
  id: string;
  symbol: string;
  exchange: Exchange;
  fsm_state: FsmState;
  execution_mode: ExecutionMode;
  /** null before first 1D close */
  daily_bias: DailyBias | null;
  /** Today's daily open price (UTC 00:00). null before first 1D close */
  daily_open: Decimal | null;
  /** US session opening candle high. null until set */
  session_box_high: Decimal | null;
  /** US session opening candle low. null until set */
  session_box_low: Decimal | null;
  /** Cumulative loss amount today (USD) */
  losses_today: Decimal;
  /** Stop-loss count in current trading session */
  losses_session: number;
  /** Stop-loss count for 5M entries in current 1H window */
  losses_this_1h_5m: number;
  /** Stop-loss count for 1M entries in current 1H window */
  losses_this_1h_1m: number;
  updated_at: Date;
};

// ---------------------------------------------------------------------------
// Reference entities
// ---------------------------------------------------------------------------

export type CommonCode = {
  group_code: CommonCodeGroup;
  code: string;
  /** jsonb value — type is free-form, validated by consumers */
  value: unknown;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

// ---------------------------------------------------------------------------
// Transaction entities
// ---------------------------------------------------------------------------

export type TradeBlock = {
  id: string;
  block_type: BlockType;
  start_time: Date;
  end_time: Date;
  reason: string | null;
  is_recurring: boolean;
  /** Recurrence rule jsonb. Only set when is_recurring=true */
  recurrence_rule: unknown | null;
  /** External API source data. Typically set for ECONOMIC type */
  source_data: unknown | null;
  created_at: Date;
};

export type Candle = {
  id: string;
  symbol: string;
  exchange: Exchange;
  timeframe: Timeframe;
  open_time: Date;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  is_closed: boolean;
  created_at: Date;
};

export type WatchSession = {
  id: string;
  symbol: string;
  exchange: Exchange;
  detection_type: DetectionType;
  direction: Direction;
  /** TP1 target: 1H MA20. null until set */
  tp1_price: Decimal | null;
  /** TP2 target: opposite 1H BB20. null until set */
  tp2_price: Decimal | null;
  detected_at: Date;
  /** null means session is active */
  invalidated_at: Date | null;
  invalidation_reason: string | null;
  /** Snapshot of BB values, S/R levels, squeeze state at detection time */
  context_data: unknown | null;
  created_at: Date;
};

export type Signal = {
  id: string;
  symbol: string;
  exchange: Exchange;
  watch_session_id: string;
  timeframe: VectorTimeframe;
  signal_type: SignalType;
  direction: Direction;
  entry_price: Decimal;
  sl_price: Decimal;
  safety_passed: boolean;
  knn_decision: KnnDecision | null;
  a_grade: boolean;
  vector_id: string | null;
  created_at: Date;
};

export type SignalDetail = {
  id: string;
  signal_id: string;
  key: string;
  value: Decimal | null;
  text_value: string | null;
};

export type Vector = {
  id: string;
  candle_id: string;
  symbol: string;
  exchange: Exchange;
  timeframe: VectorTimeframe;
  /** 202-dimensional feature vector */
  embedding: Float32Array;
  /** null until labeled (Ticket CLOSED) */
  label: TradeResult | null;
  /** null until labeled */
  grade: VectorGrade | null;
  labeled_at: Date | null;
  created_at: Date;
};

export type Ticket = {
  id: string;
  symbol: string;
  exchange: Exchange;
  signal_id: string;
  /** null for primary ticket; references parent for pyramid entries */
  parent_ticket_id: string | null;
  timeframe: VectorTimeframe;
  direction: Direction;
  state: TicketState;
  /** Actual fill price */
  entry_price: Decimal;
  /** Initial stop-loss price */
  sl_price: Decimal;
  /** Current stop-loss price (may have moved to break-even) */
  current_sl_price: Decimal;
  size: Decimal;
  remaining_size: Decimal;
  leverage: number;
  tp1_price: Decimal | null;
  tp2_price: Decimal | null;
  trailing_active: boolean;
  trailing_price: Decimal | null;
  /** Maximum favorable excursion (profit peak) */
  max_profit: Decimal;
  pyramid_count: number;
  opened_at: Date;
  closed_at: Date | null;
  close_reason: CloseReason | null;
  /** Confirmed after CLOSED */
  result: TradeResult | null;
  /** Cumulative realized PnL */
  pnl: Decimal | null;
  pnl_pct: Decimal | null;
  /** Maximum Favorable Excursion */
  max_favorable: Decimal | null;
  /** Maximum Adverse Excursion */
  max_adverse: Decimal | null;
  hold_duration_sec: number | null;
  created_at: Date;
  updated_at: Date;
};

export type Order = {
  id: string;
  /** null for panic-close orders (no associated ticket) */
  ticket_id: string | null;
  exchange: Exchange;
  order_type: OrderType;
  status: OrderStatus;
  side: OrderSide;
  /** null for market orders */
  price: Decimal | null;
  expected_price: Decimal | null;
  size: Decimal;
  filled_price: Decimal | null;
  filled_size: Decimal | null;
  exchange_order_id: string | null;
  /** Logical order intent ID (groups retries) */
  intent_id: string;
  /** Per-attempt idempotency key */
  idempotency_key: string;
  /** filled_price - expected_price */
  slippage: Decimal | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

export type Backtest = {
  id: string;
  run_type: BacktestRunType;
  symbol: string;
  exchange: Exchange;
  start_date: Date;
  end_date: Date;
  /** Full config snapshot at run time */
  config_snapshot: unknown;
  /** Aggregated result metrics */
  results: unknown;
  /** null for top-level runs; WFO windows reference their parent */
  parent_id: string | null;
  /** WFO window index; null for non-WFO runs */
  window_index: number | null;
  created_at: Date;
};

export type EventLog = {
  id: string;
  event_type: EventType;
  symbol: string | null;
  exchange: Exchange | null;
  ref_id: string | null;
  ref_type: string | null;
  /** Event detail data (jsonb). Null for events with no extra data */
  data: unknown | null;
  created_at: Date;
};
